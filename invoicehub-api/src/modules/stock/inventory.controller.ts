import {
  Controller, Get, Post, Put,
  Body, Param, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createInventorySchema, saveCountsSchema } from './stock.schema';
import type { CreateInventoryInput, SaveCountsInput } from './stock.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@ApiTags('Stock — Inventaire')
@ApiBearerAuth()
@Controller('stock/inventory')
export class InventoryController {
  constructor(private readonly svc: InventoryService) {}

  @Get()
  @Permission('stock:read')
  list() {
    return this.svc.listSessions();
  }

  @Post()
  @Permission('stock:adjust')
  @Audit('stock', 'CREATE')
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(createInventorySchema)) body: CreateInventoryInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.createSession(body, user.sub);
  }

  @Get(':id')
  @Permission('stock:read')
  get(@Param('id') id: string) {
    return this.svc.getSession(id);
  }

  @Put(':id/counts')
  @Permission('stock:adjust')
  saveCounts(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveCountsSchema)) body: SaveCountsInput,
  ) {
    return this.svc.saveCounts(id, body);
  }

  @Post(':id/validate')
  @Permission('stock:adjust')
  @Audit('stock', 'UPDATE')
  validate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.validateSession(id, user.sub);
  }

  @Post(':id/cancel')
  @Permission('stock:adjust')
  cancel(@Param('id') id: string) {
    return this.svc.cancelSession(id);
  }
}
