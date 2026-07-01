import type { NotificationStatus } from '@prisma/client';

// ─── Design email sobre & professionnel ───────────────────────────────────────
// Un seul accent (bleu de marque), typographie neutre, pas de bandeau vif ni de
// lignes de tableau multicolores. Le sens (retard, rejet…) est porté par le TITRE
// et le texte, pas par des couleurs criardes. Source unique pour le seed et pour
// le script de rafraîchissement des templates en base (sync-email-templates.ts).

const ACCENT = '#2D7DD2';
const NAVY   = '#0f2d4a';

const INTERNAL_NOTE = 'Notification interne — réservée aux membres de {{companyName}}.';

interface ShellOptions {
  title: string;
  intro: string;
  rows?: [string, string][];
  cta?:  { label: string; url: string };
  note?: string;
}

/** Gabarit HTML commun à tous les emails — sobre, une seule couleur d'accent. */
export function renderEmailShell(o: ShellOptions): string {
  const rowsHtml = (o.rows ?? [])
    .map(([k, v]) => `
        <tr>
          <td style="padding:10px 16px;border:1px solid #e5e7eb;background:#f8fafc;color:#6b7280;font-weight:600;width:42%;">${k}</td>
          <td style="padding:10px 16px;border:1px solid #e5e7eb;color:#1f2937;">${v}</td>
        </tr>`).join('');

  const table = (o.rows && o.rows.length)
    ? `<table style="width:100%;border-collapse:collapse;margin:0 0 22px;font-size:14px;">${rowsHtml}
      </table>`
    : '';

  const cta = o.cta
    ? `<div style="margin:22px 0;">
        <a href="${o.cta.url}" style="display:inline-block;background:${ACCENT};color:#ffffff;padding:11px 26px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${o.cta.label}</a>
      </div>`
    : '';

  const note = o.note
    ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #eef0f2;font-size:12px;color:#9ca3af;line-height:1.5;">${o.note}</p>`
    : '';

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#1f2937;line-height:1.55;">
  <div style="padding:22px 28px 18px;border-bottom:2px solid ${ACCENT};">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.6px;color:${NAVY};text-transform:uppercase;">{{companyName}}</div>
    <h1 style="margin:8px 0 0;font-size:18px;font-weight:700;color:${NAVY};">${o.title}</h1>
  </div>
  <div style="padding:24px 28px;">
    <p style="margin:0 0 18px;color:#374151;">${o.intro}</p>
    ${table}${cta}${note}
  </div>
</div>`;
}

export interface EmailTemplateSeed {
  type:      NotificationStatus;
  name:      string;
  subject:   string;
  bodyHtml:  string;
  variables: string[];
}

export const EMAIL_TEMPLATES: EmailTemplateSeed[] = [
  {
    type: 'invoice_issued',
    name: 'Facture émise [interne BTS]',
    subject: '[InvoiceHub] Facture émise — {{invoiceNumber}}',
    bodyHtml: renderEmailShell({
      title: 'Facture émise — {{invoiceNumber}}',
      intro: `Bonjour <strong>{{userName}}</strong>, la facture <strong>{{invoiceNumber}}</strong> vient d'être émise pour le client <strong>{{clientName}}</strong>.`,
      rows: [['Client', '{{clientName}}'], ['N° facture', '{{invoiceNumber}}'], ['Montant TTC', '<strong>{{totalTtc}} XAF</strong>'], ['Échéance', '{{dueDate}}']],
      cta: { label: 'Voir la facture', url: '{{invoiceLink}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{userName}}', '{{invoiceNumber}}', '{{clientName}}', '{{totalTtc}}', '{{dueDate}}', '{{invoiceLink}}', '{{companyName}}'],
  },
  {
    type: 'invoice_overdue',
    name: 'Facture en retard [interne BTS]',
    subject: '[InvoiceHub] Facture {{invoiceNumber}} en retard ({{daysOverdue}} j)',
    bodyHtml: renderEmailShell({
      title: 'Facture en retard — {{invoiceNumber}}',
      intro: `Bonjour <strong>{{userName}}</strong>, la facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong> est en retard de paiement depuis <strong>{{daysOverdue}} jour(s)</strong>.`,
      rows: [['Client', '{{clientName}}'], ['N° facture', '{{invoiceNumber}}'], ['Montant TTC', '<strong>{{totalTtc}} XAF</strong>'], ['Retard', '{{daysOverdue}} jour(s)']],
      cta: { label: 'Voir la facture', url: '{{invoiceLink}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{daysOverdue}}', '{{invoiceLink}}', '{{companyName}}'],
  },
  {
    type: 'payment_registered',
    name: 'Paiement enregistré [interne BTS]',
    subject: '[InvoiceHub] Paiement reçu — {{invoiceNumber}} — {{amountPaid}} XAF',
    bodyHtml: renderEmailShell({
      title: 'Paiement reçu — {{invoiceNumber}}',
      intro: `Bonjour <strong>{{userName}}</strong>, un paiement de <strong>{{amountPaid}} XAF</strong> a été enregistré pour la facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong>.`,
      rows: [['Client', '{{clientName}}'], ['N° facture', '{{invoiceNumber}}'], ['Montant reçu', '<strong>{{amountPaid}} XAF</strong>'], ['Solde restant', '{{balanceDue}} XAF'], ['Date de paiement', '{{paymentDate}}']],
      cta: { label: 'Voir la facture', url: '{{invoiceLink}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{amountPaid}}', '{{balanceDue}}', '{{paymentDate}}', '{{invoiceLink}}', '{{companyName}}'],
  },
  {
    type: 'proforma_sent',
    name: 'Proforma envoyée [interne BTS]',
    subject: '[InvoiceHub] Proforma envoyée — {{proformaNumber}} — {{clientName}}',
    bodyHtml: renderEmailShell({
      title: 'Proforma envoyée — {{proformaNumber}}',
      intro: `Bonjour <strong>{{userName}}</strong>, la proforma <strong>{{proformaNumber}}</strong> a été envoyée au client <strong>{{clientName}}</strong>.`,
      rows: [['Client', '{{clientName}}'], ['N° proforma', '{{proformaNumber}}'], ['Montant TTC', '<strong>{{totalTtc}} XAF</strong>'], ['Valide jusqu\'au', '{{validUntil}}']],
      cta: { label: 'Voir la proforma', url: '{{proformaLink}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{userName}}', '{{clientName}}', '{{proformaNumber}}', '{{totalTtc}}', '{{validUntil}}', '{{proformaLink}}', '{{companyName}}'],
  },
  {
    type: 'system',
    name: 'Réinitialisation de mot de passe',
    subject: '[InvoiceHub] Réinitialisation de votre mot de passe',
    bodyHtml: renderEmailShell({
      title: 'Réinitialisation du mot de passe',
      intro: `Bonjour <strong>{{firstName}}</strong>, vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour en définir un nouveau.`,
      cta: { label: 'Réinitialiser mon mot de passe', url: '{{resetLink}}' },
      note: `Ce lien est valable <strong>1 heure</strong>. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.`,
    }),
    variables: ['{{firstName}}', '{{resetLink}}', '{{companyName}}'],
  },
  {
    type: 'user_created',
    name: 'Bienvenue (nouvel utilisateur)',
    subject: '[InvoiceHub] Bienvenue {{firstName}} — Votre accès InvoiceHub',
    bodyHtml: renderEmailShell({
      title: 'Bienvenue sur InvoiceHub',
      intro: `Bonjour <strong>{{firstName}}</strong>, votre compte a été créé avec succès. Vous pouvez dès à présent vous connecter avec vos identifiants.`,
      rows: [['Rôle', '{{roleName}}'], ['Email', '{{userEmail}}']],
      cta: { label: 'Accéder à la plateforme', url: '{{loginLink}}' },
    }),
    variables: ['{{firstName}}', '{{userEmail}}', '{{roleName}}', '{{loginLink}}', '{{companyName}}'],
  },
  {
    type: 'reminder_sent',
    name: 'Relance interne [interne BTS]',
    subject: '[InvoiceHub] Relance niveau {{reminderLevel}} — {{invoiceNumber}} — {{clientName}}',
    bodyHtml: renderEmailShell({
      title: 'Relance niveau {{reminderLevel}} — {{invoiceNumber}}',
      intro: `Bonjour <strong>{{userName}}</strong>, la facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong> reste impayée. Une action de votre part est recommandée.`,
      rows: [['Client', '{{clientName}}'], ['N° facture', '{{invoiceNumber}}'], ['Montant dû', '<strong>{{totalTtc}} XAF</strong>'], ['Retard', '{{daysOverdue}} jour(s)'], ['Niveau de relance', '{{reminderLevel}}']],
      cta: { label: 'Voir la facture', url: '{{invoiceLink}}' },
      note: 'Notification interne — aucun email n\'a été envoyé directement au client. Réservée aux membres de {{companyName}}.',
    }),
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{daysOverdue}}', '{{reminderLevel}}', '{{invoiceLink}}', '{{companyName}}'],
  },
  {
    type: 'invoice_paid',
    name: 'Facture soldée [interne BTS]',
    subject: '[InvoiceHub] Facture {{invoiceNumber}} intégralement soldée — {{clientName}}',
    bodyHtml: renderEmailShell({
      title: 'Facture soldée — {{invoiceNumber}}',
      intro: `Bonjour <strong>{{userName}}</strong>, la facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong> est intégralement réglée.`,
      rows: [['Client', '{{clientName}}'], ['N° facture', '{{invoiceNumber}}'], ['Montant TTC', '<strong>{{totalTtc}} XAF</strong>'], ['Date de solde', '{{paymentDate}}']],
      cta: { label: 'Voir la facture', url: '{{invoiceLink}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{paymentDate}}', '{{invoiceLink}}', '{{companyName}}'],
  },
  {
    type: 'invoice_partially_paid',
    name: 'Paiement partiel reçu [interne BTS]',
    subject: '[InvoiceHub] Paiement partiel — {{invoiceNumber}} — Solde restant {{balanceDue}} XAF',
    bodyHtml: renderEmailShell({
      title: 'Paiement partiel — {{invoiceNumber}}',
      intro: `Bonjour <strong>{{userName}}</strong>, un paiement partiel de <strong>{{amountPaid}} XAF</strong> a été enregistré pour la facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong>. Il reste <strong>{{balanceDue}} XAF</strong> à percevoir.`,
      rows: [['Client', '{{clientName}}'], ['N° facture', '{{invoiceNumber}}'], ['Montant TTC total', '{{totalTtc}} XAF'], ['Montant reçu', '<strong>{{amountPaid}} XAF</strong>'], ['Solde restant', '<strong>{{balanceDue}} XAF</strong>']],
      cta: { label: 'Voir la facture', url: '{{invoiceLink}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{amountPaid}}', '{{balanceDue}}', '{{invoiceLink}}', '{{companyName}}'],
  },
  {
    type: 'proforma_accepted',
    name: 'Proforma acceptée [interne BTS]',
    subject: '[InvoiceHub] Proforma {{proformaNumber}} acceptée par {{clientName}}',
    bodyHtml: renderEmailShell({
      title: 'Proforma acceptée — {{proformaNumber}}',
      intro: `Bonjour <strong>{{userName}}</strong>, la proforma <strong>{{proformaNumber}}</strong> a été acceptée par le client <strong>{{clientName}}</strong>. Vous pouvez maintenant la convertir en facture.`,
      rows: [['Client', '{{clientName}}'], ['N° proforma', '{{proformaNumber}}'], ['Montant TTC', '<strong>{{totalTtc}} XAF</strong>']],
      cta: { label: 'Voir la proforma', url: '{{proformaLink}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{userName}}', '{{clientName}}', '{{proformaNumber}}', '{{totalTtc}}', '{{proformaLink}}', '{{companyName}}'],
  },
  {
    type: 'proforma_rejected',
    name: 'Proforma rejetée [interne BTS]',
    subject: '[InvoiceHub] Proforma {{proformaNumber}} refusée — {{clientName}}',
    bodyHtml: renderEmailShell({
      title: 'Proforma refusée — {{proformaNumber}}',
      intro: `Bonjour <strong>{{userName}}</strong>, le client <strong>{{clientName}}</strong> a refusé la proforma <strong>{{proformaNumber}}</strong>.`,
      rows: [['Client', '{{clientName}}'], ['N° proforma', '{{proformaNumber}}'], ['Montant TTC', '{{totalTtc}} XAF'], ['Motif', '<em>{{comment}}</em>']],
      cta: { label: 'Voir la proforma', url: '{{proformaLink}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{userName}}', '{{clientName}}', '{{proformaNumber}}', '{{totalTtc}}', '{{comment}}', '{{proformaLink}}', '{{companyName}}'],
  },
  {
    type: 'proforma_expired',
    name: 'Proforma expirée [interne BTS]',
    subject: '[InvoiceHub] Proforma {{proformaNumber}} expirée — {{clientName}}',
    bodyHtml: renderEmailShell({
      title: 'Proforma expirée — {{proformaNumber}}',
      intro: `Bonjour <strong>{{userName}}</strong>, la proforma <strong>{{proformaNumber}}</strong> envoyée au client <strong>{{clientName}}</strong> a expiré sans réponse le <strong>{{validUntil}}</strong>.`,
      rows: [['Client', '{{clientName}}'], ['N° proforma', '{{proformaNumber}}'], ['Montant TTC', '{{totalTtc}} XAF'], ['Expirée le', '{{validUntil}}']],
      cta: { label: 'Voir la proforma', url: '{{proformaLink}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{userName}}', '{{clientName}}', '{{proformaNumber}}', '{{totalTtc}}', '{{validUntil}}', '{{proformaLink}}', '{{companyName}}'],
  },
  {
    type: 'approval_requested',
    name: "Demande d'approbation [interne BTS]",
    subject: '[InvoiceHub] Action requise — Approbation : {{documentType}} {{documentNumber}}',
    bodyHtml: renderEmailShell({
      title: 'Approbation requise — {{documentType}} {{documentNumber}}',
      intro: `Bonjour <strong>{{approverName}}</strong>, <strong>{{requesterName}}</strong> vous demande d'approuver le document suivant.`,
      rows: [['Document', '{{documentType}} {{documentNumber}}'], ['Demandé par', '{{requesterName}}'], ['Montant', '<strong>{{amount}} XAF</strong>'], ['Étape', '{{stepName}} ({{currentStep}}/{{totalSteps}})']],
      cta: { label: 'Voir et approuver', url: '{{appUrl}}/approvals?highlight={{requestId}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{approverName}}', '{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{amount}}', '{{stepName}}', '{{currentStep}}', '{{totalSteps}}', '{{requestId}}', '{{appUrl}}', '{{companyName}}'],
  },
  {
    type: 'approval_approved',
    name: 'Approbation validée [interne BTS]',
    subject: '[InvoiceHub] Étape approuvée ({{currentStep}}/{{totalSteps}}) — {{documentType}} {{documentNumber}}',
    bodyHtml: renderEmailShell({
      title: 'Étape approuvée — {{documentType}} {{documentNumber}}',
      intro: `Bonjour <strong>{{requesterName}}</strong>, l'étape <strong>{{stepName}}</strong> de votre demande pour <strong>{{documentType}} {{documentNumber}}</strong> a été approuvée par <strong>{{deciderName}}</strong>.`,
      rows: [['Document', '{{documentType}} {{documentNumber}}'], ['Étape approuvée', '{{stepName}}'], ['Approuvé par', '{{deciderName}}'], ['Progression', '{{currentStep}} / {{totalSteps}} étape(s)']],
      cta: { label: 'Suivre la demande', url: '{{appUrl}}/approvals?highlight={{requestId}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{stepName}}', '{{deciderName}}', '{{currentStep}}', '{{totalSteps}}', '{{requestId}}', '{{appUrl}}', '{{companyName}}'],
  },
  {
    type: 'approval_rejected',
    name: 'Approbation rejetée [interne BTS]',
    subject: '[InvoiceHub] Demande rejetée — {{documentType}} {{documentNumber}} par {{deciderName}}',
    bodyHtml: renderEmailShell({
      title: 'Demande rejetée — {{documentType}} {{documentNumber}}',
      intro: `Bonjour <strong>{{requesterName}}</strong>, votre demande d'approbation pour <strong>{{documentType}} {{documentNumber}}</strong> a été rejetée par <strong>{{deciderName}}</strong>. Le document a été remis en brouillon.`,
      rows: [['Document', '{{documentType}} {{documentNumber}}'], ['Rejeté par', '{{deciderName}}'], ['Motif', '<em>{{comment}}</em>']],
      cta: { label: 'Corriger et soumettre à nouveau', url: '{{appUrl}}/{{documentUrl}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{deciderName}}', '{{comment}}', '{{documentUrl}}', '{{appUrl}}', '{{companyName}}'],
  },
  {
    type: 'approval_expired',
    name: "Demande d'approbation expirée [interne BTS]",
    subject: '[InvoiceHub] Demande expirée — {{documentType}} {{documentNumber}}',
    bodyHtml: renderEmailShell({
      title: 'Demande expirée — {{documentType}} {{documentNumber}}',
      intro: `Bonjour <strong>{{requesterName}}</strong>, la demande d'approbation pour <strong>{{documentType}} {{documentNumber}}</strong> a expiré sans réponse de l'approbateur désigné. Veuillez la soumettre à nouveau ou contacter votre responsable.`,
      rows: [['Document', '{{documentType}} {{documentNumber}}'], ['Demandé par', '{{requesterName}}']],
      cta: { label: 'Soumettre une nouvelle demande', url: '{{appUrl}}/approvals' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{appUrl}}', '{{companyName}}'],
  },
  {
    type: 'approval_delegated',
    name: 'Approbation déléguée [interne BTS]',
    subject: '[InvoiceHub] Délégation — {{documentType}} {{documentNumber}} transmis à {{delegateName}}',
    bodyHtml: renderEmailShell({
      title: 'Demande déléguée — {{documentType}} {{documentNumber}}',
      intro: `Bonjour <strong>{{requesterName}}</strong>, l'étape <strong>{{stepName}}</strong> de votre demande pour <strong>{{documentType}} {{documentNumber}}</strong> a été déléguée par <strong>{{deciderName}}</strong> à <strong>{{delegateName}}</strong>.`,
      rows: [['Document', '{{documentType}} {{documentNumber}}'], ['Étape', '{{stepName}}'], ['Délégué par', '{{deciderName}}'], ['Délégué à', '{{delegateName}}']],
      cta: { label: 'Suivre la demande', url: '{{appUrl}}/approvals?highlight={{requestId}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{stepName}}', '{{deciderName}}', '{{delegateName}}', '{{requestId}}', '{{appUrl}}', '{{companyName}}'],
  },
  {
    type: 'purchase_order_created',
    name: 'Bon de commande créé [interne BTS]',
    subject: '[InvoiceHub] Nouveau bon de commande — {{purchaseOrderNumber}}',
    bodyHtml: renderEmailShell({
      title: 'Nouveau bon de commande — {{purchaseOrderNumber}}',
      intro: `Bonjour <strong>{{userName}}</strong>, le bon de commande <strong>{{purchaseOrderNumber}}</strong> vient d'être créé.`,
      rows: [['N° bon de commande', '{{purchaseOrderNumber}}'], ['Montant TTC', '<strong>{{amountTtc}} XAF</strong>']],
      cta: { label: 'Voir le bon de commande', url: '{{appUrl}}{{documentLink}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{userName}}', '{{purchaseOrderNumber}}', '{{amountTtc}}', '{{documentLink}}', '{{appUrl}}', '{{companyName}}'],
  },
  {
    type: 'purchase_order_approved',
    name: 'Bon de commande envoyé au fournisseur [interne BTS]',
    subject: '[InvoiceHub] Bon de commande envoyé — {{purchaseOrderNumber}}',
    bodyHtml: renderEmailShell({
      title: 'Bon de commande envoyé — {{purchaseOrderNumber}}',
      intro: `Bonjour <strong>{{userName}}</strong>, le bon de commande <strong>{{purchaseOrderNumber}}</strong> a été approuvé et envoyé au fournisseur.`,
      rows: [['N° bon de commande', '{{purchaseOrderNumber}}'], ['Montant TTC', '<strong>{{amountTtc}} XAF</strong>']],
      cta: { label: 'Voir le bon de commande', url: '{{appUrl}}{{documentLink}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{userName}}', '{{purchaseOrderNumber}}', '{{amountTtc}}', '{{documentLink}}', '{{appUrl}}', '{{companyName}}'],
  },
  {
    type: 'supplier_invoice_received',
    name: 'Facture fournisseur reçue [interne BTS]',
    subject: '[InvoiceHub] Facture fournisseur reçue — {{supplierInvoiceNumber}}',
    bodyHtml: renderEmailShell({
      title: 'Facture fournisseur reçue — {{supplierInvoiceNumber}}',
      intro: `Bonjour <strong>{{userName}}</strong>, la facture fournisseur <strong>{{supplierInvoiceNumber}}</strong> a été enregistrée dans le système.`,
      rows: [['N° facture fournisseur', '{{supplierInvoiceNumber}}'], ['Montant TTC', '<strong>{{amountTtc}} XAF</strong>']],
      cta: { label: 'Voir la facture fournisseur', url: '{{appUrl}}{{documentLink}}' },
      note: INTERNAL_NOTE,
    }),
    variables: ['{{userName}}', '{{supplierInvoiceNumber}}', '{{amountTtc}}', '{{documentLink}}', '{{appUrl}}', '{{companyName}}'],
  },
  {
    type: 'budget_exceeded',
    name: 'Alerte budget [interne BTS]',
    subject: '[InvoiceHub] Alerte budget — {{categoryName}} ({{percentUsed}} %)',
    bodyHtml: renderEmailShell({
      title: 'Alerte budget — {{categoryName}}',
      intro: `Bonjour <strong>{{userName}}</strong>, le budget de la catégorie <strong>{{categoryName}}</strong> ({{periodLabel}}) a atteint <strong>{{percentUsed}} %</strong> d'utilisation (seuil d'alerte : {{threshold}} %).`,
      rows: [['Catégorie', '{{categoryName}}'], ['Période', '{{periodLabel}}'], ['Utilisation', '<strong>{{percentUsed}} %</strong>'], ['Seuil d\'alerte', '{{threshold}} %']],
      note: INTERNAL_NOTE,
    }),
    variables: ['{{userName}}', '{{categoryName}}', '{{periodLabel}}', '{{percentUsed}}', '{{threshold}}', '{{companyName}}'],
  },
  {
    type: 'accounting_entry_failed',
    name: 'Écriture comptable non générée [interne BTS]',
    subject: '[InvoiceHub] Écriture comptable non générée — {{operation}}',
    bodyHtml: renderEmailShell({
      title: 'Écriture comptable non générée',
      intro: `Bonjour <strong>{{userName}}</strong>, l'écriture comptable pour l'opération <strong>{{operation}}</strong> n'a pas pu être générée automatiquement. L'opération a bien été enregistrée, mais l'écriture doit être saisie ou régénérée manuellement.`,
      rows: [['Opération', '{{operation}}'], ['Type de source', '{{sourceType}}'], ['Référence', '{{sourceId}}'], ['Erreur', '<em>{{error}}</em>']],
      note: INTERNAL_NOTE,
    }),
    variables: ['{{userName}}', '{{operation}}', '{{sourceType}}', '{{sourceId}}', '{{error}}', '{{companyName}}'],
  },
];
