import type { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } from "@aws-sdk/client-cognito-identity-provider";

const region = process.env.AWS_REGION || "us-east-1";
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const cognitoClient = new CognitoIdentityProviderClient({ region });

// Environment variables set in backend.ts
const USER_TABLE = process.env.USER_TABLE_NAME || "";
const USER_TENANT_TABLE = process.env.USER_TENANT_TABLE_NAME || "";
const TENANT_TABLE = process.env.TENANT_TABLE_NAME || "";

interface ActivateUserEvent {
  email: string;
  cognitoId: string;
  userPoolId: string;
}

interface ActivateUserResult {
  success: boolean;
  message: string;
  groupsAdded: string[];
}

export const handler: Handler<ActivateUserEvent, ActivateUserResult> = async (event) => {
  console.log("Activate user handler:", JSON.stringify(event, null, 2));

  const { email, cognitoId, userPoolId } = event;
  const groupsAdded: string[] = [];

  if (!email || !cognitoId || !userPoolId) {
    return {
      success: false,
      message: "Missing required fields: email, cognitoId, or userPoolId",
      groupsAdded: [],
    };
  }

  try {
    // 1. Look up user by email in User table
    const userQuery = await dynamoClient.send(
      new QueryCommand({
        TableName: USER_TABLE,
        IndexName: "byEmail",
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: { ":email": email.toLowerCase() },
      })
    );

    const user = userQuery.Items?.[0];
    if (!user) {
      return {
        success: false,
        message: `No pending user found for email ${email}`,
        groupsAdded: [],
      };
    }

    console.log(`Found user: ${user.id}, status: ${user.status}`);

    // 2. Update user with cognitoId and set status to active
    await dynamoClient.send(
      new UpdateCommand({
        TableName: USER_TABLE,
        Key: { id: user.id },
        UpdateExpression: "SET cognitoId = :cognitoId, #status = :status, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":cognitoId": cognitoId,
          ":status": "active",
          ":updatedAt": new Date().toISOString(),
        },
      })
    );
    console.log(`Updated user ${user.id} with cognitoId and status=active`);

    // 3. Get user's tenant assignments
    const userTenantQuery = await dynamoClient.send(
      new QueryCommand({
        TableName: USER_TENANT_TABLE,
        IndexName: "byUser",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": user.id },
      })
    );

    const userTenants = userTenantQuery.Items || [];
    console.log(`Found ${userTenants.length} tenant assignments for user`);

    // 4. For each tenant assignment, get the tenant's groupId and add user to Cognito group
    for (const ut of userTenants) {
      if (!ut.isActive) continue;

      // Get tenant to find groupId
      const tenantResult = await dynamoClient.send(
        new GetCommand({
          TableName: TENANT_TABLE,
          Key: { id: ut.tenantId },
        })
      );

      const tenant = tenantResult.Item;
      if (!tenant) {
        console.log(`Tenant ${ut.tenantId} not found, skipping`);
        continue;
      }

      // Build the Cognito group name: tenant_{groupId}_{role}
      const groupName = `tenant_${tenant.groupId}_${ut.role}`;
      console.log(`Adding user to Cognito group: ${groupName}`);

      try {
        await cognitoClient.send(
          new AdminAddUserToGroupCommand({
            UserPoolId: userPoolId,
            Username: email.toLowerCase(),
            GroupName: groupName,
          })
        );
        console.log(`Successfully added user to group ${groupName}`);
        groupsAdded.push(groupName);
      } catch (groupError) {
        console.error(`Failed to add user to group ${groupName}:`, groupError);
      }
    }

    return {
      success: true,
      message: `User activated and added to ${groupsAdded.length} group(s)`,
      groupsAdded,
    };

  } catch (error) {
    console.error("Error in activateUser:", error);
    return {
      success: false,
      message: `Error: ${error}`,
      groupsAdded: [],
    };
  }
};
