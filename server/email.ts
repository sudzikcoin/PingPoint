import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
// Use Resend's test domain if no verified domain is configured
// onboarding@resend.dev works without domain verification for testing
const defaultFrom = process.env.MAIL_FROM || "PingPoint <onboarding@resend.dev>";

if (!resendApiKey) {
  console.warn("[Email] RESEND_API_KEY is not set; email sending will fallback to console logging.");
}

const resend = resendApiKey ? new Resend(resendApiKey) : null;

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export async function sendTransactionalEmail(params: EmailParams): Promise<boolean> {
  const fromAddress = params.from || defaultFrom;
  
  if (!resend) {
    console.log("[DEV EMAIL] Would send email:");
    console.log(`  To: ${params.to}`);
    console.log(`  Subject: ${params.subject}`);
    console.log(`  From: ${fromAddress}`);
    console.log(`  Body (text): ${params.text || "(html only)"}`);
    return true;
  }

  try {
    console.log(`[Email] Sending to ${params.to} from ${fromAddress}...`);
    const result = await resend.emails.send({
      from: fromAddress,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    
    if (result.error) {
      console.error(`[Email] Resend API error:`, result.error);
      return false;
    }
    
    console.log(`[Email] Successfully sent to ${params.to}, id: ${result.data?.id}`);
    return true;
  } catch (error: any) {
    console.error("[Email] Failed to send:", error?.message || error);
    return false;
  }
}

export async function sendBrokerVerificationEmail(
  email: string, 
  verificationUrl: string,
  brokerName?: string
): Promise<boolean> {
  const name = brokerName || "there";
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" style="max-width:520px;background:#111;border-radius:12px;border:1px solid #222;">
              <tr>
                <td style="padding:32px 28px;">
                  <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#fff;">
                    🎮 PingPoint
                  </h1>
                  <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#ccc;">
                    Hey ${name},
                  </p>
                  <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#ccc;">
                    Here is your secure link to access your PingPoint load dashboard:
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding:8px 0 24px;">
                        <a href="${verificationUrl}" style="display:inline-block;padding:14px 32px;border-radius:9999px;background:#facc15;color:#000;text-decoration:none;font-weight:600;font-size:15px;">
                          Open PingPoint Console
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#888;">
                    Or copy and paste this URL into your browser:
                  </p>
                  <p style="margin:0 0 24px;font-size:12px;line-height:1.4;color:#666;word-break:break-all;">
                    <code style="background:#1a1a1a;padding:8px 12px;border-radius:6px;display:block;color:#888;">
                      ${verificationUrl}
                    </code>
                  </p>
                  <p style="margin:0;font-size:12px;line-height:1.5;color:#666;">
                    If you did not request this link, you can safely ignore this email.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 28px;border-top:1px solid #222;">
                  <p style="margin:0;font-size:11px;color:#555;text-align:center;">
                    PingPoint by SuVerse Labs · Real-time logistics tracking
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const text = `Hey ${name},

Here is your secure link to access your PingPoint load dashboard:

${verificationUrl}

If you did not request this link, you can safely ignore this email.

---
PingPoint by SuVerse Labs
Real-time logistics tracking`;

  return sendTransactionalEmail({
    to: email,
    subject: "Your PingPoint Access Link",
    html,
    text,
  });
}

export async function sendDriverAppLink(
  phone: string,
  driverUrl: string
): Promise<boolean> {
  console.log(`[SMS STUB] Would send SMS to ${phone}: ${driverUrl}`);
  return true;
}
