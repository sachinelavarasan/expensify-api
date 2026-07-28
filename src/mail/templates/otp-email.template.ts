export type OtpEmailPurpose = 'signup_verify' | 'password_reset';

export function otpEmailTemplate(args: { name: string; code: string; purpose: OtpEmailPurpose }) {
  const { name, code, purpose } = args;

  const heading = purpose === 'signup_verify' ? 'Verify your email address' : 'Reset your password';
  const intro =
    purpose === 'signup_verify'
      ? 'Use the code below to verify your email address and finish setting up your account.'
      : 'Use the code below to set a new password for your account.';

  const subject =
    purpose === 'signup_verify'
      ? 'Your Expensify verification code'
      : 'Your Expensify password reset code';

  const text = `Hi ${name || 'there'},\n\n${intro}\n\nYour code: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore this email.`;

  const html = `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin-bottom: 8px;">${heading}</h2>
      <p style="color: #444; line-height: 1.5;">Hi ${name || 'there'},</p>
      <p style="color: #444; line-height: 1.5;">${intro}</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 4px; text-align: center; margin: 24px 0;">${code}</p>
      <p style="color: #888; font-size: 13px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  return { subject, html, text };
}
