import * as path from 'path';
import * as fs from 'fs';
import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, Res, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createSupplierInvoiceSchema, updateSupplierInvoiceSchema,
  paySupplierInvoiceSchema, disputeSchema,
} from './supplier-invoices.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

const SUPPLIER_INVOICE_DIR = path.resolve(process.cwd(), 'uploads', 'supplier-invoices');
if (!fs.existsSync(SUPPLIER_INVOICE_DIR)) fs.mkdirSync(SUPPLIER_INVOICE_DIR, { recursive: true });

@Controller('supplier-invoices')
export class SupplierInvoicesController {
  constructor(private readonly svc: SupplierInvoicesService) {}

  @Get()
  @Permission('supplier-invoices:read')
  async list(
    @Query('page')       page       = '1',
    @Query('limit')      limit      = '20',
    @Query('status')     status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('dateFrom')   dateFrom?: string,
    @Query('dateTo')     dateTo?: string,
    @Query('search')     search?: string,
  ) {
    return this.svc.list({
      page:  parseInt(page,  10),
      limit: parseInt(limit, 10),
      status, supplierId, dateFrom, dateTo, search,
    });
  }

  @Post()
  @Permission('supplier-invoices:write')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createSupplierInvoiceSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.create(body, user.sub);
  }

  @Post(':id/attachment')
  @Permission('supplier-invoices:write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, SUPPLIER_INVOICE_DIR),
        filename:    (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname) || '.bin'}`),
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Format non accepté. Utilisez PDF, JPEG, PNG ou WEBP.'), false);
        }
      },
    }),
  )
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new Error('Aucun fichier fourni');
    await this.svc.uploadAttachment(id, file.path);
    return { message: 'Document fournisseur téléchargé' };
  }

  @Get(':id/attachment')
  @Permission('supplier-invoices:read')
  @SkipResponseWrapper()
  async getAttachment(@Param('id') id: string, @Res() res: Response) {
    const { filePath, filename } = await this.svc.getAttachment(id);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.sendFile(path.resolve(filePath));
  }

  @Delete(':id/attachment')
  @HttpCode(HttpStatus.OK)
  @Permission('supplier-invoices:write')
  async deleteAttachment(@Param('id') id: string) {
    await this.svc.deleteAttachment(id);
    return { message: 'Document fournisseur supprimé' };
  }

  @Get(':id/payments')
  @Permission('supplier-invoices:read')
  async listPayments(@Param('id') id: string) {
    return this.svc.listPayments(id);
  }

  @Get(':id')
  @Permission('supplier-invoices:read')
  async findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Put(':id')
  @Permission('supplier-invoices:write')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupplierInvoiceSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, body, user.sub);
  }

  @Delete(':id')
  @Permission('supplier-invoices:delete')
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
    return { message: 'Facture fournisseur supprimée' };
  }

  @Post(':id/validate')
  @Permission('supplier-invoices:validate')
  async validate(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.validate(id, user.sub);
  }

  @Post(':id/dispute')
  @Permission('supplier-invoices:write')
  async dispute(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(disputeSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.dispute(id, user.sub, body.reason);
  }

  @Post(':id/pay')
  @Permission('supplier-invoices:pay')
  async pay(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(paySupplierInvoiceSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.pay(id, body, user.sub);
  }
}
