import { defineAuth } from "@aws-amplify/backend";

/**
 * Box to Cloud Authentication Configuration
 *
 * Configured for invite-only email-based authentication with Cognito.
 * MFA is required using TOTP (authenticator app).
 * Users are invited by admins - no self-registration allowed.
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
});
