import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { logger } from '../core/middleware/requestLogger';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
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
  if (!env.SMTP_HOST) {
    logger.warn('SMTP not configured — email not sent', { to: options.to, subject: options.subject });
    return;
  }

  try {
    await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments,
    });
    logger.info('Email sent', { to: options.to, subject: options.subject });
  } catch (err) {
    logger.error('Email send failed', { error: (err as Error).message });
    throw err;
  }
}

/**
 * Envoie un email à partir d'un template stocké en base (email_templates).
 * Les variables {{VAR}} sont remplacées par les valeurs fournies.
 */
export async function sendTemplatedEmail(
  templateCode: string,
  to: string | string[],
  variables: Record<string, string>,
): Promise<void> {
  const template = await prisma.emailTemplate.findFirst({
    where: { name: templateCode },
  });

  if (!template || !template.isActive) {
    logger.warn(`Email template not found or inactive: ${templateCode}`);
    return;
  }

  let subject = template.subject;
  let html = template.bodyHtml;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    subject = subject.replace(regex, value);
    html = html.replace(regex, value);
  }

  await sendMail({ to, subject, html });
}
