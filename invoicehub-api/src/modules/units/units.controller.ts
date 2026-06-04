import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UnitsService, createUnitSchema, updateUnitSchema } from './units.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Permission } from '../../common/decorators/permission.decorator';
import type { CreateUnitInput, UpdateUnitInput } from './units.service';

@ApiTags('Unités')
@ApiBearerAuth()
@Controller('units')
export class UnitsController {
  constructor(private readonly svc: UnitsService) {}

  /** Toutes les unités (actives uniquement par défaut) — utilisé par les dropdowns */
  @Get()
  @Permission('settings:read')
  list(@Query('all') all?: string) {
    return this.svc.list(all !== 'true');
  }

  @Post()
  @Permission('settings:update')
  create(@Body(new ZodValidationPipe(createUnitSchema)) body: CreateUnitInput) {
    return this.svc.create(body);
  }

  @Put(':id')
  @Permission('settings:update')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUnitSchema)) body: UpdateUnitInput,
  ) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @Permission('settings:update')
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
    return { success: true, message: 'Unité désactivée' };
  }

  @Post('reorder')
  @Permission('settings:update')
  async reorder(@Body() body: { items: { id: string; sortOrder: number }[] }) {
    await this.svc.reorder(body.items);
    return { success: true };
  }
}
