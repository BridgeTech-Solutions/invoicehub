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
      console.error('❌ Aucun fichier reçu');
      throw new BadRequestException('Aucun fichier reçu');
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

    // Mise à jour en base de données
    const existing = await this.prisma.companySettings.findFirst();
    if (existing) {
      await this.prisma.companySettings.update({
        where: { id: existing.id },
        data: { [field]: url },
      });
    }

    console.log(`✓ Fichier sauvegardé: ${file.path} → ${url} (${field})`);
    return { path: url };
  }

  @Public()
  @Get('assets/:filename')
  async getAsset(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const filePath = path.join(process.cwd(), 'uploads', 'settings', filename);
    
    console.log(`[GET Asset] filename=${filename}, path=${filePath}`);

    // Vérifier que le fichier demandé est bien dans le répertoire uploads/settings
    const basePath = path.resolve(path.join(process.cwd(), 'uploads', 'settings'));
    if (!path.resolve(filePath).startsWith(basePath)) {
      console.error(`[GET Asset] Tentative d'accès à l'extérieur du répertoire: ${filePath}`);
      return res.status(403).json({ error: 'Accès refusé' });
    }

    if (!fs.existsSync(filePath)) {
      console.error(`[GET Asset] Fichier non trouvé: ${filePath}`);
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
    res.set('Cache-Control', 'public, max-age=86400');
    
    console.log(`[GET Asset] ✓ Fichier trouvé, envoi: ${filePath} (${contentType})`);
    return res.sendFile(filePath);
  }
}
