import type { PostConfirmationTriggerHandler } from "aws-lambda";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({ region: "us-east-1" });

const ADMIN_EMAIL = "breencp@gmail.com"; // Admin to notify
const FROM_EMAIL = "noreply@boxtocloud.com"; // Must be verified in SES

export const handler: PostConfirmationTriggerHandler = async (event) => {
  console.log("Post confirmation trigger executed:", JSON.stringify(event, null, 2));

  const { userPoolId } = event;
  const attrs = event.request.userAttributes;
  const email = attrs.email?.toLowerCase();
  const cognitoId = attrs.sub;

  if (!email || !cognitoId) {
    console.log("Missing email or cognitoId, skipping notification");
    return event;
  }

  // Send notification email to admin about new signup
  // The admin will need to:
  // 1. Check if this user was invited (has a pending User record)
  // 2. Link the cognitoId to their User record if so
  // 3. Add them to appropriate Cognito groups
  try {
    const emailBody = `
New user signed up on Box to Cloud:

Email: ${email}
Cognito ID: ${cognitoId}
User Pool ID: ${userPoolId}

Next steps:
1. Check if this user was invited (has a pending User record in DynamoDB)
2. If invited, update their User record to link cognitoId and set status to "active"
3. Add them to the appropriate Cognito group:

aws cognito-idp admin-add-user-to-group \\
  --user-pool-id ${userPoolId} \\
  --username ${email} \\
  --group-name tenant_XXXX_viewer  # or _reviewer
    `.trim();

    await sesClient.send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: {
          ToAddresses: [ADMIN_EMAIL],
        },
        Message: {
          Subject: {
            Data: `[Box to Cloud] New user signed up: ${email}`,
            Charset: "UTF-8",
          },
          Body: {
            Text: {
              Data: emailBody,
              Charset: "UTF-8",
            },
          },
        },
      })
    );

    console.log(`Notification email sent to ${ADMIN_EMAIL}`);
  } catch (error) {
    console.error("Failed to send notification email:", error);
    // Don't throw - we don't want to break the confirmation process
  }

  return event;
};
