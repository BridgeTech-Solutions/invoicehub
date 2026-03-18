export interface EmailTemplate {
  id:        string
  type:      string
  name:      string
  subject:   string
  bodyHtml:  string
  isActive:  boolean
  createdAt: string
  updatedAt: string
}

export interface UpdateEmailTemplatePayload {
  name?:      string
  subject?:   string
  bodyHtml?:  string
  isActive?:  boolean
}

export interface PreviewEmailTemplatePayload {
  [variable: string]: string
}

export interface PreviewEmailTemplateResponse {
  subject: string
  html:    string
}

// Variables disponibles par type de template (clés = valeurs de l'enum notification_status)
export const TEMPLATE_VARIABLES: Record<string, string[]> = {
  invoice_issued:      ['{{clientName}}','{{invoiceNumber}}','{{totalTtc}}','{{dueDate}}','{{companyName}}'],
  payment_registered:  ['{{clientName}}','{{invoiceNumber}}','{{amountPaid}}','{{balanceDue}}','{{companyName}}'],
  invoice_overdue:     ['{{clientName}}','{{invoiceNumber}}','{{totalTtc}}','{{daysOverdue}}','{{companyName}}'],
  proforma_sent:       ['{{clientName}}','{{proformaNumber}}','{{totalTtc}}','{{validUntil}}','{{companyName}}'],
  system:              ['{{firstName}}','{{resetLink}}','{{companyName}}'],
  user_created:        ['{{firstName}}','{{loginLink}}','{{companyName}}'],
  reminder_sent:       ['{{clientName}}','{{invoiceNumber}}','{{totalTtc}}','{{daysOverdue}}','{{companyName}}'],
}
