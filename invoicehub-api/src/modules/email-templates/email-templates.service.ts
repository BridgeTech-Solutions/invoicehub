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

  async findByType(type: string, locale = 'fr') {
    const data = await this.prisma.emailTemplate.findFirst({
      where: { type: type as never, locale, isActive: true },
    }) ?? await this.prisma.emailTemplate.findFirst({
      where: { type: type as never, locale: 'fr', isActive: true },
    });
    if (!data) throw AppError.notFound(`Template introuvable pour le type : ${type}`);
    return data;
  }

  async update(id: string, input: UpdateEmailTemplateInput, editedById?: string) {
    const current = await this.findById(id);
    if (input.subject !== undefined || input.bodyHtml !== undefined) {
      await this.prisma.emailTemplateVersion.create({
        data: {
          templateId: id,
          subject:    current.subject,
          bodyHtml:   current.bodyHtml,
          editedById: editedById ?? null,
        },
      });
    }
    return this.prisma.emailTemplate.update({ where: { id }, data: input });
  }

  async getVersions(id: string) {
    await this.findById(id);
    return this.prisma.emailTemplateVersion.findMany({
      where:   { templateId: id },
      orderBy: { createdAt: 'desc' },
      take:    20,
      include: { editedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async restoreVersion(templateId: string, versionId: string, editedById?: string) {
    const version = await this.prisma.emailTemplateVersion.findFirst({
      where: { id: versionId, templateId },
    });
    if (!version) throw AppError.notFound('Version introuvable');
    return this.update(templateId, { subject: version.subject, bodyHtml: version.bodyHtml }, editedById);
  }

  async listByLocale(locale: string) {
    return this.prisma.emailTemplate.findMany({ where: { locale }, orderBy: { type: 'asc' } });
  }

  async preview(id: string, vars: Record<string, string>) {
    const template = await this.findById(id);
    let subject = template.subject;
    let html    = template.bodyHtml;
    const escapeHtml = (v: string) =>
      String(v).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
      );
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      subject = subject.replace(regex, value);
      html    = html.replace(regex, escapeHtml(value));
    }
    return { subject, html };
  }
}
