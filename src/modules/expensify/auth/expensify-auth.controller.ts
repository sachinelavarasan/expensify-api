import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

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

@Controller('expensify/auth')
export class ExpensifyAuthController {
  constructor(private expensifyAuthService: ExpensifyAuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    return this.expensifyAuthService.signup(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('verify-signup-otp')
  async verifySignupOtp(@Body() dto: VerifyOtpDto) {
    return this.expensifyAuthService.verifySignupOtp(dto);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('resend-otp')
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.expensifyAuthService.resendOtp(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.expensifyAuthService.login(dto);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.expensifyAuthService.forgotPassword(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.expensifyAuthService.resetPassword(dto);
  }

  @Post('refresh-token')
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.expensifyAuthService.refreshToken(dto.refreshToken);
  }
}
