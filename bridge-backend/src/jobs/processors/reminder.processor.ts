/**
 * @module jobs/processors/reminder
 * Cron quotidien 09:00 WAT (08:00 UTC) — système de vérification active interne.
 *
 * 4 modules (aucune notification envoyée aux clients) :
 *  1. Factures OVERDUE   → escalade progressive (logique existante, inchangée)
 *  2. Factures ISSUED    → confirmation de paiement     J+3 / J+7 / J+15
 *  3. Proformas SENT     → confirmation statut client   J+3 / J+7 / J+15
 *  4. Brouillons         → escalade J+1 / J+3 / J+7 (factures et proformas)
 *
 * Suivi des niveaux :
 *  - Invoice issued   → reminderEscalationLevel (0 → 3)
 *  - Proforma sent    → reminderCount (0 → 3, réutilisé comme level)
 *  - Brouillons       → draftReminderLevel (0 → 3), reset à 0 au quick-confirm
 *
 * Champs data dans les notifications (utilisés par le frontend pour les boutons) :
 *  action: 'confirm_payment' | 'confirm_proforma_status'
 *        | 'confirm_invoice_draft_sent' | 'confirm_proforma_draft_sent'
 */
import { Job } from 'bullmq';
import { prisma } from '../../config/database';
import { notificationQueue, emailQueue } from '../queues';
import { logger } from '../../core/middleware/requestLogger';
import type { ReminderJobData } from '../queues';

// ── Types ──────────────────────────────────────────────────────────────────────

interface EscalationLevel {
  daysOverdue:    number;
  label:          'Douce' | 'Ferme' | 'Urgente' | 'Critique' | string;
  notifyCreator:  boolean;
  notifyManagers: boolean;
  sendEmail:      boolean;
}

interface EscalationConfig {
  levels: EscalationLevel[];
}

interface CheckLevel {
  daysSince:      number;
  level:          number;
  notifyManagers: boolean;
  sendEmail:      boolean;
}

type Manager = { id: string; email: string; firstName: string };

// ── Configuration ──────────────────────────────────────────────────────────────

const DEFAULT_ESCALATION: EscalationConfig = {
  levels: [
    { daysOverdue: 0,  label: 'Douce',    notifyCreator: true, notifyManagers: false, sendEmail: false },
    { daysOverdue: 7,  label: 'Ferme',    notifyCreator: true, notifyManagers: false, sendEmail: true  },
    { daysOverdue: 15, label: 'Urgente',  notifyCreator: true, notifyManagers: true,  sendEmail: true  },
    { daysOverdue: 30, label: 'Critique', notifyCreator: true, notifyManagers: true,  sendEmail: true  },
  ],
};

// Niveaux de vérification active — défauts (écrasés par company_settings au runtime)
const DEFAULT_CHECK_LEVELS: CheckLevel[] = [
  { daysSince: 3,  level: 1, notifyManagers: false, sendEmail: false },
  { daysSince: 7,  level: 2, notifyManagers: false, sendEmail: true  },
  { daysSince: 15, level: 3, notifyManagers: true,  sendEmail: true  },
];

// Niveaux d'escalade brouillon — défauts (Cas B — J+1 / J+3 / J+7)
const DEFAULT_DRAFT_CHECK_LEVELS: CheckLevel[] = [
  { daysSince: 1, level: 1, notifyManagers: false, sendEmail: false },
  { daysSince: 3, level: 2, notifyManagers: false, sendEmail: false },
  { daysSince: 7, level: 3, notifyManagers: true,  sendEmail: true  },
];

// ── Utilitaires ────────────────────────────────────────────────────────────────

function levelEmoji(label: string): string {
  switch (label) {
    case 'Douce':    return 'ℹ️';
    case 'Ferme':    return '⚠️';
    case 'Urgente':  return '🚨';
    case 'Critique': return '🔴';
    default:         return '📌';
  }
}

function daysSince(date: Date | string, today: Date): number {
  return Math.floor((today.getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

function daysLabel(n: number): string {
  return `${n} jour${n > 1 ? 's' : ''}`;
}

function formatAmount(n: number | bigint | { toString(): string }): string {
  return Number(n).toLocaleString('fr-FR');
}

/** Retourne le niveau CHECK le plus élevé applicable pour un nombre de jours donné. */
function targetCheckLevel(days: number, levels: CheckLevel[]): CheckLevel | null {
  let target: CheckLevel | null = null;
  for (const lvl of levels) {
    if (days >= lvl.daysSince) target = lvl;
  }
  return target;
}

// ── Builders de messages ───────────────────────────────────────────────────────

function buildOverdueNotifMessage(
  label: string, number: string, clientName: string, daysOverdue: number, amount: string,
): string {
  const d = daysOverdue === 0 ? "aujourd'hui" : `depuis ${daysLabel(daysOverdue)}`;
  switch (label) {
    case 'Douce':    return `La facture ${number} (${clientName}) est arrivée à échéance ${d}. Solde dû : ${amount} XAF. Pensez à contacter le client.`;
    case 'Ferme':    return `La facture ${number} (${clientName}) est en retard ${d}. Solde dû : ${amount} XAF. Une relance client est nécessaire.`;
    case 'Urgente':  return `La facture ${number} (${clientName}) est impayée ${d}. Solde dû : ${amount} XAF. Escalade recommandée — contactez votre responsable.`;
    case 'Critique': return `La facture ${number} (${clientName}) est impayée ${d}. Solde dû : ${amount} XAF. Intervention du management requise immédiatement.`;
    default:         return `La facture ${number} (${clientName}) est en retard ${d}. Solde dû : ${amount} XAF.`;
  }
}

function buildOverdueEmailHtml(
  label: string, number: string, clientName: string,
  daysOverdue: number, amount: string, recipientFirstName: string,
): string {
  const emoji = levelEmoji(label);
  const d     = daysOverdue === 0 ? "aujourd'hui" : `depuis ${daysLabel(daysOverdue)}`;
  const color = label === 'Critique' ? '#dc2626' : label === 'Urgente' ? '#ea580c' : label === 'Ferme' ? '#d97706' : '#2563eb';
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${color};padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;">${emoji} Relance ${label} — ${number}</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <p>Bonjour ${recipientFirstName},</p>
        <p>La facture <strong>${number}</strong> du client <strong>${clientName}</strong>
           est en retard de paiement <strong>${d}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr style="background:#f9fafb;"><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Client</td><td style="padding:10px 16px;border:1px solid #e5e7eb;">${clientName}</td></tr>
          <tr><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Facture</td><td style="padding:10px 16px;border:1px solid #e5e7eb;">${number}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Retard</td><td style="padding:10px 16px;border:1px solid #e5e7eb;">${d}</td></tr>
          <tr><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Solde dû</td><td style="padding:10px 16px;border:1px solid #e5e7eb;color:${color};font-weight:bold;">${amount} XAF</td></tr>
        </table>
        <p style="color:#6b7280;font-size:13px;">Ceci est une alerte interne — InvoiceHub BTS. Aucun email n'a été envoyé au client.</p>
      </div>
    </div>`;
}

function buildCheckEmailHtml(
  docType: 'invoice' | 'proforma',
  checkType: 'payment' | 'status' | 'draft',
  number: string, clientName: string,
  days: number, amount: string, recipientFirstName: string,
): string {
  const docLabel = docType === 'invoice' ? 'facture' : 'proforma';
  const checkMsg =
    checkType === 'payment'
      ? 'Avez-vous reçu ce paiement ? Si oui, mettez à jour le statut dans InvoiceHub.'
      : checkType === 'status'
        ? 'Le client a-t-il répondu (accepté ou refusé) ? Si oui, mettez à jour le statut dans InvoiceHub.'
        : `Cette ${docLabel} est encore en brouillon. A-t-elle été envoyée au client ? Si oui, mettez à jour son statut.`;

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#2563eb;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;">💬 Confirmation requise — ${number}</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <p>Bonjour ${recipientFirstName},</p>
        <p>La <strong>${docLabel} ${number}</strong> du client <strong>${clientName}</strong>
           est en attente de confirmation depuis <strong>${daysLabel(days)}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr style="background:#f9fafb;"><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Document</td><td style="padding:10px 16px;border:1px solid #e5e7eb;">${number}</td></tr>
          <tr><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Client</td><td style="padding:10px 16px;border:1px solid #e5e7eb;">${clientName}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Montant</td><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">${amount} XAF</td></tr>
          <tr><td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">En attente depuis</td><td style="padding:10px 16px;border:1px solid #e5e7eb;">${daysLabel(days)}</td></tr>
        </table>
        <p>${checkMsg}</p>
        <p style="color:#6b7280;font-size:13px;">Ceci est une alerte interne — InvoiceHub BTS. Aucun email n'a été envoyé au client.</p>
      </div>
    </div>`;
}

// ── Helper : construction de la liste des destinataires ───────────────────────

function buildRecipients(
  creator:     { id: string; email: string; firstName: string },
  assignee:    { id: string; email: string; firstName: string } | null,
  creatorId:   string,
  assigneeId:  string | null,
  managers:    Manager[],
  includeManagers: boolean,
): Map<string, { email: string; firstName: string }> {
  const map = new Map<string, { email: string; firstName: string }>();
  map.set(creator.id, creator);
  if (assignee && assigneeId !== creatorId) map.set(assignee.id, assignee);
  if (includeManagers) {
    for (const mgr of managers) map.set(mgr.id, mgr);
  }
  return map;
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 1 — Escalade factures OVERDUE (logique existante, inchangée)
// ══════════════════════════════════════════════════════════════════════════════

async function processOverdueEscalation(
  config: EscalationConfig,
  managers: Manager[],
  today: Date,
): Promise<void> {
  const levels = [...config.levels].sort((a, b) => a.daysOverdue - b.daysOverdue);
  if (levels.length === 0) return;

  const maxLevelIndex = levels.length;

  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      status: 'overdue',
      reminderEscalationLevel: { lt: maxLevelIndex },
    },
    select: {
      id: true, number: true, dueDate: true, balanceDue: true,
      reminderCount: true, reminderEscalationLevel: true,
      createdById: true, assignedToId: true,
      client:     { select: { name: true } },
      createdBy:  { select: { id: true, email: true, firstName: true } },
      assignedTo: { select: { id: true, email: true, firstName: true } },
    },
  });

  for (const inv of overdueInvoices) {
    const daysOverdue = Math.floor(
      (today.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24),
    );

    let targetLevelIndex = 0;
    for (let i = 0; i < levels.length; i++) {
      if (daysOverdue >= levels[i].daysOverdue) targetLevelIndex = i + 1;
    }
    if (targetLevelIndex === 0 || targetLevelIndex <= inv.reminderEscalationLevel) continue;

    const levelCfg = levels[targetLevelIndex - 1];
    const amount   = formatAmount(inv.balanceDue);
    const title    = `${levelEmoji(levelCfg.label)} Relance ${levelCfg.label} — ${inv.number}`;
    const message  = buildOverdueNotifMessage(levelCfg.label, inv.number, inv.client.name, daysOverdue, amount);

    const recipients = buildRecipients(
      inv.createdBy, inv.assignedTo, inv.createdById, inv.assignedToId,
      managers, levelCfg.notifyManagers,
    );

    for (const [userId] of recipients) {
      await notificationQueue.add('notification', {
        userId, type: 'reminder_sent', title, message,
        data: {
          invoiceId: inv.id, invoiceNumber: inv.number, clientName: inv.client.name,
          daysOverdue, escalationLevel: targetLevelIndex, escalationLabel: levelCfg.label,
          balanceDue: Number(inv.balanceDue),
        },
      });
    }

    if (levelCfg.sendEmail) {
      for (const [, recipient] of recipients) {
        await emailQueue.add('email', {
          to: recipient.email,
          subject: `[InvoiceHub BTS] ${title}`,
          html: buildOverdueEmailHtml(levelCfg.label, inv.number, inv.client.name, daysOverdue, amount, recipient.firstName),
        });
      }
    }

    await prisma.invoice.update({
      where: { id: inv.id },
      data: {
        reminderEscalationLevel: targetLevelIndex,
        lastReminderAt:          new Date(),
        reminderCount:           inv.reminderCount + 1,
      },
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 2 — Factures ISSUED : confirmation de paiement (J+3 / J+7 / J+15)
// ══════════════════════════════════════════════════════════════════════════════

async function processIssuedConfirmation(managers: Manager[], checkLevels: CheckLevel[], today: Date): Promise<void> {
  if (checkLevels.length === 0) return;
  const minDays    = checkLevels[0].daysSince;
  const minDaysAgo = new Date(today.getTime() - minDays * 24 * 60 * 60 * 1000);

  const issuedInvoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      status: 'issued',
      reminderEscalationLevel: { lt: checkLevels.length },
      issueDate: { lte: minDaysAgo },
    },
    select: {
      id: true, number: true, issueDate: true, balanceDue: true,
      reminderCount: true, reminderEscalationLevel: true,
      createdById: true, assignedToId: true,
      client:     { select: { name: true } },
      createdBy:  { select: { id: true, email: true, firstName: true } },
      assignedTo: { select: { id: true, email: true, firstName: true } },
    },
  });

  for (const inv of issuedInvoices) {
    const days = daysSince(inv.issueDate, today);
    const lvl  = targetCheckLevel(days, checkLevels);
    if (!lvl || lvl.level <= inv.reminderEscalationLevel) continue;

    const amount = formatAmount(inv.balanceDue);
    const title  = `💬 Paiement reçu ? — ${inv.number}`;
    const msg    = `La facture ${inv.number} (${inv.client.name}) a été émise il y a ${daysLabel(days)} — ${amount} XAF. Avez-vous reçu ce paiement ?`;

    const recipients = buildRecipients(
      inv.createdBy, inv.assignedTo, inv.createdById, inv.assignedToId,
      managers, lvl.notifyManagers,
    );

    for (const [userId] of recipients) {
      await notificationQueue.add('notification', {
        userId, type: 'reminder_sent', title, message: msg,
        data: {
          action:         'confirm_payment',
          invoiceId:      inv.id,
          documentNumber: inv.number,
          clientName:     inv.client.name,
          amount:         Number(inv.balanceDue),
          daysSince:      days,
          checkLevel:     lvl.level,
        },
      });
    }

    if (lvl.sendEmail) {
      for (const [, recipient] of recipients) {
        await emailQueue.add('email', {
          to:      recipient.email,
          subject: `[InvoiceHub BTS] Paiement à confirmer — ${inv.number}`,
          html:    buildCheckEmailHtml('invoice', 'payment', inv.number, inv.client.name, days, amount, recipient.firstName),
        });
      }
    }

    await prisma.invoice.update({
      where: { id: inv.id },
      data: { reminderEscalationLevel: lvl.level, lastReminderAt: new Date(), reminderCount: inv.reminderCount + 1 },
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 3 — Proformas SENT : confirmation statut client (J+3 / J+7 / J+15)
// ══════════════════════════════════════════════════════════════════════════════

async function processSentProformaCheck(managers: Manager[], checkLevels: CheckLevel[], today: Date): Promise<void> {
  if (checkLevels.length === 0) return;
  const minDays    = checkLevels[0].daysSince;
  const minDaysAgo = new Date(today.getTime() - minDays * 24 * 60 * 60 * 1000);

  // reminderCount est réutilisé comme tracker de niveau (0 → N)
  const sentProformas = await prisma.proforma.findMany({
    where: {
      deletedAt: null,
      status: 'sent',
      reminderCount: { lt: checkLevels.length },
      issueDate: { lte: minDaysAgo },
    },
    select: {
      id: true, number: true, issueDate: true, totalTtc: true,
      reminderCount: true,
      createdById: true, assignedToId: true,
      client:     { select: { name: true } },
      createdBy:  { select: { id: true, email: true, firstName: true } },
      assignedTo: { select: { id: true, email: true, firstName: true } },
    },
  });

  for (const pfm of sentProformas) {
    const days = daysSince(pfm.issueDate, today);
    const lvl  = targetCheckLevel(days, checkLevels);
    if (!lvl || lvl.level <= pfm.reminderCount) continue;

    const amount = formatAmount(pfm.totalTtc);
    const title  = `💬 Réponse reçue ? — ${pfm.number}`;
    const msg    = `La proforma ${pfm.number} (${pfm.client.name}) a été envoyée il y a ${daysLabel(days)} — ${amount} XAF. Le client a-t-il répondu ?`;

    const recipients = buildRecipients(
      pfm.createdBy, pfm.assignedTo, pfm.createdById, pfm.assignedToId,
      managers, lvl.notifyManagers,
    );

    for (const [userId] of recipients) {
      await notificationQueue.add('notification', {
        userId, type: 'reminder_sent', title, message: msg,
        data: {
          action:         'confirm_proforma_status',
          proformaId:     pfm.id,
          documentNumber: pfm.number,
          clientName:     pfm.client.name,
          amount:         Number(pfm.totalTtc),
          daysSince:      days,
          checkLevel:     lvl.level,
        },
      });
    }

    if (lvl.sendEmail) {
      for (const [, recipient] of recipients) {
        await emailQueue.add('email', {
          to:      recipient.email,
          subject: `[InvoiceHub BTS] Réponse client à confirmer — ${pfm.number}`,
          html:    buildCheckEmailHtml('proforma', 'status', pfm.number, pfm.client.name, days, amount, recipient.firstName),
        });
      }
    }

    await prisma.proforma.update({
      where: { id: pfm.id },
      data: { reminderCount: lvl.level, lastReminderAt: new Date() },
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 4 — Brouillons : escalade J+1 / J+3 / J+7 (Cas B)
// ══════════════════════════════════════════════════════════════════════════════

async function processDraftCheck(managers: Manager[], draftCheckLevels: CheckLevel[], today: Date): Promise<void> {
  if (draftCheckLevels.length === 0) return;
  const minDays    = draftCheckLevels[0].daysSince;
  const minDaysAgo = new Date(today.getTime() - minDays * 24 * 60 * 60 * 1000);

  // ── Factures en brouillon ──────────────────────────────────────────────────
  const draftInvoices = await prisma.invoice.findMany({
    where: {
      deletedAt:          null,
      status:             'draft',
      draftReminderLevel: { lt: draftCheckLevels.length },
      createdAt:          { lte: minDaysAgo },
    },
    select: {
      id: true, number: true, createdAt: true, totalTtc: true,
      draftReminderLevel: true,
      createdById: true, assignedToId: true,
      client:     { select: { name: true } },
      createdBy:  { select: { id: true, email: true, firstName: true } },
      assignedTo: { select: { id: true, email: true, firstName: true } },
    },
  });

  for (const inv of draftInvoices) {
    const days = daysSince(inv.createdAt, today);
    const lvl  = targetCheckLevel(days, draftCheckLevels);
    if (!lvl || lvl.level <= inv.draftReminderLevel) continue;

    const amount = formatAmount(inv.totalTtc);
    const urgency = lvl.level === 3 ? '🚨' : lvl.level === 2 ? '⚠️' : '📋';
    const title  = `${urgency} Brouillon non envoyé — ${inv.number}`;
    const msg    = `La facture ${inv.number} (${inv.client.name}) est en brouillon depuis ${daysLabel(days)} — ${amount} XAF. A-t-elle été envoyée au client ?`;

    const recipients = buildRecipients(
      inv.createdBy, inv.assignedTo, inv.createdById, inv.assignedToId,
      managers, lvl.notifyManagers,
    );

    for (const [userId] of recipients) {
      await notificationQueue.add('notification', {
        userId, type: 'system', title, message: msg,
        data: {
          action:             'confirm_invoice_draft_sent',
          invoiceId:          inv.id,
          documentNumber:     inv.number,
          clientName:         inv.client.name,
          amount:             Number(inv.totalTtc),
          daysSince:          days,
          draftReminderLevel: lvl.level,
        },
      });
    }

    if (lvl.sendEmail) {
      for (const [, recipient] of recipients) {
        await emailQueue.add('email', {
          to:      recipient.email,
          subject: `[InvoiceHub BTS] Brouillon à envoyer — ${inv.number}`,
          html:    buildCheckEmailHtml('invoice', 'draft', inv.number, inv.client.name, days, amount, recipient.firstName),
        });
      }
    }

    await prisma.invoice.update({
      where: { id: inv.id },
      data:  { draftReminderLevel: lvl.level, lastReminderAt: new Date() },
    });
  }

  // ── Proformas en brouillon ─────────────────────────────────────────────────
  const draftProformas = await prisma.proforma.findMany({
    where: {
      deletedAt:          null,
      status:             'draft',
      draftReminderLevel: { lt: draftCheckLevels.length },
      createdAt:          { lte: minDaysAgo },
    },
    select: {
      id: true, number: true, createdAt: true, totalTtc: true,
      draftReminderLevel: true,
      createdById: true, assignedToId: true,
      client:     { select: { name: true } },
      createdBy:  { select: { id: true, email: true, firstName: true } },
      assignedTo: { select: { id: true, email: true, firstName: true } },
    },
  });

  for (const pfm of draftProformas) {
    const days = daysSince(pfm.createdAt, today);
    const lvl  = targetCheckLevel(days, draftCheckLevels);
    if (!lvl || lvl.level <= pfm.draftReminderLevel) continue;

    const amount  = formatAmount(pfm.totalTtc);
    const urgency = lvl.level === 3 ? '🚨' : lvl.level === 2 ? '⚠️' : '📋';
    const title   = `${urgency} Brouillon non envoyé — ${pfm.number}`;
    const msg     = `La proforma ${pfm.number} (${pfm.client.name}) est en brouillon depuis ${daysLabel(days)} — ${amount} XAF. A-t-elle été envoyée au client ?`;

    const recipients = buildRecipients(
      pfm.createdBy, pfm.assignedTo, pfm.createdById, pfm.assignedToId,
      managers, lvl.notifyManagers,
    );

    for (const [userId] of recipients) {
      await notificationQueue.add('notification', {
        userId, type: 'system', title, message: msg,
        data: {
          action:             'confirm_proforma_draft_sent',
          proformaId:         pfm.id,
          documentNumber:     pfm.number,
          clientName:         pfm.client.name,
          amount:             Number(pfm.totalTtc),
          daysSince:          days,
          draftReminderLevel: lvl.level,
        },
      });
    }

    if (lvl.sendEmail) {
      for (const [, recipient] of recipients) {
        await emailQueue.add('email', {
          to:      recipient.email,
          subject: `[InvoiceHub BTS] Brouillon à envoyer — ${pfm.number}`,
          html:    buildCheckEmailHtml('proforma', 'draft', pfm.number, pfm.client.name, days, amount, recipient.firstName),
        });
      }
    }

    await prisma.proforma.update({
      where: { id: pfm.id },
      data:  { draftReminderLevel: lvl.level, lastReminderAt: new Date() },
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PROCESSOR PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

export async function processReminderJob(_job: Job<ReminderJobData>): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Charger toute la config depuis company_settings
  const settings  = await prisma.companySettings.findFirst({ select: { reminderEscalation: true } });
  const raw = settings?.reminderEscalation as Record<string, unknown> | null | undefined;

  const config: EscalationConfig =
    raw && 'levels' in raw
      ? (raw as unknown as EscalationConfig)
      : DEFAULT_ESCALATION;

  // checkLevels / draftCheckLevels — issus des settings ou valeurs par défaut
  function normaliseCheckLevels(arr: unknown[] | undefined, defaults: CheckLevel[]): CheckLevel[] {
    if (!Array.isArray(arr) || arr.length === 0) return defaults;
    return arr
      .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
      .sort((a, b) => (a.daysSince as number) - (b.daysSince as number))
      .map((e, i) => ({
        daysSince:      Number(e.daysSince),
        level:          i + 1,
        notifyManagers: Boolean(e.notifyManagers),
        sendEmail:      Boolean(e.sendEmail),
      }));
  }

  const checkLevels      = normaliseCheckLevels(raw?.checkLevels as unknown[] | undefined,      DEFAULT_CHECK_LEVELS);
  const draftCheckLevels = normaliseCheckLevels(raw?.draftCheckLevels as unknown[] | undefined, DEFAULT_DRAFT_CHECK_LEVELS);

  // Charger les managers une seule fois (partagés par tous les modules)
  const managers = await prisma.user.findMany({
    where: { role: 'admin', status: 'active', deletedAt: null },
    select: { id: true, email: true, firstName: true },
  });

  // Avertissement si aucun manager disponible — les escalades Urgente/Critique
  // n'atteindront que le créateur/assigné sans notifier le management
  const needsManagers =
    config.levels.some(l => l.notifyManagers) ||
    checkLevels.some(l => l.notifyManagers)   ||
    draftCheckLevels.some(l => l.notifyManagers);

  if (managers.length === 0 && needsManagers) {
    logger.warn(
      '[Reminder] Aucun administrateur actif trouvé — les escalades de niveau Urgente/Critique ' +
      'ne seront notifiées qu\'au créateur/assigné. Vérifiez qu\'au moins un utilisateur avec ' +
      'le rôle "admin" est actif dans le système.',
    );
  }

  // Exécuter les 4 modules en séquence
  await processOverdueEscalation(config, managers, today);
  await processIssuedConfirmation(managers, checkLevels, today);
  await processSentProformaCheck(managers, checkLevels, today);
  await processDraftCheck(managers, draftCheckLevels, today);
}
