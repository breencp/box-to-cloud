# Claude Code Instructions for Box to Cloud

## AWS Amplify Gen2 - Critical Reminders

### Circular Dependency Fix for Lambda Functions

**IMPORTANT:** When defining Lambda functions that are used as auth triggers (like `postConfirmation`), you MUST assign them to the appropriate resource group to avoid CloudFormation circular dependency errors.

```typescript
// CORRECT - Assign auth triggers to the "auth" resource group
const postConfirmation = defineFunction({
  entry: "../functions/postConfirmation/handler.ts",
  resourceGroupName: "auth",  // <-- REQUIRED for auth triggers
});
```

**Resolution rules:**
1. If your function is defined as an **auth trigger** (postConfirmation, preSignUp, etc.), assign it to the `auth` stack: `resourceGroupName: "auth"`
2. If your function is used as a **data resolver** or calls the data API, assign it to the `data` stack: `resourceGroupName: "data"`
3. If your function accesses **storage**, assign it to the `storage` stack: `resourceGroupName: "storage"`

Without `resourceGroupName`, Amplify creates a separate nested stack for each function, which can cause circular dependencies when the function needs access to resources from multiple stacks.

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
