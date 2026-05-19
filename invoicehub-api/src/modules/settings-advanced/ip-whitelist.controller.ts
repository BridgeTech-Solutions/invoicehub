import { Controller, Get, Post, Delete, Param, Body, Req, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { Permission } from '../../common/decorators/permission.decorator';
import { SettingsAdvancedService } from './settings-advanced.service';
import { createIpWhitelistSchema } from './settings-advanced.schema';

@Controller('ip-whitelist')
@Permission('settings:manage')
export class IpWhitelistController {
  constructor(private readonly service: SettingsAdvancedService) {}

  @Get()
  list() { return this.service.listIpWhitelist(); }

  @Post()
  @HttpCode(201)
  add(@Body() body: unknown, @Req() req: Request) {
    const input = createIpWhitelistSchema.parse(body);
    return this.service.addIpWhitelist(input, req.user!.sub);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id') id: string) {
    await this.service.removeIpWhitelist(id);
    return { message: 'IP supprimée' };
  }
}
