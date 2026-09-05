import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

import { otpEmailTemplate, OtpEmailPurpose } from './templates/otp-email.template';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port: Number(this.config.get('SMTP_PORT')),
      secure: this.config.get('SMTP_SECURE') === 'true',
      auth: {
        user: this.config.get('SMTP_USER'),
        pass: this.config.get('SMTP_PASSWORD'),
      },
    });
  }

  async sendOtpEmail(args: { to: string; name: string; code: string; purpose: OtpEmailPurpose }) {
    const { subject, html, text } = otpEmailTemplate(args);
    try {
      await this.transporter.sendMail({
        from: `${this.config.get('SMTP_FROM_NAME')} <${this.config.get('SMTP_FROM_EMAIL')}>`,
        to: args.to,
        subject,
        html,
        text,
      });
    } catch (e) {
      throw new HttpException('Failed to send email', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
