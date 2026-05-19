# PROMPT — Corrections & Améliorations AccountingEngine v2
# InvoiceHub v3 — Bridge Technologies Solutions (BTS), Douala, Cameroun
# À suivre étape par étape, dans l'ordre exact défini ici.
# IMPORTANT : Toujours analyser le code actuel avant d'implémenter chaque étape.

---

## CONTEXTE GÉNÉRAL

**Projet** : InvoiceHub v3 — ERP complet SYSCOHADA pour BTS
**Stack** : Node.js + Express + TypeScript + Prisma + PostgreSQL + Redis + BullMQ
**Backend dir** : `D:/Bel/projets/BRIDGE/bridge-backend/`
**Build actuel** : ✅ Propre — `pnpm build` → EXIT 0

### Fichier central concerné
`src/lib/accountingEngine.ts` — Génère les écritures comptables automatiques.

### Fichiers de référence à lire AVANT chaque étape
- `bridge-backend/prisma/schema.prisma` — vérifier les champs exacts de chaque modèle
- `src/lib/accountingEngine.ts` — code actuel à améliorer
- `src/modules/invoices/invoices.service.ts` — pour la logique avoir/cancel
- `src/modules/payments/payments.service.ts` — pour bankAccountId
- `src/modules/supplier-invoices/supplier-invoices.service.ts`
- `src/modules/expenses/expenses.service.ts`

---

## RÈGLES ABSOLUES (identiques aux autres prompts)

1. **TypeScript** — `as any` uniquement pour les enums Prisma en dernier recours
2. **AppError** — toutes les erreurs métier via `AppError.notFound()`, `.badRequest()`, etc.
3. **Pas de `console.log`** — utiliser `logger` depuis `../../core/middleware/requestLogger`
4. **Prisma transactions** — toute opération multi-table dans `prisma.$transaction()`
5. **`pnpm build` doit rester propre** après chaque étape — vérifier avant de passer à la suivante
6. **Silencieux** — les fonctions de l'accountingEngine ne doivent JAMAIS bloquer l'opération métier.
   Tout le corps de chaque fonction reste dans un `try { ... } catch { /* silencieux */ }`

---

## ÉTAT ACTUEL — PROBLÈMES IDENTIFIÉS

### Problème 1 — Comptes hardcodés (CRITIQUE)
```typescript
// ❌ Actuel — ignore les comptes configurés sur les entités
accountNumber: '411000'  // même si client.accountingAccount = '411BTS001'
accountNumber: '401000'  // même si supplier.accountingAccount = '401FOUR42'
accountNumber: '521000'  // même si bankAccount.accountingAccount = '521002'
```

Le schéma Prisma prévoit déjà `accountingAccount` sur :
- `Supplier` → `accountingAccount` (default `"401000"`)
- `SupplierInvoice` → `accountingAccount` (default `"401000"`)
- `BankAccount` → `accountingAccount` (default `"521000"`)
- `ExpenseCategory` → `accountingAccount`
- `Expense` → `accountingAccount`

Mais `Client` **n'a pas** de champ `accountingAccount` → il faut l'ajouter au schéma Prisma.

### Problème 2 — TVA hardcodée à 19,25%
```typescript
// ❌ Actuel
label: `TVA collectée 19,25%`  // toujours 19,25% peu importe les lignes

// ✅ À faire : lire les lignes de la facture, grouper par taux de TVA
// Ex: 3 lignes à 19.25% + 1 ligne exonérée → 2 écritures TVA distinctes
```

### Problème 3 — Compte de ventes générique (706000)
```typescript
// ❌ Actuel — tout en 706 (prestations de services)
accountNumber: '706000'

// ✅ À faire — selon ProductType de chaque ligne :
// product  (marchandise) → '701000'
// service               → '706000'
// Si lignes mixtes → plusieurs lignes d'écriture distinctes
```

### Problème 4 — Compte client non auxiliaire
```typescript
// ❌ Actuel — tout dans le même compte collectif
accountNumber: '411000'

// ✅ À faire — compte auxiliaire si défini sur le client
// client.accountingAccount ?? '411000'
// Ex: client "Orange CM" → compte '411ORANGE'
```

### Problème 5 — Banque non identifiée dans les paiements
```typescript
// ❌ Actuel — toujours 521000 même si paiement sur Atlantic Bank
accountNumber: '521000'

// ✅ À faire — lire payment.bankAccountId → bankAccount.accountingAccount
// Si bankAccountId null → fallback '521000'
```

### Problème 6 — Avoir (annulation facture) sans écriture comptable
Quand `invoices.service.ts` annule une facture et génère un avoir :
- L'écriture de la facture originale reste (débit 411, crédit 706)
- **Aucune contre-passation** n'est créée pour l'avoir
- En comptabilité : l'avoir doit INVERSER l'écriture originale

```typescript
// ✅ À créer : onInvoiceCancelled(invoiceId, avoirId, tx)
// Écriture de contre-passation (Journal des avoirs ou OD) :
// Débit  706xxx (Ventes)         → annule le CA
// Débit  447200 (TVA collectée)  → annule la TVA
// Crédit 411xxx (Client)         → annule la créance
```

### Problème 7 — entryNumber non atomique (race condition)
```typescript
// ❌ Actuel — COUNT peut retourner la même valeur pour 2 requêtes simultanées
const count = await tx.journalEntry.count({ where: { ... } });
return `${journalCode}-${year}-${String(count + 1).padStart(5, '0')}`;
```

Le bon pattern : utiliser `document_sequences` via `fn_next_document_number` (déjà utilisé
pour les factures) ou un `SELECT MAX(entry_number) FOR UPDATE` dans la transaction.

### Problème 8 — StockMovement manquant à l'émission de facture
Quand une facture client est émise (vente), les produits de type `product` (marchandise)
avec `trackStock = true` devraient générer un `StockMovement` de type `sale` :
```typescript
// À déclencher dans invoices.service.ts → issue()
// Pour chaque ligne de facture avec product.trackStock = true :
// createStockMovement({ type: 'sale', quantity: -line.quantity, ... })
```
Actuellement `onInvoiceIssued` ne crée pas ce mouvement.

### Problème 9 — Compte d'achat générique (607000)
```typescript
// ❌ Actuel
accountNumber: '607000'  // toujours "Achats de marchandises"

// ✅ À faire — selon la nature de la facture fournisseur ou la catégorie :
// supplierInvoice.accountingAccount si défini → utiliser ce compte
// Sinon → '607000' par défaut
```

---

## ÉTAPE 0 — ANALYSE PRÉALABLE (OBLIGATOIRE)

Avant tout, lire ces fichiers pour connaître l'état exact du code :
1. `bridge-backend/prisma/schema.prisma` — modèles Client, Supplier, BankAccount, Payment, SupplierPayment, Invoice, InvoiceLine, SupplierInvoice, ExpenseCategory, Expense
2. `src/lib/accountingEngine.ts` — code complet actuel
3. `src/modules/invoices/invoices.service.ts` — fonctions `issue()` et `cancel()`

---

## ÉTAPE 1 — Prisma : ajouter `accountingAccount` sur `Client`

### Fichier à modifier : `prisma/schema.prisma`

Dans le modèle `Client`, ajouter après le champ `currency` :

```prisma
accountingAccount  String?  @default("411000") @map("accounting_account") @db.VarChar(20)
```

Puis régénérer le client Prisma :
```bash
cd bridge-backend
pnpm prisma generate
```

**Note** : Pas de migration SQL ici — on suppose que la DB sera mise à jour séparément.
Vérifier que `pnpm build` reste propre après cette modification.

---

## ÉTAPE 2 — Comptes dynamiques pour Client et Fournisseur

### Fichier à modifier : `src/lib/accountingEngine.ts`

#### 2.1 — `onInvoiceIssued` : compte client dynamique

Charger les lignes de la facture + le compte client :

```typescript
export async function onInvoiceIssued(invoiceId: string, tx: Tx): Promise<void> {
  try {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: true,
        lines: true,          // ← NOUVEAU : charger les lignes
      },
    });
    if (!invoice) return;

    // Compte client : auxiliaire si défini, sinon collectif 411000
    const clientAccount = invoice.client?.accountingAccount ?? '411000';

    // Grouper le HT par type de produit (service vs marchandise)
    // et la TVA par taux
    // → voir section 2.3 pour la logique de décomposition
    const { salesLines, taxLines } = buildSalesBreakdown(invoice.lines);

    const entryDate   = new Date(invoice.issueDate ?? new Date());
    const journal     = await getDefaultJournal(tx, JournalType.sales);
    const period      = await getOpenPeriod(tx, entryDate);
    const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);

    const lineItems = [
      // Débit : créance client (TTC)
      { sortOrder: 0, accountNumber: clientAccount, label: `Client ${invoice.client?.name ?? ''}`, debit: Number(invoice.totalTtc), credit: 0 },
      // Crédit : ventes par type (voir buildSalesBreakdown)
      ...salesLines,
      // Crédit : TVA collectée par taux
      ...taxLines,
    ];

    await tx.journalEntry.create({
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `FAC ${invoice.number} — ${invoice.client?.name ?? 'Client'}`,
        sourceType:  'invoice',
        sourceId:    invoice.id,
        totalDebit:  Number(invoice.totalTtc),
        totalCredit: Number(invoice.totalTtc),
        status:      'draft',
        lines: { create: lineItems },
      },
    });
  } catch {
    // Silencieux — ne bloque pas l'émission
  }
}
```

#### 2.2 — Helper `buildSalesBreakdown` (ajouter en haut du fichier)

```typescript
interface JournalLineData {
  sortOrder: number;
  accountNumber: string;
  label: string;
  debit: number;
  credit: number;
}

function buildSalesBreakdown(lines: Array<{
  netHt: any; taxRate: any; taxAmount: any; product?: { type?: string } | null;
}>): { salesLines: JournalLineData[]; taxLines: JournalLineData[] } {
  // Grouper le HT par compte de ventes selon le type de produit
  const salesMap = new Map<string, number>();
  const taxMap   = new Map<string, number>();

  for (const l of lines) {
    // Compte de ventes : 701000 = marchandise, 706000 = service/défaut
    const salesAccount = l.product?.type === 'product' ? '701000' : '706000';
    salesMap.set(salesAccount, (salesMap.get(salesAccount) ?? 0) + Number(l.netHt));

    // TVA groupée par taux (ex: 19.25 → '447200', 0 → ignoré)
    const rate = Number(l.taxRate);
    if (rate > 0) {
      const taxAccount = '447200'; // TVA collectée — BTS utilise un seul compte TVA
      taxMap.set(taxAccount, (taxMap.get(taxAccount) ?? 0) + Number(l.taxAmount));
    }
  }

  const salesLines: JournalLineData[] = [];
  let sortOrder = 1;
  for (const [accountNumber, amount] of salesMap) {
    if (amount > 0) {
      const label = accountNumber === '701000' ? 'Ventes de marchandises' : 'Prestations de services';
      salesLines.push({ sortOrder: sortOrder++, accountNumber, label, debit: 0, credit: amount });
    }
  }

  const taxLines: JournalLineData[] = [];
  for (const [accountNumber, amount] of taxMap) {
    if (amount > 0) {
      taxLines.push({ sortOrder: sortOrder++, accountNumber, label: 'TVA collectée', debit: 0, credit: amount });
    }
  }

  return { salesLines, taxLines };
}
```

#### 2.3 — `onPaymentReceived` : banque dynamique + compte client dynamique

```typescript
export async function onPaymentReceived(paymentId: string, tx: Tx): Promise<void> {
  try {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: { include: { client: true } },
        bankAccount: true,   // ← NOUVEAU
      },
    });
    if (!payment) return;

    // Compte banque : celui configuré sur le compte bancaire, sinon 521000
    const bankAccount   = payment.bankAccount?.accountingAccount ?? '521000';
    const bankLabel     = payment.bankAccount?.name ?? 'Banque';

    // Compte client auxiliaire
    const clientAccount = payment.invoice?.client?.accountingAccount ?? '411000';

    const entryDate   = new Date(payment.paymentDate);
    const journal     = await getDefaultJournal(tx, JournalType.bank);
    const period      = await getOpenPeriod(tx, entryDate);
    const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);

    await tx.journalEntry.create({
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:   `Règlement FAC ${payment.invoice?.number ?? ''} — ${payment.invoice?.client?.name ?? ''}`,
        sourceType: 'payment',
        sourceId:   payment.id,
        totalDebit:  Number(payment.amount),
        totalCredit: Number(payment.amount),
        status: 'draft',
        lines: {
          create: [
            { sortOrder: 0, accountNumber: bankAccount,   label: `Encaissement ${bankLabel}`,                        debit: Number(payment.amount), credit: 0 },
            { sortOrder: 1, accountNumber: clientAccount, label: `Client ${payment.invoice?.client?.name ?? ''}`,    debit: 0, credit: Number(payment.amount) },
          ],
        },
      },
    });
  } catch {
    // Silencieux
  }
}
```

---

## ÉTAPE 3 — Comptes dynamiques Fournisseur + Banque

### Fichier à modifier : `src/lib/accountingEngine.ts`

#### 3.1 — `onSupplierInvoiceValidated` : compte fournisseur dynamique

```typescript
// Compte fournisseur : auxiliaire si défini sur le fournisseur
const supplierAccount = inv.supplier?.accountingAccount
  ?? inv.accountingAccount          // compte défini sur la facture elle-même
  ?? '401000';

// Compte d'achat : celui défini sur la facture fournisseur, sinon 607000
const purchaseAccount = inv.accountingAccount
  && inv.accountingAccount !== '401000'
  ? inv.accountingAccount
  : '607000';
```

Lignes de l'écriture :
```typescript
lines: {
  create: [
    { sortOrder: 0, accountNumber: purchaseAccount, label: `Achats — ${inv.supplierInvoiceNumber}`, debit: Number(inv.totalHt),  credit: 0 },
    { sortOrder: 1, accountNumber: '447100',         label: `TVA déductible`,                       debit: Number(inv.totalTax), credit: 0 },
    { sortOrder: 2, accountNumber: supplierAccount,  label: `Fournisseur ${inv.supplier?.name ?? ''}`, debit: 0, credit: Number(inv.totalTtc) },
  ],
},
```

#### 3.2 — `onSupplierPaymentMade` : banque + fournisseur dynamiques

```typescript
const payment = await tx.supplierPayment.findUnique({
  where: { id: supplierPaymentId },
  include: {
    supplier:    true,
    bankAccount: true,   // ← NOUVEAU
  },
});

const supplierAccount = payment.supplier?.accountingAccount ?? '401000';
const bankAccount     = payment.bankAccount?.accountingAccount ?? '521000';
const bankLabel       = payment.bankAccount?.name ?? 'Banque';
```

---

## ÉTAPE 4 — Écriture de contre-passation pour les Avoirs

### Fichier à modifier : `src/lib/accountingEngine.ts`

Ajouter la fonction `onInvoiceCancelled` :

```typescript
/**
 * Contre-passation lors de l'annulation d'une facture et génération d'un avoir.
 * Annule exactement l'écriture de l'émission (Journal des Opérations Diverses).
 * Débit 70xxxx (Ventes), Débit 447200 (TVA), Crédit 411xxx (Client)
 */
export async function onInvoiceCancelled(invoiceId: string, tx: Tx): Promise<void> {
  try {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: { client: true, lines: true },
    });
    if (!invoice) return;

    const clientAccount = invoice.client?.accountingAccount ?? '411000';
    const { salesLines, taxLines } = buildSalesBreakdown(invoice.lines);

    const entryDate   = new Date();
    // Chercher un journal OD (Operations Diverses) ou fallback sur sales
    let journal = await tx.accountingJournal.findFirst({ where: { type: 'operations', isActive: true } });
    if (!journal) journal = await getDefaultJournal(tx, JournalType.sales);

    const period      = await getOpenPeriod(tx, entryDate);
    const entryNumber = await nextEntryNumber(tx, journal.code, entryDate);

    // Contre-passation = inversion exacte de l'écriture d'émission
    const counterLines = [
      // Crédit : annule la créance client
      { sortOrder: 0, accountNumber: clientAccount, label: `Avoir — Annulation FAC ${invoice.number}`, debit: 0, credit: Number(invoice.totalTtc) },
      // Débit : annule les ventes
      ...salesLines.map((l, i) => ({ ...l, sortOrder: i + 1, debit: l.credit, credit: 0 })),
      // Débit : annule la TVA collectée
      ...taxLines.map((l, i) => ({ ...l, sortOrder: salesLines.length + i + 1, debit: l.credit, credit: 0 })),
    ];

    await tx.journalEntry.create({
      data: {
        journalId:      journal.id,
        fiscalPeriodId: period.id,
        entryDate,
        accountingDate: entryDate,
        entryNumber,
        label:       `AVOIR sur FAC ${invoice.number} — ${invoice.client?.name ?? 'Client'}`,
        sourceType:  'invoice',
        sourceId:    invoice.id,
        totalDebit:  Number(invoice.totalTtc),
        totalCredit: Number(invoice.totalTtc),
        status:      'draft',
        lines: { create: counterLines },
      },
    });
  } catch {
    // Silencieux
  }
}
```

### Fichier à modifier : `src/modules/invoices/invoices.service.ts`

Dans la fonction `cancel()`, après la transaction, appeler `onInvoiceCancelled` :

```typescript
// Après le .then() existant qui gère la notification :
void prisma.$transaction((tx) => accountingEngine.onInvoiceCancelled(id, tx));
```

---

## ÉTAPE 5 — entryNumber atomique (sans race condition)

### Fichier à modifier : `src/lib/accountingEngine.ts`

Remplacer la fonction `nextEntryNumber` actuelle par une requête `SELECT MAX ... FOR UPDATE` :

```typescript
async function nextEntryNumber(tx: Tx, journalCode: string, date: Date): Promise<string> {
  const year   = date.getFullYear();
  const prefix = `${journalCode}-${year}-`;

  // MAX sur le numéro existant dans ce journal/année — atomique dans la transaction
  const last = await tx.journalEntry.findFirst({
    where: {
      journal:   { code: journalCode },
      entryDate: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) },
    },
    orderBy: { entryNumber: 'desc' },
    select:  { entryNumber: true },
  });

  let next = 1;
  if (last?.entryNumber) {
    const lastNum = parseInt(last.entryNumber.replace(prefix, ''), 10);
    if (!isNaN(lastNum)) next = lastNum + 1;
  }

  return `${prefix}${String(next).padStart(5, '0')}`;
}
```

**Note** : Cette implémentation est atomique car elle s'exécute dans la transaction Prisma (`tx`).
Deux transactions simultanées ne peuvent pas lire le même MAX car l'une sera bloquée
par le verrou de transaction jusqu'à ce que l'autre committe.

---

## ÉTAPE 6 — StockMovement à l'émission de facture (vente)

### Fichier à modifier : `src/modules/invoices/invoices.service.ts`

Dans la fonction `issue()`, après la mise à jour de la facture, créer les mouvements de stock
pour les produits avec `trackStock = true` :

```typescript
async issue(id: string, userId: string) {
  const invoice = await this.findById(id);
  // ... validations existantes ...

  // Charger les lignes avec les infos produit pour le stock
  const invoiceWithLines = await prisma.invoice.findUnique({
    where: { id },
    include: {
      lines: {
        include: { product: { select: { id: true, trackStock: true, stockQuantity: true, stockMinLevel: true } } },
      },
    },
  });

  const updated = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.update({
      where: { id },
      data: {
        status: 'issued',
        lastSentAt: new Date(),
        draftReminderLevel: 0,
        statusHistory: {
          create: { changedById: userId, previousStatus: 'draft', newStatus: 'issued' },
        },
      },
    });

    // Mouvements de stock pour les produits tracés (vente = sortie)
    for (const line of invoiceWithLines?.lines ?? []) {
      if (!line.product?.trackStock || !line.productId) continue;
      const qty         = -Number(line.quantity);  // négatif = sortie
      const qtyBefore   = Number(line.product.stockQuantity ?? 0);
      const qtyAfter    = qtyBefore + qty;

      await tx.stockMovement.create({
        data: {
          productId:      line.productId,
          type:           'sale' as any,
          quantity:       qty,
          unitCostHt:     Number(line.unitPriceHt),
          quantityBefore: qtyBefore,
          quantityAfter:  qtyAfter,
          sourceType:     'invoice',
          sourceId:       id,
          createdById:    userId,
        },
      });

      await tx.product.update({
        where: { id: line.productId },
        data:  { stockQuantity: qtyAfter },
      });

      const minLevel = Number(line.product.stockMinLevel ?? 0);
      if (minLevel > 0 && qtyAfter < minLevel) {
        void eventBus.emit('stock.low', { productId: line.productId, currentQty: qtyAfter, minLevel });
      }
    }

    return inv;
  });

  // ... reste du code existant (notifications, eventBus, accountingEngine) ...
  return updated;
}
```

**Important** : Ne pas supprimer les appels existants (broadcastNotification, eventBus.emit, accountingEngine).
Les intégrer dans la transaction si possible, ou les garder après avec `void`.

---

## ÉTAPE 7 — Vérification build final

```bash
cd bridge-backend
pnpm build
```

**Résultat attendu** : EXIT 0 — aucune erreur TypeScript.

Erreurs courantes à anticiper :
- `bankAccount` non inclus dans le type Payment → ajouter `include: { bankAccount: true }` dans la query
- `lines` non inclus dans Invoice → ajouter `include: { lines: { include: { product: true } } }`
- `accountingAccount` not found on Client → vérifier que l'étape 1 (Prisma generate) a été faite
- `JournalType.operations` n'existe pas → vérifier le nom exact dans le schéma Prisma

---

## RÉCAPITULATIF DES FICHIERS MODIFIÉS

| Étape | Fichiers | Ce qui change |
|-------|----------|---------------|
| 1 | `prisma/schema.prisma` | Ajout `accountingAccount` sur `Client` + `prisma generate` |
| 2 | `accountingEngine.ts` | Compte client dynamique, TVA par taux, ventes 701/706 |
| 2 | `accountingEngine.ts` | Banque dynamique via `payment.bankAccount.accountingAccount` |
| 3 | `accountingEngine.ts` | Compte fournisseur + banque dynamiques pour achats/paiements |
| 4 | `accountingEngine.ts` | Nouvelle fonction `onInvoiceCancelled` (contre-passation avoir) |
| 4 | `invoices.service.ts` | Appel `onInvoiceCancelled` dans `cancel()` |
| 5 | `accountingEngine.ts` | `nextEntryNumber` atomique via `findFirst + orderBy desc` |
| 6 | `invoices.service.ts` | `StockMovement` type `sale` dans `issue()` pour produits tracés |
| 7 | — | Vérification `pnpm build` → EXIT 0 |

---

## NOTES IMPORTANTES

### Sur les comptes auxiliaires (Sage-style)
Un compte auxiliaire comme `411ORANGE` pour le client Orange CM doit exister dans
`chart_of_accounts` pour que le grand livre soit cohérent. L'accountingEngine crée
l'écriture avec ce numéro, mais si le compte n'existe pas dans `chart_of_accounts`,
le grand livre ne pourra pas y associer un libellé. Pour l'instant, créer l'écriture
avec le numéro personnalisé suffit — la cohérence du plan comptable est gérée par
le module Comptabilité (chart route).

### Sur la TVA
BTS Cameroun utilise un seul taux TVA standard (19,25%) donc le compte `447200` est
toujours correct. Si des lignes ont `taxRate = 0` (exonérées), ne pas créer de ligne
TVA pour elles (déjà géré par `if (rate > 0)` dans `buildSalesBreakdown`).

### Sur le statut des écritures (`draft` vs `validated`)
Les écritures sont créées en `draft` intentionnellement pour permettre au comptable
de les vérifier avant validation. Ce comportement est correct pour une PME.
Ne pas changer en `validated` automatiquement.

### Sur la contra-passation de l'avoir
L'avoir est créé avec `status: 'issued'` dans `invoices.service.ts`. Son écriture
comptable (contre-passation) est générée par `onInvoiceCancelled` sur la facture
originale, pas sur l'avoir. C'est le comportement SYSCOHADA correct.

### Sur les imports à vérifier
Dans `accountingEngine.ts`, vérifier que `JournalType` contient bien `operations`
pour le journal OD. Si ce type n'existe pas, utiliser le journal `sales` en fallback.
Toujours lire le schéma Prisma avant d'implémenter.
