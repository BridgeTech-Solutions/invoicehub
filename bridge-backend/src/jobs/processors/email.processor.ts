/**
 * @module jobs/processors/email
 * Traitement des jobs d'envoi d'email.
 *
 * Chaque job contient le destinataire, l'objet et le corps HTML.
 * En cas d'échec (SMTP indisponible), BullMQ rejoue jusqu'à 3 fois
 * avec backoff exponentiel (5s → 10s → 20s).
 */
import { Job } from 'bullmq';
import { sendMail } from '../../lib/mailer';
import type { EmailJobData } from '../queues';

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { to, subject, html, replyTo } = job.data;

  await sendMail({ to, subject, html, replyTo });
}
