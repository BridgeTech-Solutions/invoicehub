import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { sendMail } from '../../lib/mailer';
import type { EmailJobData } from '../job-types';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  async process(job: Job<EmailJobData>): Promise<void> {
    const { to, subject, html } = job.data;
    await sendMail({ to, subject, html });
  }
}
