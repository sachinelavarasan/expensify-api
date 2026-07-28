import { Body, Controller, Post } from '@nestjs/common';

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

  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    return this.expensifyAuthService.signup(dto);
  }

  @Post('verify-signup-otp')
  async verifySignupOtp(@Body() dto: VerifyOtpDto) {
    return this.expensifyAuthService.verifySignupOtp(dto);
  }

  @Post('resend-otp')
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.expensifyAuthService.resendOtp(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.expensifyAuthService.login(dto);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.expensifyAuthService.forgotPassword(dto);
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.expensifyAuthService.resetPassword(dto);
  }

  @Post('refresh-token')
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.expensifyAuthService.refreshToken(dto.refreshToken);
  }
}
