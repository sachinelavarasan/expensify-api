import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as Express from 'express';

import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiExcludeEndpoint()
  @Get()
  getStatusPage(@Res() res: Express.Response) {
    res.type('html').send(this.appService.renderStatusPage());
  }

  @ApiOperation({ summary: 'API health/status check' })
  @Get('health')
  getHealth() {
    return this.appService.getStatus();
  }
}
