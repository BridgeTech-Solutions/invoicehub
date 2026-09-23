export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  from?: string;
  cc?: string[];
  bcc?: string[];
  // Pièces jointes transportées en base64 dans la file (ex. PDF de facture/proforma).
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
}

export interface NotificationJobData {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface OverdueJobData {
  triggeredAt: string;
}

export interface RecurringJobData {
  triggeredAt: string;
}

export interface ReminderJobData {
  triggeredAt: string;
}

export interface BackupJobData {
  backupId: string;
}

export interface CleanupJobData {
  triggeredAt: string;
}

export interface ExportJobData {
  exportJobId: string;
}

export interface BankImportJobData {
  importId:      string;
  bankAccountId: string;
  lines:         unknown[];
}

export interface ApprovalJobData {
  type: 'check-expired' | 'notify-approvers';
  requestId?: string;
}
