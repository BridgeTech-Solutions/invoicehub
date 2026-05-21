import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Controller, Get, Put, Post, Body, Req, UploadedFile, UseInterceptors, BadRequestException, OnModuleInit, Param, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { Permission } from '../../common/decorators/permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SettingsService } from './settings.service';
import { assertFileMime } from '../../lib/file-magic';
import { PrismaService } from '../../prisma/prisma.service';
import { updateSettingsSchema } from './settings.schema';

@Controller('settings')
export class SettingsController implements OnModuleInit {
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'settings');

  constructor(
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    // Créer le répertoire s'il n'existe pas
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  @Public()
  @Get()
  async get() {
    return this.settingsService.get();
  }

  @Put()
  @Permission('settings:update')
  @Audit('company_settings', 'UPDATE')
  async update(@Body() body: unknown, @Req() req: Request) {
    const auditPreviousData = await this.settingsService.get();
    (req as any).auditPreviousData = auditPreviousData;

    const input = updateSettingsSchema.parse(body);
    return this.settingsService.update(input);
  }

  @Put('assets/:type')
  @Permission('settings:update')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(process.cwd(), 'uploads', 'settings');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
      if (allowed.includes(file.mimetype)) {
        console.log(`✓ Upload accepté: ${file.originalname} (${file.mimetype})`);
        cb(null, true);
      } else {
        const err = new Error(`Format non accepté: ${file.mimetype}. Utilisez PNG, JPEG, WebP ou PDF.`);
        console.error(`✗ Upload rejeté: ${file.originalname} (${file.mimetype}) - ${err.message}`);
        cb(err as any, false);
      }
    },
  }))
  async uploadAsset(
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu');
    }

    try {
      assertFileMime(file.path, ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }

    // Map type to database field
    const fieldMap: Record<string, string> = {
      header: 'headerImagePath',
      footer: 'footerImagePath',
      logo: 'logoPath',
      stamp: 'stampPath',
      signature: 'signaturePath',
    };

    const field = fieldMap[type];
    if (!field) {
      throw new BadRequestException(`Type d'asset invalide: ${type}`);
    }

    const url = `/api/settings/assets/${file.filename}`;

    // Supprimer l'ancien fichier avant de sauvegarder le nouveau
    const existing = await this.prisma.companySettings.findFirst();
    if (existing) {
      const oldUrl: string | null = (existing as any)[field] ?? null;
      if (oldUrl) {
        const oldFilename = path.basename(oldUrl);
        const oldFilePath = path.join(this.uploadDir, oldFilename);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }
      await this.prisma.companySettings.update({
        where: { id: existing.id },
        data: { [field]: url },
      });
    }

    return { path: url };
  }

  @Get('assets/:filename')
  async getAsset(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    // Valider le format du nom de fichier — UUID + extension uniquement
    const SAFE_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|pdf)$/i;
    if (!SAFE_FILENAME.test(filename)) {
      return res.status(400).json({ error: 'Nom de fichier invalide' });
    }

    const basePath = path.resolve(path.join(process.cwd(), 'uploads', 'settings'));
    const filePath = path.resolve(path.join(basePath, filename));

    if (!filePath.startsWith(basePath + path.sep) && filePath !== basePath) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };

    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'private, max-age=3600');
    return res.sendFile(filePath);
  }
}
