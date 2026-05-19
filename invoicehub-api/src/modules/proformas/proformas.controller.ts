import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
  UseGuards, Res, StreamableFile,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { ProformasService } from './proformas.service';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import {
  createProformaSchema,
  updateProformaSchema,
  listProformasSchema,
  convertProformaSchema,
} from './proformas.schema';

@Controller('proformas')
export class ProformasController {
  constructor(private readonly svc: ProformasService) {}

  @Get()
  @Permission('proformas:read')
  @SkipResponseWrapper()
  async list(@Query() query: unknown) {
    const result = await this.svc.list(listProformasSchema.parse(query));
    return { success: true, ...result };
  }

  @Get('counts')
  @Permission('proformas:read')
  counts() {
    return this.svc.counts();
  }

  @Get(':id')
  @Permission('proformas:read')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permission('proformas:create')
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.svc.create(createProformaSchema.parse(body), user.sub);
  }

  @Put(':id')
  @Permission('proformas:update')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.svc.update(id, updateProformaSchema.parse(body), user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Permission('proformas:delete')
  async remove(@Param('id') id: string) {
    await this.svc.softDelete(id);
    return { message: 'Proforma supprimée' };
  }

  @Post(':id/send')
  @Permission('proformas:update')
  send(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.send(id, user.sub);
  }

  @Post(':id/accept')
  @Permission('proformas:update')
  accept(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.accept(id, user.sub);
  }

  @Post(':id/reject')
  @Permission('proformas:update')
  reject(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const { reason } = (body as any) ?? {};
    return this.svc.reject(id, user.sub, reason);
  }

  @Post(':id/convert')
  @Permission('proformas:update')
  convert(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.svc.convertToInvoice(id, user.sub, convertProformaSchema.parse(body));
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @Permission('proformas:create')
  duplicate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.duplicate(id, user.sub);
  }

  @Post(':id/quick-confirm-sent')
  @Permission('proformas:update')
  quickConfirmSent(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.send(id, user.sub);
  }

  @Post(':id/quick-confirm-accepted')
  @Permission('proformas:update')
  quickConfirmAccepted(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.accept(id, user.sub);
  }

  @Get(':id/pdf')
  @Permission('proformas:read')
  @UseGuards(ThrottlerGuard)
  @SkipResponseWrapper()
  async getPdf(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, filename } = await this.svc.generatePdfResponse(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }
}
