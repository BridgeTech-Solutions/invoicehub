import { Controller, Get, Post, Patch, Delete, Param, Body, Query, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TaxRatesService } from './tax-rates.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Permission } from '../../common/decorators/permission.decorator';
import { createTaxRateSchema, updateTaxRateSchema } from './tax-rates.schema';
import type { CreateTaxRateInput, UpdateTaxRateInput } from './tax-rates.schema';

@ApiTags('Taux de taxe')
@ApiBearerAuth()
@Controller('tax-rates')
export class TaxRatesController {
  constructor(private readonly svc: TaxRatesService) {}

  @Get()
  @Permission('settings:read')
  list(@Query('includeInactive') includeInactive?: string) {
    return this.svc.list(includeInactive === 'true');
  }

  @Get(':id')
  @Permission('settings:read')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Permission('settings:update')
  @HttpCode(201)
  create(@Body(new ZodValidationPipe(createTaxRateSchema)) body: CreateTaxRateInput) {
    return this.svc.create(body);
  }

  @Patch(':id')
  @Permission('settings:update')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaxRateSchema)) body: UpdateTaxRateInput,
  ) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @Permission('settings:update')
  remove(@Param('id') id: string) {
    return this.svc.delete(id);
  }
}
