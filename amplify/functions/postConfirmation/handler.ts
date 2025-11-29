import type { PostConfirmationTriggerHandler } from "aws-lambda";
import {
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const dynamoClient = new DynamoDBClient({});
const cognitoClient = new CognitoIdentityProviderClient({});
const sesClient = new SESClient({});

// Table name is discovered at runtime since we can't reference data stack during deployment
let userTableName: string | null = null;

async function getUserTableName(): Promise<string> {
  if (userTableName) return userTableName;

  const result = await dynamoClient.send(new ListTablesCommand({}));
  const table = result.TableNames?.find(name => name.includes("Box2CloudUser"));
  if (!table) {
    throw new Error("Box2CloudUser table not found");
  }
  userTableName = table;
  return table;
}

const SES_FROM_EMAIL = "noreply@boxtocloud.com"; // Hardcoded since we can't pass env vars without circular dep

export const handler: PostConfirmationTriggerHandler = async (event) => {
  const { userPoolId, request } = event;
  const email = request.userAttributes.email?.toLowerCase();
  const cognitoId = request.userAttributes.sub;

  if (!email || !cognitoId) {
    console.log("Missing email or cognitoId, skipping");
    return event;
  }

  console.log(`Post-confirmation for user: ${email} (${cognitoId})`);

  try {
    const tableName = await getUserTableName();

    // Find pending user by email in DynamoDB
    const queryResult = await dynamoClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "byEmail",
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: {
          ":email": { S: email },
        },
      })
    );

    const pendingUser = queryResult.Items?.find(
      (item) => item.status?.S === "pending"
    );

    if (pendingUser) {
      // Link the Cognito ID and activate the user
      await dynamoClient.send(
        new UpdateItemCommand({
          TableName: tableName,
          Key: { id: pendingUser.id },
          UpdateExpression: "SET cognitoId = :cognitoId, #status = :status, updatedAt = :updatedAt",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":cognitoId": { S: cognitoId },
            ":status": { S: "active" },
            ":updatedAt": { S: new Date().toISOString() },
          },
        })
      );

      console.log(`Linked user ${email} to cognitoId ${cognitoId}`);

      // Notify admins
      await notifyAdmins(userPoolId, email, pendingUser.fullName?.S || email);
    } else {
      console.log(`No pending user found for email ${email}`);
      // User signed up without being invited - they won't have any group access
      // Admin will need to manually add them if appropriate
      await notifyAdmins(userPoolId, email, email, true);
    }
  } catch (error) {
    console.error("Error in post-confirmation handler:", error);
    // Don't throw - let the user sign up succeed even if our linking fails
  }

  return event;
};

async function notifyAdmins(
  userPoolId: string,
  userEmail: string,
  userName: string,
  uninvited = false
): Promise<void> {
  try {
    // Get all users in the admin group
    const adminUsers = await cognitoClient.send(
      new ListUsersInGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admin",
      })
    );

    const adminEmails: string[] = [];
    for (const user of adminUsers.Users || []) {
      const emailAttr = user.Attributes?.find((a) => a.Name === "email");
      if (emailAttr?.Value) {
        adminEmails.push(emailAttr.Value);
      }
    }

    if (adminEmails.length === 0) {
      console.log("No admin emails found to notify");
      return;
    }

    const subject = uninvited
      ? `[Box to Cloud] New uninvited user signed up: ${userEmail}`
      : `[Box to Cloud] User signed up: ${userName}`;

    const body = uninvited
      ? `A new user has signed up without being invited:\n\nEmail: ${userEmail}\n\nThis user has no group access. If they should have access, please add them to the appropriate Cognito groups.`
      : `A user has completed their account signup:\n\nName: ${userName}\nEmail: ${userEmail}\n\nPlease add them to the appropriate Cognito groups to grant access:\n\naws cognito-idp admin-add-user-to-group \\\n  --user-pool-id ${userPoolId} \\\n  --username ${userEmail} \\\n  --group-name tenant_XXXX_viewer  # or _reviewer`;

    await sesClient.send(
      new SendEmailCommand({
        Source: SES_FROM_EMAIL,
        Destination: {
          ToAddresses: adminEmails,
        },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: body } },
        },
      })
    );

    console.log(`Notified admins: ${adminEmails.join(", ")}`);
  } catch (error) {
    console.error("Error notifying admins:", error);
    // Don't throw - notification failure shouldn't block the user
  }
}
