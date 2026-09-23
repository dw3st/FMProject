import type { OutgoingEmail } from "@/backend/auth/sendEmail";

const APP_NAME = "TouchLines";

/** Builds the login-code email (subject + plain-text + HTML) for a magic code. */
export function buildLoginCodeEmail(code: string, ttlMinutes: number): Omit<OutgoingEmail, "to"> {
  const subject = `Your ${APP_NAME} login code`;

  const text = [
    `Your ${APP_NAME} login code is ${code}.`,
    ``,
    `Enter it to sign in. It expires in ${ttlMinutes} minutes.`,
    ``,
    `If you didn't request this, you can safely ignore this email.`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
            <tr>
              <td style="background:#0f172a;padding:24px 32px;">
                <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">${APP_NAME}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">Your login code</p>
                <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">Enter this code to sign in. It expires in ${ttlMinutes} minutes.</p>
                <div style="text-align:center;margin:0 0 24px;">
                  <span style="display:inline-block;font-size:34px;font-weight:800;letter-spacing:0.35em;color:#0f172a;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:16px 24px 16px 32px;font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;">${code}</span>
                </div>
                <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">If you didn't request this, you can safely ignore this email — no one can sign in without the code.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #f1f5f9;">
                <p style="margin:0;font-size:11px;color:#9ca3af;">${APP_NAME} — Football Management</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
