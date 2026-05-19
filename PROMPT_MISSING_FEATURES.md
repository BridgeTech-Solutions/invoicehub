# PROMPT — Fonctionnalités manquantes à implémenter
# InvoiceHub v3 — Bridge Technologies Solutions (BTS)
# À suivre étape par étape, dans l'ordre exact défini ici.

---

## CONTEXTE GÉNÉRAL

**Projet** : InvoiceHub v3 — ERP complet SYSCOHADA pour BTS  
**Stack** : Node.js + Express + TypeScript + Prisma + PostgreSQL + Redis + BullMQ  
**Backend dir** : `D:/Bel/projets/BRIDGE/bridge-backend/`  
**Build actuel** : ✅ Propre — `pnpm build` → EXIT 0, aucune erreur TypeScript

---

## RÈGLES ABSOLUES (identiques à PROMPT_BACKEND_V3.md)

1. **TypeScript** — utiliser `as any` uniquement en dernier recours pour les enums Prisma
2. **AppError** — toutes les erreurs métier via `AppError.notFound()`, `.badRequest()`, etc.
3. **Pas de `console.log`** — utiliser `logger` depuis `../../core/middleware/requestLogger`
4. **Soft delete** — jamais de DELETE SQL direct, toujours `deletedAt: new Date()`
5. **Prisma transactions** — toute opération multi-table dans `prisma.$transaction()`
6. **Response format** :
   - Succès : `res.setHeader('Content-Type', 'application/pdf'); res.send(buffer);`
   - Action : `{ success: true, message: '...' }`
7. **`pnpm build` doit rester propre** après chaque étape

---

## ARCHITECTURE PDF EXISTANTE — À RESPECTER EXACTEMENT

### Fichier central : `src/lib/pdf.ts`

**Deux fonctions publiques principales :**

```typescript
// 1. Génère le PDF binaire depuis un HTML complet
export async function generatePdf(html: string, footerSafeZonePx?: number): Promise<Buffer>

// 2. Construit le HTML d'un document commercial BTS (Facture/Proforma/Avoir/Acompte/Solde)
export function buildDocumentHtml(params: DocumentHtmlParams): string

// 3. Construit le HTML d'un reçu de paiement BTS
export function buildReceiptHtml(params: ReceiptParams): string
```

**Interface `DocumentLine` (lignes de tableau) :**
```typescript
interface DocumentLine {
  reference?: string;       // Référence produit (SKU)
  description?: string;     // HTML riche (fallback : designation)
  designation: string;      // Titre court obligatoire
  quantity: number;
  unit: string;
  unitPriceHt: number;
  netHt: number;            // Montant HT net après remise
  taxRate: number;          // Taux TVA en %
  discountLabel?: string;   // Libellé remise (ex: "10%")
  hideDetails?: boolean;    // Mode service : masque Ref/Qté/PU
}
```

**Interface `DocumentHtmlParams` — champs disponibles :**
```typescript
interface DocumentHtmlParams {
  type: 'Proforma' | 'Facture' | 'Facture Acompte' | 'Facture Solde' | 'Avoir';
  number: string;           // Numéro SYSCOHADA (ex: BTS/DC/2026/01/bc001)
  issueDate: string;        // Date formatée FR (ex: 06/01/2026)
  dueDate?: string;         // Date échéance
  validUntil?: string;      // Validité (proformas)
  clientName: string;       // Nom du fournisseur ou client
  clientStreet?: string;
  clientBP?: string;        // Boîte postale + ville
  clientPhone?: string;
  clientEmail?: string;
  clientTaxNumber?: string; // NIU Cameroun
  clientRccm?: string;
  clientBankAccount?: string;
  contactPerson?: string;
  subject?: string;         // Objet du document
  lines: DocumentLine[];
  subtotalHt: number;
  totalTax: number;
  totalTtc: number;
  globalDiscountAmount?: number;
  globalDiscountLabel?: string;
  subtotalBeforeDiscountHt?: number;
  deliveryDelay?: string;
  warranty?: string;
  paymentConditions?: string;
  currency: string;
  notes?: string;
  headerImageB64?: string;
  footerImageB64?: string;
  sealImageB64?: string;
  footerSafeZonePx?: number;
}
```

### Pattern utilisé dans `invoices.service.ts` (à reproduire exactement)

```typescript
// 1. Charger le document avec ses lignes
const invoice = await prisma.invoice.findFirst({
  where: { id, deletedAt: null },
  include: { client: true, lines: { orderBy: { sortOrder: 'asc' } } },
});
if (!invoice) throw AppError.notFound('...');

// 2. Charger les assets visuels depuis company_settings
const settings = await prisma.companySetting.findFirst();
const headerImageB64 = settings?.headerImagePath ? imgToBase64(settings.headerImagePath) : undefined;
const footerImageB64 = settings?.footerImagePath ? imgToBase64(settings.footerImagePath) : undefined;
const sealImageB64   = settings?.stampPath       ? imgToBase64(settings.stampPath)       : undefined;

// 3. Mapper les lignes vers DocumentLine[]
const lines: DocumentLine[] = invoice.lines.map(l => ({
  reference:    l.productReference ?? undefined,
  designation:  l.designation,
  description:  l.description ?? undefined,
  quantity:     Number(l.quantity),
  unit:         String(l.unit ?? 'pcs'),
  unitPriceHt:  Number(l.unitPriceHt),
  netHt:        Number(l.netHt),
  taxRate:      Number(l.taxRate),
  discountLabel: l.discountValue > 0 ? `${l.discountValue}%` : undefined,
}));

// 4. Construire le HTML
const html = buildDocumentHtml({ type: 'Facture', number: invoice.number, ... });

// 5. Générer le PDF
const pdfBuffer = await generatePdf(html, footerSafeZonePx);

// 6. Réponse HTTP
res.setHeader('Content-Type', 'application/pdf');
res.setHeader('Content-Disposition', `inline; filename="${invoice.number.replace(/\//g, '-')}.pdf"`);
res.send(pdfBuffer);
```

### Pattern controller PDF (depuis `invoices.controller.ts`)

```typescript
export async function getPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const { buffer, filename } = await service.generatePdfResponse(String(req.params['id']));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) { next(err); }
}
```

---

## ÉTAPE 1 — PDF BON DE COMMANDE (`purchase-orders`)

### Fichiers à modifier
- `src/modules/purchase-orders/purchase-orders.service.ts`
- `src/modules/purchase-orders/purchase-orders.controller.ts`
- `src/modules/purchase-orders/purchase-orders.routes.ts`

### 1.1 — Service : ajouter `generatePdfResponse(id: string)`

```typescript
import { generatePdf, buildDocumentHtml, imgToBase64, DocumentLine } from '../../lib/pdf';
```

Logique :
1. Charger le BC avec ses lignes et fournisseur :
```typescript
const po = await prisma.purchaseOrder.findFirst({
  where: { id, deletedAt: null },
  include: {
    supplier: true,
    lines: { orderBy: { sortOrder: 'asc' } },
    office: true,
  },
});
if (!po) throw AppError.notFound('Bon de commande introuvable');
```

2. Charger les assets depuis `companySetting`

3. Mapper les lignes — le BC utilise `quantityOrdered` (pas `quantity`) et `unitPriceHt` :
```typescript
const lines: DocumentLine[] = po.lines.map(l => ({
  reference:    l.supplierReference ?? undefined,
  designation:  l.designation,
  description:  l.description ?? undefined,
  quantity:     Number(l.quantityOrdered),
  unit:         String(l.unit ?? 'pcs'),
  unitPriceHt:  Number(l.unitPriceHt),
  netHt:        Number(l.netHt),
  taxRate:      Number(l.taxRate),
  discountLabel: Number(l.discountValue) > 0 ? `${l.discountValue}%` : undefined,
}));
```

4. Construire le HTML avec `type: 'Proforma'` (même layout : fournisseur comme client) :
```typescript
const html = buildDocumentHtml({
  type: 'Proforma',
  number: po.number,
  issueDate: new Date(po.issueDate).toLocaleDateString('fr-FR'),
  dueDate: po.expectedDeliveryDate
    ? new Date(po.expectedDeliveryDate).toLocaleDateString('fr-FR')
    : undefined,
  clientName: po.supplier.name,
  clientStreet: po.supplier.address ?? undefined,
  clientBP: po.supplier.city ?? undefined,
  clientPhone: po.supplier.phone ?? undefined,
  clientEmail: po.supplier.email ?? undefined,
  clientTaxNumber: po.supplier.taxNumber ?? undefined,
  subject: `Bon de Commande — ${po.supplier.name}`,
  lines,
  subtotalHt: Number(po.totalHt),
  totalTax: Number(po.totalTax),
  totalTtc: Number(po.totalTtc),
  currency: 'XAF',
  notes: po.notes ?? undefined,
  paymentConditions: po.paymentTerms ?? undefined,
  headerImageB64,
  footerImageB64,
  sealImageB64,
});
```

5. Retourner `{ buffer, filename }` :
```typescript
const pdfBuffer = await generatePdf(html);
return {
  buffer: pdfBuffer,
  filename: `${po.number.replace(/\//g, '-')}.pdf`,
};
```

### 1.2 — Controller : ajouter `getPdf`

```typescript
export async function getPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const { buffer, filename } = await service.generatePdfResponse(String(req.params['id']));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) { next(err); }
}
```

### 1.3 — Routes : ajouter la route PDF

```typescript
router.get('/:id/pdf', authorizePermission('purchases:read'), ctrl.getPdf);
```

---

## ÉTAPE 2 — PDF FACTURE FOURNISSEUR (`supplier-invoices`)

### Fichiers à modifier
- `src/modules/supplier-invoices/supplier-invoices.service.ts`
- `src/modules/supplier-invoices/supplier-invoices.controller.ts`
- `src/modules/supplier-invoices/supplier-invoices.routes.ts`

### 2.1 — Service : ajouter `generatePdfResponse(id: string)`

Logique :
1. Charger la facture fournisseur :
```typescript
const inv = await prisma.supplierInvoice.findFirst({
  where: { id, deletedAt: null },
  include: {
    supplier: true,
    lines: { orderBy: { sortOrder: 'asc' } },
  },
});
if (!inv) throw AppError.notFound('Facture fournisseur introuvable');
```

2. Charger assets depuis `companySetting`

3. Mapper les lignes — SupplierInvoiceLine utilise `quantity` (pas `quantityOrdered`) :
```typescript
const lines: DocumentLine[] = inv.lines.map(l => ({
  reference:    undefined,
  designation:  l.designation,
  description:  l.description ?? undefined,
  quantity:     Number(l.quantity),
  unit:         String(l.unit ?? 'pcs'),
  unitPriceHt:  Number(l.unitPriceHt),
  netHt:        Number(l.netHt),
  taxRate:      Number(l.taxRate),
  discountLabel: Number(l.discountValue) > 0 ? `${l.discountValue}%` : undefined,
}));
```

4. Construire le HTML avec `type: 'Facture'` (la facture fournisseur ressemble à une facture) :
```typescript
const html = buildDocumentHtml({
  type: 'Facture',
  number: inv.number,
  issueDate: new Date(inv.invoiceDate).toLocaleDateString('fr-FR'),
  dueDate: new Date(inv.dueDate).toLocaleDateString('fr-FR'),
  clientName: inv.supplier.name,
  clientStreet: inv.supplier.address ?? undefined,
  clientBP: inv.supplier.city ?? undefined,
  clientPhone: inv.supplier.phone ?? undefined,
  clientEmail: inv.supplier.email ?? undefined,
  clientTaxNumber: inv.supplier.taxNumber ?? undefined,
  clientRccm: inv.supplier.rccm ?? undefined,
  subject: `Facture Fournisseur — Réf. ${inv.supplierInvoiceNumber}`,
  lines,
  subtotalHt: Number(inv.totalHt),
  totalTax: Number(inv.totalTax),
  totalTtc: Number(inv.totalTtc),
  globalDiscountAmount: Number(inv.globalDiscountAmount) > 0
    ? Number(inv.globalDiscountAmount) : undefined,
  currency: inv.currency ?? 'XAF',
  notes: inv.notes ?? undefined,
  paymentConditions: inv.paymentConditions ?? undefined,
  headerImageB64,
  footerImageB64,
});
```

5. Retourner `{ buffer, filename }`

### 2.2 — Controller : ajouter `getPdf`

Même pattern que Étape 1.2.

### 2.3 — Routes : ajouter la route PDF

```typescript
router.get('/:id/pdf', authorizePermission('purchases:read'), ctrl.getPdf);
```

---

## ÉTAPE 3 — FINANCIAL SUMMARY FOURNISSEUR (`suppliers`)

### Fichiers à modifier
- `src/modules/suppliers/suppliers.service.ts`
- `src/modules/suppliers/suppliers.controller.ts`
- `src/modules/suppliers/suppliers.routes.ts`

### 3.1 — Service : ajouter `getFinancialSummary(id: string)`

```typescript
export async function getFinancialSummary(id: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id, deletedAt: null } });
  if (!supplier) throw AppError.notFound('Fournisseur introuvable');

  const now = new Date();
  const startOfYear  = new Date(now.getFullYear(), 0, 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalPurchases,
    purchasesThisYear,
    purchasesThisMonth,
    pendingPayables,
    overduePayables,
    totalPayments,
    openPurchaseOrders,
    lastInvoices,
  ] = await Promise.all([
    // Total tous achats (toutes statuts sauf draft/cancelled)
    prisma.supplierInvoice.aggregate({
      where: { supplierId: id, deletedAt: null, status: { notIn: ['draft', 'cancelled'] as any[] } },
      _sum: { totalTtc: true },
      _count: true,
    }),

    // Achats cette année
    prisma.supplierInvoice.aggregate({
      where: {
        supplierId: id, deletedAt: null,
        status: { notIn: ['draft', 'cancelled'] as any[] },
        invoiceDate: { gte: startOfYear },
      },
      _sum: { totalTtc: true },
    }),

    // Achats ce mois
    prisma.supplierInvoice.aggregate({
      where: {
        supplierId: id, deletedAt: null,
        status: { notIn: ['draft', 'cancelled'] as any[] },
        invoiceDate: { gte: startOfMonth },
      },
      _sum: { totalTtc: true },
    }),

    // Encours à payer (validées + partiellement payées)
    prisma.supplierInvoice.aggregate({
      where: {
        supplierId: id, deletedAt: null,
        status: { in: ['validated', 'partially_paid'] as any[] },
      },
      _sum: { balanceDue: true },
      _count: true,
    }),

    // En retard (dueDate dépassée et non payées)
    prisma.supplierInvoice.aggregate({
      where: {
        supplierId: id, deletedAt: null,
        status: { in: ['validated', 'partially_paid'] as any[] },
        dueDate: { lt: now },
      },
      _sum: { balanceDue: true },
      _count: true,
    }),

    // Total paiements effectués
    prisma.supplierPayment.aggregate({
      where: { supplierId: id },
      _sum: { amount: true },
      _count: true,
    }),

    // BCs ouverts
    prisma.purchaseOrder.count({
      where: {
        supplierId: id, deletedAt: null,
        status: { in: ['draft', 'sent', 'confirmed', 'partially_received'] as any[] },
      },
    }),

    // 5 dernières factures
    prisma.supplierInvoice.findMany({
      where: { supplierId: id, deletedAt: null },
      orderBy: { invoiceDate: 'desc' },
      take: 5,
      select: {
        id: true, number: true, status: true,
        totalTtc: true, balanceDue: true, invoiceDate: true, dueDate: true,
      },
    }),
  ]);

  return {
    supplierId: id,
    supplierName: supplier.name,
    totalPurchases: {
      amount: Number(totalPurchases._sum.totalTtc ?? 0),
      invoiceCount: totalPurchases._count,
    },
    purchasesThisYear:  Number(purchasesThisYear._sum.totalTtc ?? 0),
    purchasesThisMonth: Number(purchasesThisMonth._sum.totalTtc ?? 0),
    pendingPayables: {
      amount: Number(pendingPayables._sum.balanceDue ?? 0),
      count:  pendingPayables._count,
    },
    overduePayables: {
      amount: Number(overduePayables._sum.balanceDue ?? 0),
      count:  overduePayables._count,
    },
    totalPayments: {
      amount: Number(totalPayments._sum.amount ?? 0),
      count:  totalPayments._count,
    },
    openPurchaseOrders,
    lastInvoices,
  };
}
```

### 3.2 — Controller : ajouter `getFinancialSummary`

```typescript
export async function getFinancialSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getFinancialSummary(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
```

### 3.3 — Routes : ajouter la route

```typescript
router.get('/:id/financial-summary', authorizePermission('suppliers:read'), ctrl.getFinancialSummary);
```

---

## ÉTAPE 4 — TÉLÉCHARGEMENT FICHIER EXPORT (`settings-advanced`)

### Contexte
L'`ExportJob` stocke le chemin du fichier généré dans `filePath` (ex: `/exports/export_invoices_1234567890.csv`).
Le dossier physique est `process.cwd() + '/exports/'` (créé par le `export.processor.ts`).
Il manque la route `GET /exports/:id/download` qui sert le fichier.

### Fichiers à modifier
- `src/modules/settings-advanced/settings-advanced.service.ts`
- `src/modules/settings-advanced/settings-advanced.controller.ts`
- `src/modules/settings-advanced/settings-advanced.routes.ts`

### 4.1 — Service : ajouter `getExportDownload(id: string, userId: string)`

```typescript
import path from 'path';
import fs from 'fs';

export async function getExportDownload(id: string, userId: string) {
  const job = await prisma.exportJob.findFirst({ where: { id, createdById: userId } });
  if (!job) throw AppError.notFound('Export introuvable');
  if (job.status !== 'completed') throw AppError.badRequest('Export non terminé');
  if (!job.filePath) throw AppError.badRequest('Fichier non disponible');

  // job.filePath est stocké comme '/exports/filename.csv'
  // On reconstruit le chemin absolu
  const absolutePath = path.join(process.cwd(), job.filePath);
  if (!fs.existsSync(absolutePath)) {
    throw AppError.notFound('Fichier introuvable sur le serveur');
  }

  const filename = path.basename(absolutePath);
  return { absolutePath, filename, format: job.format };
}
```

### 4.2 — Controller : ajouter `downloadExport`

```typescript
export async function downloadExport(req: Request, res: Response, next: NextFunction) {
  try {
    const { absolutePath, filename, format } = await service.getExportDownload(
      String(req.params['id']),
      req.user!.id,
    );

    const mimeTypes: Record<string, string> = {
      csv:      'text/csv',
      excel:    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sage_csv: 'text/plain',
      ciel_csv: 'text/plain',
      dsf_xml:  'application/xml',
    };

    const mime = mimeTypes[format as string] ?? 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(absolutePath);
  } catch (err) { next(err); }
}
```

### 4.3 — Routes : ajouter dans `exportsRouter`

```typescript
router.get('/:id/download', authenticate, ctrl.downloadExport);
```

---

## ÉTAPE 5 — VÉRIFICATION BUILD FINAL

Après avoir implémenté toutes les étapes :

```bash
cd bridge-backend
pnpm build
```

**Résultat attendu** : `EXIT_CODE: 0` — aucune erreur TypeScript.

Si des erreurs apparaissent :
- Erreur `string | string[]` → utiliser `String(req.params['id'])`
- Erreur enum Prisma → ajouter `as any`
- Erreur champ manquant → vérifier le modèle dans `prisma/schema.prisma`

---

## RÉCAPITULATIF DES FICHIERS À MODIFIER

| Étape | Fichiers modifiés | Ce qui s'ajoute |
|-------|------------------|-----------------|
| 1 | `purchase-orders.service.ts`<br>`purchase-orders.controller.ts`<br>`purchase-orders.routes.ts` | `generatePdfResponse()` + route `GET /:id/pdf` |
| 2 | `supplier-invoices.service.ts`<br>`supplier-invoices.controller.ts`<br>`supplier-invoices.routes.ts` | `generatePdfResponse()` + route `GET /:id/pdf` |
| 3 | `suppliers.service.ts`<br>`suppliers.controller.ts`<br>`suppliers.routes.ts` | `getFinancialSummary()` + route `GET /:id/financial-summary` |
| 4 | `settings-advanced.service.ts`<br>`settings-advanced.controller.ts`<br>`settings-advanced.routes.ts` | `getExportDownload()` + route `GET /exports/:id/download` |
| 5 | — | Vérification `pnpm build` → EXIT 0 |

---

## NOTES IMPORTANTES

### Sur les champs de lignes BC vs Facture Fournisseur

| Modèle | Champ quantité | Champ prix | Champ remise |
|--------|---------------|------------|--------------|
| `PurchaseOrderLine` | `quantityOrdered` | `unitPriceHt` | `discountValue` |
| `SupplierInvoiceLine` | `quantity` | `unitPriceHt` | `discountValue` |

### Sur `imgToBase64`

```typescript
import { generatePdf, buildDocumentHtml, imgToBase64, DocumentLine } from '../../lib/pdf';
```

`imgToBase64(filePath)` retourne un data URI base64 ou `''` si le fichier n'existe pas.

### Sur `companySetting`

```typescript
const settings = await prisma.companySetting.findFirst();
const headerImageB64 = settings?.headerImagePath ? imgToBase64(settings.headerImagePath) : undefined;
const footerImageB64 = settings?.footerImagePath ? imgToBase64(settings.footerImagePath) : undefined;
const sealImageB64   = settings?.stampPath       ? imgToBase64(settings.stampPath)       : undefined;
```

### Sur le format du numéro dans le nom de fichier

```typescript
filename: `${document.number.replace(/\//g, '-')}.pdf`
// Exemple : 'BTS/DC/2026/01/bc001' → 'BTS-DC-2026-01-bc001.pdf'
```

### Sur `res.sendFile`

`res.sendFile()` requiert un **chemin absolu**. Utiliser `path.join(process.cwd(), job.filePath)`.

### Sur `paymentTerms` dans PurchaseOrder

Vérifier dans `prisma/schema.prisma` le nom exact du champ pour les conditions de paiement.
Si le champ n'existe pas, passer `paymentConditions: undefined`.
