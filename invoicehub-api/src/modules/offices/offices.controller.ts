import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OfficesService } from './offices.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Permission } from '../../common/decorators/permission.decorator';
import { createOfficeSchema, updateOfficeSchema } from './offices.schema';
import type { CreateOfficeInput, UpdateOfficeInput } from './offices.schema';

@ApiTags('Bureaux')
@ApiBearerAuth()
@Controller('offices')
export class OfficesController {
  constructor(private readonly svc: OfficesService) {}

  @Get()
  @Permission('settings:read')
  list() {
    return this.svc.list();
  }

  @Get(':id')
  @Permission('settings:read')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Permission('settings:update')
  @HttpCode(201)
  create(@Body(new ZodValidationPipe(createOfficeSchema)) body: CreateOfficeInput) {
    return this.svc.create(body);
  }

  @Patch(':id')
  @Permission('settings:update')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOfficeSchema)) body: UpdateOfficeInput,
  ) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @Permission('settings:update')
  remove(@Param('id') id: string) {
    return this.svc.delete(id);
  }
}
