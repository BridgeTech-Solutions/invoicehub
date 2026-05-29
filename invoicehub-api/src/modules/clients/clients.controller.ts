import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import {
  createClientSchema,
  updateClientSchema,
  listClientsSchema,
  importClientsBodySchema,
} from './clients.schema';
import type {
  CreateClientInput,
  UpdateClientInput,
  ListClientsInput,
  ImportClientsBody,
} from './clients.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@ApiTags('Clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly svc: ClientsService) {}

  @Get()
  @Permission('clients:read')
  @SkipResponseWrapper()
  async list(@Query(new ZodValidationPipe(listClientsSchema)) query: ListClientsInput) {
    const result = await this.svc.list(query);
    return { success: true, ...result };
  }

  @Post('import')
  @Permission('clients:create')
  @Audit('client', 'CREATE')
  @HttpCode(200)
  async importClients(
    @Body(new ZodValidationPipe(importClientsBodySchema)) body: ImportClientsBody,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.importClients(body.rows, user.sub);
  }

  @Get(':id/quick-fill')
  @Permission('clients:read')
  quickFill(@Param('id') id: string) {
    return this.svc.quickFill(id);
  }

  @Get(':id/summary')
  @Permission('clients:read')
  getSummary(@Param('id') id: string) {
    return this.svc.getSummary(id);
  }

  @Get(':id/risk-score')
  @Permission('clients:read')
  getRiskScore(@Param('id') id: string) {
    return this.svc.getRiskScore(id);
  }

  @Get(':id')
  @Permission('clients:read')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Permission('clients:create')
  @Audit('client', 'CREATE')
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(createClientSchema)) body: CreateClientInput,
    @CurrentUser() user: JwtPayload,
  ) {
    const canEditAccounting = user.permissions.includes('*') || user.permissions.includes('accounting:*') || user.permissions.includes('accounting:update');
    if (!canEditAccounting) delete (body as any).accountingAccount;
    return this.svc.create(body, user.sub);
  }

  @Put(':id')
  @Permission('clients:update')
  @Audit('client', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClientInput,
    @CurrentUser() user: JwtPayload,
  ) {
    const canEditAccounting = user.permissions.includes('*') || user.permissions.includes('accounting:*') || user.permissions.includes('accounting:update');
    if (!canEditAccounting) delete (body as any).accountingAccount;
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @Permission('clients:delete')
  @Audit('client', 'SOFT_DELETE')
  async archive(@Param('id') id: string) {
    await this.svc.archive(id);
    return { success: true, message: 'Client archivé' };
  }
}
