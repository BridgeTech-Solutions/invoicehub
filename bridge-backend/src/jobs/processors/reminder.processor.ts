/**
 * @module jobs/processors/reminder
 * Cron quotidien : escalade progressive des alertes internes sur factures impayées.
 *
 * Logique d'escalade (Option B — alertes internes uniquement) :
 *  Les relances ne sont PAS envoyées aux clients — elles alertent les
 *  collaborateurs BTS (commercial créateur et/ou managers) pour qu'ils
 *  prennent contact manuellement.
 *
 * Niveaux d'escalade (configurables dans company_settings.reminderEscalation) :
 *  Niveau 1 — Douce    (J+0)  : notification in-app → créateur de la facture
 *  Niveau 2 — Ferme    (J+7)  : notification + email → créateur
 *  Niveau 3 — Urgente  (J+15) : notification + email → créateur + managers
 *  Niveau 4 — Critique (J+30) : notification + email → créateur + tous les admins
 *
 * Garanties :
 *  - Chaque niveau n'est déclenché qu'une seule fois par facture (via reminderEscalationLevel)
 *  - Robuste aux crons manqués : recalcul basé sur la date d'échéance réelle
 *  - Le niveau est réinitialisé si la facture repasse en statut payé (géré dans payments.service)
 */
import { Job } from 'bullmq';
import { prisma } from '../../config/database';
import { notificationQueue, emailQueue } from '../queues';
import type { ReminderJobData } from '../queues';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EscalationLevel {
  /** Nombre de jours de retard à partir duquel ce niveau se déclenche */
  daysOverdue: number;
  /** Libellé affiché dans les notifications */
  label: 'Douce' | 'Ferme' | 'Urgente' | 'Critique' | string;
  /** Notifier le créateur de la facture (et son assigné le cas échéant) */
  notifyCreator: boolean;
  /** Notifier les managers (rôle admin) */
  notifyManagers: boolean;
  /** Envoyer un email en plus de la notification in-app */
  sendEmail: boolean;
}

interface EscalationConfig {
  levels: EscalationLevel[];
}

// ── Configuration par défaut ──────────────────────────────────────────────────

const DEFAULT_ESCALATION: EscalationConfig = {
  levels: [
    {
      daysOverdue:    0,
      label:          'Douce',
      notifyCreator:  true,
      notifyManagers: false,
      sendEmail:      false,
    },
    {
      daysOverdue:    7,
      label:          'Ferme',
      notifyCreator:  true,
      notifyManagers: false,
      sendEmail:      true,
    },
    {
      daysOverdue:    15,
      label:          'Urgente',
      notifyCreator:  true,
      notifyManagers: true,
      sendEmail:      true,
    },
    {
      daysOverdue:    30,
      label:          'Critique',
      notifyCreator:  true,
      notifyManagers: true,
      sendEmail:      true,
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function levelEmoji(label: string): string {
  switch (label) {
    case 'Douce':    return 'ℹ️';
    case 'Ferme':    return '⚠️';
    case 'Urgente':  return '🚨';
    case 'Critique': return '🔴';
    default:         return '📌';
  }
}

function buildNotificationMessage(
  label:      string,
  number:     string,
  clientName: string,
  daysOverdue: number,
  amount:     string,
): string {
  const d = daysOverdue === 0
    ? "aujourd'hui"
    : `depuis ${daysOverdue} jour${daysOverdue > 1 ? 's' : ''}`;

  switch (label) {
    case 'Douce':
      return `La facture ${number} (${clientName}) est arrivée à échéance ${d}. Solde dû : ${amount} XAF. Pensez à contacter le client.`;
    case 'Ferme':
      return `La facture ${number} (${clientName}) est en retard ${d}. Solde dû : ${amount} XAF. Une relance client est nécessaire.`;
    case 'Urgente':
      return `La facture ${number} (${clientName}) est impayée ${d}. Solde dû : ${amount} XAF. Escalade recommandée — contactez votre responsable.`;
    case 'Critique':
      return `La facture ${number} (${clientName}) est impayée ${d}. Solde dû : ${amount} XAF. Intervention du management requise immédiatement.`;
    default:
      return `La facture ${number} (${clientName}) est en retard ${d}. Solde dû : ${amount} XAF.`;
  }
}

function buildEmailHtml(
  label:       string,
  number:      string,
  clientName:  string,
  daysOverdue: number,
  amount:      string,
  recipientFirstName: string,
): string {
  const emoji  = levelEmoji(label);
  const d      = daysOverdue === 0 ? "aujourd'hui" : `depuis ${daysOverdue} jour${daysOverdue > 1 ? 's' : ''}`;
  const color  = label === 'Critique' ? '#dc2626'
               : label === 'Urgente'  ? '#ea580c'
               : label === 'Ferme'    ? '#d97706'
               : '#2563eb';

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
          <tr style="background:#f9fafb;">
            <td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Client</td>
            <td style="padding:10px 16px;border:1px solid #e5e7eb;">${clientName}</td>
          </tr>
          <tr>
            <td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Facture</td>
            <td style="padding:10px 16px;border:1px solid #e5e7eb;">${number}</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Retard</td>
            <td style="padding:10px 16px;border:1px solid #e5e7eb;">${d}</td>
          </tr>
          <tr>
            <td style="padding:10px 16px;border:1px solid #e5e7eb;font-weight:bold;">Solde dû</td>
            <td style="padding:10px 16px;border:1px solid #e5e7eb;color:${color};font-weight:bold;">
              ${amount} XAF
            </td>
          </tr>
        </table>
        <p style="color:#6b7280;font-size:13px;">
          Ceci est une alerte interne — InvoiceHub BTS. Aucun email n'a été envoyé au client.
        </p>
      </div>
    </div>
  `;
}

// ── Processor principal ───────────────────────────────────────────────────────

export async function processReminderJob(_job: Job<ReminderJobData>): Promise<void> {
  // Charger la configuration d'escalade
  const settings = await prisma.companySettings.findFirst({
    select: { reminderEscalation: true },
  });

  const rawConfig = settings?.reminderEscalation;
  const config: EscalationConfig =
    rawConfig && typeof rawConfig === 'object' && 'levels' in rawConfig
      ? (rawConfig as unknown as EscalationConfig)
      : DEFAULT_ESCALATION;

  // Trier les niveaux par daysOverdue croissant (sécurité)
  const levels = [...config.levels].sort((a, b) => a.daysOverdue - b.daysOverdue);
  if (levels.length === 0) return;

  const maxLevelIndex = levels.length; // index max (1-based)

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Charger les factures overdue non encore au niveau maximum ───────────────
  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      status: 'overdue',
      reminderEscalationLevel: { lt: maxLevelIndex },
    },
    select: {
      id:                     true,
      number:                 true,
      dueDate:                true,
      balanceDue:             true,
      reminderCount:          true,
      reminderEscalationLevel: true,
      createdById:            true,
      assignedToId:           true,
      client:     { select: { name: true } },
      createdBy:  { select: { id: true, email: true, firstName: true } },
      assignedTo: { select: { id: true, email: true, firstName: true } },
    },
  });

  if (overdueInvoices.length === 0) return;

  // ── Charger les managers une seule fois ────────────────────────────────────
  const managers = await prisma.user.findMany({
    where: { role: 'admin', status: 'active', deletedAt: null },
    select: { id: true, email: true, firstName: true },
  });

  // ── Traiter chaque facture ─────────────────────────────────────────────────
  for (const inv of overdueInvoices) {
    const daysOverdue = Math.floor(
      (today.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Trouver le niveau cible (le plus élevé dont daysOverdue >= seuil)
    let targetLevelIndex = 0;
    for (let i = 0; i < levels.length; i++) {
      if (daysOverdue >= levels[i].daysOverdue) {
        targetLevelIndex = i + 1; // 1-based
      }
    }

    // Ignorer si aucun niveau applicable ou déjà traité à ce niveau
    if (targetLevelIndex === 0 || targetLevelIndex <= inv.reminderEscalationLevel) {
      continue;
    }

    const levelCfg  = levels[targetLevelIndex - 1];
    const emoji     = levelEmoji(levelCfg.label);
    const amount    = Number(inv.balanceDue).toLocaleString('fr-FR');
    const title     = `${emoji} Relance ${levelCfg.label} — ${inv.number}`;
    const message   = buildNotificationMessage(levelCfg.label, inv.number, inv.client.name, daysOverdue, amount);

    // ── Construire la liste des destinataires internes ─────────────────────
    // Map userId → { email, firstName } pour déduplier
    const recipients = new Map<string, { email: string; firstName: string }>();

    if (levelCfg.notifyCreator) {
      recipients.set(inv.createdBy.id, inv.createdBy);
      // Inclure l'assigné s'il est différent du créateur
      if (inv.assignedTo && inv.assignedToId !== inv.createdById) {
        recipients.set(inv.assignedTo.id, inv.assignedTo);
      }
    }

    if (levelCfg.notifyManagers) {
      for (const mgr of managers) {
        recipients.set(mgr.id, mgr);
      }
    }

    // ── Notifications in-app ───────────────────────────────────────────────
    for (const [userId] of recipients) {
      await notificationQueue.add('notification' as string, {
        userId,
        type: 'reminder_sent',
        title,
        message,
        data: {
          invoiceId:        inv.id,
          invoiceNumber:    inv.number,
          clientName:       inv.client.name,
          daysOverdue,
          escalationLevel:  targetLevelIndex,
          escalationLabel:  levelCfg.label,
          balanceDue:       Number(inv.balanceDue),
        },
      });
    }

    // ── Emails internes (niveaux 2, 3, 4) ─────────────────────────────────
    if (levelCfg.sendEmail) {
      for (const [, recipient] of recipients) {
        await emailQueue.add('email' as string, {
          to:      recipient.email,
          subject: `[InvoiceHub BTS] ${title}`,
          html:    buildEmailHtml(
            levelCfg.label,
            inv.number,
            inv.client.name,
            daysOverdue,
            amount,
            recipient.firstName,
          ),
        });
      }
    }

    // ── Mettre à jour le niveau d'escalade sur la facture ─────────────────
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
