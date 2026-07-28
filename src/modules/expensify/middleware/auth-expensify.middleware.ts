import {
  HttpException,
  HttpStatus,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { ExpensifyService } from '../expensify.service';
import { ExpensifyUserRepository } from 'src/database/repositories/ExpensifyUser.repository';

@Injectable()
export class AuthExpensifyMiddleware implements NestMiddleware {
  constructor(
    private readonly authService: ExpensifyService,
    private config: ConfigService,
    private jwtService: JwtService,
    private usersRepository: ExpensifyUserRepository,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const authHeaders = req.headers.authorization;
    const bearerToken = authHeaders?.startsWith('Bearer ') ? authHeaders.substring(7) : null;
    if (!bearerToken) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.tryOwnJwt(bearerToken);

    if (!user) {
      throw new UnauthorizedException('Invalid session');
    }
    if (user.exp_us_is_deleted) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    (req as any).user = user;
    req['user'] = user;
    next();
  }

  private async tryOwnJwt(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get('EXPENSIFY_JWT_ACCESS_SECRET'),
      });
      if (!payload?.exp_us_id) return null;
      return await this.usersRepository.getOne({ user_id: payload.exp_us_id });
    } catch (e) {
      return null;
    }
  }
}
