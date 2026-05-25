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
  invoice_issued:         ['{{clientName}}','{{invoiceNumber}}','{{totalTtc}}','{{dueDate}}','{{companyName}}'],
  invoice_paid:           ['{{clientName}}','{{invoiceNumber}}','{{totalTtc}}','{{companyName}}'],
  invoice_partially_paid: ['{{clientName}}','{{invoiceNumber}}','{{amountPaid}}','{{balanceDue}}','{{totalTtc}}','{{companyName}}'],
  invoice_overdue:        ['{{clientName}}','{{invoiceNumber}}','{{totalTtc}}','{{daysOverdue}}','{{companyName}}'],
  payment_registered:     ['{{clientName}}','{{invoiceNumber}}','{{amountPaid}}','{{balanceDue}}','{{companyName}}'],
  reminder_sent:          ['{{clientName}}','{{invoiceNumber}}','{{totalTtc}}','{{daysOverdue}}','{{companyName}}'],
  // Proformas
  proforma_sent:          ['{{clientName}}','{{proformaNumber}}','{{totalTtc}}','{{validUntil}}','{{companyName}}'],
  proforma_accepted:      ['{{clientName}}','{{proformaNumber}}','{{totalTtc}}','{{companyName}}'],
  proforma_rejected:      ['{{clientName}}','{{proformaNumber}}','{{comment}}','{{companyName}}'],
  proforma_expired:       ['{{clientName}}','{{proformaNumber}}','{{validUntil}}','{{companyName}}'],
  // Système
  system:                 ['{{firstName}}','{{resetLink}}','{{companyName}}'],
  user_created:           ['{{firstName}}','{{loginLink}}','{{companyName}}'],
  // Approbations
  approval_requested:     ['{{approverName}}','{{requesterName}}','{{documentType}}','{{documentNumber}}','{{amount}}','{{stepName}}','{{currentStep}}','{{totalSteps}}','{{requestId}}','{{appUrl}}','{{companyName}}'],
  approval_approved:      ['{{requesterName}}','{{documentType}}','{{documentNumber}}','{{stepName}}','{{deciderName}}','{{currentStep}}','{{totalSteps}}','{{companyName}}'],
  approval_rejected:      ['{{requesterName}}','{{documentType}}','{{documentNumber}}','{{deciderName}}','{{comment}}','{{documentUrl}}','{{appUrl}}','{{companyName}}'],
  approval_expired:       ['{{requesterName}}','{{documentType}}','{{documentNumber}}','{{companyName}}'],
  approval_delegated:     ['{{requesterName}}','{{documentType}}','{{documentNumber}}','{{stepName}}','{{deciderName}}','{{delegateName}}','{{requestId}}','{{appUrl}}','{{companyName}}'],
  // Dépenses & achats (modules futurs)
  expense_submitted:      ['{{submitterName}}','{{expenseTitle}}','{{amount}}','{{categoryName}}','{{companyName}}'],
  expense_approved:       ['{{submitterName}}','{{expenseTitle}}','{{amount}}','{{approverName}}','{{companyName}}'],
  expense_rejected:       ['{{submitterName}}','{{expenseTitle}}','{{amount}}','{{approverName}}','{{comment}}','{{companyName}}'],
  purchase_order_received:['{{supplierName}}','{{orderNumber}}','{{totalTtc}}','{{companyName}}'],
  supplier_invoice_due:   ['{{supplierName}}','{{invoiceNumber}}','{{totalTtc}}','{{dueDate}}','{{companyName}}'],
}

// Valeurs de prévisualisation par défaut (utilisées pour le preview en un clic)
export const SAMPLE_PREVIEW_VALUES: Record<string, string> = {
  clientName:      'ACCESS BANK CAMEROON',
  supplierName:    'SYSCOM INFORMATIQUE',
  invoiceNumber:   'FAC001',
  proformaNumber:  'PFM001',
  orderNumber:     'CMD001',
  totalTtc:        '597 975',
  amountPaid:      '300 000',
  balanceDue:      '297 975',
  dueDate:         '30/06/2026',
  validUntil:      '15/06/2026',
  daysOverdue:     '7',
  companyName:     'Bridge Technologies Solutions',
  firstName:       'Jean-Paul',
  resetLink:       'https://app.bts.cm/reset-password?token=xxx',
  loginLink:       'https://app.bts.cm/login',
  approverName:    'Pierre Owono',
  requesterName:   'Jean-Paul Mbarga',
  deciderName:     'Pierre Owono',
  delegateName:    'Marie Ngo',
  documentType:    'Facture',
  documentNumber:  'FAC002',
  amount:          '450 000',
  stepName:        'Validation Comptable',
  currentStep:     '2',
  totalSteps:      '3',
  requestId:       'req-123',
  appUrl:          'https://app.bts.cm',
  documentUrl:     'invoices/fac002',
  comment:         'Montant trop élevé, veuillez revoir le devis.',
  submitterName:   'Marie Ngo',
  expenseTitle:    'Achat de cartouches',
  categoryName:    'Fournitures de bureau',
}

// Templates par défaut (sujet + corps) pour la restauration
export const DEFAULT_EMAIL_TEMPLATES: Record<string, { subject: string; bodyHtml: string }> = {
  invoice_issued: {
    subject: '[{{companyName}}] Votre facture {{invoiceNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Facture {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{clientName}},</p>
    <p>Veuillez trouver ci-joint votre facture <strong>{{invoiceNumber}}</strong> d'un montant de <strong>{{totalTtc}} XAF</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr style="background:#f9fafb;"><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Facture</td><td style="padding:10px 16px;border:1px solid #e5e7eb;">{{invoiceNumber}}</td></tr>
      <tr><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Montant TTC</td><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;color:#2D7DD2;">{{totalTtc}} XAF</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Échéance</td><td style="padding:10px 16px;border:1px solid #e5e7eb;">{{dueDate}}</td></tr>
    </table>
    <p>Pour toute question, n'hésitez pas à nous contacter.</p>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
  },
  invoice_paid: {
    subject: '[{{companyName}}] Facture {{invoiceNumber}} — Soldée',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">✓ Facture soldée</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{clientName}},</p>
    <p>Votre facture <strong>{{invoiceNumber}}</strong> d'un montant de <strong>{{totalTtc}} XAF</strong> est intégralement réglée. Merci pour votre paiement.</p>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
  },
  invoice_partially_paid: {
    subject: '[{{companyName}}] Paiement partiel reçu — {{invoiceNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Paiement partiel reçu</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{clientName}},</p>
    <p>Nous avons bien reçu votre paiement de <strong>{{amountPaid}} XAF</strong> pour la facture <strong>{{invoiceNumber}}</strong>. Il reste un solde de <strong>{{balanceDue}} XAF</strong> à régler.</p>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
  },
  invoice_overdue: {
    subject: '[{{companyName}}] Rappel de paiement — {{invoiceNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#dc2626;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">⚠ Rappel de paiement</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{clientName}},</p>
    <p>Nous vous rappelons que la facture <strong>{{invoiceNumber}}</strong> d'un montant de <strong>{{totalTtc}} XAF</strong> est en retard de paiement depuis <strong>{{daysOverdue}} jour(s)</strong>.</p>
    <p>Merci de bien vouloir régulariser cette situation dans les meilleurs délais.</p>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
  },
  payment_registered: {
    subject: '[{{companyName}}] Confirmation de paiement — {{invoiceNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">✓ Paiement reçu</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{clientName}},</p>
    <p>Nous avons bien reçu votre paiement de <strong>{{amountPaid}} XAF</strong> pour la facture <strong>{{invoiceNumber}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr style="background:#f9fafb;"><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Montant reçu</td><td style="padding:10px 16px;border:1px solid #e5e7eb;color:#16a34a;font-weight:bold;">{{amountPaid}} XAF</td></tr>
      <tr><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Solde restant</td><td style="padding:10px 16px;border:1px solid #e5e7eb;">{{balanceDue}} XAF</td></tr>
    </table>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
  },
  proforma_sent: {
    subject: '[{{companyName}}] Votre devis {{proformaNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#6366f1;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Devis {{proformaNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{clientName}},</p>
    <p>Veuillez trouver ci-joint notre devis <strong>{{proformaNumber}}</strong> d'un montant de <strong>{{totalTtc}} XAF</strong>, valable jusqu'au <strong>{{validUntil}}</strong>.</p>
    <p>Pour accepter ce devis, veuillez nous contacter ou répondre à cet email.</p>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
  },
  proforma_accepted: {
    subject: '[{{companyName}}] Devis {{proformaNumber}} accepté',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">✓ Devis accepté</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{clientName}},</p>
    <p>Nous avons bien reçu votre acceptation du devis <strong>{{proformaNumber}}</strong> d'un montant de <strong>{{totalTtc}} XAF</strong>. Nous allons vous faire parvenir la facture correspondante.</p>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
  },
  proforma_rejected: {
    subject: '[{{companyName}}] Devis {{proformaNumber}} refusé',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#dc2626;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Devis refusé</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{clientName}},</p>
    <p>Nous avons pris note de votre refus concernant le devis <strong>{{proformaNumber}}</strong>.</p>
    <p><strong>Motif :</strong> {{comment}}</p>
    <p>N'hésitez pas à nous contacter pour toute question ou pour établir un nouveau devis.</p>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
  },
  proforma_expired: {
    subject: '[{{companyName}}] Devis {{proformaNumber}} expiré',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#d97706;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">⚠ Devis expiré</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{clientName}},</p>
    <p>Le devis <strong>{{proformaNumber}}</strong> a expiré le <strong>{{validUntil}}</strong>. Contactez-nous si vous souhaitez un nouveau devis.</p>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
  },
  reminder_sent: {
    subject: '[InvoiceHub BTS] Relance — {{invoiceNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#d97706;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">⚠ Relance — {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>La facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong> est impayée depuis <strong>{{daysOverdue}} jour(s)</strong>.</p>
    <p>Montant dû : <strong>{{totalTtc}} XAF</strong>.</p>
    <p style="color:#6b7280;font-size:13px;">Ceci est une alerte interne — aucun email n'a été envoyé au client.</p>
  </div>
</div>`,
  },
  system: {
    subject: '[{{companyName}}] Réinitialisation de votre mot de passe',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Réinitialisation du mot de passe</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{firstName}},</p>
    <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="{{resetLink}}" style="background:#2D7DD2;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">Réinitialiser mon mot de passe</a>
    </div>
    <p style="color:#6b7280;font-size:13px;">Ce lien expire dans 1 heure.</p>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
  },
  user_created: {
    subject: '[{{companyName}}] Bienvenue sur InvoiceHub',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:18px;">Bienvenue sur InvoiceHub !</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
    <p>Bonjour {{firstName}},</p>
    <p>Votre compte sur la plateforme InvoiceHub de <strong>{{companyName}}</strong> a été créé avec succès.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="{{loginLink}}" style="background:#2D7DD2;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">Accéder à la plateforme</a>
    </div>
    <p style="margin-top:24px;">Cordialement,<br><strong>{{companyName}}</strong></p>
  </div>
</div>`,
  },
}
