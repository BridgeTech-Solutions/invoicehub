import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
  UseGuards, Res, StreamableFile,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { zodToOpenAPI } from 'nestjs-zod';
import { Response } from 'express';
import { ProformasService } from './proformas.service';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import { Audit } from '../../common/decorators/audit.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import {
  createProformaSchema,
  updateProformaSchema,
  listProformasSchema,
  rejectProformaSchema,
  convertProformaSchema,
  reorderLinesSchema,
} from './proformas.schema';

// Documente le corps de requête Zod dans Swagger (validation faite dans le service).
const ApiZodBody = (schema: Parameters<typeof zodToOpenAPI>[0]) =>
  ApiBody({ schema: zodToOpenAPI(schema) as any });

@ApiTags('Proformas')
@ApiBearerAuth()
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
  @Audit('proforma', 'CREATE')
  @ApiZodBody(createProformaSchema)
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.svc.create(createProformaSchema.parse(body), user.sub);
  }

  @Put(':id')
  @Permission('proformas:update')
  @Audit('proforma', 'UPDATE')
  @ApiZodBody(updateProformaSchema)
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.svc.update(id, updateProformaSchema.parse(body), user.sub);
  }

  @Post(':id/reorder-lines')
  @Permission('proformas:update')
  @Audit('proforma', 'UPDATE')
  @ApiZodBody(reorderLinesSchema)
  reorderLines(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const { lineIds } = reorderLinesSchema.parse(body);
    return this.svc.reorderLines(id, lineIds, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Permission('proformas:delete')
  @Audit('proforma', 'SOFT_DELETE')
  async remove(@Param('id') id: string) {
    await this.svc.softDelete(id);
    return { message: 'Proforma supprimée' };
  }

  @Post(':id/send')
  @Permission('proformas:update')
  @Audit('proforma', 'STATUS_CHANGE')
  send(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.send(id, user.sub);
  }

  @Post(':id/accept')
  @Permission('proformas:update')
  @Audit('proforma', 'STATUS_CHANGE')
  accept(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.accept(id, user.sub);
  }

  @Post(':id/reject')
  @Permission('proformas:update')
  @Audit('proforma', 'STATUS_CHANGE')
  @ApiZodBody(rejectProformaSchema)
  reject(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const { reason } = (body as any) ?? {};
    return this.svc.reject(id, user.sub, reason);
  }

  @Post(':id/convert')
  @Permission('proformas:update')
  @Audit('proforma', 'CONVERT_TO_INVOICE')
  @ApiZodBody(convertProformaSchema)
  convert(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.svc.convertToInvoice(id, user.sub, convertProformaSchema.parse(body));
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @Permission('proformas:create')
  @Audit('proforma', 'CREATE')
  duplicate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.duplicate(id, user.sub);
  }

  @Post(':id/quick-confirm-sent')
  @Permission('proformas:update')
  @Audit('proforma', 'STATUS_CHANGE')
  quickConfirmSent(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.send(id, user.sub);
  }

  @Post(':id/quick-confirm-accepted')
  @Permission('proformas:update')
  @Audit('proforma', 'STATUS_CHANGE')
  quickConfirmAccepted(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.accept(id, user.sub);
  }

  @Get(':id/pdf')
  @Permission('proformas:read')
  @UseGuards(ThrottlerGuard)
  @SkipResponseWrapper()
  @Audit('proforma', 'PDF_GENERATED')
  async getPdf(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, filename } = await this.svc.generatePdfResponse(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(buffer);
  }
}
