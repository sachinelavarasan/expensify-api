import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import { otpEmailTemplate, OtpEmailPurpose } from './templates/otp-email.template';

@Injectable()
export class MailService {
  private resend: Resend;

  constructor(private config: ConfigService) {
    this.resend = new Resend(this.config.get('RESEND_API_KEY'));
  }

  async sendOtpEmail(args: { to: string; name: string; code: string; purpose: OtpEmailPurpose }) {
    const { subject, html, text } = otpEmailTemplate(args);
    try {
      const { error } = await this.resend.emails.send({
        from: `${this.config.get('MAIL_FROM_NAME')} <${this.config.get('MAIL_FROM_EMAIL')}>`,
        to: args.to,
        subject,
        html,
        text,
      });

      if (error) {
        throw error;
      }
    } catch (e) {
      throw new HttpException('Failed to send email', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
