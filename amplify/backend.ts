import { defineBackend } from '@aws-amplify/backend';
import { auth, postConfirmation } from './auth/resource.js';
import { data } from './data/resource.js';
import { storage } from './storage/resource.js';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Function } from 'aws-cdk-lib/aws-lambda';

const backend = defineBackend({
  auth,
  data,
  storage,
  postConfirmation,
});

// Self-registration is allowed - users sign up after being invited
// Security is enforced via Cognito groups (users have no group access until admin adds them)

// Grant the post-confirmation Lambda access to DynamoDB, Cognito, and SES
const postConfirmationLambda = backend.postConfirmation.resources.lambda as Function;

// Get the User table name from data resources
const tables = backend.data.resources.tables;
const userTable = tables["Box2CloudUser"];

if (userTable) {
  // Grant DynamoDB access
  userTable.grantReadWriteData(postConfirmationLambda);

  // Add environment variables
  postConfirmationLambda.addEnvironment("USER_TABLE_NAME", userTable.tableName);
}

// Add User Pool ID
postConfirmationLambda.addEnvironment(
  "USER_POOL_ID",
  backend.auth.resources.userPool.userPoolId
);

// Add SES from email (you'll need to verify this in SES)
postConfirmationLambda.addEnvironment(
  "SES_FROM_EMAIL",
  "noreply@boxtocloud.com" // Update this to your verified SES email
);

// Grant Cognito permissions to list admin users
postConfirmationLambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      "cognito-idp:ListUsersInGroup",
    ],
    resources: [backend.auth.resources.userPool.userPoolArn],
  })
);

// Grant SES permissions to send emails
postConfirmationLambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["ses:SendEmail"],
    resources: ["*"], // Restrict to specific identity ARN in production
  })
);
