import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource.js';
import { data } from './data/resource.js';
import { storage } from './storage/resource.js';

/**
 * Box to Cloud Backend
 *
 * Self-registration is allowed - users sign up after being invited.
 * Security is enforced via Cognito groups (users have no group access until admin adds them).
 *
 * Note: The postConfirmation Lambda is configured in auth/resource.ts as a trigger.
 * It is NOT added to the backend definition to avoid circular dependencies.
 * The Lambda sends a simple notification email - no DynamoDB access needed.
 */
defineBackend({
  auth,
  data,
  storage,
});
