import { Job } from 'bullmq'
import { approvalsService } from '../../modules/approvals/approvals.service'
import type { ApprovalJobData } from '../queues'

export async function approvalProcessor(job: Job<ApprovalJobData>) {
  switch (job.data.type) {
    case 'check-expired':
      await approvalsService.checkExpiredRequests()
      break
    default:
      break
  }
}
