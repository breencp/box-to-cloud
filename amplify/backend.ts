import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource.js';
import { data } from './data/resource.js';
import { storage } from './storage/resource.js';
import { activateUser } from './functions/activate-user/resource.js';
import * as iam from 'aws-cdk-lib/aws-iam';

/**
 * Box to Cloud Backend
 *
 * Self-registration is allowed - users sign up after being invited.
 * Security is enforced via Cognito groups (users have no group access until admin adds them).
 *
 * Note: The postConfirmation Lambda is configured in auth/resource.ts as a trigger.
 * It invokes the activateUser function to handle DynamoDB and Cognito operations.
 */
const backend = defineBackend({
  auth,
  data,
  storage,
  activateUser,
});

// Configure activateUser function
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const activateUserLambda = backend.activateUser.resources.lambda as any;

// Grant DynamoDB permissions
backend.data.resources.tables["Box2CloudUser"].grantReadWriteData(backend.activateUser.resources.lambda);
backend.data.resources.tables["Box2CloudUserTenant"].grantReadData(backend.activateUser.resources.lambda);
backend.data.resources.tables["Box2CloudTenant"].grantReadData(backend.activateUser.resources.lambda);

// Grant permission to query GSIs
activateUserLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['dynamodb:Query'],
    resources: [
      `${backend.data.resources.tables["Box2CloudUser"].tableArn}/index/*`,
      `${backend.data.resources.tables["Box2CloudUserTenant"].tableArn}/index/*`,
    ],
  })
);

// Grant Cognito permissions to add users to groups
activateUserLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['cognito-idp:AdminAddUserToGroup'],
    resources: [backend.auth.resources.userPool.userPoolArn],
  })
);

// Set environment variables for table names
activateUserLambda.addEnvironment(
  "USER_TABLE_NAME",
  backend.data.resources.tables["Box2CloudUser"].tableName
);
activateUserLambda.addEnvironment(
  "USER_TENANT_TABLE_NAME",
  backend.data.resources.tables["Box2CloudUserTenant"].tableName
);
activateUserLambda.addEnvironment(
  "TENANT_TABLE_NAME",
  backend.data.resources.tables["Box2CloudTenant"].tableName
);

// Grant the postConfirmation trigger permission to invoke activateUser
// The postConfirmation Lambda needs to be able to call the activateUser function
backend.activateUser.resources.lambda.grantInvoke(
  backend.auth.resources.cfnResources.cfnUserPool
);

// Also need to grant via a broader policy since the trigger Lambda isn't directly accessible
// The auth stack will have a Lambda with a role we need to grant
const activateUserArn = backend.activateUser.resources.lambda.functionArn;

// Add a resource-based policy to allow any Lambda in the account to invoke activateUser
// This is needed because we can't directly access the postConfirmation Lambda's role
backend.activateUser.resources.lambda.addPermission('AllowAuthTriggerInvoke', {
  principal: new iam.ServicePrincipal('lambda.amazonaws.com'),
  action: 'lambda:InvokeFunction',
  sourceAccount: backend.activateUser.resources.lambda.env.CDK_DEFAULT_ACCOUNT,
});

// Export the activateUser ARN as a stack output so it can be referenced
// We'll need to set this as an environment variable on the postConfirmation Lambda manually
// or through a custom resource after deployment
console.log("ACTIVATE_USER_FUNCTION_ARN needs to be set on postConfirmation Lambda:", activateUserArn);
