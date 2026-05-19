import { Controller, Get, Post, Delete, Param, Body, Req, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { Permission } from '../../common/decorators/permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { SettingsAdvancedService } from './settings-advanced.service';
import { createApiKeySchema } from './settings-advanced.schema';

@Controller('api-keys')
@Permission('api-keys:manage')
export class ApiKeysController {
  constructor(private readonly service: SettingsAdvancedService) {}

  @Get()
  list(@Req() req: Request) { return this.service.listApiKeys(req.user!.sub); }

  @Post()
  @HttpCode(201)
  @Audit('api_key', 'CREATE')
  async create(@Body() body: unknown, @Req() req: Request) {
    const data = await this.service.createApiKey(createApiKeySchema.parse(body), req.user!.sub);
    return { data, warning: 'La clé brute ne sera plus affichée après cette réponse.' };
  }

  @Delete(':id')
  @HttpCode(200)
  @Audit('api_key', 'SOFT_DELETE')
  async revoke(@Param('id') id: string, @Req() req: Request) {
    await this.service.revokeApiKey(id, req.user!.sub);
    return { message: 'Clé révoquée' };
  }
}
