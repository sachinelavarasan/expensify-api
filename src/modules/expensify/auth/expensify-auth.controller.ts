import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ExpensifyAuthService } from './expensify-auth.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  ResendOtpDto,
  ResetPasswordDto,
  SignupDto,
  VerifyOtpDto,
} from './dto/expensify-auth.dto';

@ApiTags('Expensify Auth')
@Controller('expensify/auth')
export class ExpensifyAuthController {
  constructor(private expensifyAuthService: ExpensifyAuthService) {}

  @ApiOperation({ summary: 'Register a new account and send a signup OTP' })
  @ApiResponse({ status: 201, description: 'Signup accepted, OTP sent' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    return this.expensifyAuthService.signup(dto);
  }

  @ApiOperation({ summary: 'Verify the OTP sent during signup' })
  @ApiResponse({ status: 201, description: 'Account verified' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('verify-signup-otp')
  async verifySignupOtp(@Body() dto: VerifyOtpDto) {
    return this.expensifyAuthService.verifySignupOtp(dto);
  }

  @ApiOperation({ summary: 'Resend an OTP for signup verification or password reset' })
  @ApiResponse({ status: 201, description: 'OTP resent' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('resend-otp')
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.expensifyAuthService.resendOtp(dto);
  }

  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 201, description: 'Login successful, tokens returned' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.expensifyAuthService.login(dto);
  }

  @ApiOperation({ summary: 'Request a password reset OTP' })
  @ApiResponse({ status: 201, description: 'Reset OTP sent if the account exists' })
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.expensifyAuthService.forgotPassword(dto);
  }

  @ApiOperation({ summary: 'Reset the account password using an OTP' })
  @ApiResponse({ status: 201, description: 'Password reset' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.expensifyAuthService.resetPassword(dto);
  }

  @ApiOperation({ summary: 'Exchange a refresh token for a new access token' })
  @ApiResponse({ status: 201, description: 'New access token issued' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @Post('refresh-token')
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.expensifyAuthService.refreshToken(dto.refreshToken);
  }
}
