import { defineStorage } from "@aws-amplify/backend";

/**
 * Box to Cloud Storage Configuration
 *
 * S3 bucket for storing page images extracted from scanned PDFs.
 * Structure: pages/{boxNumber}/{docId}/page_{pageNumber}.png
 */
export const storage = defineStorage({
  name: "box2cloud-pages",
  access: (allow) => ({
    "pages/*": [
      allow.authenticated.to(["read"]),
    ],
  }),
});
