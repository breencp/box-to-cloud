# Claude Code Instructions for Box to Cloud

## AWS Amplify Gen2 - Critical Reminders

### Circular Dependency Fix for Lambda Functions

**IMPORTANT:** When defining Lambda functions that access resources from multiple stacks, you MUST:
1. Define the function in its own `resource.ts` file (not inline in auth/resource.ts)
2. Assign it to the appropriate resource group based on what it accesses

```typescript
// amplify/functions/postConfirmation/resource.ts
import { defineFunction } from "@aws-amplify/backend";

export const postConfirmation = defineFunction({
  entry: "./handler.ts",
  resourceGroupName: "data",  // <-- Uses "data" because it accesses DynamoDB tables
});
```

Then import and re-export from auth/resource.ts:
```typescript
// amplify/auth/resource.ts
import { postConfirmation } from "../functions/postConfirmation/resource.js";

export const auth = defineAuth({
  // ...
  triggers: {
    postConfirmation,
  },
});

export { postConfirmation } from "../functions/postConfirmation/resource.js";
```

**Resolution rules - assign based on what the function ACCESSES, not what triggers it:**
1. If your function accesses **DynamoDB tables** (data resources), assign it to the `data` stack: `resourceGroupName: "data"`
2. If your function accesses **storage** (S3), assign it to the `storage` stack: `resourceGroupName: "storage"`
3. If your function ONLY accesses **auth resources** and nothing else, assign it to the `auth` stack: `resourceGroupName: "auth"`

**Important:** Even if a function is an auth trigger (like `postConfirmation`), if it accesses DynamoDB tables via `backend.data.resources.tables`, it must be assigned to the `data` stack to avoid circular dependencies.

### Adding New Tenants

When adding a new tenant/building to the system, update these files:
1. `amplify/auth/resource.ts` - Add tenant groups to the `groups` array
2. `amplify/storage/resource.ts` - Add storage access rules for the tenant path
3. `scripts/setup_tenant.py` - Follow instructions in the script

### Lambda Environment Variables

When a Lambda needs access to other Amplify resources (DynamoDB tables, User Pool, etc.), cast the Lambda to `Function` type to access `addEnvironment`:

```typescript
import { Function } from 'aws-cdk-lib/aws-lambda';

const myLambda = backend.myFunction.resources.lambda as Function;
myLambda.addEnvironment("TABLE_NAME", table.tableName);
```
