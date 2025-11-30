# Claude Code Instructions for Box to Cloud

## AWS Amplify Gen2 - Critical Reminders

### Circular Dependency Fix for Auth Trigger Functions

**IMPORTANT:** Auth trigger functions (postConfirmation, preSignUp, customMessage, etc.) cause circular dependencies if you try to:
1. Add them to the `defineBackend()` call
2. Configure permissions for them in backend.ts
3. Reference other stacks (data, storage) from them

**The correct pattern:**

1. **Define the function in its own resource.ts file with `resourceGroupName: "auth"`:**
```typescript
// amplify/functions/postConfirmation/resource.ts
import { defineFunction } from "@aws-amplify/backend";

export const postConfirmation = defineFunction({
  name: "post-confirmation",
  entry: "./handler.ts",
  resourceGroupName: "auth",
});
```

2. **Import in auth/resource.ts and use in triggers:**
```typescript
// amplify/auth/resource.ts
import { postConfirmation } from "../functions/postConfirmation/resource";

export const auth = defineAuth({
  // ... config
  triggers: { postConfirmation },
});
// DO NOT re-export postConfirmation
```

3. **DO NOT add the function to backend.ts:**
```typescript
// backend.ts - CORRECT: postConfirmation is NOT included
defineBackend({
  auth,
  data,
  storage,
  // NO postConfirmation here! Auth triggers are wired via auth/resource.ts only
});
```

4. **DO NOT configure permissions for auth triggers in backend.ts** - this causes circular dependencies because:
   - `storage` depends on `auth` (via `allow.groups()`)
   - `data` depends on `auth` (via `allow.groups()`)
   - Adding the trigger to backend and referencing `backend.auth` or `backend.data` creates cycles

5. **Keep auth trigger handlers simple and self-contained:**
   - Send notification emails only
   - Do NOT access DynamoDB tables
   - Do NOT reference other Amplify resources
   - Handle database updates manually or via a separate non-trigger function

6. **If you don't need to configure resources in backend.ts, don't assign to a variable:**
```typescript
// CORRECT - no unused variable warning
defineBackend({
  auth,
  data,
  storage,
});

// INCORRECT - causes "unused variable" warning if you don't use backend
const backend = defineBackend({ ... });
```

### Adding New Tenants

When adding a new tenant/building to the system, update these files:
1. `amplify/auth/resource.ts` - Add tenant groups to the `groups` array
2. `amplify/storage/resource.ts` - Add storage access rules for the tenant path
3. `scripts/setup_tenant.py` - Follow instructions in the script

### Working Example

See `/Users/breencp/SourceCode/contribute-to-the-cause/amplify/` for a working example of auth triggers without circular dependencies.

### User Flow Reminder

The current user invite flow (simplified to avoid circular dependencies):
1. Admin creates User in AdminPage with `status: "pending"`, `cognitoId: null`
2. Admin sends user the signup link manually
3. User signs up via Cognito (self-registration enabled, MFA required)
4. postConfirmation Lambda sends email notification to admin
5. Admin manually:
   - Updates User record: set `cognitoId` and `status: "active"`
   - Adds user to Cognito group: `aws cognito-idp admin-add-user-to-group ...`
