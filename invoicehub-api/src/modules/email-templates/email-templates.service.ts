import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import type { UpdateEmailTemplateInput } from './email-templates.schema';

@Injectable()
export class EmailTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.emailTemplate.findMany({ orderBy: { type: 'asc' } });
  }

  async findById(id: string) {
    const data = await this.prisma.emailTemplate.findFirst({ where: { id } });
    if (!data) throw AppError.notFound('Template introuvable');
    return data;
  }

  async findByType(type: string) {
    const data = await this.prisma.emailTemplate.findFirst({ where: { type: type as never } });
    if (!data) throw AppError.notFound(`Template introuvable pour le type : ${type}`);
    return data;
  }

  async update(id: string, input: UpdateEmailTemplateInput) {
    await this.findById(id);
    return this.prisma.emailTemplate.update({ where: { id }, data: input });
  }

  async preview(id: string, vars: Record<string, string>) {
    const template = await this.findById(id);
    let subject = template.subject;
    let html    = template.bodyHtml;
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      subject = subject.replace(regex, value);
      html    = html.replace(regex, value);
    }
    return { subject, html };
  }
}
