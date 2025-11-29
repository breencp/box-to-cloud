import { defineAuth } from "@aws-amplify/backend";
import { postConfirmation } from "../functions/postConfirmation/resource.js";

/**
 * Box to Cloud Authentication Configuration
 *
 * Users self-register after being invited via the admin UI.
 * MFA is required using TOTP (authenticator app).
 * Security is enforced via Cognito groups - users have no access until added to groups.
 *
 * Groups:
 * - admin: Super-admins who can manage all tenants and users
 * - tenant_{id}_viewer: Read-only access to a tenant's data
 * - tenant_{id}_reviewer: Can review pages for a tenant
 *
 * When adding a new tenant, add their groups here AND in storage/resource.ts
 *
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  userAttributes: {
    email: {
      required: true,
      mutable: true,
    },
  },
  multifactor: {
    mode: "REQUIRED",
    totp: true,
  },
  groups: [
    "admin",
    // Waikiki Townhouse
    "tenant_wth_viewer",
    "tenant_wth_reviewer",
    // Add new tenant groups here:
    // "tenant_abc_viewer",
    // "tenant_abc_reviewer",
  ],
  triggers: {
    postConfirmation,
  },
});

export { postConfirmation } from "../functions/postConfirmation/resource.js";
