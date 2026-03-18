/**
 * @module modules/ai/ai.tools
 * Outils DB que BTS Assistant peut appeler pour récupérer les données pertinentes.
 *
 * Chaque outil correspond à une requête Prisma ciblée.
 * Le service AI détermine quel outil appeler via un premier appel Ollama (analyse d'intention),
 * exécute la requête, puis construit le contexte pour la réponse finale.
 */
import { prisma } from '../../config/database';

// ─── Types des paramètres d'outils ────────────────────────────────────────

export type ToolName =
  | 'getInvoices'
  | 'getProformas'
  | 'getClients'
  | 'getPayments'
  | 'getDashboardKpis'
  | 'getClientSummary'
  | 'detectAnomalies'
  | 'none';

export interface ToolCall {
  tool: ToolName;
  params: Record<string, unknown>;
}

// ─── Implémentations ──────────────────────────────────────────────────────

async function getInvoices(params: {
  clientName?: string;
  status?: string[];
  type?: string[];
  limit?: number;
  overdue?: boolean;
}) {
  const where: Record<string, unknown> = { deletedAt: null };

  if (params.clientName) {
    where['client'] = { name: { contains: params.clientName, mode: 'insensitive' } };
  }
  if (params.status?.length) {
    where['status'] = { in: params.status };
  }
  if (params.type?.length) {
    where['type'] = { in: params.type };
  }
  if (params.overdue) {
    where['status'] = 'overdue';
  }

  const invoices = await prisma.invoice.findMany({
    where: where as Parameters<typeof prisma.invoice.findMany>[0]['where'],
    include: {
      client: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 10,
  });

  return invoices.map(i => ({
    id: i.id,
    number: i.number,
    client: (i.client as { name: string }).name,
    type: i.type,
    status: i.status,
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    totalTtc: Number(i.totalTtc),
    amountPaid: Number(i.amountPaid),
    balanceDue: Number(i.balanceDue),
  }));
}

async function getProformas(params: {
  clientName?: string;
  status?: string[];
  limit?: number;
}) {
  const where: Record<string, unknown> = { deletedAt: null };

  if (params.clientName) {
    where['client'] = { name: { contains: params.clientName, mode: 'insensitive' } };
  }
  if (params.status?.length) {
    where['status'] = { in: params.status };
  }

  const proformas = await prisma.proforma.findMany({
    where: where as Parameters<typeof prisma.proforma.findMany>[0]['where'],
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 10,
  });

  return proformas.map(p => ({
    id: p.id,
    number: p.number,
    client: (p.client as { name: string }).name,
    status: p.status,
    issueDate: p.issueDate,
    expiryDate: p.expiryDate,
    totalTtc: Number(p.totalTtc),
  }));
}

async function getClients(params: {
  name?: string;
  limit?: number;
}) {
  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      ...(params.name ? { name: { contains: params.name, mode: 'insensitive' } } : {}),
    },
    orderBy: { name: 'asc' },
    take: params.limit ?? 10,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      city: true,
      _count: { select: { invoices: true, proformas: true } },
    },
  });

  return clients.map(c => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    city: c.city,
    invoiceCount: c._count.invoices,
    proformaCount: c._count.proformas,
  }));
}

async function getPayments(params: {
  clientName?: string;
  limit?: number;
}) {
  const payments = await prisma.payment.findMany({
    where: {
      deletedAt: null,
      ...(params.clientName
        ? { invoice: { client: { name: { contains: params.clientName, mode: 'insensitive' } } } }
        : {}),
    },
    include: {
      invoice: { select: { number: true, client: { select: { name: true } } } },
    },
    orderBy: { paymentDate: 'desc' },
    take: params.limit ?? 10,
  });

  return payments.map(p => ({
    id: p.id,
    invoice: (p.invoice as { number: string; client: { name: string } }).number,
    client: (p.invoice as { number: string; client: { name: string } }).client.name,
    amount: Number(p.amount),
    method: p.method,
    paymentDate: p.paymentDate,
  }));
}

async function getDashboardKpis() {
  const [
    totalInvoices,
    unpaidInvoices,
    overdueInvoices,
    recentPayments,
    topClients,
  ] = await Promise.all([
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { not: 'cancelled' } },
      _sum: { totalTtc: true, amountPaid: true, balanceDue: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] } },
      _sum: { balanceDue: true },
      _count: true,
    }),
    prisma.invoice.count({
      where: { deletedAt: null, status: 'overdue' },
    }),
    prisma.payment.aggregate({
      where: {
        deletedAt: null,
        paymentDate: { gte: new Date(new Date().setDate(1)) }, // mois courant
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.client.findMany({
      where: { deletedAt: null },
      take: 5,
      select: {
        name: true,
        invoices: {
          where: { deletedAt: null, status: { not: 'cancelled' } },
          select: { totalTtc: true },
        },
      },
    }),
  ]);

  const clientRanking = topClients
    .map(c => ({
      name: c.name,
      totalFacture: c.invoices.reduce((s, i) => s + Number(i.totalTtc), 0),
    }))
    .sort((a, b) => b.totalFacture - a.totalFacture)
    .slice(0, 5);

  return {
    totalFacture: Number(totalInvoices._sum.totalTtc ?? 0),
    totalEncaisse: Number(totalInvoices._sum.amountPaid ?? 0),
    totalImpaye: Number(unpaidInvoices._sum.balanceDue ?? 0),
    nombreFactures: totalInvoices._count,
    nombreImpayees: unpaidInvoices._count,
    nombreEnRetard: overdueInvoices,
    encaisseMoisCourant: Number(recentPayments._sum.amount ?? 0),
    topClients: clientRanking,
  };
}

async function getClientSummary(params: { clientName: string }) {
  const client = await prisma.client.findFirst({
    where: {
      deletedAt: null,
      name: { contains: params.clientName, mode: 'insensitive' },
    },
    include: {
      invoices: {
        where: { deletedAt: null, status: { not: 'cancelled' } },
        select: { totalTtc: true, amountPaid: true, balanceDue: true, status: true },
      },
    },
  });

  if (!client) return null;

  const stats = {
    name: client.name,
    email: client.email,
    phone: client.phone,
    totalFacture: client.invoices.reduce((s, i) => s + Number(i.totalTtc), 0),
    totalPaye: client.invoices.reduce((s, i) => s + Number(i.amountPaid), 0),
    totalDu: client.invoices.reduce((s, i) => s + Number(i.balanceDue), 0),
    nombreFactures: client.invoices.length,
    facturesEnRetard: client.invoices.filter(i => i.status === 'overdue').length,
  };

  return stats;
}

async function detectAnomalies() {
  const anomalies: string[] = [];

  // Factures avec montant anormalement bas (< 10% de la moyenne)
  const avgResult = await prisma.invoice.aggregate({
    where: { deletedAt: null, status: { not: 'cancelled' } },
    _avg: { totalTtc: true },
  });
  const avg = Number(avgResult._avg.totalTtc ?? 0);

  if (avg > 0) {
    const lowInvoices = await prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: { not: 'cancelled' },
        totalTtc: { lt: avg * 0.1 },
      },
      include: { client: { select: { name: true } } },
      take: 3,
    });

    for (const inv of lowInvoices) {
      anomalies.push(
        `Facture ${inv.number} (${(inv.client as { name: string }).name}) : ${Number(inv.totalTtc).toLocaleString('fr-FR')} XAF — soit moins de 10% de votre montant moyen. Vérification recommandée.`
      );
    }
  }

  // Clients sans activité depuis 90 jours
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const inactiveClients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      invoices: {
        none: { createdAt: { gte: ninetyDaysAgo }, deletedAt: null },
      },
    },
    select: { name: true },
    take: 3,
  });

  for (const c of inactiveClients) {
    anomalies.push(`Client ${c.name} : aucune facture depuis plus de 90 jours.`);
  }

  // Factures avec TVA à 0% (potentiellement incorrectes)
  const zeroVatInvoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      status: { not: 'cancelled' },
      totalTax: { equals: 0 },
      totalHt: { gt: 0 },
    },
    include: { client: { select: { name: true } } },
    take: 3,
  });

  for (const inv of zeroVatInvoices) {
    anomalies.push(
      `Facture ${inv.number} (${(inv.client as { name: string }).name}) : TVA à 0 XAF sur un montant HT de ${Number(inv.totalHt).toLocaleString('fr-FR')} XAF — vérifier si intentionnel.`
    );
  }

  return anomalies;
}

// ─── Dispatcher ────────────────────────────────────────────────────────────

export async function executeTool(call: ToolCall): Promise<unknown> {
  switch (call.tool) {
    case 'getInvoices':      return getInvoices(call.params as Parameters<typeof getInvoices>[0]);
    case 'getProformas':     return getProformas(call.params as Parameters<typeof getProformas>[0]);
    case 'getClients':       return getClients(call.params as Parameters<typeof getClients>[0]);
    case 'getPayments':      return getPayments(call.params as Parameters<typeof getPayments>[0]);
    case 'getDashboardKpis': return getDashboardKpis();
    case 'getClientSummary': return getClientSummary(call.params as Parameters<typeof getClientSummary>[0]);
    case 'detectAnomalies':  return detectAnomalies();
    case 'none':             return null;
    default:                 return null;
  }
}
