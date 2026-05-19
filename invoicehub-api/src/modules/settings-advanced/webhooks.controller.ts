import { Controller, Get, Post, Put, Delete, Param, Body, Req, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { Permission } from '../../common/decorators/permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { SettingsAdvancedService } from './settings-advanced.service';
import { createWebhookSchema, updateWebhookSchema } from './settings-advanced.schema';

@Controller('webhooks')
@Permission('webhooks:manage')
export class WebhooksController {
  constructor(private readonly service: SettingsAdvancedService) {}

  @Get()
  list() { return this.service.listWebhooks(); }

  @Get(':id')
  getOne(@Param('id') id: string) { return this.service.getWebhookById(id); }

  @Post()
  @HttpCode(201)
  @Audit('webhook', 'CREATE')
  create(@Body() body: unknown, @Req() req: Request) {
    return this.service.createWebhook(createWebhookSchema.parse(body), req.user!.sub);
  }

  @Put(':id')
  @Audit('webhook', 'UPDATE')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.service.updateWebhook(id, updateWebhookSchema.parse(body));
  }

  @Delete(':id')
  @HttpCode(200)
  @Audit('webhook', 'SOFT_DELETE')
  async remove(@Param('id') id: string) {
    await this.service.deleteWebhook(id);
    return { message: 'Webhook supprimé' };
  }
}
