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
  groups: ["admin"],
});
