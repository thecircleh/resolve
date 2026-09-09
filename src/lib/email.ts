// Transactional email via Resend.
// Only used for magic-link sign-in during beta.

import { Resend } from "resend";

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return new Resend(key);
}

export async function sendMagicLinkEmail(
  to: string,
  magicLinkUrl: string,
  code?: string,
): Promise<void> {
  const from = process.env.EMAIL_FROM || "Resolve <no-reply@resolve.local>";

  const subject = "Your Resolve sign-in link";
  const codeLine = code
    ? `\nOr, if you are signing in on the Resolve mobile app, enter this code: ${code}\n`
    : "";
  const text = [
    "Sign in to Resolve using the link below. It expires in 15 minutes.",
    "",
    magicLinkUrl,
    codeLine,
    "If you did not request this link you can ignore this email.",
  ].join("\n");

  const codeHtml = code
    ? `<p style="margin: 20px 0 0; line-height: 1.6;">
        Signing in on the mobile app? Enter this code instead:
      </p>
      <p style="margin: 8px 0 0; font-size: 26px; letter-spacing: 6px; font-weight: 600; color: #0f172a;">
        ${code}
      </p>`
    : "";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; padding: 24px; max-width: 560px;">
      <h2 style="font-weight: 600; font-size: 18px; margin: 0 0 16px;">Sign in to Resolve</h2>
      <p style="margin: 0 0 16px; line-height: 1.6;">
        Click the button below to sign in. The link expires in 15 minutes.
      </p>
      <p style="margin: 24px 0;">
        <a href="${magicLinkUrl}"
           style="background: #0f172a; color: #ffffff; padding: 10px 20px;
                  border-radius: 6px; text-decoration: none; font-weight: 500;">
          Sign in to Resolve
        </a>
      </p>
      ${codeHtml}
      <p style="margin: 16px 0 0; color: #64748b; font-size: 13px;">
        If you did not request this link you can safely ignore this email.
      </p>
    </div>
  `;

  await getResend().emails.send({
    from,
    to,
    subject,
    text,
    html,
  });
}
