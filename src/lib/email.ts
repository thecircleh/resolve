// Transactional email via Resend.
// Two messages: the magic-link sign-in email, and the invite email an
// administrator triggers when adding a beta tester on /admin.

import { Resend } from "resend";

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return new Resend(key);
}

function from(): string {
  return process.env.EMAIL_FROM || "Resolve <no-reply@resolve.local>";
}

// Shared layout so the two emails cannot drift apart visually.
function renderEmail(opts: {
  heading: string;
  intro: string;
  buttonLabel: string;
  url: string;
  extraHtml?: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; padding: 24px; max-width: 560px;">
      <h2 style="font-weight: 600; font-size: 18px; margin: 0 0 16px;">${opts.heading}</h2>
      <p style="margin: 0 0 16px; line-height: 1.6;">${opts.intro}</p>
      <p style="margin: 24px 0;">
        <a href="${opts.url}"
           style="background: #0f172a; color: #ffffff; padding: 10px 20px;
                  border-radius: 6px; text-decoration: none; font-weight: 500;">
          ${opts.buttonLabel}
        </a>
      </p>
      ${opts.extraHtml || ""}
      <p style="margin: 16px 0 0; color: #64748b; font-size: 13px;">
        If you did not expect this email you can safely ignore it.
      </p>
    </div>
  `;
}

export async function sendMagicLinkEmail(
  to: string,
  magicLinkUrl: string,
  code?: string | null,
): Promise<void> {
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

  await getResend().emails.send({
    from: from(),
    to,
    subject: "Your Resolve sign-in link",
    text,
    html: renderEmail({
      heading: "Sign in to Resolve",
      intro: "Click the button below to sign in. The link expires in 15 minutes.",
      buttonLabel: "Sign in to Resolve",
      url: magicLinkUrl,
      extraHtml: codeHtml,
    }),
  });
}

// Sent when an administrator adds someone to the beta on /admin.
// The link is long-lived (see INVITE_TTL_DAYS) because an invite may sit
// unread for a day or more; it carries no 6-digit code for that reason.
export async function sendInviteEmail(
  to: string,
  inviteUrl: string,
  opts: { expiresInDays: number; loginUrl: string },
): Promise<void> {
  const dayWord = opts.expiresInDays === 1 ? "day" : "days";
  const expiry = `${opts.expiresInDays} ${dayWord}`;

  const text = [
    "You have been invited to the Resolve beta.",
    "",
    `Use the link below to sign in. It works for ${expiry}.`,
    "",
    inviteUrl,
    "",
    "On first sign-in you will be guided through building your Business",
    "Context Profile. After that you can start a session anytime.",
    "",
    `If the link has expired, go to ${opts.loginUrl} and enter this email`,
    "address to get a fresh one.",
  ].join("\n");

  await getResend().emails.send({
    from: from(),
    to,
    subject: "You've been invited to Resolve",
    text,
    html: renderEmail({
      heading: "You've been invited to Resolve",
      intro: `Click below to sign in and get started. This link works for ${expiry}.`,
      buttonLabel: "Get started",
      url: inviteUrl,
      extraHtml: `<p style="margin: 20px 0 0; line-height: 1.6; color: #475569; font-size: 14px;">
        On first sign-in you will be guided through building your Business
        Context Profile. If this link has expired, go to
        <a href="${opts.loginUrl}" style="color: #0f172a;">${opts.loginUrl}</a>
        and enter your email address to get a fresh one.
      </p>`,
    }),
  });
}
