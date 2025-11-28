import { defineStorage } from "@aws-amplify/backend";

/**
 * Box to Cloud Storage Configuration
 *
 * S3 bucket for storing page images extracted from scanned PDFs.
 * Structure: {tenant}/{box}/{set}/page_{pageNumber}.png
 * Example: wth/001/box_001_20251110_173850/page_0001.png
 *
 * Access: Each tenant's files are restricted to their Cognito groups.
 * When adding a new tenant, add a new path rule below.
 */
export const storage = defineStorage({
  name: "box2cloud-pages",
  access: (allow) => ({
    // Waikiki Townhouse
    "wth/*": [
      allow.groups(["tenant_wth_viewer", "tenant_wth_reviewer"]).to(["read"]),
      allow.groups(["admin"]).to(["read", "write", "delete"]),
    ],
    // Add new tenants here:
    // "abc/*": [
    //   allow.groups(["tenant_abc_viewer", "tenant_abc_reviewer"]).to(["read"]),
    //   allow.groups(["admin"]).to(["read", "write", "delete"]),
    // ],
  }),
});
