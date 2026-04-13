/**
 * @module modules/ai/ai.tools
 * Outils DB que BTS Assistant peut appeler pour récupérer les données pertinentes.
 * Chaque outil retourne des données réelles et complètes pour que l'IA puisse
 * répondre avec des valeurs précises (lignes, remises, TVA, montants détaillés).
 */
import { prisma } from '../../config/database';

// ─── Types ────────────────────────────────────────────────────────────────

export type ToolName =
  | 'getInvoices'
  | 'getInvoiceDetail'
  | 'getProformas'
  | 'getProformaDetail'
  | 'getClients'
  | 'getPayments'
  | 'getDashboardKpis'
  | 'getClientSummary'
  | 'getProductCatalog'
  | 'detectAnomalies'
  | 'none';

export interface ToolCall {
  tool: ToolName;
  params: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const fmt = (n: unknown) => Number(n ?? 0);

// ─── Outils ───────────────────────────────────────────────────────────────

/** Liste de factures avec totaux — vue d'ensemble */
async function getInvoices(params: {
  clientName?: string;
  status?: string[];
  type?: string[];
  limit?: number;
  overdue?: boolean;
}) {
  const where: Record<string, unknown> = { deletedAt: null };
  if (params.clientName) where['client'] = { name: { contains: params.clientName, mode: 'insensitive' } };
  if (params.status?.length)  where['status'] = { in: params.status };
  if (params.type?.length)    where['type']   = { in: params.type };
  if (params.overdue)         where['status'] = 'overdue';

  const invoices = await prisma.invoice.findMany({
    where: where as NonNullable<Parameters<typeof prisma.invoice.findMany>[0]>['where'],
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 10,
  });

  return invoices.map(i => ({
    number:     i.number,
    client:     (i.client as { name: string }).name,
    type:       i.type,
    status:     i.status,
    issueDate:  i.issueDate,
    dueDate:    i.dueDate,
    totalHt:    fmt(i.totalHt),
    totalTax:   fmt(i.totalTax),
    totalTtc:   fmt(i.totalTtc),
    remiseGlobale: fmt(i.globalDiscountAmount),
    amountPaid: fmt(i.amountPaid),
    balanceDue: fmt(i.balanceDue),
  }));
}

/** Détail complet d'une facture : lignes, remises, TVA par ligne */
async function getInvoiceDetail(params: { invoiceNumber?: string; clientName?: string }) {
  const where: Record<string, unknown> = { deletedAt: null };
  if (params.invoiceNumber) where['number'] = { contains: params.invoiceNumber, mode: 'insensitive' };
  if (params.clientName)    where['client'] = { name: { contains: params.clientName, mode: 'insensitive' } };

  const invoice = await prisma.invoice.findFirst({
    where: where as NonNullable<Parameters<typeof prisma.invoice.findFirst>[0]>['where'],
    include: {
      client: { select: { name: true, email: true } },
      lines:  {
        select: {
          sortOrder:      true,
          designation:    true,
          description:    true,
          quantity:       true,
          unit:           true,
          unitPriceHt:    true,
          discountType:   true,
          discountValue:  true,
          discountAmount: true,
          taxRate:        true,
          taxAmount:      true,
          subtotalHt:     true,
          netHt:          true,
          totalTtc:       true,
        },
        orderBy: { sortOrder: 'asc' },
      },
      payments: {
        where: { deletedAt: null },
        select: { amount: true, method: true, paymentDate: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!invoice) return null;

  const inv = invoice as unknown as Record<string, unknown>;
  return {
    number:          invoice.number,
    client:          (inv['client'] as { name: string; email: string }).name,
    clientEmail:     (inv['client'] as { name: string; email: string }).email,
    type:            invoice.type,
    status:          invoice.status,
    issueDate:       invoice.issueDate,
    dueDate:         invoice.dueDate,
    notes:           invoice.notes,
    paymentTerms:    invoice.paymentConditions,
    remiseGlobaleType:  invoice.globalDiscountType,
    remiseGlobaleValeur: fmt(invoice.globalDiscountValue),
    remiseGlobaleMontant: fmt(invoice.globalDiscountAmount),
    totalHt:         fmt(invoice.totalHt),
    totalTax:        fmt(invoice.totalTax),
    totalTtc:        fmt(invoice.totalTtc),
    amountPaid:      fmt(invoice.amountPaid),
    balanceDue:      fmt(invoice.balanceDue),
    lignes: (inv['lines'] as Array<Record<string, unknown>>).map(l => ({
      position:     l['sortOrder'],
      designation:  l['designation'],
      description:  l['description'],
      quantite:     fmt(l['quantity']),
      unite:        l['unit'],
      prixUnitaireHt: fmt(l['unitPriceHt']),
      remiseType:   l['discountType'],
      remiseValeur: fmt(l['discountValue']),
      remiseMontant: fmt(l['discountAmount']),
      tauxTva:      fmt(l['taxRate']),
      montantTva:   fmt(l['taxAmount']),
      totalHt:      fmt(l['subtotalHt']),
      netHt:        fmt(l['netHt']),
      totalTtc:     fmt(l['totalTtc']),
    })),
    paiements: (inv['payments'] as Array<Record<string, unknown>>).map(p => ({
      montant:      fmt(p['amount']),
      methode:      p['method'],
      date:         p['paymentDate'],
    })),
  };
}

/** Liste de proformas avec totaux */
async function getProformas(params: {
  clientName?: string;
  status?: string[];
  limit?: number;
}) {
  const where: Record<string, unknown> = { deletedAt: null };
  if (params.clientName)  where['client'] = { name: { contains: params.clientName, mode: 'insensitive' } };
  if (params.status?.length) where['status'] = { in: params.status };

  const proformas = await prisma.proforma.findMany({
    where: where as NonNullable<Parameters<typeof prisma.proforma.findMany>[0]>['where'],
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 10,
  });

  return proformas.map(p => ({
    number:     p.number,
    client:     (p.client as { name: string }).name,
    status:     p.status,
    issueDate:  p.issueDate,
    expiryDate: (p as unknown as Record<string, unknown>)['validUntil'],
    totalHt:    fmt(p.totalHt),
    totalTax:   fmt(p.totalTax),
    totalTtc:   fmt(p.totalTtc),
  }));
}

/** Détail complet d'une proforma avec lignes */
async function getProformaDetail(params: { proformaNumber?: string; clientName?: string }) {
  const where: Record<string, unknown> = { deletedAt: null };
  if (params.proformaNumber) where['number'] = { contains: params.proformaNumber, mode: 'insensitive' };
  if (params.clientName)     where['client'] = { name: { contains: params.clientName, mode: 'insensitive' } };

  const proforma = await prisma.proforma.findFirst({
    where: where as NonNullable<Parameters<typeof prisma.proforma.findFirst>[0]>['where'],
    include: {
      client: { select: { name: true } },
      lines: {
        select: {
          sortOrder: true, designation: true, description: true, quantity: true, unit: true,
          unitPriceHt: true, discountType: true, discountValue: true,
          discountAmount: true, taxRate: true, taxAmount: true,
          subtotalHt: true, netHt: true, totalTtc: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!proforma) return null;

  const pf = proforma as unknown as Record<string, unknown>;
  return {
    number:      proforma.number,
    client:      (pf['client'] as { name: string }).name,
    status:      proforma.status,
    issueDate:   proforma.issueDate,
    expiryDate:  pf['validUntil'],
    paymentTerms: proforma.paymentConditions,
    remiseGlobaleMontant: fmt(proforma.globalDiscountAmount),
    totalHt:     fmt(proforma.totalHt),
    totalTax:    fmt(proforma.totalTax),
    totalTtc:    fmt(proforma.totalTtc),
    lignes: (pf['lines'] as Array<Record<string, unknown>>).map(l => ({
      position:     l['sortOrder'],
      designation:  l['designation'],
      description:  l['description'],
      quantite:     fmt(l['quantity']),
      unite:        l['unit'],
      prixUnitaireHt: fmt(l['unitPriceHt']),
      remiseMontant:  fmt(l['discountAmount']),
      tauxTva:      fmt(l['taxRate']),
      montantTva:   fmt(l['taxAmount']),
      netHt:        fmt(l['netHt']),
      totalTtc:     fmt(l['totalTtc']),
    })),
  };
}

/** Liste des clients avec stats de facturation */
async function getClients(params: { name?: string; limit?: number }) {
  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      ...(params.name ? { name: { contains: params.name, mode: 'insensitive' } } : {}),
    },
    orderBy: { name: 'asc' },
    take: params.limit ?? 10,
    select: {
      name: true, email: true, phone: true, city: true, taxNumber: true,
    },
  });

  return clients.map(c => ({
    name:          c.name,
    email:         c.email,
    phone:         c.phone,
    ville:         c.city,
    numeroTaxe:    c.taxNumber,
  }));
}

/** Paiements avec détails */
async function getPayments(params: { clientName?: string; limit?: number }) {
  const payments = await prisma.payment.findMany({
    where: {
      deletedAt: null,
      ...(params.clientName
        ? { invoice: { client: { name: { contains: params.clientName, mode: 'insensitive' } } } }
        : {}),
    },
    include: {
      invoice: { select: { number: true, totalTtc: true, client: { select: { name: true } } } },
    },
    orderBy: { paymentDate: 'desc' },
    take: params.limit ?? 10,
  });

  return payments.map(p => {
    const inv = p.invoice as { number: string; totalTtc: unknown; client: { name: string } };
    return {
      facture:      inv.number,
      client:       inv.client.name,
      montantFacture: fmt(inv.totalTtc),
      montantPaye:  fmt(p.amount),
      methode:      p.method,
      reference:    p.reference,
      date:         p.paymentDate,
    };
  });
}

/** KPIs globaux du tableau de bord */
async function getDashboardKpis() {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const startOfLastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  const endOfLastMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 0);

  const [total, unpaid, overdue, thisMonth, lastMonth, topClients] = await Promise.all([
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
    prisma.invoice.count({ where: { deletedAt: null, status: 'overdue' } }),
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { not: 'cancelled' }, issueDate: { gte: startOfMonth } },
      _sum: { totalTtc: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { not: 'cancelled' }, issueDate: { gte: startOfLastMonth, lte: endOfLastMonth } },
      _sum: { totalTtc: true },
    }),
    prisma.client.findMany({
      where: { deletedAt: null },
      select: {
        name: true,
        invoices: {
          where: { deletedAt: null, status: { not: 'cancelled' } },
          select: { totalTtc: true, amountPaid: true, balanceDue: true },
        },
      },
    }),
  ]);

  const caMoisCourant  = fmt(thisMonth._sum.totalTtc);
  const caMoisPrecedent = fmt(lastMonth._sum.totalTtc);
  const evolutionCA    = caMoisPrecedent > 0
    ? Math.round((caMoisCourant - caMoisPrecedent) / caMoisPrecedent * 100)
    : null;

  const clientRanking = topClients
    .map(c => ({
      nom:           c.name,
      totalFacture:  c.invoices.reduce((s, i) => s + fmt(i.totalTtc), 0),
      totalPaye:     c.invoices.reduce((s, i) => s + fmt(i.amountPaid), 0),
      totalDu:       c.invoices.reduce((s, i) => s + fmt(i.balanceDue), 0),
    }))
    .sort((a, b) => b.totalFacture - a.totalFacture)
    .slice(0, 5);

  return {
    caMoisCourant,
    caMoisPrecedent,
    evolutionCAPct:   evolutionCA,
    caTotal:          fmt(total._sum.totalTtc),
    encaisseTotal:    fmt(total._sum.amountPaid),
    impayes:          fmt(unpaid._sum.balanceDue),
    nombreFactures:   total._count,
    nombreImpayees:   unpaid._count,
    nombreEnRetard:   overdue,
    facturesMoisCourant: thisMonth._count,
    top5Clients:      clientRanking,
  };
}

/** Résumé financier complet d'un client */
async function getClientSummary(params: { clientName: string }) {
  const client = await prisma.client.findFirst({
    where: { deletedAt: null, name: { contains: params.clientName, mode: 'insensitive' } },
    include: {
      invoices: {
        where: { deletedAt: null, status: { not: 'cancelled' } },
        select: {
          number: true, status: true, type: true,
          issueDate: true, dueDate: true,
          totalTtc: true, amountPaid: true, balanceDue: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!client) return null;

  return {
    nom:            client.name,
    email:          client.email,
    telephone:      client.phone,
    ville:          client.city,
    numeroTaxe:     client.taxNumber,
    totalFacture:   client.invoices.reduce((s, i) => s + fmt(i.totalTtc), 0),
    totalPaye:      client.invoices.reduce((s, i) => s + fmt(i.amountPaid), 0),
    totalDu:        client.invoices.reduce((s, i) => s + fmt(i.balanceDue), 0),
    nombreFactures: client.invoices.length,
    enRetard:       client.invoices.filter(i => i.status === 'overdue').length,
    dernieresFactures: client.invoices.map(i => ({
      numero:    i.number,
      statut:    i.status,
      type:      i.type,
      emission:  i.issueDate,
      echeance:  i.dueDate,
      totalTtc:  fmt(i.totalTtc),
      paye:      fmt(i.amountPaid),
      solde:     fmt(i.balanceDue),
    })),
  };
}

/** Catalogue des produits/services */
async function getProductCatalog(params: { search?: string; name?: string; limit?: number }) {
  const keyword = params.search ?? params.name;
  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ...(keyword ? { name: { contains: keyword, mode: 'insensitive' } } : {}),
    },
    include: { category: { select: { name: true } } },
    orderBy: { name: 'asc' },
    take: params.limit ?? 20,
  });

  return products.map(p => ({
    nom:        p.name,
    categorie:  (p.category as { name: string } | null)?.name ?? 'Sans catégorie',
    prix:       fmt(p.unitPriceHt),
    unite:      p.unit,
    tauxTva:    fmt(p.taxRateValue),
    description: p.description,
    actif:      !p.deletedAt,
  }));
}

/** Détection d'anomalies dans les données */
async function detectAnomalies() {
  const anomalies: string[] = [];

  const avgResult = await prisma.invoice.aggregate({
    where: { deletedAt: null, status: { not: 'cancelled' } },
    _avg: { totalTtc: true },
  });
  const avg = fmt(avgResult._avg.totalTtc);

  if (avg > 0) {
    const lowInvoices = await prisma.invoice.findMany({
      where: { deletedAt: null, status: { not: 'cancelled' }, totalTtc: { lt: avg * 0.1 } },
      include: { client: { select: { name: true } } },
      take: 3,
    });
    for (const inv of lowInvoices) {
      anomalies.push(`Facture ${inv.number} (${(inv.client as { name: string }).name}) : ${fmt(inv.totalTtc).toLocaleString('fr-FR')} XAF — moins de 10% de la moyenne (${Math.round(avg).toLocaleString('fr-FR')} XAF). Vérification recommandée.`);
    }
  }

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const inactiveClients = await prisma.client.findMany({
    where: { deletedAt: null, invoices: { none: { createdAt: { gte: ninetyDaysAgo }, deletedAt: null } } },
    select: { name: true },
    take: 3,
  });
  for (const c of inactiveClients) {
    anomalies.push(`Client ${c.name} : aucune facture depuis plus de 90 jours.`);
  }

  const zeroVatInvoices = await prisma.invoice.findMany({
    where: { deletedAt: null, status: { not: 'cancelled' }, totalTax: { equals: 0 }, totalHt: { gt: 0 } },
    include: { client: { select: { name: true } } },
    take: 3,
  });
  for (const inv of zeroVatInvoices) {
    anomalies.push(`Facture ${inv.number} (${(inv.client as { name: string }).name}) : TVA à 0 XAF sur ${fmt(inv.totalHt).toLocaleString('fr-FR')} XAF HT.`);
  }

  return anomalies.length > 0 ? anomalies : ['Aucune anomalie détectée.'];
}

// ─── Dispatcher ────────────────────────────────────────────────────────────

export async function executeTool(call: ToolCall): Promise<unknown> {
  switch (call.tool) {
    case 'getInvoices':       return getInvoices(call.params as Parameters<typeof getInvoices>[0]);
    case 'getInvoiceDetail':  return getInvoiceDetail(call.params as Parameters<typeof getInvoiceDetail>[0]);
    case 'getProformas':      return getProformas(call.params as Parameters<typeof getProformas>[0]);
    case 'getProformaDetail': return getProformaDetail(call.params as Parameters<typeof getProformaDetail>[0]);
    case 'getClients':        return getClients(call.params as Parameters<typeof getClients>[0]);
    case 'getPayments':       return getPayments(call.params as Parameters<typeof getPayments>[0]);
    case 'getDashboardKpis':  return getDashboardKpis();
    case 'getClientSummary':  return getClientSummary(call.params as Parameters<typeof getClientSummary>[0]);
    case 'getProductCatalog': return getProductCatalog(call.params as Parameters<typeof getProductCatalog>[0]);
    case 'detectAnomalies':   return detectAnomalies();
    case 'none':              return null;
    default:                  return null;
  }
}
