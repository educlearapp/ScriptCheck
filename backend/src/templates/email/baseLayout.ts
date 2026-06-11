export type EmailTemplateParams = {
  title: string;
  preheader?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

const LOGO_URL = "https://scriptcheck.educlear.group/scriptcheck-logo.png";

export function renderEmailHtml(params: EmailTemplateParams): string {
  const { title, preheader, bodyHtml, ctaLabel, ctaUrl } = params;

  const ctaBlock =
    ctaLabel && ctaUrl
      ? `<p style="margin:28px 0 0;text-align:center;">
          <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#d4af37,#9a7b1a);color:#1a1a1a;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px;">
            ${ctaLabel}
          </a>
        </p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  ${preheader ? `<meta name="description" content="${preheader}" />` : ""}
</head>
<body style="margin:0;padding:0;background:#f0f1f4;font-family:'Segoe UI',system-ui,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f1f4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(16,24,40,0.08);">
          <tr>
            <td style="background:#1c1c1e;padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="ScriptCheck" width="100" style="display:block;margin:0 auto 12px;" />
              <div style="color:#d4af37;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">Assessment Intelligence</div>
              <div style="color:rgba(255,255,255,0.5);font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-top:6px;">An EduClear Group Product</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px;">
              <h1 style="margin:0 0 16px;font-size:22px;color:#1f2937;font-weight:700;">${title}</h1>
              <div style="font-size:15px;line-height:1.6;color:#4b5563;">${bodyHtml}</div>
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;border-top:1px solid #e4e7ec;">
              <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;text-align:center;letter-spacing:0.04em;">
                ScriptCheck · An EduClear Group Product<br />
                Premium Assessment Intelligence Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderPasswordResetEmail(resetUrl: string, recipientName: string): string {
  return renderEmailHtml({
    title: "Reset your ScriptCheck password",
    preheader: "Password reset instructions for your ScriptCheck account",
    bodyHtml: `<p>Hi ${recipientName},</p>
      <p>We received a request to reset your ScriptCheck password. Click the button below to choose a new password. This link expires in 24 hours.</p>
      <p style="color:#9ca3af;font-size:13px;">If you did not request this, you can safely ignore this email.</p>`,
    ctaLabel: "Reset password",
    ctaUrl: resetUrl,
  });
}

export function renderWelcomeEmail(recipientName: string, loginUrl: string): string {
  return renderEmailHtml({
    title: "Welcome to ScriptCheck",
    preheader: "Your premium assessment intelligence platform is ready",
    bodyHtml: `<p>Hi ${recipientName},</p>
      <p>Welcome to <strong>ScriptCheck</strong> — the premium assessment intelligence platform from EduClear Group.</p>
      <p>Sign in to manage assessments, marking, moderation, and results with confidence.</p>`,
    ctaLabel: "Sign in to ScriptCheck",
    ctaUrl: loginUrl,
  });
}

export function renderPortalOtpEmail(code: string, workspaceName: string): string {
  return renderEmailHtml({
    title: "Your ScriptCheck verification code",
    preheader: `Verification code for ${workspaceName}`,
    bodyHtml: `<p>Your verification code for <strong>${workspaceName}</strong> is:</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:0.2em;color:#9a7b1a;text-align:center;margin:24px 0;">${code}</p>
      <p>This code expires in 10 minutes. Do not share it with anyone.</p>`,
  });
}
