import { defineBackend } from '@aws-amplify/backend';
import { auth, postConfirmation } from './auth/resource.js';
import { data } from './data/resource.js';
import { storage } from './storage/resource.js';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Stack } from 'aws-cdk-lib';

const backend = defineBackend({
  auth,
  data,
  storage,
  postConfirmation,
});

// Self-registration is allowed - users sign up after being invited
// Security is enforced via Cognito groups (users have no group access until admin adds them)

// Get references we need - all from auth stack to avoid circular dependencies
const authStack = Stack.of(backend.auth.resources.userPool);
const region = authStack.region;
const accountId = authStack.account;

// Grant the post-confirmation Lambda broad DynamoDB access for Box2CloudUser table
// We use a policy with table name pattern instead of referencing data stack directly
backend.postConfirmation.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      "dynamodb:ListTables", // Needed to discover table name at runtime
    ],
    resources: ["*"],
  })
);

backend.postConfirmation.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      "dynamodb:Query",
      "dynamodb:GetItem",
      "dynamodb:UpdateItem",
    ],
    resources: [
      `arn:aws:dynamodb:${region}:${accountId}:table/*-Box2CloudUser-*`,
      `arn:aws:dynamodb:${region}:${accountId}:table/*-Box2CloudUser-*/index/*`,
    ],
  })
);

// Grant Cognito permissions to list admin users
backend.postConfirmation.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      "cognito-idp:ListUsersInGroup",
    ],
    resources: [backend.auth.resources.userPool.userPoolArn],
  })
);

// Grant SES permissions to send emails
backend.postConfirmation.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["ses:SendEmail"],
    resources: ["*"], // Restrict to specific identity ARN in production
  })
);
