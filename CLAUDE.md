# Claude Code Instructions for Box to Cloud

## AWS Amplify Gen2 - Critical Reminders

### Auth Trigger Functions (postConfirmation, preSignUp, etc.)

Auth triggers are placed in `amplify/auth/` folder (e.g., `amplify/auth/post-confirmation/`) and defined with `resourceGroupName: "auth"`.

**Pattern for auth triggers that need to call other functions:**

1. Keep the auth trigger simple - it invokes a separate Lambda function
2. The separate function (e.g., `activateUser`) is added to backend.ts where permissions can be configured
3. Auth trigger needs Lambda invoke permissions and the function ARN as environment variable

**After deployment, set environment variable on postConfirmation Lambda:**
```bash
aws lambda update-function-configuration \
  --function-name <POST_CONFIRMATION_FUNCTION_NAME> \
  --environment "Variables={ACTIVATE_USER_FUNCTION_ARN=<ACTIVATE_USER_ARN>}"
```

### Adding New Tenants

When adding a new tenant/building to the system, update these files:
1. `amplify/auth/resource.ts` - Add tenant groups to the `groups` array
2. `amplify/storage/resource.ts` - Add storage access rules for the tenant path

### User Flow

1. Admin invites user via AdminPage (creates User record with `status: "pending"`)
2. Invitation email is sent automatically with signup link
3. User signs up via Cognito (MFA required)
4. postConfirmation trigger invokes activateUser function which:
   - Looks up User by email
   - Sets cognitoId and status to "active"
   - Adds user to appropriate Cognito groups based on UserTenant assignments
5. User can now access the app with their tenant permissions

### DynamoDB Table Names

- User table: `Box2CloudUser-ddbyou2nijbrln3l2njq3v7hja-NONE`

### Working Example

See `/Users/breencp/SourceCode/contribute-to-the-cause/amplify/` for reference patterns.
