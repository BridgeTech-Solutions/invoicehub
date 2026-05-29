export interface EmailTemplate {
  id:        string
  type:      string
  locale:    string
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

export const SUPPORTED_LOCALES = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
] as const

export type SupportedLocale = typeof SUPPORTED_LOCALES[number]['value']

export interface PreviewEmailTemplatePayload {
  [variable: string]: string
}

export interface PreviewEmailTemplateResponse {
  subject: string
  html:    string
}

export interface EmailTemplateVersion {
  id:         string
  templateId: string
  subject:    string
  bodyHtml:   string
  createdAt:  string
  editedBy: {
    id:        string
    firstName: string
    lastName:  string
  } | null
}

// Variables disponibles par type de template
export const TEMPLATE_VARIABLES: Record<string, string[]> = {
  // Factures
  invoice_issued:         ['{{userName}}','{{clientName}}','{{invoiceNumber}}','{{totalTtc}}','{{dueDate}}','{{invoiceLink}}','{{companyName}}'],
  invoice_paid:           ['{{userName}}','{{clientName}}','{{invoiceNumber}}','{{totalTtc}}','{{paymentDate}}','{{invoiceLink}}','{{companyName}}'],
  invoice_partially_paid: ['{{userName}}','{{clientName}}','{{invoiceNumber}}','{{totalTtc}}','{{amountPaid}}','{{balanceDue}}','{{invoiceLink}}','{{companyName}}'],
  invoice_overdue:        ['{{userName}}','{{clientName}}','{{invoiceNumber}}','{{totalTtc}}','{{daysOverdue}}','{{invoiceLink}}','{{companyName}}'],
  payment_registered:     ['{{userName}}','{{clientName}}','{{invoiceNumber}}','{{amountPaid}}','{{balanceDue}}','{{paymentDate}}','{{invoiceLink}}','{{companyName}}'],
  reminder_sent:          ['{{userName}}','{{clientName}}','{{invoiceNumber}}','{{totalTtc}}','{{daysOverdue}}','{{reminderLevel}}','{{invoiceLink}}','{{companyName}}'],
  // Proformas
  proforma_sent:          ['{{userName}}','{{clientName}}','{{proformaNumber}}','{{totalTtc}}','{{validUntil}}','{{proformaLink}}','{{companyName}}'],
  proforma_accepted:      ['{{userName}}','{{clientName}}','{{proformaNumber}}','{{totalTtc}}','{{proformaLink}}','{{companyName}}'],
  proforma_rejected:      ['{{userName}}','{{clientName}}','{{proformaNumber}}','{{totalTtc}}','{{comment}}','{{proformaLink}}','{{companyName}}'],
  proforma_expired:       ['{{userName}}','{{clientName}}','{{proformaNumber}}','{{totalTtc}}','{{validUntil}}','{{proformaLink}}','{{companyName}}'],
  // Système
  system:                 ['{{firstName}}','{{resetLink}}','{{companyName}}'],
  user_created:           ['{{firstName}}','{{userEmail}}','{{roleName}}','{{loginLink}}','{{companyName}}'],
  // Approbations
  approval_requested:     ['{{approverName}}','{{requesterName}}','{{documentType}}','{{documentNumber}}','{{amount}}','{{stepName}}','{{currentStep}}','{{totalSteps}}','{{requestId}}','{{appUrl}}','{{companyName}}'],
  approval_approved:      ['{{requesterName}}','{{documentType}}','{{documentNumber}}','{{stepName}}','{{deciderName}}','{{currentStep}}','{{totalSteps}}','{{requestId}}','{{appUrl}}','{{companyName}}'],
  approval_rejected:      ['{{requesterName}}','{{documentType}}','{{documentNumber}}','{{deciderName}}','{{comment}}','{{documentUrl}}','{{appUrl}}','{{companyName}}'],
  approval_expired:       ['{{requesterName}}','{{documentType}}','{{documentNumber}}','{{appUrl}}','{{companyName}}'],
  approval_delegated:     ['{{requesterName}}','{{documentType}}','{{documentNumber}}','{{stepName}}','{{deciderName}}','{{delegateName}}','{{requestId}}','{{appUrl}}','{{companyName}}'],
  // Dépenses & achats (modules futurs)
  expense_submitted:      ['{{submitterName}}','{{expenseTitle}}','{{amount}}','{{categoryName}}','{{companyName}}'],
  expense_approved:       ['{{submitterName}}','{{expenseTitle}}','{{amount}}','{{approverName}}','{{companyName}}'],
  expense_rejected:       ['{{submitterName}}','{{expenseTitle}}','{{amount}}','{{approverName}}','{{comment}}','{{companyName}}'],
  purchase_order_created:      ['{{supplierName}}','{{orderNumber}}','{{totalTtc}}','{{companyName}}'],
  purchase_order_approved:     ['{{supplierName}}','{{orderNumber}}','{{totalTtc}}','{{companyName}}'],
  purchase_order_rejected:     ['{{supplierName}}','{{orderNumber}}','{{comment}}','{{companyName}}'],
  supplier_invoice_received:   ['{{supplierName}}','{{invoiceNumber}}','{{totalTtc}}','{{dueDate}}','{{companyName}}'],
  supplier_invoice_due:        ['{{supplierName}}','{{invoiceNumber}}','{{totalTtc}}','{{dueDate}}','{{companyName}}'],
  // Stock / Banque / Fiscal / RH
  low_stock_alert:             ['{{productName}}','{{stockQuantity}}','{{stockMinLevel}}','{{companyName}}'],
  bank_reconciliation_pending: ['{{bankAccountName}}','{{pendingCount}}','{{companyName}}'],
  fiscal_period_closing:       ['{{periodLabel}}','{{closingDate}}','{{companyName}}'],
  role_changed:                ['{{firstName}}','{{oldRole}}','{{newRole}}','{{companyName}}'],
  budget_exceeded:             ['{{categoryName}}','{{periodLabel}}','{{percentUsed}}','{{companyName}}'],
}

// Valeurs de prévisualisation par défaut (utilisées pour le preview en un clic)
export const SAMPLE_PREVIEW_VALUES: Record<string, string> = {
  // Destinataire (membre BTS)
  userName:        'Jean-Paul Mbarga',
  firstName:       'Jean-Paul',
  userEmail:       'commercial@bts.cm',
  roleName:        'Commercial',
  // Clients / fournisseurs
  clientName:      'ACCESS BANK CAMEROON',
  supplierName:    'SYSCOM INFORMATIQUE',
  // Documents
  invoiceNumber:   'BTS/DC/2026/06/FAC001',
  proformaNumber:  'BTS/DC/2026/06/PFM001',
  orderNumber:     'BTS/DC/2026/06/CMD001',
  documentType:    'Facture',
  documentNumber:  'BTS/DC/2026/06/FAC002',
  // Montants
  totalTtc:        '597 975',
  amountPaid:      '300 000',
  balanceDue:      '297 975',
  amount:          '450 000',
  // Dates
  dueDate:         '30/06/2026',
  validUntil:      '15/06/2026',
  paymentDate:     '28/05/2026',
  daysOverdue:     '7',
  reminderLevel:   '2',
  // Liens vers l'app
  invoiceLink:     'https://app.bts.cm/invoices/fac001',
  proformaLink:    'https://app.bts.cm/proformas/pfm001',
  resetLink:       'https://app.bts.cm/reset-password?token=abc123',
  loginLink:       'https://app.bts.cm/login',
  appUrl:          'https://app.bts.cm',
  documentUrl:     'invoices/fac002',
  // Approbations
  approverName:    'Pierre Owono',
  requesterName:   'Jean-Paul Mbarga',
  deciderName:     'Pierre Owono',
  delegateName:    'Marie Ngo',
  stepName:        'Validation Comptable',
  currentStep:     '2',
  totalSteps:      '3',
  requestId:       'req-abc123',
  comment:         'Montant trop élevé, veuillez revoir le devis.',
  // Dépenses
  submitterName:   'Marie Ngo',
  expenseTitle:    'Achat de cartouches',
  categoryName:    'Fournitures de bureau',
  // Entreprise
  companyName:     'Bridge Technologies Solutions',
}

// Templates par défaut (sujet + corps) pour la restauration — version interne BTS
export const DEFAULT_EMAIL_TEMPLATES: Record<string, { subject: string; bodyHtml: string }> = {
  invoice_issued: {
    subject: '[{{companyName}}] Facture émise — {{invoiceNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">📄</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Facture émise : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La facture <strong>{{invoiceNumber}}</strong> vient d'être émise pour le client <strong>{{clientName}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0f7ff;"><td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;width:40%;">Client</td><td style="padding:11px 16px;border:1px solid #dbeafe;color:#1f2937;">{{clientName}}</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td><td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td></tr>
      <tr style="background:#f0f7ff;"><td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;">Montant TTC</td><td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:700;font-size:16px;color:#2D7DD2;">{{totalTtc}} XAF</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Échéance</td><td style="padding:11px 16px;border:1px solid #e5e7eb;color:#dc2626;font-weight:600;">{{dueDate}}</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">Voir la facture →</a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.</p>
  </div>
</div>`,
  },
  invoice_paid: {
    subject: '[{{companyName}}] Facture {{invoiceNumber}} intégralement soldée — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">✅</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Facture soldée : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong> est intégralement réglée.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0fdf4;"><td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;width:40%;">Client</td><td style="padding:11px 16px;border:1px solid #bbf7d0;color:#1f2937;">{{clientName}}</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td><td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td></tr>
      <tr style="background:#f0fdf4;"><td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;">Montant TTC</td><td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:700;font-size:16px;color:#16a34a;">{{totalTtc}} XAF</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Date de solde</td><td style="padding:11px 16px;border:1px solid #e5e7eb;color:#374151;">{{paymentDate}}</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">Voir la facture →</a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.</p>
  </div>
</div>`,
  },
  invoice_partially_paid: {
    subject: '[{{companyName}}] Paiement partiel — {{invoiceNumber}} — Solde restant {{balanceDue}} XAF',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">💳</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Paiement partiel : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Un paiement partiel de <strong>{{amountPaid}} XAF</strong> a été enregistré pour la facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong>. Il reste <strong>{{balanceDue}} XAF</strong> à percevoir.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0f7ff;"><td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;width:40%;">Client</td><td style="padding:11px 16px;border:1px solid #dbeafe;color:#1f2937;">{{clientName}}</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td><td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td></tr>
      <tr style="background:#f0f7ff;"><td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;">Montant TTC total</td><td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#374151;">{{totalTtc}} XAF</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Montant reçu</td><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:700;font-size:15px;color:#16a34a;">{{amountPaid}} XAF</td></tr>
      <tr style="background:#fef2f2;"><td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;">Solde restant</td><td style="padding:11px 16px;border:1px solid #fecaca;font-weight:700;font-size:15px;color:#dc2626;">{{balanceDue}} XAF</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">Voir la facture →</a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.</p>
  </div>
</div>`,
  },
  invoice_overdue: {
    subject: '[{{companyName}}] ALERTE — Facture {{invoiceNumber}} en retard ({{daysOverdue}} j)',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#dc2626;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">⚠</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Facture en retard : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong> est en retard de paiement depuis <strong>{{daysOverdue}} jour(s)</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#fef2f2;"><td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;width:40%;">Client</td><td style="padding:11px 16px;border:1px solid #fecaca;color:#1f2937;">{{clientName}}</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td><td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td></tr>
      <tr style="background:#fef2f2;"><td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;">Montant TTC</td><td style="padding:11px 16px;border:1px solid #fecaca;font-weight:700;font-size:16px;color:#dc2626;">{{totalTtc}} XAF</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Retard</td><td style="padding:11px 16px;border:1px solid #e5e7eb;color:#dc2626;font-weight:700;">{{daysOverdue}} jour(s)</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">Voir la facture →</a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.</p>
  </div>
</div>`,
  },
  payment_registered: {
    subject: '[{{companyName}}] Paiement reçu — {{invoiceNumber}} — {{amountPaid}} XAF',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">✓</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Paiement enregistré : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Un paiement de <strong>{{amountPaid}} XAF</strong> a été enregistré pour la facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0fdf4;"><td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;width:40%;">Client</td><td style="padding:11px 16px;border:1px solid #bbf7d0;color:#1f2937;">{{clientName}}</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td><td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td></tr>
      <tr style="background:#f0fdf4;"><td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;">Montant reçu</td><td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:700;font-size:16px;color:#16a34a;">{{amountPaid}} XAF</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Solde restant</td><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">{{balanceDue}} XAF</td></tr>
      <tr style="background:#f0fdf4;"><td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;">Date de paiement</td><td style="padding:11px 16px;border:1px solid #bbf7d0;color:#1f2937;">{{paymentDate}}</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">Voir la facture →</a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.</p>
  </div>
</div>`,
  },
  proforma_sent: {
    subject: '[{{companyName}}] Proforma envoyée — {{proformaNumber}} — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">📋</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Proforma envoyée : {{proformaNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La proforma <strong>{{proformaNumber}}</strong> a été envoyée au client <strong>{{clientName}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0f7ff;"><td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;width:40%;">Client</td><td style="padding:11px 16px;border:1px solid #dbeafe;color:#1f2937;">{{clientName}}</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Proforma</td><td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{proformaNumber}}</td></tr>
      <tr style="background:#f0f7ff;"><td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;">Montant TTC</td><td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:700;font-size:16px;color:#2D7DD2;">{{totalTtc}} XAF</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Valide jusqu'au</td><td style="padding:11px 16px;border:1px solid #e5e7eb;color:#374151;font-weight:600;">{{validUntil}}</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{proformaLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">Voir la proforma →</a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.</p>
  </div>
</div>`,
  },
  proforma_accepted: {
    subject: '[{{companyName}}] Proforma {{proformaNumber}} acceptée par {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">✅</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Proforma acceptée : {{proformaNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La proforma <strong>{{proformaNumber}}</strong> a été acceptée par le client <strong>{{clientName}}</strong>. Vous pouvez maintenant la convertir en facture.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0fdf4;"><td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;width:40%;">Client</td><td style="padding:11px 16px;border:1px solid #bbf7d0;color:#1f2937;">{{clientName}}</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Proforma</td><td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{proformaNumber}}</td></tr>
      <tr style="background:#f0fdf4;"><td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;">Montant TTC</td><td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:700;font-size:16px;color:#16a34a;">{{totalTtc}} XAF</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{proformaLink}}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">Voir la proforma →</a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.</p>
  </div>
</div>`,
  },
  proforma_rejected: {
    subject: '[{{companyName}}] Proforma {{proformaNumber}} refusée — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#dc2626;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">✗</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Proforma refusée : {{proformaNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Le client <strong>{{clientName}}</strong> a refusé la proforma <strong>{{proformaNumber}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#fef2f2;"><td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;width:40%;">Client</td><td style="padding:11px 16px;border:1px solid #fecaca;color:#1f2937;">{{clientName}}</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Proforma</td><td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{proformaNumber}}</td></tr>
      <tr style="background:#fef2f2;"><td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;">Montant TTC</td><td style="padding:11px 16px;border:1px solid #fecaca;font-weight:700;color:#dc2626;">{{totalTtc}} XAF</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Motif</td><td style="padding:11px 16px;border:1px solid #e5e7eb;color:#374151;font-style:italic;">{{comment}}</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{proformaLink}}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">Voir la proforma →</a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.</p>
  </div>
</div>`,
  },
  proforma_expired: {
    subject: '[{{companyName}}] Proforma {{proformaNumber}} expirée — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#d97706;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">⌛</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Proforma expirée : {{proformaNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La proforma <strong>{{proformaNumber}}</strong> envoyée au client <strong>{{clientName}}</strong> a expiré sans réponse le <strong>{{validUntil}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#fffbeb;"><td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;width:40%;">Client</td><td style="padding:11px 16px;border:1px solid #fde68a;color:#1f2937;">{{clientName}}</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Proforma</td><td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{proformaNumber}}</td></tr>
      <tr style="background:#fffbeb;"><td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;">Montant TTC</td><td style="padding:11px 16px;border:1px solid #fde68a;font-weight:700;color:#d97706;">{{totalTtc}} XAF</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Expirée le</td><td style="padding:11px 16px;border:1px solid #e5e7eb;color:#dc2626;font-weight:600;">{{validUntil}}</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{proformaLink}}" style="display:inline-block;background:#d97706;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">Voir la proforma →</a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.</p>
  </div>
</div>`,
  },
  reminder_sent: {
    subject: '[{{companyName}}] Relance niveau {{reminderLevel}} — {{invoiceNumber}} — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#d97706;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">🔔</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Relance niveau {{reminderLevel}} — {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong> reste impayée. Une action de votre part est recommandée.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#fffbeb;"><td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;width:40%;">Client</td><td style="padding:11px 16px;border:1px solid #fde68a;color:#1f2937;">{{clientName}}</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td><td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td></tr>
      <tr style="background:#fffbeb;"><td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;">Montant dû</td><td style="padding:11px 16px;border:1px solid #fde68a;font-weight:700;font-size:16px;color:#d97706;">{{totalTtc}} XAF</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Retard</td><td style="padding:11px 16px;border:1px solid #e5e7eb;color:#dc2626;font-weight:700;">{{daysOverdue}} jour(s)</td></tr>
      <tr style="background:#fffbeb;"><td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;">Niveau de relance</td><td style="padding:11px 16px;border:1px solid #fde68a;font-weight:700;color:#d97706;">Niveau {{reminderLevel}}</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#d97706;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">Voir la facture →</a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement. Aucun email n'a été envoyé directement au client.</p>
  </div>
</div>`,
  },
  system: {
    subject: '[{{companyName}}] Réinitialisation de votre mot de passe',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">🔐</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Réinitialisation du mot de passe</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{firstName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Vous avez demandé la réinitialisation de votre mot de passe pour votre compte <strong>{{companyName}}</strong>.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="{{resetLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">Réinitialiser mon mot de passe →</a>
    </div>
    <p style="margin:0 0 20px;padding:14px 16px;background:#f0f7ff;border-left:3px solid #2D7DD2;border-radius:4px;font-size:13px;color:#1e40af;">⏱ Ce lien est valable <strong>1 heure</strong>. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.</p>
  </div>
</div>`,
  },
  user_created: {
    subject: '[{{companyName}}] Bienvenue {{firstName}} — Votre accès InvoiceHub',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">👋</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Bienvenue sur InvoiceHub !</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{firstName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Votre compte sur la plateforme <strong>InvoiceHub</strong> de <strong>{{companyName}}</strong> a été créé avec succès.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0f7ff;"><td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;width:40%;">Rôle</td><td style="padding:11px 16px;border:1px solid #dbeafe;color:#1f2937;">{{roleName}}</td></tr>
      <tr><td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Email</td><td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{userEmail}}</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{loginLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">Accéder à la plateforme →</a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.</p>
  </div>
</div>`,
  },
}
