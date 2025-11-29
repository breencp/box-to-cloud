# Claude Code Instructions for Box to Cloud

## AWS Amplify Gen2 - Critical Reminders

### Circular Dependency Fix for Lambda Functions

**IMPORTANT:** Auth trigger functions (postConfirmation, preSignUp, etc.) cause circular dependencies if you try to configure them in backend.ts.

**The correct pattern:**

1. **Define the function in its own resource.ts file with `resourceGroupName: "auth"`:**
```typescript
// amplify/auth/post-confirmation/resource.ts (or amplify/functions/postConfirmation/resource.ts)
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
  triggers: { postConfirmation },
});
```

3. **DO NOT add the function to backend.ts:**
```typescript
// backend.ts - CORRECT: postConfirmation is NOT included
const backend = defineBackend({
  auth,
  data,
  storage,
  // NO postConfirmation here!
});
```

4. **DO NOT try to add permissions to the trigger function in backend.ts** - this causes circular dependencies. The function should be self-contained and not require cross-stack references.

5. **If the trigger needs to access DynamoDB or other resources**, keep it simple:
   - Just send a notification email
   - Handle the actual database updates manually or via a separate function
   - Or use the Amplify data client with proper IAM role (more complex setup)

### Adding New Tenants

When adding a new tenant/building to the system, update these files:
1. `amplify/auth/resource.ts` - Add tenant groups to the `groups` array
2. `amplify/storage/resource.ts` - Add storage access rules for the tenant path
3. `scripts/setup_tenant.py` - Follow instructions in the script

### Working Example

See `/Users/breencp/SourceCode/contribute-to-the-cause/amplify/` for a working example of auth triggers without circular dependencies.
