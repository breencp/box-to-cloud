# DocSense Cloud Migration Specification

## For Claude: Read This First

This document contains the complete specification for building a new cloud-based document retention review application. It was designed through an extensive planning session and captures all architectural decisions, rationale, and implementation details.

**You are building a NEW application**, not modifying DocSense. However, DocSense contains:
1. The source SQLite database with existing document/page data to migrate
2. The PDFs that need to be rendered to PNGs
3. Reference code for PDF rendering and filename parsing

---

## Executive Summary

### What We're Building

A serverless AWS application that allows AOAO (condo association) board members to review scanned document pages one at a time and mark each as **Shred**, **Unsure**, or **Retain**. The goal is to determine which physical boxes of documents can be safely destroyed.

### Why We're Building It This Way

| Requirement | Solution | Rationale |
|-------------|----------|-----------|
| Cost < $5/month | Serverless (Lambda, DynamoDB, S3) | Pay-per-use, scales to zero |
| No SQLite hosting | DynamoDB | No server needed, ~$0.03/month |
| 5-10 concurrent users | Queue-based page assignment | Prevents duplicate reviews |
| 50,000+ pages | Pre-rendered PNGs in S3 | Fast viewing, ~$0.23/month storage |
| Future SaaS potential | tenant_id in data model | Easy to add other AOAOs later |
| Simple auth | Cognito | Free tier, handles invites |

### What We're NOT Building (MVP Scope)

- ❌ LLM analysis or AI features
- ❌ Full-text search
- ❌ Semantic/vector search
- ❌ Document upload capability
- ❌ Undo/change review decisions
- ❌ Dual-approval workflows

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CloudFront                                  │
│                         (CDN + HTTPS termination)                       │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
┌─────────────────────────┐       ┌─────────────────────────┐
│      S3 Bucket          │       │      S3 Bucket          │
│   (React Static Site)   │       │    (Page Images)        │
│                         │       │                         │
│   index.html            │       │   <tenant>/pages/       │
│   static/js/...         │       │     box_001/            │
│   static/css/...        │       │       page_001.png      │
└─────────────────────────┘       │       page_002.png      │
                                  │     box_002/            │
              │                   │       ...               │
              │ API calls         └─────────────────────────┘
              │                             ▲
              ▼                             │ presigned URLs
┌─────────────────────────┐                 │
│     API Gateway         │                 │
│     (HTTP API)          │                 │
│                         │                 │
│  JWT Authorizer ────────┼──► Cognito     │
└──────────┬──────────────┘    User Pool   │
           │                               │
           ▼                               │
┌─────────────────────────┐                │
│       Lambda            │────────────────┘
│    (Python 3.12)        │
│                         │
│  - get_next_page        │
│  - submit_review        │
│  - get_progress         │
│  - get_boxes            │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│      DynamoDB           │
│   (Single Table)        │
│                         │
│  - Boxes metadata       │
│  - Documents            │
│  - Pages + review status│
│  - User review history  │
│                         │
│  GSI1: Queue of pending │
│        pages            │
└─────────────────────────┘
```

---

## DynamoDB Schema (Single Table Design)

### Why Single Table?

- Fewer round trips
- Simpler IAM policies
- Cost efficient (one table = one billing unit)
- All access patterns satisfied with PK/SK + 1 GSI

### Table Configuration

```
Table Name: retention-review
Billing Mode: PAY_PER_REQUEST (on-demand)
Partition Key: PK (String)
Sort Key: SK (String)
```

### Entity Definitions

#### Box Entity

Represents a physical box of scanned documents.

```
PK: TENANT#<tenant_id>#BOX#<box_number>
SK: META

Attributes:
{
  "box_number": "001",                    // String, 3 digits zero-padded
  "total_documents": 15,                  // Number
  "total_pages": 847,                     // Number
  "pages_reviewed": 234,                  // Number
  "pages_shred": 180,                     // Number
  "pages_unsure": 24,                     // Number
  "pages_retain": 30,                     // Number
  "status": "in_progress",                // "pending" | "in_progress" | "complete"
  "created_at": "2024-01-15T10:00:00Z",   // ISO 8601
  "updated_at": "2024-01-15T14:30:00Z"    // ISO 8601
}
```

#### Document Entity

Represents a single PDF file within a box.

```
PK: TENANT#<tenant_id>#BOX#<box_number>
SK: DOC#<doc_id>

Attributes:
{
  "doc_id": "00042",                      // String, 5 digits zero-padded
  "filename": "box_001_20250103_143022.pdf",
  "page_count": 12,                       // Number
  "pages_reviewed": 8,                    // Number
  "created_at": "2024-01-15T10:00:00Z"
}
```

#### Page Entity

Represents a single page within a document. This is the primary entity for the review workflow.

```
PK: TENANT#<tenant_id>#BOX#<box_number>
SK: PAGE#<doc_id>#<page_number>

Attributes:
{
  "page_id": "12345",                     // Original SQLite page_id (for reference)
  "doc_id": "00042",                      // String, 5 digits
  "page_number": 5,                       // Number, 1-indexed
  "filename": "box_001_20250103_143022.pdf",  // Denormalized for display
  "s3_key": "aoao-123/pages/box_001/box_001_20250103_143022_page_005.png",

  // Review state
  "review_status": "pending",             // "pending" | "shred" | "unsure" | "retain"
  "reviewed_by": null,                    // Cognito user sub (UUID), null if pending
  "reviewed_at": null,                    // ISO 8601, null if pending

  // Optimistic locking for queue
  "locked_by": null,                      // Cognito user sub, null if not locked
  "locked_at": null,                      // ISO 8601, null if not locked

  // GSI1 attributes (only present when review_status = "pending")
  "GSI1PK": "TENANT#aoao-123#QUEUE",
  "GSI1SK": "BOX#001#PAGE#00042#005"
}
```

#### User Review History Entity

Tracks what each user has reviewed (for audit and "my reviews" display).

```
PK: TENANT#<tenant_id>#USER#<cognito_sub>
SK: REVIEW#<timestamp>#<page_id>

Attributes:
{
  "page_id": "12345",
  "box_number": "001",
  "doc_id": "00042",
  "page_number": 5,
  "decision": "shred",                    // "shred" | "unsure" | "retain"
  "reviewed_at": "2024-01-15T14:32:00Z"
}
```

### Global Secondary Index: GSI1 (Queue)

Used to efficiently fetch the next unreviewed page.

```
GSI Name: GSI1
Partition Key: GSI1PK (String)
Sort Key: GSI1SK (String)
Projection: ALL
```

**How it works:**
- Only pages with `review_status = "pending"` have GSI1PK/GSI1SK attributes
- Query `GSI1PK = "TENANT#<tenant>#QUEUE"` with `Limit 1` to get next page
- When a page is reviewed, remove GSI1PK/GSI1SK to remove it from queue
- Sort key ensures pages are processed in box/document/page order

### Access Patterns

| Operation | Key Condition | Notes |
|-----------|---------------|-------|
| Get next page to review | GSI1: `GSI1PK = TENANT#x#QUEUE`, Limit 1 | Returns oldest pending page |
| Get box metadata | `PK = TENANT#x#BOX#001`, `SK = META` | Single item |
| List documents in box | `PK = TENANT#x#BOX#001`, `SK begins_with DOC#` | All docs in box |
| List pages in box | `PK = TENANT#x#BOX#001`, `SK begins_with PAGE#` | All pages in box |
| Get specific page | `PK = TENANT#x#BOX#001`, `SK = PAGE#00042#005` | Single item |
| Get user's reviews | `PK = TENANT#x#USER#uuid`, `SK begins_with REVIEW#` | User history |
| List all boxes | Scan with `SK = META` filter | Or maintain a separate TENANT#x#BOXES index |

---

## Queue Lock Mechanism

Prevents two users from reviewing the same page simultaneously.

### Flow

```
1. User A requests next page
   └─► Query GSI1 for QUEUE, Limit 1
   └─► Returns Page X

2. Attempt to lock Page X (Conditional Update)
   └─► UpdateItem with ConditionExpression:
       "locked_by = :null OR locked_at < :five_minutes_ago"
   └─► SET locked_by = user_a_id, locked_at = now

   If condition fails (someone else locked it):
   └─► Query GSI1 again, skip to next page
   └─► Retry lock

3. User A reviews and submits decision
   └─► TransactWriteItems:
       a) Update Page X:
          - SET review_status, reviewed_by, reviewed_at
          - REMOVE locked_by, locked_at, GSI1PK, GSI1SK
       b) Update Box: INCREMENT pages_reviewed, pages_<decision>
       c) PUT user review history item

4. Lock expires after 5 minutes (handles abandoned sessions)
   └─► Next user's lock attempt will succeed due to timestamp check
```

### Conditional Update Expression

```python
# Lock acquisition
response = table.update_item(
    Key={'PK': page_pk, 'SK': page_sk},
    UpdateExpression='SET locked_by = :user, locked_at = :now',
    ConditionExpression='attribute_not_exists(locked_by) OR locked_at < :expiry',
    ExpressionAttributeValues={
        ':user': user_id,
        ':now': datetime.utcnow().isoformat() + 'Z',
        ':expiry': (datetime.utcnow() - timedelta(minutes=5)).isoformat() + 'Z'
    }
)
```

---

## S3 Structure

### Buckets

1. **Static Site Bucket:** `retention-review-frontend`
   - Hosts React build output
   - CloudFront origin

2. **Page Images Bucket:** `retention-review-pages`
   - Stores pre-rendered PNG images
   - Accessed via presigned URLs only

### Page Images Structure

```
s3://retention-review-pages/
  <tenant_id>/
    pages/
      box_001/
        box_001_20250103_143022_page_001.png
        box_001_20250103_143022_page_002.png
        box_001_20250103_143022_page_003.png
        box_001_20250115_091500_page_001.png
        ...
      box_002/
        box_002_20241201_140000_page_001.png
        ...
```

### Naming Convention

```
<tenant_id>/pages/box_<box_number>/<original_filename_without_extension>_page_<page_number>.png

Examples:
- aoao-123/pages/box_001/box_001_20250103_143022_page_005.png
- aoao-123/pages/box_042/box_042_20241115_083000_page_012.png
```

### Presigned URLs

Lambda generates presigned URLs with 15-minute expiry:

```python
import boto3

s3 = boto3.client('s3')

def generate_presigned_url(s3_key: str, expiry_seconds: int = 900) -> str:
    return s3.generate_presigned_url(
        'get_object',
        Params={
            'Bucket': 'retention-review-pages',
            'Key': s3_key
        },
        ExpiresIn=expiry_seconds
    )
```

---

## API Specification

### Base URL

```
https://{api-id}.execute-api.{region}.amazonaws.com/prod
```

### Authentication

All endpoints require a valid Cognito JWT in the Authorization header:

```
Authorization: Bearer <id_token>
```

### Endpoints

#### GET /queue/next

Get the next page to review. Automatically acquires a 5-minute lock.

**Response 200:**
```json
{
  "page": {
    "page_id": "12345",
    "box_number": "001",
    "doc_id": "00042",
    "page_number": 5,
    "filename": "box_001_20250103_143022.pdf",
    "image_url": "https://s3...presigned-url...",
    "context": {
      "box_total_pages": 847,
      "box_pages_reviewed": 234,
      "doc_page_count": 12,
      "doc_current_page": 5
    }
  },
  "lock_expires_at": "2024-01-15T14:37:00Z"
}
```

**Response 204:** Queue is empty (all pages reviewed)

**Response 503:** All pages currently locked by other users (try again)

---

#### POST /pages/{page_id}/review

Submit a review decision for a page.

**Request:**
```json
{
  "decision": "shred"  // "shred" | "unsure" | "retain"
}
```

**Response 200:**
```json
{
  "success": true,
  "box_number": "001",
  "pages_remaining_in_box": 613
}
```

**Response 400:** Invalid decision value

**Response 403:** Page not locked by this user

**Response 404:** Page not found

---

#### GET /progress

Get overall progress statistics.

**Response 200:**
```json
{
  "total_pages": 50000,
  "pages_reviewed": 12500,
  "pages_remaining": 37500,
  "percent_complete": 25.0,
  "breakdown": {
    "shred": 8000,
    "unsure": 1500,
    "retain": 3000
  },
  "boxes_summary": {
    "total": 60,
    "complete": 12,
    "in_progress": 8,
    "pending": 40
  },
  "boxes": [
    {
      "box_number": "001",
      "total_pages": 847,
      "pages_reviewed": 847,
      "status": "complete",
      "recommendation": "SHRED",  // "SHRED" if all shred, "RETAIN" if any retain, "REVIEW" if any unsure
      "breakdown": {
        "shred": 847,
        "unsure": 0,
        "retain": 0
      }
    },
    {
      "box_number": "002",
      "total_pages": 920,
      "pages_reviewed": 456,
      "status": "in_progress",
      "recommendation": null,
      "breakdown": {
        "shred": 300,
        "unsure": 56,
        "retain": 100
      }
    }
  ]
}
```

---

#### GET /boxes

List all boxes with their status.

**Response 200:**
```json
{
  "boxes": [
    {
      "box_number": "001",
      "total_documents": 15,
      "total_pages": 847,
      "pages_reviewed": 847,
      "status": "complete",
      "recommendation": "SHRED"
    }
  ]
}
```

---

#### GET /boxes/{box_number}

Get detailed information about a specific box.

**Response 200:**
```json
{
  "box_number": "001",
  "total_documents": 15,
  "total_pages": 847,
  "pages_reviewed": 847,
  "status": "complete",
  "breakdown": {
    "shred": 820,
    "unsure": 12,
    "retain": 15
  },
  "recommendation": "REVIEW",
  "documents": [
    {
      "doc_id": "00042",
      "filename": "box_001_20250103_143022.pdf",
      "page_count": 12,
      "pages_reviewed": 12
    }
  ]
}
```

---

#### GET /my-reviews

Get the current user's review history.

**Query Parameters:**
- `limit` (optional, default 50, max 100)
- `cursor` (optional, for pagination)

**Response 200:**
```json
{
  "reviews": [
    {
      "page_id": "12345",
      "box_number": "001",
      "page_number": 5,
      "decision": "shred",
      "reviewed_at": "2024-01-15T14:32:00Z"
    }
  ],
  "total_count": 156,
  "next_cursor": "eyJwayI6..."
}
```

---

#### POST /pages/{page_id}/unlock

Release a lock without submitting a decision (user navigated away).

**Response 200:**
```json
{
  "success": true
}
```

---

## React Application Structure

### Technology Stack

- **React 18** with TypeScript
- **Vite** for build tooling
- **AWS Amplify Auth** for Cognito integration
- **TanStack Query** for data fetching/caching
- **Tailwind CSS** for styling

### Directory Structure

```
src/
├── main.tsx                    # Entry point
├── App.tsx                     # Router setup
├── config/
│   └── aws.ts                  # Cognito/API configuration
├── pages/
│   ├── LoginPage.tsx           # Cognito hosted UI redirect
│   ├── ReviewPage.tsx          # Main review interface
│   ├── ProgressPage.tsx        # Dashboard with statistics
│   └── BoxListPage.tsx         # All boxes with status
├── components/
│   ├── PageImage.tsx           # Image display with zoom/pan
│   ├── DecisionButtons.tsx     # Shred/Unsure/Retain buttons
│   ├── PageContext.tsx         # Box/document/page info display
│   ├── ProgressBar.tsx         # Visual progress indicator
│   ├── BoxCard.tsx             # Box summary card
│   └── Layout/
│       ├── Header.tsx          # Navigation, user info, logout
│       └── Container.tsx       # Page wrapper
├── hooks/
│   ├── useAuth.ts              # Cognito auth state
│   ├── useQueue.ts             # Fetch next page
│   ├── useReview.ts            # Submit review mutation
│   └── useProgress.ts          # Progress data
├── services/
│   └── api.ts                  # API client with auth headers
└── types/
    └── index.ts                # TypeScript interfaces
```

### Key Components

#### ReviewPage.tsx

The main review interface. Shows:
- Large page image (full height, scrollable)
- Context bar: "Box 001 | Document 5 of 15 | Page 3 of 12"
- Progress: "234 of 847 pages reviewed in this box"
- Three large decision buttons at bottom

```
┌────────────────────────────────────────────────────┐
│  [Logo]  Review Documents      [Progress] [Logout] │
├────────────────────────────────────────────────────┤
│  Box 001  •  Document 5 of 15  •  Page 3 of 12     │
│  234 of 847 pages reviewed (28%)                   │
├────────────────────────────────────────────────────┤
│                                                    │
│                                                    │
│              [Page Image - Zoomable]               │
│                                                    │
│                                                    │
│                                                    │
├────────────────────────────────────────────────────┤
│                                                    │
│   [SHRED (1)]    [UNSURE (2)]    [RETAIN (3)]     │
│      red            yellow          green          │
│                                                    │
└────────────────────────────────────────────────────┘
```

#### Keyboard Shortcuts

- `1` or `S` - Mark as Shred
- `2` or `U` - Mark as Unsure
- `3` or `R` - Mark as Retain
- `+` / `-` or scroll - Zoom in/out
- Arrow keys - Pan when zoomed

#### ProgressPage.tsx

Dashboard showing:
- Overall progress bar with percentage
- Pie chart of Shred/Unsure/Retain breakdown
- List of boxes with individual progress bars
- "Safe to Shred" badges on complete boxes where all pages marked shred
- Current user's contribution count

---

## Cognito Configuration

### User Pool Settings

```
User Pool Name: retention-review-users

Sign-in:
  - Email (username)

Password Policy:
  - Minimum 8 characters
  - Require uppercase
  - Require lowercase
  - Require number

MFA: Optional (TOTP)

Email Verification: Required

Account Recovery: Email code
```

### App Client Settings

```
App Client Name: web-app

Authentication Flows:
  - ALLOW_USER_SRP_AUTH
  - ALLOW_REFRESH_TOKEN_AUTH

OAuth:
  - Authorization code grant
  - Scopes: openid, email, profile

Callback URLs:
  - https://review.yourdomain.com/callback
  - http://localhost:3000/callback (dev)

Sign-out URLs:
  - https://review.yourdomain.com/
  - http://localhost:3000/ (dev)
```

### Inviting Users

```bash
# Create user and send invite email automatically
aws cognito-idp admin-create-user \
  --user-pool-id us-west-2_XXXXXX \
  --username board.member@email.com \
  --user-attributes Name=email,Value=board.member@email.com \
  --desired-delivery-mediums EMAIL

# Or create with temporary password (send invite manually)
aws cognito-idp admin-create-user \
  --user-pool-id us-west-2_XXXXXX \
  --username board.member@email.com \
  --user-attributes Name=email,Value=board.member@email.com \
  --temporary-password "TempPass123!" \
  --message-action SUPPRESS
```

---

## Data Migration

### Overview

The existing DocSense SQLite database and PDF files need to be migrated to the new cloud infrastructure. This is a one-time batch process run locally.

### Migration Steps

1. **Render PDFs to PNGs** (local script)
2. **Upload PNGs to S3** (local script)
3. **Populate DynamoDB** (local script)

### Source Data Location (DocSense)

```
Database: /Users/breencp/SourceCode/DocSense/docsense.db
PDFs: Configured in .env as PDF_DIRECTORY
OCR'd PDFs: Configured in .env as OCR_OUTPUT_DIRECTORY (if available)
```

### Script 1: render_pages.py

Renders all PDF pages to PNG images using PyMuPDF.

**Key Reference:** DocSense `webapp/app.py` lines 313-335 show the rendering pattern.

```python
#!/usr/bin/env python3
"""
Render all PDF pages to PNG images.

Usage: python render_pages.py \
    --db /path/to/docsense.db \
    --pdf-dir /path/to/pdfs \
    --ocr-dir /path/to/ocr-pdfs \
    --output-dir /path/to/output \
    --tenant-id aoao-123
"""
import sqlite3
import fitz  # PyMuPDF
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
import argparse
from tqdm import tqdm

def render_document(args):
    """Render all pages of a single document."""
    doc_id, filename, box_number, pdf_dir, ocr_dir, output_dir, tenant_id = args

    # Prefer OCR'd PDF if it exists
    pdf_path = Path(ocr_dir) / filename if (Path(ocr_dir) / filename).exists() else Path(pdf_dir) / filename

    if not pdf_path.exists():
        return (doc_id, 0, f"PDF not found: {pdf_path}")

    try:
        doc = fitz.open(str(pdf_path))
        output_box_dir = Path(output_dir) / tenant_id / "pages" / f"box_{box_number}"
        output_box_dir.mkdir(parents=True, exist_ok=True)

        filename_stem = Path(filename).stem  # Remove .pdf extension

        for page_num in range(len(doc)):
            page = doc[page_num]

            # Render at 150 DPI (good balance of quality vs file size)
            zoom = 150 / 72
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)

            # Output path matches S3 key structure
            output_path = output_box_dir / f"{filename_stem}_page_{page_num + 1:03d}.png"
            pix.save(str(output_path))

        doc.close()
        return (doc_id, len(doc), None)
    except Exception as e:
        return (doc_id, 0, str(e))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True)
    parser.add_argument('--pdf-dir', required=True)
    parser.add_argument('--ocr-dir', default='')
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--tenant-id', required=True)
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()

    # Get documents from SQLite
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
        SELECT d.doc_id, d.filename, b.box_number
        FROM documents d
        JOIN boxes b ON d.box_id = b.box_id
        ORDER BY b.box_number, d.doc_id
    """)
    documents = cursor.fetchall()
    conn.close()

    print(f"Found {len(documents)} documents to render")

    # Prepare arguments for parallel processing
    render_args = [
        (doc['doc_id'], doc['filename'], doc['box_number'],
         args.pdf_dir, args.ocr_dir, args.output_dir, args.tenant_id)
        for doc in documents
    ]

    # Render in parallel
    total_pages = 0
    errors = []

    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        results = list(tqdm(
            executor.map(render_document, render_args),
            total=len(render_args),
            desc="Rendering"
        ))

    for doc_id, pages, error in results:
        if error:
            errors.append((doc_id, error))
        else:
            total_pages += pages

    print(f"\nRendered {total_pages} pages")
    if errors:
        print(f"Errors ({len(errors)}):")
        for doc_id, error in errors[:10]:
            print(f"  Doc {doc_id}: {error}")

if __name__ == '__main__':
    main()
```

### Script 2: upload_to_s3.py

Uploads rendered PNGs to S3.

```python
#!/usr/bin/env python3
"""
Upload rendered PNG pages to S3.

Usage: python upload_to_s3.py \
    --input-dir /path/to/rendered \
    --bucket retention-review-pages
"""
import boto3
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse
from tqdm import tqdm

def upload_file(args):
    """Upload a single file."""
    s3_client, local_path, bucket, s3_key = args
    try:
        s3_client.upload_file(
            str(local_path),
            bucket,
            s3_key,
            ExtraArgs={'ContentType': 'image/png'}
        )
        return (s3_key, True, None)
    except Exception as e:
        return (s3_key, False, str(e))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input-dir', required=True)
    parser.add_argument('--bucket', required=True)
    parser.add_argument('--workers', type=int, default=10)
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    s3 = boto3.client('s3')

    # Find all PNGs (structure: tenant_id/pages/box_XXX/filename_page_NNN.png)
    pngs = list(input_dir.rglob('*.png'))
    print(f"Found {len(pngs)} PNG files")

    # Build upload tasks
    # Local path relative to input_dir becomes S3 key
    upload_args = []
    for png in pngs:
        s3_key = str(png.relative_to(input_dir))
        upload_args.append((s3, png, args.bucket, s3_key))

    # Upload in parallel
    success = 0
    errors = []

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        results = list(tqdm(
            executor.map(upload_file, upload_args),
            total=len(upload_args),
            desc="Uploading"
        ))

    for s3_key, ok, error in results:
        if ok:
            success += 1
        else:
            errors.append((s3_key, error))

    print(f"\nUploaded {success} files to s3://{args.bucket}/")
    if errors:
        print(f"Errors ({len(errors)}):")
        for key, error in errors[:10]:
            print(f"  {key}: {error}")

if __name__ == '__main__':
    main()
```

### Script 3: migrate_to_dynamodb.py

Populates DynamoDB from SQLite.

```python
#!/usr/bin/env python3
"""
Migrate DocSense SQLite data to DynamoDB.

Usage: python migrate_to_dynamodb.py \
    --db /path/to/docsense.db \
    --table retention-review \
    --tenant-id aoao-123
"""
import sqlite3
import boto3
from datetime import datetime
import argparse
from tqdm import tqdm

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True)
    parser.add_argument('--table', required=True)
    parser.add_argument('--tenant-id', required=True)
    args = parser.parse_args()

    # Connect to SQLite
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Connect to DynamoDB
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(args.table)

    tenant = args.tenant_id
    now = datetime.utcnow().isoformat() + 'Z'

    # --- Migrate Boxes ---
    cursor.execute("""
        SELECT
            b.box_number,
            COUNT(DISTINCT d.doc_id) as total_documents,
            COUNT(p.page_id) as total_pages
        FROM boxes b
        LEFT JOIN documents d ON b.box_id = d.box_id
        LEFT JOIN pages p ON d.doc_id = p.doc_id
        GROUP BY b.box_id
    """)
    boxes = cursor.fetchall()

    print(f"Migrating {len(boxes)} boxes...")
    with table.batch_writer() as batch:
        for box in tqdm(boxes, desc="Boxes"):
            batch.put_item(Item={
                'PK': f"TENANT#{tenant}#BOX#{box['box_number']}",
                'SK': 'META',
                'box_number': box['box_number'],
                'total_documents': box['total_documents'],
                'total_pages': box['total_pages'],
                'pages_reviewed': 0,
                'pages_shred': 0,
                'pages_unsure': 0,
                'pages_retain': 0,
                'status': 'pending',
                'created_at': now,
                'updated_at': now
            })

    # --- Migrate Documents ---
    cursor.execute("""
        SELECT d.doc_id, d.filename, d.page_count, b.box_number
        FROM documents d
        JOIN boxes b ON d.box_id = b.box_id
    """)
    documents = cursor.fetchall()

    print(f"Migrating {len(documents)} documents...")
    with table.batch_writer() as batch:
        for doc in tqdm(documents, desc="Documents"):
            batch.put_item(Item={
                'PK': f"TENANT#{tenant}#BOX#{doc['box_number']}",
                'SK': f"DOC#{doc['doc_id']:05d}",
                'doc_id': f"{doc['doc_id']:05d}",
                'filename': doc['filename'],
                'page_count': doc['page_count'],
                'pages_reviewed': 0,
                'created_at': now
            })

    # --- Migrate Pages ---
    cursor.execute("""
        SELECT p.page_id, p.doc_id, p.page_number, d.filename, b.box_number
        FROM pages p
        JOIN documents d ON p.doc_id = d.doc_id
        JOIN boxes b ON d.box_id = b.box_id
        ORDER BY b.box_number, d.doc_id, p.page_number
    """)
    pages = cursor.fetchall()

    print(f"Migrating {len(pages)} pages...")
    with table.batch_writer() as batch:
        for page in tqdm(pages, desc="Pages"):
            filename_stem = page['filename'].rsplit('.', 1)[0]  # Remove .pdf
            s3_key = f"{tenant}/pages/box_{page['box_number']}/{filename_stem}_page_{page['page_number']:03d}.png"

            batch.put_item(Item={
                'PK': f"TENANT#{tenant}#BOX#{page['box_number']}",
                'SK': f"PAGE#{page['doc_id']:05d}#{page['page_number']:03d}",
                'page_id': str(page['page_id']),
                'doc_id': f"{page['doc_id']:05d}",
                'page_number': page['page_number'],
                'filename': page['filename'],
                's3_key': s3_key,
                'review_status': 'pending',
                'reviewed_by': None,
                'reviewed_at': None,
                'locked_by': None,
                'locked_at': None,
                # GSI1 attributes for queue
                'GSI1PK': f"TENANT#{tenant}#QUEUE",
                'GSI1SK': f"BOX#{page['box_number']}#PAGE#{page['doc_id']:05d}#{page['page_number']:03d}"
            })

    conn.close()
    print("\nMigration complete!")

if __name__ == '__main__':
    main()
```

---

## Cost Estimate

### Monthly Costs (50k pages, 5-10 users, ~1000 reviews/month)

| Service | Calculation | Monthly Cost |
|---------|-------------|--------------|
| **DynamoDB** | | |
| Storage | 50k items × 2KB = 100MB | $0.025 |
| Writes | ~2000 WCU | $0.00125 |
| Reads | ~10000 RCU | $0.00125 |
| **DynamoDB Total** | | **$0.03** |
| **S3 - Images** | | |
| Storage | 50k × 200KB = 10GB | $0.23 |
| GET requests | ~2000/month | $0.001 |
| **S3 Images Total** | | **$0.23** |
| **S3 - Static Site** | ~5MB | $0.001 |
| **Lambda** | 3000 invocations × 500ms | Free tier |
| **API Gateway** | 3000 requests | Free tier* |
| **Cognito** | 10 MAU | Free tier |
| **CloudFront** | ~5GB transfer | Free tier |
| | | |
| **TOTAL** | | **~$0.30/month** |

*API Gateway free tier expires after 12 months. Afterwards: ~$0.01/month at this volume.

### Cost at Scale

| Scenario | Est. Monthly Cost |
|----------|-------------------|
| 50k pages, light use | $0.30 |
| 50k pages, heavy use (all reviewed in one month) | $1.50 |
| 200k pages, moderate use | $1.20 |
| 1M pages, enterprise | $6.00 |

---

## Deployment Checklist

### Phase 1: AWS Infrastructure

- [ ] Create DynamoDB table with GSI1
- [ ] Create S3 bucket for page images
- [ ] Create S3 bucket for static site
- [ ] Create Cognito User Pool + App Client
- [ ] Create Lambda functions (Python 3.12, ARM64)
- [ ] Create API Gateway with Cognito authorizer
- [ ] Create CloudFront distribution
- [ ] Configure custom domain (optional)

### Phase 2: Data Migration

- [ ] Run `render_pages.py` locally
- [ ] Run `upload_to_s3.py`
- [ ] Run `migrate_to_dynamodb.py`
- [ ] Verify page count in DynamoDB matches SQLite

### Phase 3: Frontend

- [ ] Build React application
- [ ] Deploy to S3 static site bucket
- [ ] Invalidate CloudFront cache
- [ ] Test authentication flow

### Phase 4: User Onboarding

- [ ] Create Cognito users for board members
- [ ] Send invitation emails
- [ ] Verify login works for all users
- [ ] Review first few pages together as a group

---

## Security Considerations

1. **S3 Images:** Private bucket, presigned URLs only (15-minute expiry)
2. **API Gateway:** All endpoints require valid Cognito JWT
3. **DynamoDB:** IAM role limited to single table
4. **HTTPS:** Enforced via CloudFront
5. **CORS:** Restricted to frontend domain only
6. **Audit Trail:** All reviews logged with user ID and timestamp

---

## Reference: DocSense Files

These files in the existing DocSense codebase are relevant for migration:

| File | Contains |
|------|----------|
| `database/schema.sql` | SQLite schema (source data structure) |
| `database/database.py` | Database query patterns |
| `utils/filename_parser.py` | Filename parsing logic |
| `webapp/app.py` | Page rendering code (lines 313-335) |
| `config/settings.py` | Path configurations |

---

## Questions for Future Implementation

1. **Custom domain:** Do you want `review.youraoao.com` or is the CloudFront URL acceptable?
2. **Email notifications:** Should users get notified when boxes are complete?
3. **Export functionality:** Do you need to export the final decisions to CSV/PDF?
4. **Admin interface:** Do you need an admin view to add users or view all activity?