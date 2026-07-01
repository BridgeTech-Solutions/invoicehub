import * as nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';

/** Échappe une valeur destinée à être injectée dans du HTML (anti-injection). */
function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT ?? '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: nodemailer.SendMailOptions['attachments'];
}

export async function sendMail(options: SendMailOptions): Promise<void> {
  if (!process.env.SMTP_HOST) {
    console.warn('[Mailer] SMTP not configured — email not sent', { to: options.to, subject: options.subject });
    return;
  }

  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@bts.cm',
      to:   Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html:    options.html,
      attachments: options.attachments,
    });
  } catch (err) {
    console.error('[Mailer] Email send failed', (err as Error).message);
    throw err;
  }
}

// prismaInstance optionnel — utilisé par les processeurs qui injectent PrismaService
let _prisma: PrismaClient | null = null;

export function setMailerPrisma(p: PrismaClient) {
  _prisma = p;
}

export async function renderEmailTemplate(
  templateType: string,
  variables: Record<string, string>,
): Promise<{ subject: string; html: string } | null> {
  if (!_prisma) {
    console.warn(`[Mailer] PrismaClient non initialisé — template ${templateType} ignoré`);
    return null;
  }

  const template = await _prisma.emailTemplate.findFirst({
    where: { type: templateType as never, isActive: true },
  });
  if (!template) return null;

  let subject = template.subject;
  let html    = template.bodyHtml;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    // Le sujet est du texte brut (pas de contexte HTML) → valeur telle quelle.
    // Le corps est du HTML → on échappe la valeur pour empêcher toute injection
    // de balise ou casse de mise en page (ex. motif de rejet saisi par un user).
    subject = subject.replace(regex, value);
    html    = html.replace(regex, escapeHtml(value));
  }
  // Filet de sécurité : on retire tout placeholder non résolu pour ne jamais
  // afficher d'accolades brutes ({{xxx}}) au lecteur, même si un site d'envoi
  // a oublié de fournir une variable.
  const stripUnresolved = (s: string) => s.replace(/\{\{\s*[\w.]+\s*\}\}/g, '');
  subject = stripUnresolved(subject);
  html    = stripUnresolved(html);
  return { subject, html };
}

export async function sendTemplatedEmail(
  templateCode: string,
  to: string | string[],
  variables: Record<string, string>,
): Promise<void> {
  const rendered = await renderEmailTemplate(templateCode, variables);
  if (!rendered) return;
  await sendMail({ to, subject: rendered.subject, html: rendered.html });
}
