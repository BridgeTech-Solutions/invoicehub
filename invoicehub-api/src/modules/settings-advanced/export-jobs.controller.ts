import { Controller, Get, Post, Param, Body, Req, Res, HttpCode } from '@nestjs/common';
import { Request, Response } from 'express';
import { SettingsAdvancedService } from './settings-advanced.service';
import { createExportJobSchema } from './settings-advanced.schema';

@Controller('exports')
export class ExportJobsController {
  constructor(private readonly service: SettingsAdvancedService) {}

  @Get()
  list(@Req() req: Request) { return this.service.listExportJobs(req.user!.sub); }

  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: Request) {
    return this.service.getExportJob(id, req.user!.sub);
  }

  @Post()
  @HttpCode(202)
  async create(@Body() body: unknown, @Req() req: Request) {
    const data = await this.service.createExportJob(createExportJobSchema.parse(body), req.user!.sub);
    return { data, message: 'Export en cours de traitement' };
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { absolutePath, filename, format } = await this.service.getExportDownload(id, req.user!.sub);

    const mimeTypes: Record<string, string> = {
      csv:      'text/csv',
      excel:    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sage_csv: 'text/plain',
      ciel_csv: 'text/plain',
      dsf_xml:  'application/xml',
    };

    const mime = mimeTypes[format as string] ?? 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(absolutePath);
  }
}
