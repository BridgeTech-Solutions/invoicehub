import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';

export interface UpdateEmailTemplateInput {
  name?:     string;
  subject?:  string;
  bodyHtml?: string;
  isActive?: boolean;
}

export class EmailTemplatesService {
  async list() {
    return prisma.emailTemplate.findMany({ orderBy: { type: 'asc' } });
  }

  async findById(id: string) {
    const data = await prisma.emailTemplate.findFirst({ where: { id } });
    if (!data) throw AppError.notFound('Template introuvable');
    return data;
  }

  async update(id: string, input: UpdateEmailTemplateInput) {
    await this.findById(id);
    return prisma.emailTemplate.update({ where: { id }, data: input });
  }

  async preview(id: string, vars: Record<string, string>) {
    const template = await this.findById(id);
    let html = template.bodyHtml;
    for (const [key, value] of Object.entries(vars)) {
      html = html.replaceAll(`{{${key}}}`, value);
    }
    return { subject: template.subject, html };
  }
}

export const emailTemplatesService = new EmailTemplatesService();
