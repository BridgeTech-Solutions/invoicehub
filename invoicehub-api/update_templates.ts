/**
 * update_templates.ts — Met à jour les email templates dans la DB
 *
 * Usage :
 *   npx tsx update_templates.ts
 *
 * Ce script force la mise à jour (update) de TOUS les templates,
 * en écrasant les versions existantes avec les templates corrigés du seed.
 */

import { PrismaClient, NotificationStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Templates corrigés (version interne BTS) ─────────────────────────────────

const TEMPLATES: {
  type:      NotificationStatus;
  name:      string;
  subject:   string;
  bodyHtml:  string;
  variables: string[];
}[] = [
  // ── invoice_issued (référence, déjà correct — inclus pour cohérence) ────────
  {
    type:     'invoice_issued',
    name:     'Facture émise [interne BTS]',
    subject:  '[{{companyName}}] Facture émise — {{invoiceNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">📄</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Facture émise : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La facture <strong>{{invoiceNumber}}</strong> vient d'être émise pour le client <strong>{{clientName}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0f7ff;">
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #dbeafe;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td>
      </tr>
      <tr style="background:#f0f7ff;">
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;">Montant TTC</td>
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:700;font-size:16px;color:#2D7DD2;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Échéance</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#dc2626;font-weight:600;">{{dueDate}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la facture →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{invoiceNumber}}', '{{clientName}}', '{{totalTtc}}', '{{dueDate}}', '{{invoiceLink}}', '{{companyName}}'],
  },

  // ── invoice_overdue ──────────────────────────────────────────────────────────
  {
    type:     'invoice_overdue',
    name:     'Facture en retard [interne BTS]',
    subject:  '[{{companyName}}] ALERTE — Facture {{invoiceNumber}} en retard ({{daysOverdue}} j)',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#dc2626;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">⚠</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Facture en retard : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong> est en retard de paiement depuis <strong>{{daysOverdue}} jour(s)</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#fef2f2;">
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #fecaca;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td>
      </tr>
      <tr style="background:#fef2f2;">
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;">Montant TTC</td>
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:700;font-size:16px;color:#dc2626;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Retard</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#dc2626;font-weight:700;">{{daysOverdue}} jour(s)</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la facture →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{daysOverdue}}', '{{invoiceLink}}', '{{companyName}}'],
  },

  // ── payment_registered ───────────────────────────────────────────────────────
  {
    type:     'payment_registered',
    name:     'Paiement enregistré [interne BTS]',
    subject:  '[{{companyName}}] Paiement reçu — {{invoiceNumber}} — {{amountPaid}} XAF',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">✓</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Paiement enregistré : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Un paiement de <strong>{{amountPaid}} XAF</strong> a été enregistré pour la facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td>
      </tr>
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;">Montant reçu</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:700;font-size:16px;color:#16a34a;">{{amountPaid}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Solde restant</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">{{balanceDue}} XAF</td>
      </tr>
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;">Date de paiement</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;color:#1f2937;">{{paymentDate}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la facture →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{amountPaid}}', '{{balanceDue}}', '{{paymentDate}}', '{{invoiceLink}}', '{{companyName}}'],
  },

  // ── proforma_sent ────────────────────────────────────────────────────────────
  {
    type:     'proforma_sent',
    name:     'Proforma envoyée [interne BTS]',
    subject:  '[{{companyName}}] Proforma envoyée — {{proformaNumber}} — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">📋</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Proforma envoyée : {{proformaNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La proforma <strong>{{proformaNumber}}</strong> a été envoyée au client <strong>{{clientName}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0f7ff;">
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #dbeafe;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Proforma</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{proformaNumber}}</td>
      </tr>
      <tr style="background:#f0f7ff;">
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;">Montant TTC</td>
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:700;font-size:16px;color:#2D7DD2;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Valide jusqu'au</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#374151;font-weight:600;">{{validUntil}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{proformaLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la proforma →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{proformaNumber}}', '{{totalTtc}}', '{{validUntil}}', '{{proformaLink}}', '{{companyName}}'],
  },

  // ── system ───────────────────────────────────────────────────────────────────
  {
    type:     'system',
    name:     'Réinitialisation de mot de passe',
    subject:  '[{{companyName}}] Réinitialisation de votre mot de passe',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">🔐</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Réinitialisation du mot de passe</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{firstName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Vous avez demandé la réinitialisation de votre mot de passe pour votre compte <strong>{{companyName}}</strong>. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="{{resetLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Réinitialiser mon mot de passe →
      </a>
    </div>
    <p style="margin:0 0 20px;padding:14px 16px;background:#f0f7ff;border-left:3px solid #2D7DD2;border-radius:4px;font-size:13px;color:#1e40af;">
      ⏱ Ce lien est valable <strong>1 heure</strong>. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
    </p>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{firstName}}', '{{resetLink}}', '{{companyName}}'],
  },

  // ── user_created ─────────────────────────────────────────────────────────────
  {
    type:     'user_created',
    name:     'Bienvenue (nouvel utilisateur)',
    subject:  '[{{companyName}}] Bienvenue {{firstName}} — Votre accès InvoiceHub',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">👋</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Bienvenue sur InvoiceHub !</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{firstName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Votre compte sur la plateforme <strong>InvoiceHub</strong> de <strong>{{companyName}}</strong> a été créé avec succès. Vous pouvez dès maintenant vous connecter avec vos identifiants.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0f7ff;">
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;width:40%;">Rôle</td>
        <td style="padding:11px 16px;border:1px solid #dbeafe;color:#1f2937;">{{roleName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Email</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{userEmail}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{loginLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Accéder à la plateforme →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{firstName}}', '{{userEmail}}', '{{roleName}}', '{{loginLink}}', '{{companyName}}'],
  },

  // ── reminder_sent ────────────────────────────────────────────────────────────
  {
    type:     'reminder_sent',
    name:     'Relance interne [interne BTS]',
    subject:  '[{{companyName}}] Relance niveau {{reminderLevel}} — {{invoiceNumber}} — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#d97706;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">🔔</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Relance niveau {{reminderLevel}} — {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong> reste impayée. Une action de votre part est recommandée.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#fffbeb;">
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #fde68a;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td>
      </tr>
      <tr style="background:#fffbeb;">
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;">Montant dû</td>
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:700;font-size:16px;color:#d97706;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Retard</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#dc2626;font-weight:700;">{{daysOverdue}} jour(s)</td>
      </tr>
      <tr style="background:#fffbeb;">
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;">Niveau de relance</td>
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:700;color:#d97706;">Niveau {{reminderLevel}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#d97706;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la facture →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement. Aucun email n'a été envoyé directement au client.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{daysOverdue}}', '{{reminderLevel}}', '{{invoiceLink}}', '{{companyName}}'],
  },

  // ── invoice_paid ─────────────────────────────────────────────────────────────
  {
    type:     'invoice_paid',
    name:     'Facture soldée [interne BTS]',
    subject:  '[{{companyName}}] Facture {{invoiceNumber}} intégralement soldée — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">✅</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Facture soldée : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong> est intégralement réglée.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td>
      </tr>
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;">Montant TTC</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:700;font-size:16px;color:#16a34a;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Date de solde</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#374151;">{{paymentDate}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la facture →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{paymentDate}}', '{{invoiceLink}}', '{{companyName}}'],
  },

  // ── invoice_partially_paid ───────────────────────────────────────────────────
  {
    type:     'invoice_partially_paid',
    name:     'Paiement partiel reçu [interne BTS]',
    subject:  '[{{companyName}}] Paiement partiel — {{invoiceNumber}} — Solde restant {{balanceDue}} XAF',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#2D7DD2;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">💳</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Paiement partiel : {{invoiceNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Un paiement partiel de <strong>{{amountPaid}} XAF</strong> a été enregistré pour la facture <strong>{{invoiceNumber}}</strong> du client <strong>{{clientName}}</strong>. Il reste <strong>{{balanceDue}} XAF</strong> à percevoir.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0f7ff;">
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #dbeafe;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Facture</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{invoiceNumber}}</td>
      </tr>
      <tr style="background:#f0f7ff;">
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#1e40af;">Montant TTC total</td>
        <td style="padding:11px 16px;border:1px solid #dbeafe;font-weight:600;color:#374151;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Montant reçu</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:700;font-size:15px;color:#16a34a;">{{amountPaid}} XAF</td>
      </tr>
      <tr style="background:#fef2f2;">
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;">Solde restant</td>
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:700;font-size:15px;color:#dc2626;">{{balanceDue}} XAF</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{invoiceLink}}" style="display:inline-block;background:#2D7DD2;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la facture →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{invoiceNumber}}', '{{totalTtc}}', '{{amountPaid}}', '{{balanceDue}}', '{{invoiceLink}}', '{{companyName}}'],
  },

  // ── proforma_accepted ────────────────────────────────────────────────────────
  {
    type:     'proforma_accepted',
    name:     'Proforma acceptée [interne BTS]',
    subject:  '[{{companyName}}] Proforma {{proformaNumber}} acceptée par {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">✅</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Proforma acceptée : {{proformaNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La proforma <strong>{{proformaNumber}}</strong> a été acceptée par le client <strong>{{clientName}}</strong>. Vous pouvez maintenant convertir ce devis en facture.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Proforma</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{proformaNumber}}</td>
      </tr>
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;">Montant TTC</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:700;font-size:16px;color:#16a34a;">{{totalTtc}} XAF</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{proformaLink}}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la proforma →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{proformaNumber}}', '{{totalTtc}}', '{{proformaLink}}', '{{companyName}}'],
  },

  // ── proforma_rejected ────────────────────────────────────────────────────────
  {
    type:     'proforma_rejected',
    name:     'Proforma rejetée [interne BTS]',
    subject:  '[{{companyName}}] Proforma {{proformaNumber}} refusée — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#dc2626;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">✗</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Proforma refusée : {{proformaNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Le client <strong>{{clientName}}</strong> a refusé la proforma <strong>{{proformaNumber}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#fef2f2;">
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #fecaca;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Proforma</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{proformaNumber}}</td>
      </tr>
      <tr style="background:#fef2f2;">
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;">Montant TTC</td>
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:700;color:#dc2626;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Motif</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#374151;font-style:italic;">{{comment}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{proformaLink}}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la proforma →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{proformaNumber}}', '{{totalTtc}}', '{{comment}}', '{{proformaLink}}', '{{companyName}}'],
  },

  // ── proforma_expired ─────────────────────────────────────────────────────────
  {
    type:     'proforma_expired',
    name:     'Proforma expirée [interne BTS]',
    subject:  '[{{companyName}}] Proforma {{proformaNumber}} expirée — {{clientName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#d97706;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">⌛</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Proforma expirée : {{proformaNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{userName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La proforma <strong>{{proformaNumber}}</strong> envoyée au client <strong>{{clientName}}</strong> a expiré sans réponse le <strong>{{validUntil}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#fffbeb;">
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;width:40%;">Client</td>
        <td style="padding:11px 16px;border:1px solid #fde68a;color:#1f2937;">{{clientName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">N° Proforma</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-family:monospace;font-size:14px;">{{proformaNumber}}</td>
      </tr>
      <tr style="background:#fffbeb;">
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:600;color:#92400e;">Montant TTC</td>
        <td style="padding:11px 16px;border:1px solid #fde68a;font-weight:700;color:#d97706;">{{totalTtc}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Expirée le</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#dc2626;font-weight:600;">{{validUntil}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{proformaLink}}" style="display:inline-block;background:#d97706;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir la proforma →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{userName}}', '{{clientName}}', '{{proformaNumber}}', '{{totalTtc}}', '{{validUntil}}', '{{proformaLink}}', '{{companyName}}'],
  },

  // ── approval_requested ───────────────────────────────────────────────────────
  {
    type:     'approval_requested',
    name:     "Demande d'approbation [interne BTS]",
    subject:  '[{{companyName}}] ACTION REQUISE — Approbation demandée : {{documentType}} {{documentNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#7c3aed;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">✋</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Approbation requise : {{documentType}} {{documentNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{approverName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;"><strong>{{requesterName}}</strong> vous demande d'approuver le document suivant.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#faf5ff;">
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-weight:600;color:#6b21a8;width:40%;">Document</td>
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-family:monospace;color:#1f2937;">{{documentType}} {{documentNumber}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Demandé par</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#1f2937;">{{requesterName}}</td>
      </tr>
      <tr style="background:#faf5ff;">
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-weight:600;color:#6b21a8;">Montant</td>
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-weight:700;font-size:16px;color:#7c3aed;">{{amount}} XAF</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Étape</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#374151;">{{stepName}} ({{currentStep}}/{{totalSteps}})</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{appUrl}}/approvals?highlight={{requestId}}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Voir et approuver →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{approverName}}', '{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{amount}}', '{{stepName}}', '{{currentStep}}', '{{totalSteps}}', '{{requestId}}', '{{appUrl}}', '{{companyName}}'],
  },

  // ── approval_approved ────────────────────────────────────────────────────────
  {
    type:     'approval_approved',
    name:     'Approbation validée [interne BTS]',
    subject:  '[{{companyName}}] Étape approuvée ({{currentStep}}/{{totalSteps}}) — {{documentType}} {{documentNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#16a34a;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">✅</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Étape approuvée : {{documentType}} {{documentNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{requesterName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">L'étape <strong>{{stepName}}</strong> de votre demande pour <strong>{{documentType}} {{documentNumber}}</strong> a été approuvée par <strong>{{deciderName}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;width:40%;">Document</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-family:monospace;color:#1f2937;">{{documentType}} {{documentNumber}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Étape approuvée</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#1f2937;">{{stepName}}</td>
      </tr>
      <tr style="background:#f0fdf4;">
        <td style="padding:11px 16px;border:1px solid #bbf7d0;font-weight:600;color:#166534;">Approuvé par</td>
        <td style="padding:11px 16px;border:1px solid #bbf7d0;color:#1f2937;">{{deciderName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Progression</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:700;color:#16a34a;">{{currentStep}} / {{totalSteps}} étape(s)</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{appUrl}}/approvals?highlight={{requestId}}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Suivre la demande →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{stepName}}', '{{deciderName}}', '{{currentStep}}', '{{totalSteps}}', '{{requestId}}', '{{appUrl}}', '{{companyName}}'],
  },

  // ── approval_rejected ────────────────────────────────────────────────────────
  {
    type:     'approval_rejected',
    name:     'Approbation rejetée [interne BTS]',
    subject:  '[{{companyName}}] Demande rejetée — {{documentType}} {{documentNumber}} par {{deciderName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#dc2626;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">✗</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Demande rejetée : {{documentType}} {{documentNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{requesterName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">Votre demande d'approbation pour <strong>{{documentType}} {{documentNumber}}</strong> a été rejetée par <strong>{{deciderName}}</strong>. Le document a été remis en brouillon.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#fef2f2;">
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;width:40%;">Document</td>
        <td style="padding:11px 16px;border:1px solid #fecaca;font-family:monospace;color:#1f2937;">{{documentType}} {{documentNumber}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Rejeté par</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#1f2937;">{{deciderName}}</td>
      </tr>
      <tr style="background:#fef2f2;">
        <td style="padding:11px 16px;border:1px solid #fecaca;font-weight:600;color:#991b1b;">Motif</td>
        <td style="padding:11px 16px;border:1px solid #fecaca;color:#374151;font-style:italic;">{{comment}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{appUrl}}/{{documentUrl}}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Corriger et soumettre à nouveau →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{deciderName}}', '{{comment}}', '{{documentUrl}}', '{{appUrl}}', '{{companyName}}'],
  },

  // ── approval_expired ─────────────────────────────────────────────────────────
  {
    type:     'approval_expired',
    name:     "Demande d'approbation expirée [interne BTS]",
    subject:  '[{{companyName}}] Demande expirée — {{documentType}} {{documentNumber}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#7c3aed;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">⌛</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Demande expirée : {{documentType}} {{documentNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{requesterName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">La demande d'approbation pour <strong>{{documentType}} {{documentNumber}}</strong> a expiré sans réponse de l'approbateur désigné. Veuillez soumettre une nouvelle demande ou contacter votre responsable.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#faf5ff;">
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-weight:600;color:#6b21a8;width:40%;">Document</td>
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-family:monospace;color:#1f2937;">{{documentType}} {{documentNumber}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Demandé par</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#1f2937;">{{requesterName}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{appUrl}}/approvals" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Soumettre une nouvelle demande →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{appUrl}}', '{{companyName}}'],
  },

  // ── approval_delegated ───────────────────────────────────────────────────────
  {
    type:     'approval_delegated',
    name:     'Approbation déléguée [interne BTS]',
    subject:  '[{{companyName}}] Délégation — {{documentType}} {{documentNumber}} transmis à {{delegateName}}',
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#7c3aed;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
    <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;">↗</div>
    <h2 style="color:#fff;margin:0;font-size:18px;">Demande déléguée : {{documentType}} {{documentNumber}}</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;background:#fff;">
    <p style="margin:0 0 16px;">Bonjour <strong>{{requesterName}}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151;">L'étape <strong>{{stepName}}</strong> de votre demande pour <strong>{{documentType}} {{documentNumber}}</strong> a été déléguée par <strong>{{deciderName}}</strong> à <strong>{{delegateName}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;border-radius:6px;overflow:hidden;">
      <tr style="background:#faf5ff;">
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-weight:600;color:#6b21a8;width:40%;">Document</td>
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-family:monospace;color:#1f2937;">{{documentType}} {{documentNumber}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Étape</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;color:#1f2937;">{{stepName}}</td>
      </tr>
      <tr style="background:#faf5ff;">
        <td style="padding:11px 16px;border:1px solid #e9d5ff;font-weight:600;color:#6b21a8;">Délégué par</td>
        <td style="padding:11px 16px;border:1px solid #e9d5ff;color:#1f2937;">{{deciderName}}</td>
      </tr>
      <tr>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Délégué à</td>
        <td style="padding:11px 16px;border:1px solid #e5e7eb;font-weight:700;color:#7c3aed;">{{delegateName}}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{appUrl}}/approvals?highlight={{requestId}}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
        Suivre la demande →
      </a>
    </div>
    <p style="margin:20px 0 0;padding:14px 16px;background:#fef9c3;border-left:3px solid #d97706;border-radius:4px;font-size:12px;color:#92400e;">
      📌 Notification interne — ce message est destiné aux membres de <strong>{{companyName}}</strong> uniquement.
    </p>
  </div>
</div>`,
    variables: ['{{requesterName}}', '{{documentType}}', '{{documentNumber}}', '{{stepName}}', '{{deciderName}}', '{{delegateName}}', '{{requestId}}', '{{appUrl}}', '{{companyName}}'],
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔄 Mise à jour des email templates InvoiceHub v3 — BTS\n');

  let updated = 0;
  let created = 0;

  for (const tpl of TEMPLATES) {
    const existing = await prisma.emailTemplate.findUnique({
      where: { type_locale: { type: tpl.type, locale: 'fr' } },
    });

    if (existing) {
      await prisma.emailTemplate.update({
        where: { type_locale: { type: tpl.type, locale: 'fr' } },
        data: {
          name:      tpl.name,
          subject:   tpl.subject,
          bodyHtml:  tpl.bodyHtml,
          variables: tpl.variables,
          isActive:  true,
        },
      });
      console.log(`  ✓ [MàJ] ${tpl.type}`);
      updated++;
    } else {
      await prisma.emailTemplate.create({
        data: {
          type:      tpl.type,
          locale:    'fr',
          name:      tpl.name,
          subject:   tpl.subject,
          bodyHtml:  tpl.bodyHtml,
          variables: tpl.variables,
          isActive:  true,
        },
      });
      console.log(`  ✓ [Créé] ${tpl.type}`);
      created++;
    }
  }

  console.log(`\n✅ Terminé — ${updated} templates mis à jour, ${created} créés.\n`);
}

main()
  .catch((e) => { console.error('❌ Échec :', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
