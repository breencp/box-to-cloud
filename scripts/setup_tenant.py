#!/usr/bin/env python3
"""
Box to Cloud - Tenant Setup Script

Creates Cognito groups for a new tenant/building.

Usage:
    python setup_tenant.py

The script will prompt for:
    - Building/tenant name
    - User Pool ID (from AWS Cognito)

It will then create the necessary Cognito groups and provide next steps.
"""

import subprocess
import sys
import re


def sanitize_tenant_id(name: str) -> str:
    """Convert a building name to a safe tenant ID."""
    # Convert to lowercase, replace spaces with underscores, remove special chars
    tenant_id = name.lower().strip()
    tenant_id = re.sub(r'\s+', '_', tenant_id)
    tenant_id = re.sub(r'[^a-z0-9_]', '', tenant_id)
    return tenant_id


def create_cognito_group(user_pool_id: str, group_name: str) -> bool:
    """Create a Cognito group using AWS CLI."""
    try:
        result = subprocess.run(
            [
                "aws", "cognito-idp", "create-group",
                "--user-pool-id", user_pool_id,
                "--group-name", group_name
            ],
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            print(f"  Created group: {group_name}")
            return True
        elif "GroupExistsException" in result.stderr:
            print(f"  Group already exists: {group_name}")
            return True
        else:
            print(f"  Error creating group {group_name}: {result.stderr}")
            return False
    except FileNotFoundError:
        print("Error: AWS CLI not found. Please install and configure the AWS CLI.")
        sys.exit(1)


def main():
    print("=" * 60)
    print("Box to Cloud - Tenant Setup")
    print("=" * 60)
    print()

    # Get building name
    building_name = input("Enter building/AOAO name: ").strip()
    if not building_name:
        print("Error: Building name is required.")
        sys.exit(1)

    # Generate tenant ID
    tenant_id = sanitize_tenant_id(building_name)
    print(f"\nTenant ID will be: {tenant_id}")

    # Confirm or allow override
    custom_id = input(f"Press Enter to use '{tenant_id}' or type a custom ID: ").strip()
    if custom_id:
        tenant_id = sanitize_tenant_id(custom_id)
        print(f"Using tenant ID: {tenant_id}")

    print()

    # Get User Pool ID
    print("You can find your User Pool ID by running:")
    print("  aws cognito-idp list-user-pools --max-results 10")
    print()
    print("Or in the AWS Console:")
    print("  Cognito > User pools > [your pool] > User pool overview")
    print()
    print("The ID format is: us-east-1_XXXXXXXX (region_alphanumeric)")
    print()
    user_pool_id = input("Enter Cognito User Pool ID: ").strip()
    if not user_pool_id:
        print("Error: User Pool ID is required.")
        sys.exit(1)

    # Validate format
    if not re.match(r'^[\w-]+_[0-9a-zA-Z]+$', user_pool_id):
        print()
        print("Warning: The User Pool ID doesn't match the expected format (region_alphanumeric).")
        print("Expected format example: us-east-1_ABC123xyz")
        print()
        confirm = input("Continue anyway? (y/N): ").strip().lower()
        if confirm != 'y':
            print("Aborted.")
            sys.exit(1)

    print()
    print("-" * 60)
    print("Creating Cognito groups...")
    print("-" * 60)

    # Define groups to create
    groups = [
        f"tenant_{tenant_id}_viewer",
        f"tenant_{tenant_id}_reviewer",
    ]

    # Create groups
    all_success = True
    for group in groups:
        if not create_cognito_group(user_pool_id, group):
            all_success = False

    print()
    print("=" * 60)
    print("NEXT STEPS")
    print("=" * 60)
    print()

    if all_success:
        print("1. Create the tenant in the Admin UI:")
        print(f"   - Go to Admin > Tenants > Add Tenant")
        print(f"   - Name: {building_name}")
        print(f"   - Group ID: {tenant_id}")
        print()
        print("2. To upload scanned pages for this tenant, run:")
        print(f"   python upload_pages.py /path/to/pdfs --tenant {tenant_id}")
        print()
        print("3. To invite users to this tenant:")
        print(f"   - Go to Admin > Invites > Send Invite")
        print(f"   - Select the tenant and role (viewer or reviewer)")
        print()
        print("4. After creating a user in Cognito, add them to the appropriate group:")
        print(f"   aws cognito-idp admin-add-user-to-group \\")
        print(f"     --user-pool-id {user_pool_id} \\")
        print(f"     --username USER_EMAIL \\")
        print(f"     --group-name tenant_{tenant_id}_viewer")
        print()
        print("   Or for reviewers:")
        print(f"   aws cognito-idp admin-add-user-to-group \\")
        print(f"     --user-pool-id {user_pool_id} \\")
        print(f"     --username USER_EMAIL \\")
        print(f"     --group-name tenant_{tenant_id}_reviewer")
    else:
        print("Some groups failed to create. Please check the errors above")
        print("and try creating them manually in the AWS Console.")

    print()
    print("=" * 60)


if __name__ == "__main__":
    main()
