#!/usr/bin/env python3
"""
Box to Cloud - PDF Page Upload Script

Scans a folder for PDFs from the scanner, converts each page to an image,
and uploads to S3. Also creates corresponding DynamoDB records.

Usage:
    # Process all PDFs in a directory
    python upload_pages.py /path/to/scanned/pdfs

    # Process a single PDF file
    python upload_pages.py /path/to/scanned/pdfs/box_007_20251110_173850.pdf

    # Specify environment when multiple exist
    python upload_pages.py /path/to/scanned/pdfs --env 3qslisom2rf57gtlhmdx3gwuqa

Requirements:
    pip install boto3 pdf2image pillow

    Also requires poppler-utils:
    - macOS: brew install poppler
    - Ubuntu: sudo apt-get install poppler-utils
"""

import os
import sys
import re
import json
from pathlib import Path
from datetime import datetime, timezone
from io import BytesIO

import boto3
from pdf2image import convert_from_path

# Configuration - update these after deploying Amplify
TENANT_ID = "default"  # Update if multi-tenant
AWS_REGION = "us-east-1"

# These will be read from amplify_outputs.json if available
S3_BUCKET = None
DYNAMODB_TABLE_PREFIX = "Box2Cloud"


def load_amplify_config():
    """Load S3 bucket name from amplify_outputs.json if available."""
    global S3_BUCKET

    config_paths = [
        Path(__file__).parent.parent / "amplify_outputs.json",
        Path.cwd() / "amplify_outputs.json",
    ]

    for config_path in config_paths:
        if config_path.exists():
            with open(config_path) as f:
                config = json.load(f)
                if "storage" in config:
                    S3_BUCKET = config["storage"]["bucket_name"]
                    print(f"Loaded S3 bucket from config: {S3_BUCKET}")
                    return

    print("Warning: amplify_outputs.json not found. Set S3_BUCKET manually.")


def parse_pdf_filename(filename: str) -> dict | None:
    """
    Parse PDF filename in format: box_xxx_yyyymmdd_hhmmss.pdf

    Returns dict with boxNumber, date, time, setId or None if invalid.
    """
    pattern = r"^box_(\d{3})_(\d{8})_(\d{6})\.pdf$"
    match = re.match(pattern, filename, re.IGNORECASE)

    if not match:
        return None

    box_num, date_str, time_str = match.groups()

    return {
        "boxNumber": box_num,
        "date": date_str,
        "time": time_str,
        "setId": f"box_{box_num}_{date_str}_{time_str}",
        "filename": filename,
    }


def get_existing_s3_keys(s3_client, bucket: str, prefix: str = "pages/") -> set:
    """Get all existing S3 keys under the given prefix."""
    existing_keys = set()
    paginator = s3_client.get_paginator("list_objects_v2")

    print(f"Fetching existing S3 objects from {bucket}/{prefix}...")

    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            existing_keys.add(obj["Key"])

    print(f"Found {len(existing_keys)} existing objects in S3")
    return existing_keys


def get_existing_sets(dynamodb, table_name: str) -> set:
    """Get all existing set IDs from DynamoDB."""
    existing_sets = set()
    table = dynamodb.Table(table_name)

    print(f"Fetching existing sets from {table_name}...")

    response = table.scan(ProjectionExpression="setId")
    existing_sets.update(item["setId"] for item in response.get("Items", []))

    while "LastEvaluatedKey" in response:
        response = table.scan(
            ProjectionExpression="setId",
            ExclusiveStartKey=response["LastEvaluatedKey"]
        )
        existing_sets.update(item["setId"] for item in response.get("Items", []))

    print(f"Found {len(existing_sets)} existing sets in DynamoDB")
    return existing_sets


def find_dynamodb_tables(dynamodb_client, env_id: str | None = None) -> dict | list:
    """
    Find the Box2Cloud DynamoDB tables.

    If env_id is provided, filter to tables matching that environment.
    If multiple environments are found and no env_id specified, returns a list of env IDs.
    """
    # Group tables by environment ID (the string between hyphens before -NONE or -main etc)
    environments: dict[str, dict] = {}
    paginator = dynamodb_client.get_paginator("list_tables")

    for page in paginator.paginate():
        for table_name in page["TableNames"]:
            if "Box2Cloud" not in table_name:
                continue

            # Extract environment ID: Box2CloudBox-{env_id}-{branch}
            parts = table_name.split("-")
            if len(parts) >= 2:
                # env_id is the second-to-last part (before NONE/main/etc)
                env = parts[-2]

                if env_id and env != env_id:
                    continue

                if env not in environments:
                    environments[env] = {"env_id": env, "tables": {}}

                if "Box2CloudBox" in table_name:
                    environments[env]["tables"]["box"] = table_name
                elif "Box2CloudSet" in table_name:
                    environments[env]["tables"]["set"] = table_name
                elif "Box2CloudPage" in table_name:
                    environments[env]["tables"]["page"] = table_name

    # If env_id specified, return just those tables
    if env_id:
        if env_id in environments:
            return environments[env_id]["tables"]
        return {}

    # If only one environment, return its tables
    if len(environments) == 1:
        return list(environments.values())[0]["tables"]

    # Multiple environments found - return list for user to choose
    return list(environments.values())


def find_s3_buckets(s3_client, env_id: str | None = None) -> str | list:
    """
    Find Box2Cloud S3 buckets.

    If env_id is provided, filter to bucket matching that environment.
    If multiple buckets found and no env_id specified, returns a list.
    """
    buckets = []
    response = s3_client.list_buckets()

    for bucket in response["Buckets"]:
        name = bucket["Name"]
        if "box2cloud" in name.lower() or "boxtocloud" in name.lower():
            if env_id:
                # Check if bucket name contains the env_id
                if env_id in name:
                    return name
            else:
                buckets.append(name)

    if len(buckets) == 1:
        return buckets[0]

    return buckets


def convert_pdf_to_images(pdf_path: Path, dpi: int = 150) -> list:
    """Convert PDF pages to PIL images."""
    return convert_from_path(str(pdf_path), dpi=dpi)


def upload_page_image(s3_client, bucket: str, image, s3_key: str) -> bool:
    """Upload a PIL image to S3 as PNG."""
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    buffer.seek(0)

    s3_client.upload_fileobj(
        buffer,
        bucket,
        s3_key,
        ExtraArgs={"ContentType": "image/png"}
    )
    return True


def get_tenant_groups(tenant_id: str) -> dict:
    """Generate group names for a tenant."""
    return {
        "tenantViewerGroup": f"tenant_{tenant_id}_viewer",
        "tenantReviewerGroup": f"tenant_{tenant_id}_reviewer",
    }


def get_or_create_box(dynamodb, table_name: str, box_number: str) -> str:
    """Get existing box or create a new one, returns the box ID."""
    table = dynamodb.Table(table_name)

    # Check if box exists
    response = table.scan(
        FilterExpression="boxNumber = :bn AND tenantId = :tid",
        ExpressionAttributeValues={
            ":bn": box_number,
            ":tid": TENANT_ID,
        }
    )

    if response.get("Items"):
        return response["Items"][0]["id"]
    else:
        # Create new box
        import uuid
        box_id = str(uuid.uuid4())
        groups = get_tenant_groups(TENANT_ID)
        table.put_item(Item={
            "id": box_id,
            "boxNumber": box_number,
            "tenantId": TENANT_ID,
            "totalSets": 0,
            "totalPages": 0,
            "pagesReviewed": 0,
            "pagesShred": 0,
            "pagesUnsure": 0,
            "pagesRetain": 0,
            "status": "pending",
            "tenantViewerGroup": groups["tenantViewerGroup"],
            "tenantReviewerGroup": groups["tenantReviewerGroup"],
            "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        })
        return box_id


def recalculate_box_totals(dynamodb, tables: dict, box_id: str) -> None:
    """Recalculate box totals from actual set and page records."""
    # Count sets for this box
    set_table = dynamodb.Table(tables["set"])
    set_response = set_table.scan(
        FilterExpression="boxId = :bid",
        ExpressionAttributeValues={":bid": box_id}
    )
    total_sets = len(set_response.get("Items", []))

    # Count pages and review statuses for this box
    page_table = dynamodb.Table(tables["page"])
    page_response = page_table.scan(
        FilterExpression="boxId = :bid",
        ExpressionAttributeValues={":bid": box_id}
    )
    pages = page_response.get("Items", [])
    total_pages = len(pages)
    pages_reviewed = sum(1 for p in pages if p.get("reviewStatus") and p["reviewStatus"] != "pending")
    pages_shred = sum(1 for p in pages if p.get("reviewStatus") == "shred")
    pages_unsure = sum(1 for p in pages if p.get("reviewStatus") == "unsure")
    pages_retain = sum(1 for p in pages if p.get("reviewStatus") == "retain")

    # Determine status
    if total_pages == 0:
        status = "pending"
    elif pages_reviewed == total_pages:
        status = "complete"
    elif pages_reviewed > 0:
        status = "in_progress"
    else:
        status = "pending"

    # Update box with calculated totals
    box_table = dynamodb.Table(tables["box"])
    box_table.update_item(
        Key={"id": box_id},
        UpdateExpression="SET totalSets = :sets, totalPages = :pages, pagesReviewed = :reviewed, pagesShred = :shred, pagesUnsure = :unsure, pagesRetain = :retain, #st = :status",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={
            ":sets": total_sets,
            ":pages": total_pages,
            ":reviewed": pages_reviewed,
            ":shred": pages_shred,
            ":unsure": pages_unsure,
            ":retain": pages_retain,
            ":status": status,
        }
    )


def create_set(dynamodb, table_name: str, set_id: str, box_id: str,
               filename: str, page_count: int) -> None:
    """Create a set record."""
    table = dynamodb.Table(table_name)
    import uuid
    groups = get_tenant_groups(TENANT_ID)

    table.put_item(Item={
        "id": str(uuid.uuid4()),
        "setId": set_id,
        "boxId": box_id,
        "tenantId": TENANT_ID,
        "filename": filename,
        "pageCount": page_count,
        "pagesReviewed": 0,
        "tenantViewerGroup": groups["tenantViewerGroup"],
        "tenantReviewerGroup": groups["tenantReviewerGroup"],
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    })


def create_page(dynamodb, table_name: str, page_id: str, set_id: str,
                box_id: str, page_number: int, filename: str, s3_key: str) -> None:
    """Create a page record."""
    table = dynamodb.Table(table_name)
    import uuid
    groups = get_tenant_groups(TENANT_ID)

    table.put_item(Item={
        "id": str(uuid.uuid4()),
        "pageId": page_id,
        "setId": set_id,
        "boxId": box_id,
        "tenantId": TENANT_ID,
        "pageNumber": page_number,
        "filename": filename,
        "s3Key": s3_key,
        "reviewStatus": "pending",
        "tenantViewerGroup": groups["tenantViewerGroup"],
        "tenantReviewerGroup": groups["tenantReviewerGroup"],
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    })


def delete_existing_records(dynamodb, tables: dict, set_id: str) -> None:
    """Delete existing set and page records for a set_id."""
    # Delete set records
    set_table = dynamodb.Table(tables["set"])
    response = set_table.scan(
        FilterExpression="setId = :sid",
        ExpressionAttributeValues={":sid": set_id}
    )
    for item in response.get("Items", []):
        set_table.delete_item(Key={"id": item["id"]})
        print(f"    Deleted existing set record: {item['id']}")

    # Delete page records
    page_table = dynamodb.Table(tables["page"])
    response = page_table.scan(
        FilterExpression="setId = :sid",
        ExpressionAttributeValues={":sid": set_id}
    )
    deleted_pages = len(response.get("Items", []))
    for item in response.get("Items", []):
        page_table.delete_item(Key={"id": item["id"]})
    if deleted_pages > 0:
        print(f"    Deleted {deleted_pages} existing page records")


def process_pdf(pdf_path: Path, pdf_info: dict, s3_client, dynamodb,
                tables: dict, bucket: str, existing_s3_keys: set,
                existing_sets: set, force: bool = False) -> dict:
    """Process a single PDF file."""
    set_id = pdf_info["setId"]
    box_number = pdf_info["boxNumber"]

    # Skip if already processed (unless forcing)
    if set_id in existing_sets:
        if not force:
            print(f"  Skipping {pdf_info['filename']} - already processed")
            return {"skipped": True}
        else:
            print(f"  Force mode: deleting existing records for {pdf_info['filename']}")
            delete_existing_records(dynamodb, tables, set_id)

    print(f"  Processing {pdf_info['filename']}...")

    # Convert PDF to images
    try:
        images = convert_pdf_to_images(pdf_path)
    except Exception as e:
        print(f"  Error converting PDF: {e}")
        return {"error": str(e)}

    page_count = len(images)
    print(f"    Found {page_count} pages")

    # Get or create box record
    box_id = get_or_create_box(dynamodb, tables["box"], box_number)

    # Create set record
    create_set(
        dynamodb, tables["set"], set_id, box_id,
        pdf_info["filename"], page_count
    )

    # Upload each page
    for page_num, image in enumerate(images, start=1):
        s3_key = f"pages/{box_number}/{set_id}/page_{page_num:04d}.png"
        page_id = f"{set_id}_page_{page_num:04d}"

        if s3_key not in existing_s3_keys:
            upload_page_image(s3_client, bucket, image, s3_key)
            print(f"    Uploaded page {page_num}/{page_count}")
        else:
            print(f"    Page {page_num} already exists in S3")

        # Create page record
        create_page(
            dynamodb, tables["page"], page_id, set_id,
            box_id, page_num, f"page_{page_num:04d}.png", s3_key
        )

    # Recalculate box totals from actual data
    recalculate_box_totals(dynamodb, tables, box_id)

    return {"pages": page_count, "box_id": box_id}


def main():
    if len(sys.argv) < 2:
        print("Usage: python upload_pages.py /path/to/scanned/pdfs [OPTIONS]")
        print("       python upload_pages.py /path/to/file.pdf [OPTIONS]")
        print("\nOptions:")
        print("  --env ENV_ID      Specify the environment ID (the code between hyphens in table names)")
        print("  --tenant TENANT   Specify the tenant ID (required for multi-tenant setup)")
        print("  --force           Re-upload files even if they exist in DynamoDB")
        print("\nEnvironment variables (alternative to options):")
        print("  AWS_REGION - AWS region (default: us-east-1)")
        print("  S3_BUCKET - S3 bucket name (auto-detected from amplify_outputs.json)")
        print("  TENANT_ID - Tenant ID for multi-tenant setup (default: 'default')")
        sys.exit(1)

    # Parse arguments
    args = sys.argv[1:]
    env_id = None
    input_path_str = None
    force_upload = False
    tenant_id_arg = None

    i = 0
    while i < len(args):
        if args[i] == "--env":
            if i + 1 < len(args):
                env_id = args[i + 1]
                i += 2
            else:
                print("Error: --env requires an argument")
                sys.exit(1)
        elif args[i] == "--tenant":
            if i + 1 < len(args):
                tenant_id_arg = args[i + 1]
                i += 2
            else:
                print("Error: --tenant requires an argument")
                sys.exit(1)
        elif args[i] == "--force":
            force_upload = True
            i += 1
        elif input_path_str is None:
            input_path_str = args[i]
            i += 1
        else:
            i += 1

    if not input_path_str:
        print("Error: No input path specified")
        sys.exit(1)

    input_path = Path(input_path_str)
    if not input_path.exists():
        print(f"Error: Path not found: {input_path}")
        sys.exit(1)

    # Determine if input is a single file or directory
    single_file_mode = input_path.is_file() and input_path.suffix.lower() == ".pdf"

    # Load configuration
    load_amplify_config()

    global AWS_REGION, TENANT_ID, S3_BUCKET
    AWS_REGION = os.environ.get("AWS_REGION", AWS_REGION)
    # Command line --tenant takes precedence over env var
    TENANT_ID = tenant_id_arg or os.environ.get("TENANT_ID", TENANT_ID)
    print(f"Using tenant ID: {TENANT_ID}")

    # Initialize AWS clients
    session = boto3.Session(region_name=AWS_REGION)
    s3_client = session.client("s3")
    dynamodb_client = session.client("dynamodb")
    dynamodb = session.resource("dynamodb")

    # Find DynamoDB tables
    tables_result = find_dynamodb_tables(dynamodb_client, env_id)

    # Check if multiple environments found
    if isinstance(tables_result, list):
        print("\n" + "=" * 60)
        print("ERROR: Multiple Box2Cloud environments found!")
        print("=" * 60)
        print("\nPlease specify which environment to use with --env\n")
        print("Available environments:")
        print("-" * 60)
        for env in tables_result:
            env_code = env["env_id"]
            box_table = env["tables"].get("box", "not found")
            # Get row count for box table
            try:
                table = dynamodb.Table(box_table)
                count = table.scan(Select="COUNT")["Count"]
            except Exception:
                count = "?"
            print(f"\n  --env {env_code}")
            print(f"       Box table: {box_table}")
            print(f"       Boxes in DB: {count}")
        print("\n" + "-" * 60)
        print("\nExample:")
        print(f"  python upload_pages.py {input_path} --env {tables_result[0]['env_id']}")
        print()
        sys.exit(1)

    tables = tables_result
    if not tables or not all(k in tables for k in ["box", "set", "page"]):
        print(f"Error: Could not find all required DynamoDB tables.")
        print(f"Found: {tables}")
        print("Make sure Amplify backend is deployed.")
        sys.exit(1)

    print(f"Using tables: {tables}")

    # Handle S3 bucket - use from config or find it
    S3_BUCKET = os.environ.get("S3_BUCKET", S3_BUCKET)
    if not S3_BUCKET:
        bucket_result = find_s3_buckets(s3_client, env_id)
        if isinstance(bucket_result, list):
            if len(bucket_result) == 0:
                print("Error: No Box2Cloud S3 buckets found.")
                sys.exit(1)
            print("\nMultiple S3 buckets found:")
            for b in bucket_result:
                print(f"  - {b}")
            print("\nSet S3_BUCKET environment variable or use --env to filter.")
            sys.exit(1)
        S3_BUCKET = bucket_result

    if not S3_BUCKET:
        print("Error: S3_BUCKET not set. Deploy Amplify first or set S3_BUCKET env var.")
        sys.exit(1)

    print(f"Using S3 bucket: {S3_BUCKET}")

    # Get existing data
    existing_s3_keys = get_existing_s3_keys(s3_client, S3_BUCKET)
    existing_sets = get_existing_sets(dynamodb, tables["set"])
    if force_upload:
        print("Force mode: will delete and re-upload existing files")

    # Find PDFs to process
    if single_file_mode:
        pdf_files = [input_path]
        print(f"\nProcessing single file: {input_path.name}")
    else:
        pdf_files = list(input_path.glob("*.pdf")) + list(input_path.glob("*.PDF"))
        print(f"\nFound {len(pdf_files)} PDF files in {input_path}")

    # Process each PDF
    stats = {"processed": 0, "skipped": 0, "errors": 0, "pages": 0}

    for pdf_path in sorted(pdf_files):
        pdf_info = parse_pdf_filename(pdf_path.name)

        if not pdf_info:
            print(f"  Skipping {pdf_path.name} - doesn't match expected format")
            continue

        result = process_pdf(
            pdf_path, pdf_info, s3_client, dynamodb,
            tables, S3_BUCKET, existing_s3_keys, existing_sets,
            force=force_upload
        )

        if result.get("skipped"):
            stats["skipped"] += 1
        elif result.get("error"):
            stats["errors"] += 1
        else:
            stats["processed"] += 1
            stats["pages"] += result.get("pages", 0)

    # Print summary
    print(f"\n{'='*50}")
    print("Upload Complete!")
    print(f"  Processed: {stats['processed']} sets ({stats['pages']} pages)")
    print(f"  Skipped:   {stats['skipped']} (already uploaded)")
    print(f"  Errors:    {stats['errors']}")


if __name__ == "__main__":
    main()
