export type OtpEmailPurpose = 'signup_verify' | 'password_reset';

const BRAND_PRIMARY = '#6B5DE6';
const BRAND_PRIMARY_TINT = '#F1EEFF';
const BRAND_PRIMARY_BORDER = '#E3DEFC';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function otpEmailTemplate(args: { name: string; code: string; purpose: OtpEmailPurpose }) {
  const { code, purpose } = args;
  const name = escapeHtml(args.name || 'there');

  const heading = purpose === 'signup_verify' ? 'Verify your email address' : 'Reset your password';
  const intro =
    purpose === 'signup_verify'
      ? 'Use the code below to verify your email address and finish setting up your account.'
      : 'Use the code below to set a new password for your account.';

  const subject =
    purpose === 'signup_verify'
      ? 'Your Expensify verification code'
      : 'Your Expensify password reset code';

  const text = `Hi ${args.name || 'there'},\n\n${intro}\n\nYour code: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore this email.`;

  const html = `
    <div style="background-color: #F5F5F7; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border: 1px solid #ECECEC; border-radius: 12px;">
        <tr>
          <td style="padding: 28px 32px 0 32px;">
            <span style="font-size: 18px; font-weight: 700; color: ${BRAND_PRIMARY};">Expensify</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 20px 32px 0 32px;">
            <h1 style="margin: 0 0 16px 0; font-size: 20px; color: #1A1A1A;">${heading}</h1>
            <p style="margin: 0 0 8px 0; color: #444444; font-size: 15px; line-height: 1.6;">Hi ${name},</p>
            <p style="margin: 0; color: #444444; font-size: 15px; line-height: 1.6;">${intro}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 24px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${BRAND_PRIMARY_TINT}; border: 1px solid ${BRAND_PRIMARY_BORDER}; border-radius: 10px;">
              <tr>
                <td style="padding: 18px 16px; text-align: center;">
                  <span style="font-family: 'SFMono-Regular', Consolas, Menlo, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: ${BRAND_PRIMARY};">${code}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px 32px 28px 32px;">
            <p style="margin: 0; color: #888888; font-size: 13px; line-height: 1.5;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px 32px; border-top: 1px solid #ECECEC;">
            <p style="margin: 0; color: #AAAAAA; font-size: 12px;">© ${new Date().getFullYear()} Expensify</p>
          </td>
        </tr>
      </table>
    </div>
  `;

  return { subject, html, text };
}
