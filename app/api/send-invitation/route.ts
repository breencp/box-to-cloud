import { NextRequest, NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({ region: "us-east-1" });

const FROM_EMAIL = "me@christopherbreen.com";

interface InvitationRequest {
  email: string;
  fullName: string;
  tenantName: string;
  role: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: InvitationRequest = await request.json();
    const { email, fullName, tenantName, role } = body;

    if (!email || !fullName || !tenantName || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get the app URL from the request
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "https://boxtocloud.com";
    const signupUrl = `${appUrl}/signup`;

    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; border-spacing: 0; background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td style="text-align: center;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; border-spacing: 0; max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e5e7eb;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1f2937;">Box to Cloud</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; font-size: 20px; font-weight: 600; color: #1f2937;">You've Been Invited!</h2>

              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #4b5563;">
                Hi ${fullName},
              </p>

              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #4b5563;">
                You've been invited to join <strong>${tenantName}</strong> on Box to Cloud as a <strong>${role}</strong>.
              </p>

              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.6; color: #4b5563;">
                Click the button below to create your account and get started:
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="border-collapse: collapse; border-spacing: 0; margin: 0 auto 30px;">
                <tr>
                  <td style="background-color: #2563eb; border-radius: 6px;">
                    <a href="${signupUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">
                      Create Your Account
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 10px; font-size: 14px; line-height: 1.6; color: #6b7280;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 30px; font-size: 14px; line-height: 1.6; color: #2563eb; word-break: break-all;">
                <a href="${signupUrl}" style="color: #2563eb;">${signupUrl}</a>
              </p>

              <!-- Info Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; border-spacing: 0; background-color: #eff6ff; border-radius: 6px; border-left: 4px solid #2563eb;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 10px; font-size: 14px; font-weight: 600; color: #1e40af;">What to expect:</p>
                    <ul style="margin: 0; padding: 0 0 0 20px; font-size: 14px; line-height: 1.8; color: #1e40af;">
                      <li>Create your account using this email address</li>
                      <li>Set up multi-factor authentication (required)</li>
                      <li>Access will be granted after admin approval</li>
                    </ul>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                This invitation was sent to ${email}.<br>
                If you didn't expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const textBody = `
You've Been Invited to Box to Cloud!

Hi ${fullName},

You've been invited to join ${tenantName} on Box to Cloud as a ${role}.

Create your account here: ${signupUrl}

What to expect:
- Create your account using this email address (${email})
- Set up multi-factor authentication (required)
- Access will be granted after admin approval

If you didn't expect this email, you can safely ignore it.
    `.trim();

    await sesClient.send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: {
          ToAddresses: [email],
        },
        Message: {
          Subject: {
            Data: `You've been invited to ${tenantName} on Box to Cloud`,
            Charset: "UTF-8",
          },
          Body: {
            Html: {
              Data: htmlBody,
              Charset: "UTF-8",
            },
            Text: {
              Data: textBody,
              Charset: "UTF-8",
            },
          },
        },
      })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send invitation email:", error);
    return NextResponse.json(
      { error: "Failed to send invitation email" },
      { status: 500 }
    );
  }
}
