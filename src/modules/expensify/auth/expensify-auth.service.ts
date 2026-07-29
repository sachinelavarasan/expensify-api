import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { ExpensifyUserRepository } from '../../../database/repositories/ExpensifyUser.repository';
import { ExpensifyBankAccountRepository } from '../../../database/repositories/ExpensifyBankAccounts.repository';
import { SelectExpensifyUser } from '../../../database/schemas/schema';

import { MailService } from '../../../mail/mail.service';
import { OtpEmailPurpose } from '../../../mail/templates/otp-email.template';

import {
  ForgotPasswordDto,
  LoginDto,
  ResendOtpDto,
  ResetPasswordDto,
  SignupDto,
  VerifyOtpDto,
} from './dto/expensify-auth.dto';

const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class ExpensifyAuthService {
  constructor(
    private usersRepository: ExpensifyUserRepository,
    private expensifyBankAccountRepository: ExpensifyBankAccountRepository,
    private jwtService: JwtService,
    private config: ConfigService,
    private mailService: MailService,
  ) {}

  private sanitizeUser(user: SelectExpensifyUser) {
    const {
      exp_us_password_hash,
      exp_us_otp_code_hash,
      exp_us_otp_purpose,
      exp_us_otp_expires_at,
      exp_us_otp_attempts,
      ...safeUser
    } = user;
    return safeUser;
  }

  private generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private async issueTokens(user: SelectExpensifyUser) {
    const payload = { exp_us_id: user.exp_us_id, email: user.exp_us_email };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get('EXPENSIFY_JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('EXPENSIFY_JWT_ACCESS_EXPIRY') || '7d',
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get('EXPENSIFY_JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('EXPENSIFY_JWT_REFRESH_EXPIRY') || '90d',
    });
    return { accessToken, refreshToken };
  }

  private async issueAndSendOtp(user: SelectExpensifyUser, purpose: OtpEmailPurpose) {
    const code = this.generateOtp();
    const hash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
    await this.usersRepository.setOtp(user.exp_us_id, { hash, purpose, expiresAt });
    console.log('TEMP-TEST-OTP', user.exp_us_email, code); // TODO remove after manual test
    await this.mailService.sendOtpEmail({
      to: user.exp_us_email,
      name: user.exp_us_name,
      code,
      purpose,
    });
  }

  private async verifyOtp(user: SelectExpensifyUser, purpose: OtpEmailPurpose, code: string) {
    if (
      !user.exp_us_otp_code_hash ||
      user.exp_us_otp_purpose !== purpose ||
      !user.exp_us_otp_expires_at
    ) {
      throw new HttpException('No pending code for this request', HttpStatus.BAD_REQUEST);
    }
    if (new Date(user.exp_us_otp_expires_at).getTime() < Date.now()) {
      throw new HttpException('Code has expired, please request a new one', HttpStatus.BAD_REQUEST);
    }
    if (user.exp_us_otp_attempts >= MAX_OTP_ATTEMPTS) {
      throw new HttpException(
        'Too many attempts, please request a new code',
        HttpStatus.BAD_REQUEST,
      );
    }
    const isMatch = await bcrypt.compare(code, user.exp_us_otp_code_hash);
    if (!isMatch) {
      await this.usersRepository.incrementOtpAttempts(user.exp_us_id);
      throw new HttpException('Invalid code', HttpStatus.BAD_REQUEST);
    }
  }

  async signup(dto: SignupDto) {
    const existing = await this.usersRepository.getOne({ email: dto.email });
    if (existing) {
      if (existing.exp_us_email_verified) {
        throw new HttpException(
          'An account with this email already exists',
          HttpStatus.CONFLICT,
        );
      }
      await this.issueAndSendOtp(existing, 'signup_verify');
      return { message: 'Verification code sent to your email' };
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const [user] = await this.usersRepository.createUser({
      exp_us_name: dto.name,
      exp_us_email: dto.email,
      exp_us_password_hash: passwordHash,
      exp_us_email_verified: false,
    });
    await this.expensifyBankAccountRepository.createBankAccount({
      exp_ba_name: 'Main Account',
      exp_ba_balance: '0',
      exp_ba_user_id: user.exp_us_id,
      exp_ba_icon: 'account-balance',
    });

    await this.issueAndSendOtp(user, 'signup_verify');
    return { message: 'Verification code sent to your email' };
  }

  async verifySignupOtp(dto: VerifyOtpDto) {
    const user = await this.usersRepository.getOne({ email: dto.email });
    if (!user) {
      throw new HttpException('Account not found', HttpStatus.BAD_REQUEST);
    }
    await this.verifyOtp(user, 'signup_verify', dto.code);
    if (!user.exp_us_email_verified) {
      await this.usersRepository.markEmailVerified(user.exp_us_id);
    }
    await this.usersRepository.clearOtp(user.exp_us_id);
    const verifiedUser = await this.usersRepository.getOne({ email: dto.email });
    const tokens = await this.issueTokens(verifiedUser);
    return { ...tokens, user: this.sanitizeUser(verifiedUser) };
  }

  async resendOtp(dto: ResendOtpDto) {
    const user = await this.usersRepository.getOne({ email: dto.email });
    // Same response whether or not the account exists, so this endpoint
    // can't be used to enumerate registered emails.
    if (user) {
      await this.issueAndSendOtp(user, dto.purpose);
    }
    return { message: 'If that email is registered, a verification code has been sent' };
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepository.getOne({ email: dto.email });
    if (!user) {
      throw new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);
    }
    if (!user.exp_us_password_hash) {
      throw new HttpException(
        { code: 'PASSWORD_SETUP_REQUIRED', message: 'Please set a password to continue' },
        HttpStatus.CONFLICT,
      );
    }
    const isMatch = await bcrypt.compare(dto.password, user.exp_us_password_hash);
    if (!isMatch) {
      throw new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);
    }
    if (!user.exp_us_email_verified) {
      throw new HttpException(
        { code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email to continue' },
        HttpStatus.FORBIDDEN,
      );
    }
    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.sanitizeUser(user) };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersRepository.getOne({ email: dto.email });
    if (!user) {
      throw new HttpException('No account found with this email', HttpStatus.BAD_REQUEST);
    }
    await this.issueAndSendOtp(user, 'password_reset');
    return { message: 'Verification code sent to your email' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.usersRepository.getOne({ email: dto.email });
    if (!user) {
      throw new HttpException('Account not found', HttpStatus.BAD_REQUEST);
    }
    await this.verifyOtp(user, 'password_reset', dto.code);

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.usersRepository.setPasswordHash(user.exp_us_id, passwordHash);
    await this.usersRepository.markEmailVerified(user.exp_us_id);
    await this.usersRepository.clearOtp(user.exp_us_id);

    const updatedUser = await this.usersRepository.getOne({ email: dto.email });
    const tokens = await this.issueTokens(updatedUser);
    return { ...tokens, user: this.sanitizeUser(updatedUser) };
  }

  async refreshToken(refreshToken: string) {
    let payload: { exp_us_id: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.config.get('EXPENSIFY_JWT_REFRESH_SECRET'),
      });
    } catch (e) {
      throw new HttpException('Invalid or expired refresh token', HttpStatus.UNAUTHORIZED);
    }
    const user = await this.usersRepository.getOne({ user_id: payload.exp_us_id });
    if (!user || user.exp_us_is_deleted) {
      throw new HttpException('Invalid or expired refresh token', HttpStatus.UNAUTHORIZED);
    }
    const accessToken = await this.jwtService.signAsync(
      { exp_us_id: user.exp_us_id, email: user.exp_us_email },
      {
        secret: this.config.get('EXPENSIFY_JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('EXPENSIFY_JWT_ACCESS_EXPIRY') || '7d',
      },
    );
    return { accessToken };
  }
}
