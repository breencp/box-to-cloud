# Claude Code Instructions for Box to Cloud

## AWS Amplify Gen2 - Critical Reminders

### Circular Dependency Fix for Lambda Functions

**IMPORTANT:** Circular dependencies occur when stacks reference each other. In this app:
- `storage` depends on `auth` (via `allow.groups()`)
- `data` depends on `auth` (via `allow.groups()`)
- Auth triggers are in `auth` stack

**To avoid circular dependencies:**

1. **Define functions in their own resource.ts file:**
```typescript
// amplify/functions/postConfirmation/resource.ts
import { defineFunction } from "@aws-amplify/backend";

export const postConfirmation = defineFunction({
  entry: "./handler.ts",
  resourceGroupName: "auth",  // Auth triggers go in auth stack
});
```

2. **Import and re-export from auth/resource.ts:**
```typescript
// amplify/auth/resource.ts
import { postConfirmation } from "../functions/postConfirmation/resource.js";

export const auth = defineAuth({
  triggers: { postConfirmation },
});

export { postConfirmation } from "../functions/postConfirmation/resource.js";
```

3. **DO NOT reference `backend.data.resources.tables` in backend.ts** - this creates auth → data dependency. Instead:
   - Use IAM policies with table name patterns: `arn:aws:dynamodb:*:*:table/*-Box2CloudUser-*`
   - Discover table names at runtime using `ListTables` API
   - Get `userPoolId` from the Lambda event (Cognito triggers include it)

4. **Use pattern-based IAM policies instead of direct resource references:**
```typescript
// backend.ts - CORRECT: No cross-stack references
backend.postConfirmation.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["dynamodb:Query", "dynamodb:UpdateItem"],
    resources: [`arn:aws:dynamodb:${region}:${accountId}:table/*-Box2CloudUser-*`],
  })
);
```

### Adding New Tenants

When adding a new tenant/building to the system, update these files:
1. `amplify/auth/resource.ts` - Add tenant groups to the `groups` array
2. `amplify/storage/resource.ts` - Add storage access rules for the tenant path
3. `scripts/setup_tenant.py` - Follow instructions in the script

### Lambda Runtime Table Discovery

Since we can't pass table names as environment variables (circular dependency), discover at runtime:
```typescript
let userTableName: string | null = null;

async function getUserTableName(): Promise<string> {
  if (userTableName) return userTableName;
  const result = await dynamoClient.send(new ListTablesCommand({}));
  const table = result.TableNames?.find(name => name.includes("Box2CloudUser"));
  if (!table) throw new Error("Box2CloudUser table not found");
  userTableName = table;
  return table;
}
```
