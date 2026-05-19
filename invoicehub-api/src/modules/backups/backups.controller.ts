import { Controller, Get, Post, Delete, Param, Query, Req, Res, HttpCode, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import * as fs from 'fs';
import { Permission } from '../../common/decorators/permission.decorator';
import { BackupRateLimitGuard } from '../../common/guards/backup-rate-limit.guard';
import { BackupsService } from './backups.service';

@Controller('backups')
@Permission('backups:manage')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Post()
  @HttpCode(202)
  @UseGuards(BackupRateLimitGuard)
  async trigger(@Req() req: Request) {
    const backup = await this.backupsService.trigger(req.user!.sub);
    return { data: backup, message: 'Backup en cours de création...' };
  }

  @Get()
  async list(@Query('page') page?: string, @Query('limit') limit?: string, @Query('status') status?: string) {
    return this.backupsService.list({ page: Number(page) || 1, limit: Number(limit) || 20, status });
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.backupsService.findById(id);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { url, localPath, filename } = await this.backupsService.getDownloadInfo(id);

    if (url) {
      res.redirect(302, url);
      return;
    }

    if (localPath && fs.existsSync(localPath)) {
      const stat = fs.statSync(localPath);
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(localPath).pipe(res);
      return;
    }

    res.status(404).json({ success: false, message: 'Fichier de backup introuvable sur le disque' });
  }

  @Delete(':id')
  @HttpCode(200)
  async deleteBackup(@Param('id') id: string) {
    await this.backupsService.delete(id);
    return { message: 'Backup supprimé' };
  }
}
