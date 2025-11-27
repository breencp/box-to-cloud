import { defineAuth } from "@aws-amplify/backend";

/**
 * Box to Cloud Authentication Configuration
 *
 * Configured for email-based authentication with Cognito.
 * MFA is required using TOTP (authenticator app).
 * Board members will be invited via admin-create-user.
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
});
