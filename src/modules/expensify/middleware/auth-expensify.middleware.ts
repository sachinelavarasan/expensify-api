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
import { createClerkClient, verifyToken } from '@clerk/backend';
import { ExpensifyUserRepository } from 'src/database/repositories/ExpensifyUser.repository';

@Injectable()
export class AuthExpensifyMiddleware implements NestMiddleware {
  clerkClient;
  constructor(
    private readonly authService: ExpensifyService,
    private config: ConfigService,
    private jwtService: JwtService,
    private usersRepository: ExpensifyUserRepository,
  ) {
    this.clerkClient = createClerkClient({
      publishableKey: this.config.get('EXPENSIFY_CLERK_PUBLISHABLE_KEY'),
      secretKey: this.config.get('EXPENSIFY_CLERK_SECRET_KEY'),
    });
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const authHeaders = req.headers.authorization;
    const bearerToken = authHeaders?.startsWith('Bearer ') ? authHeaders.substring(7) : null;
    if (!bearerToken) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    // Try our own JWT first (new auth system).
    const user = (await this.tryOwnJwt(bearerToken)) ?? (await this.tryClerkToken(bearerToken));

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

  private async tryClerkToken(token: string) {
    try {
      const decoded = await verifyToken(token, {
        secretKey: this.config.get('EXPENSIFY_CLERK_SECRET_KEY'),
      });
      if (!decoded) return null;

      const clerkUser = await this.clerkClient.users.getUser(decoded.sub);
      if (!clerkUser) return null;

      return await this.usersRepository.getOne({ id: clerkUser.id });
    } catch (e) {
      return null;
    }
  }
}
