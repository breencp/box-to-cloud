import { defineAuth } from "@aws-amplify/backend";

/**
 * DocSense Cloud Authentication Configuration
 *
 * Configured for email-based authentication with Cognito.
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
});
