import * as path from 'path';
import * as fs from 'fs';
import {
  Controller, Get, Post, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
  UseGuards, UseInterceptors, UploadedFile,
  Res, StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { PaymentsService } from './payments.service';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { createPaymentSchema, listPaymentsSchema } from './payments.schema';

const PAYMENT_DIR = path.resolve(process.cwd(), 'uploads', 'payments');
if (!fs.existsSync(PAYMENT_DIR)) fs.mkdirSync(PAYMENT_DIR, { recursive: true });

@Controller('payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Get()
  @Permission('payments:read')
  @SkipResponseWrapper()
  async list(@Query() query: unknown) {
    const result = await this.svc.list(listPaymentsSchema.parse(query));
    return { success: true, ...result };
  }

  @Get(':id/receipt')
  @Permission('payments:read')
  @UseGuards(ThrottlerGuard)
  @SkipResponseWrapper()
  async getReceipt(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, filename } = await this.svc.generateReceipt(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Permission('payments:delete')
  async remove(@Param('id') id: string) {
    await this.svc.softDelete(id);
    return { message: 'Paiement supprimé' };
  }

  @Post(':id/attachment')
  @Permission('payments:create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, PAYMENT_DIR),
        filename:    (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname) || '.bin'}`),
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Format non accepté. Utilisez PDF, JPEG ou PNG.'), false);
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
    return { message: 'Justificatif téléchargé' };
  }

  @Get(':id/attachment')
  @Permission('payments:read')
  @SkipResponseWrapper()
  async getAttachment(@Param('id') id: string, @Res() res: Response) {
    const { filePath, filename } = await this.svc.getAttachment(id);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.sendFile(path.resolve(filePath));
  }

  @Delete(':id/attachment')
  @HttpCode(HttpStatus.OK)
  @Permission('payments:create')
  async deleteAttachment(@Param('id') id: string) {
    await this.svc.deleteAttachment(id);
    return { message: 'Justificatif supprimé' };
  }
}
