import type { PostConfirmationTriggerHandler } from "aws-lambda";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const region = "us-east-1";
const lambdaClient = new LambdaClient({ region });
const sesClient = new SESClient({ region });

const ADMIN_EMAIL = "breencp@gmail.com";
const FROM_EMAIL = "support@boxtocloud.com";

// The activateUser function ARN is set via environment variable
const ACTIVATE_USER_FUNCTION_ARN = process.env.ACTIVATE_USER_FUNCTION_ARN || "";

export const handler: PostConfirmationTriggerHandler = async (event) => {
  console.log("Post confirmation trigger executed:", JSON.stringify(event, null, 2));

  const { userPoolId } = event;
  const attrs = event.request.userAttributes;
  const email = attrs.email?.toLowerCase();
  const cognitoId = attrs.sub;

  if (!email || !cognitoId) {
    console.log("Missing email or cognitoId, skipping");
    return event;
  }

  try {
    // Invoke the activateUser function to handle DynamoDB and Cognito operations
    const response = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: ACTIVATE_USER_FUNCTION_ARN,
        Payload: JSON.stringify({
          email,
          cognitoId,
          userPoolId,
        }),
      })
    );

    const result = JSON.parse(new TextDecoder().decode(response.Payload));
    console.log("activateUser result:", result);

    // Send admin notification with the result
    await sendAdminNotification(email, cognitoId, userPoolId, result.message || "Unknown result");

  } catch (error) {
    console.error("Error in postConfirmation:", error);
    await sendAdminNotification(email, cognitoId, userPoolId, `Error: ${error}`);
  }

  return event;
};

async function sendAdminNotification(
  email: string,
  cognitoId: string,
  userPoolId: string,
  status: string
) {
  try {
    const emailBody = `
Box to Cloud - New User Signup

Email: ${email}
Cognito ID: ${cognitoId}
User Pool ID: ${userPoolId}

Status: ${status}
    `.trim();

    await sesClient.send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [ADMIN_EMAIL] },
        Message: {
          Subject: {
            Data: `[Box to Cloud] User signup: ${email}`,
            Charset: "UTF-8",
          },
          Body: {
            Text: { Data: emailBody, Charset: "UTF-8" },
          },
        },
      })
    );
    console.log(`Admin notification sent to ${ADMIN_EMAIL}`);
  } catch (error) {
    console.error("Failed to send admin notification:", error);
  }
}
