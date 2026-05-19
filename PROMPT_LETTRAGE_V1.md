# PROMPT — Implémentation du Lettrage Comptable
# InvoiceHub v3 — Bridge Technologies Solutions (BTS), Douala, Cameroun
# À suivre étape par étape, dans l'ordre exact défini ici.
# IMPORTANT : Toujours analyser le code actuel avant d'implémenter chaque étape.

---

## CONTEXTE GÉNÉRAL

**Projet** : InvoiceHub v3 — ERP complet SYSCOHADA pour BTS
**Stack** : Node.js + Express + TypeScript + Prisma + PostgreSQL + Redis + BullMQ
**Backend dir** : `D:/Bel/projets/BRIDGE/bridge-backend/`
**Build actuel** : ✅ Propre — `pnpm build` → EXIT 0

### C'est quoi le lettrage ?
Le lettrage consiste à relier dans le grand livre comptable une écriture de débit
(ex: facture client → débit 411000) avec son écriture de crédit correspondante
(ex: paiement → crédit 411000) via un même **code lettre** (A, B, C... AA, AB...).
Les lignes lettrées sont considérées "soldées". Les non lettrées = créances/dettes ouvertes.

### Fichiers de référence à lire AVANT chaque étape
- `bridge-backend/prisma/schema.prisma` — modèles JournalEntry, JournalEntryLine, ChartOfAccount
- `src/lib/accountingEngine.ts` — fonctions onInvoiceIssued, onPaymentReceived, onSupplierInvoiceValidated, onSupplierPaymentMade
- `src/modules/accounting/accounting.service.ts` — services existants
- `src/modules/accounting/accounting.controller.ts` — contrôleurs existants
- `src/modules/accounting/accounting.routes.ts` — routes existantes
- `src/modules/accounting/accounting.schema.ts` — schémas Zod existants

---

## RÈGLES ABSOLUES

1. **TypeScript strict** — `as any` uniquement pour les enums Prisma en dernier recours
2. **AppError** — toutes les erreurs métier via `AppError.notFound()`, `.badRequest()`, `.conflict()`
3. **Pas de `console.log`** — utiliser `logger` depuis `../../core/middleware/requestLogger` si besoin
4. **Prisma transactions** — toute opération multi-ligne dans `prisma.$transaction()`
5. **`pnpm build` doit rester propre** après chaque étape — vérifier avant de passer à la suivante
6. **Silencieux dans accountingEngine** — le lettrage auto ne bloque jamais l'opération métier (try/catch)
7. **Ne pas modifier** les fichiers autres que ceux listés dans chaque étape
8. **Pas de duplication** — ajouter dans les fichiers existants, ne pas créer de nouveaux modules

---

## ÉTAT ACTUEL — CE QUI EXISTE DÉJÀ

### Dans le schéma Prisma (champs déjà présents)
```prisma
model JournalEntryLine {
  letteringCode  String?    @map("lettering_code") @db.VarChar(20)  // ✅ existe
  letteredAt     DateTime?  @map("lettered_at") @db.Timestamptz()   // ✅ existe
  letteredById   String?    @map("lettered_by") @db.Uuid            // ✅ existe
  letteredBy     User?      @relation(...)                          // ✅ existe
}

model ChartOfAccount {
  allowsReconciliation Boolean @default(false) @map("allows_reconciliation") // ✅ existe
}
```

### Dans accountingEngine.ts (ce qui manque)
- `onInvoiceIssued` crée des lignes 411xxx avec `letteringCode: null` — ❌ jamais lettré
- `onPaymentReceived` crée des lignes 411xxx avec `letteringCode: null` — ❌ jamais lettré
- `onSupplierInvoiceValidated` crée des lignes 401xxx avec `letteringCode: null` — ❌ jamais lettré
- `onSupplierPaymentMade` crée des lignes 401xxx avec `letteringCode: null` — ❌ jamais lettré

### Dans accounting.routes.ts (routes existantes, ne pas modifier)
```
GET  /accounting/chart
POST /accounting/chart
PUT  /accounting/chart/:accountNumber
GET  /accounting/periods
POST /accounting/periods
POST /accounting/periods/:id/close
POST /accounting/periods/:id/lock
GET  /accounting/journals
POST /accounting/journals
GET  /accounting/entries
POST /accounting/entries
GET  /accounting/entries/:id
POST /accounting/entries/:id/validate
POST /accounting/entries/:id/lock
GET  /accounting/reports/balance
GET  /accounting/reports/ledger/:accountNumber
GET  /accounting/reports/export/sage
GET  /accounting/tax-declarations
POST /accounting/tax-declarations
GET  /accounting/tax-declarations/:id
POST /accounting/tax-declarations/:id/submit
```

---

## ÉTAPE 0 — ANALYSE PRÉALABLE (OBLIGATOIRE)

Avant toute modification, lire intégralement ces fichiers :
1. `prisma/schema.prisma` — vérifier les champs exacts de JournalEntryLine, JournalEntry, ChartOfAccount
2. `src/lib/accountingEngine.ts` — comprendre comment les écritures sont créées (sourceId, sourceType)
3. `src/modules/accounting/accounting.service.ts` — voir les fonctions existantes pour ne pas dupliquer
4. `src/modules/accounting/accounting.controller.ts` — voir le pattern handler existant
5. `src/modules/accounting/accounting.schema.ts` — voir le pattern Zod existant
6. `src/modules/accounting/accounting.routes.ts` — voir les routes et permissions existantes

---

## ÉTAPE 1 — Helper `nextLetteringCode` dans accountingEngine.ts

### Fichier à modifier : `src/lib/accountingEngine.ts`

Ajouter en haut du fichier (après la définition de `Tx`), la fonction qui génère
le prochain code de lettrage disponible pour un compte donné.

**Logique de génération** : A → B → ... → Z → AA → AB → ... → AZ → BA → ...
(identique à la numérotation Excel des colonnes)

```typescript
/**
 * Génère le prochain code de lettrage disponible pour un compte comptable.
 * Séquence : A → Z → AA → AZ → BA → ... (style colonnes Excel)
 * S'exécute dans la transaction pour être atomique.
 */
async function nextLetteringCode(tx: Tx, accountNumber: string): Promise<string> {
  const last = await tx.journalEntryLine.findFirst({
    where: {
      accountNumber,
      letteringCode: { not: null },
    },
    orderBy: { letteredAt: 'desc' },
    select: { letteringCode: true },
  });

  if (!last?.letteringCode) return 'A';

  // Incrémenter le code (style Excel : A→B, Z→AA, AZ→BA)
  const chars = last.letteringCode.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] < 'Z') {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join('');
    }
    chars[i] = 'A';
    i--;
  }
  return 'A' + chars.join('');
}
```

**Vérification** : `pnpm build` → EXIT 0

---

## ÉTAPE 2 — Lettrage automatique dans `onPaymentReceived`

### Fichier à modifier : `src/lib/accountingEngine.ts`

Après création de l'écriture de paiement dans `onPaymentReceived`, lettrer automatiquement
la ligne 411xxx du paiement avec la ligne 411xxx de la facture correspondante.

**Logique** :
1. Trouver le `JournalEntry` lié à la facture (`sourceType: 'invoice'`, `sourceId: invoice.id`)
2. Récupérer sa ligne dont `accountNumber` commence par '411' (compte client)
3. Récupérer la ligne 411 du paiement qu'on vient de créer
4. Si les deux existent et ne sont pas déjà lettrées → attribuer `nextLetteringCode`

```typescript
// À ajouter DANS le try{} de onPaymentReceived, après tx.journalEntry.create(...)

// Lettrage automatique 411 : lier la ligne facture et la ligne paiement
try {
  const invoiceId = payment.invoice?.id;
  if (invoiceId) {
    // Ligne 411 de l'écriture de la facture (débit)
    const invoiceEntry = await tx.journalEntry.findFirst({
      where: { sourceType: 'invoice', sourceId: invoiceId },
      include: { lines: true },
    });
    const invoiceLine = invoiceEntry?.lines.find(
      l => l.accountNumber.startsWith('411') && !l.letteringCode
    );

    // Ligne 411 de l'écriture de paiement qu'on vient de créer (crédit)
    const paymentEntry = await tx.journalEntry.findFirst({
      where: { sourceType: 'payment', sourceId: payment.id },
      include: { lines: true },
    });
    const paymentLine = paymentEntry?.lines.find(
      l => l.accountNumber.startsWith('411') && !l.letteringCode
    );

    if (invoiceLine && paymentLine) {
      const code = await nextLetteringCode(tx, invoiceLine.accountNumber);
      const now  = new Date();
      await tx.journalEntryLine.updateMany({
        where: { id: { in: [invoiceLine.id, paymentLine.id] } },
        data: { letteringCode: code, letteredAt: now },
      });
    }
  }
} catch {
  // Silencieux — le lettrage auto ne bloque pas l'encaissement
}
```

**Note** : Le `letteredById` n'est pas renseigné en automatique (pas de userId disponible
dans l'accountingEngine). Seul le lettrage manuel renseigne `letteredById`.

**Vérification** : `pnpm build` → EXIT 0

---

## ÉTAPE 3 — Lettrage automatique dans `onSupplierPaymentMade`

### Fichier à modifier : `src/lib/accountingEngine.ts`

Même logique que l'étape 2 mais pour les comptes 401xxx (fournisseurs).

```typescript
// À ajouter DANS le try{} de onSupplierPaymentMade, après tx.journalEntry.create(...)

// Lettrage automatique 401 : lier la ligne facture fournisseur et la ligne paiement
try {
  const supplierInvoiceId = payment.supplierInvoiceId;
  if (supplierInvoiceId) {
    const invEntry = await tx.journalEntry.findFirst({
      where: { sourceType: 'supplier_invoice', sourceId: supplierInvoiceId },
      include: { lines: true },
    });
    const invLine = invEntry?.lines.find(
      l => l.accountNumber.startsWith('401') && !l.letteringCode
    );

    const payEntry = await tx.journalEntry.findFirst({
      where: { sourceType: 'supplier_payment', sourceId: payment.id },
      include: { lines: true },
    });
    const payLine = payEntry?.lines.find(
      l => l.accountNumber.startsWith('401') && !l.letteringCode
    );

    if (invLine && payLine) {
      const code = await nextLetteringCode(tx, invLine.accountNumber);
      const now  = new Date();
      await tx.journalEntryLine.updateMany({
        where: { id: { in: [invLine.id, payLine.id] } },
        data: { letteringCode: code, letteredAt: now },
      });
    }
  }
} catch {
  // Silencieux
}
```

**Note** : Vérifier dans le schéma que `SupplierPayment` a bien un champ `supplierInvoiceId`.
Si le champ s'appelle différemment, adapter en conséquence.

**Vérification** : `pnpm build` → EXIT 0

---

## ÉTAPE 4 — Schémas Zod pour le lettrage manuel

### Fichier à modifier : `src/modules/accounting/accounting.schema.ts`

Ajouter à la fin du fichier :

```typescript
// ── Lettrage manuel ────────────────────────────────────────────────────────────

export const manualLetteringSchema = z.object({
  lineIds:       z.array(z.string().uuid()).min(2, 'Au moins 2 lignes requises'),
  accountNumber: z.string().min(3, 'Numéro de compte requis'),
});

export const deleteLetteringSchema = z.object({
  accountNumber: z.string().min(3, 'Numéro de compte requis'),
});

export const unletteredLinesSchema = z.object({
  accountNumber: z.string().min(3),
  dateFrom:      z.string().optional(),
  dateTo:        z.string().optional(),
  page:          z.coerce.number().int().min(1).default(1),
  limit:         z.coerce.number().int().min(1).max(200).default(50),
});

export type ManualLetteringInput   = z.infer<typeof manualLetteringSchema>;
export type DeleteLetteringInput   = z.infer<typeof deleteLetteringSchema>;
export type UnletteredLinesInput   = z.infer<typeof unletteredLinesSchema>;
```

**Vérification** : `pnpm build` → EXIT 0

---

## ÉTAPE 5 — Service lettrage manuel

### Fichier à modifier : `src/modules/accounting/accounting.service.ts`

Lire le fichier en entier d'abord pour comprendre le pattern existant (classe ou fonctions ?).
Ajouter les 3 fonctions suivantes en respectant le même pattern.

#### 5.1 — `letterLines` : lettrer manuellement N lignes

```typescript
export async function letterLines(
  input: ManualLetteringInput,
  userId: string,
): Promise<void> {
  const { lineIds, accountNumber } = input;

  // Vérifier que toutes les lignes existent et appartiennent au même compte
  const lines = await prisma.journalEntryLine.findMany({
    where: { id: { in: lineIds } },
    select: { id: true, accountNumber: true, debit: true, credit: true, letteringCode: true },
  });

  if (lines.length !== lineIds.length) {
    throw AppError.notFound('Une ou plusieurs lignes introuvables');
  }

  const wrongAccount = lines.find(l => l.accountNumber !== accountNumber);
  if (wrongAccount) {
    throw AppError.badRequest(
      `La ligne ${wrongAccount.id} appartient au compte ${wrongAccount.accountNumber}, pas ${accountNumber}`
    );
  }

  const alreadyLettered = lines.find(l => l.letteringCode);
  if (alreadyLettered) {
    throw AppError.conflict(
      `La ligne ${alreadyLettered.id} est déjà lettrée (${alreadyLettered.letteringCode})`
    );
  }

  // Vérifier l'équilibre débit/crédit (obligatoire pour un lettrage valide)
  const totalDebit  = lines.reduce((s, l) => s + Number(l.debit),  0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
  const diff = Math.abs(totalDebit - totalCredit);
  if (diff > 0.01) {
    throw AppError.badRequest(
      `Le lettrage n'est pas équilibré : débit ${totalDebit} ≠ crédit ${totalCredit} (écart ${diff})`
    );
  }

  await prisma.$transaction(async (tx) => {
    // Utiliser le helper nextLetteringCode (doit être accessible — voir note ci-dessous)
    const last = await tx.journalEntryLine.findFirst({
      where: { accountNumber, letteringCode: { not: null } },
      orderBy: { letteredAt: 'desc' },
      select: { letteringCode: true },
    });
    const code = generateNextCode(last?.letteringCode ?? null);
    const now  = new Date();

    await tx.journalEntryLine.updateMany({
      where: { id: { in: lineIds } },
      data:  { letteringCode: code, letteredAt: now, letteredById: userId },
    });
  });
}

// Helper local (à ajouter dans ce fichier — ne pas importer depuis accountingEngine)
function generateNextCode(lastCode: string | null): string {
  if (!lastCode) return 'A';
  const chars = lastCode.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] < 'Z') {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join('');
    }
    chars[i] = 'A';
    i--;
  }
  return 'A' + chars.join('');
}
```

#### 5.2 — `deleteLettring` : délettrer toutes les lignes d'un code

```typescript
export async function deleteLettering(
  code: string,
  accountNumber: string,
): Promise<void> {
  const lines = await prisma.journalEntryLine.findMany({
    where: { letteringCode: code, accountNumber },
    select: { id: true },
  });

  if (lines.length === 0) {
    throw AppError.notFound(`Aucune ligne lettrée avec le code "${code}" sur le compte ${accountNumber}`);
  }

  await prisma.journalEntryLine.updateMany({
    where: { letteringCode: code, accountNumber },
    data:  { letteringCode: null, letteredAt: null, letteredById: null },
  });
}
```

#### 5.3 — `getUnletteredLines` : lignes non lettrées d'un compte

```typescript
export async function getUnletteredLines(input: UnletteredLinesInput) {
  const { accountNumber, dateFrom, dateTo, page, limit } = input;
  const skip = (page - 1) * limit;

  const where: Prisma.JournalEntryLineWhereInput = {
    accountNumber,
    letteringCode: null,
    journalEntry: {
      ...(dateFrom || dateTo ? {
        entryDate: {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
        },
      } : {}),
    },
  };

  const [data, total] = await Promise.all([
    prisma.journalEntryLine.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: {
        journalEntry: {
          select: { entryNumber: true, entryDate: true, label: true, sourceType: true, sourceId: true },
        },
      },
    }),
    prisma.journalEntryLine.count({ where }),
  ]);

  const totalDebit  = data.reduce((s, l) => s + Number(l.debit),  0);
  const totalCredit = data.reduce((s, l) => s + Number(l.credit), 0);

  return { data, total, page, limit, totalPages: Math.ceil(total / limit), totalDebit, totalCredit, balance: totalDebit - totalCredit };
}
```

**Note** : Vérifier les imports nécessaires en haut du fichier (`Prisma` depuis `@prisma/client`,
`AppError`, et les types Zod nouvellement créés à l'étape 4).

**Vérification** : `pnpm build` → EXIT 0

---

## ÉTAPE 6 — Contrôleurs lettrage

### Fichier à modifier : `src/modules/accounting/accounting.controller.ts`

Lire le fichier en entier d'abord pour comprendre le pattern de gestion des erreurs
et de validation Zod utilisé dans les handlers existants. Respecter exactement ce pattern.

Ajouter les 3 handlers suivants :

```typescript
// ── Lettrage manuel ────────────────────────────────────────────────────────────

letterLines: async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = manualLetteringSchema.parse(req.body);
    await accountingService.letterLines(input, req.user!.id);
    res.status(200).json({ message: 'Lettrage effectué avec succès' });
  } catch (err) {
    next(err);
  }
},

deleteLettering: async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params;
    const { accountNumber } = deleteLetteringSchema.parse(req.body);
    await accountingService.deleteLettering(code, accountNumber);
    res.status(200).json({ message: 'Lettrage supprimé' });
  } catch (err) {
    next(err);
  }
},

getUnletteredLines: async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = unlettteredLinesSchema.parse(req.query);
    const result = await accountingService.getUnletteredLines(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
},
```

**Note** : Vérifier les imports en haut du fichier — ajouter les nouveaux schemas Zod
et les nouvelles fonctions du service si nécessaire.

**Vérification** : `pnpm build` → EXIT 0

---

## ÉTAPE 7 — Routes lettrage

### Fichier à modifier : `src/modules/accounting/accounting.routes.ts`

Lire le fichier en entier d'abord. Ajouter les routes lettrage APRÈS les routes existantes,
AVANT la ligne `export default router`.

```typescript
// ── Lettrage ──────────────────────────────────────────────────────────────────
router.get('/lettering/unlettered',       authorizePermission('accounting:read'),   ctrl.getUnletteredLines);
router.post('/lettering',                 authorizePermission('accounting:write'),  auditMiddleware('lettering', 'CREATE'), ctrl.letterLines);
router.delete('/lettering/:code',         authorizePermission('accounting:write'),  auditMiddleware('lettering', 'DELETE'), ctrl.deleteLettering);
```

**Ordre important** : La route `/lettering/unlettered` doit être AVANT `/lettering/:code`
pour éviter que Express interprète "unlettered" comme un paramètre `:code`.

**Vérification** : `pnpm build` → EXIT 0

---

## ÉTAPE 8 — Vérification build final

```bash
cd bridge-backend
pnpm build
```

**Résultat attendu** : EXIT 0 — aucune erreur TypeScript.

Erreurs courantes à anticiper :
- `supplierInvoiceId` inexistant sur `SupplierPayment` → vérifier le nom exact dans le schéma
- `Prisma` non importé dans accounting.service.ts → ajouter `import { Prisma } from '@prisma/client'`
- `manualLetteringSchema` non importé dans le controller → vérifier les imports
- `letteredById` n'accepte pas `null` → utiliser `letteredById: null as any` ou vérifier le schéma Prisma
- typo `unlettteredLinesSchema` (3 't') → corriger en `unlettered`

---

## RÉCAPITULATIF DES FICHIERS MODIFIÉS

| Étape | Fichier | Ce qui change |
|-------|---------|---------------|
| 0 | — | Lecture et analyse uniquement |
| 1 | `src/lib/accountingEngine.ts` | Ajout helper `nextLetteringCode()` |
| 2 | `src/lib/accountingEngine.ts` | Lettrage auto 411 dans `onPaymentReceived` |
| 3 | `src/lib/accountingEngine.ts` | Lettrage auto 401 dans `onSupplierPaymentMade` |
| 4 | `src/modules/accounting/accounting.schema.ts` | 3 nouveaux schémas Zod + types |
| 5 | `src/modules/accounting/accounting.service.ts` | `letterLines`, `deleteLettering`, `getUnletteredLines` + helper `generateNextCode` |
| 6 | `src/modules/accounting/accounting.controller.ts` | 3 nouveaux handlers |
| 7 | `src/modules/accounting/accounting.routes.ts` | 3 nouvelles routes lettrage |
| 8 | — | Vérification `pnpm build` → EXIT 0 |

---

## ENDPOINTS API RÉSULTANTS

```
POST   /api/accounting/lettering
  body: { lineIds: string[], accountNumber: string }
  → Lettrer manuellement N lignes (min 2) d'un même compte
  → Vérifie que débit total = crédit total (équilibre)
  → Vérifie qu'aucune ligne n'est déjà lettrée
  → Assigne le prochain code disponible (A, B... AA...)
  → Permission : accounting:write

DELETE /api/accounting/lettering/:code
  body: { accountNumber: string }
  → Supprimer le lettrage d'un code (délettrer toutes les lignes du code)
  → Remet letteringCode, letteredAt, letteredById à null
  → Permission : accounting:write

GET    /api/accounting/lettering/unlettered?accountNumber=411000&dateFrom=&dateTo=&page=1&limit=50
  → Lister les lignes non lettrées d'un compte avec pagination
  → Retourne aussi totalDebit, totalCredit, balance (solde non lettré)
  → Permission : accounting:read
```

---

## NOTES IMPORTANTES

### Sur le lettrage partiel
Un paiement partiel (ex: client paie 500 000 sur 1 000 000) génère une ligne 411 de 500 000.
L'écriture facture a une ligne 411 de 1 000 000. Les montants sont différents → **pas de lettrage auto**.
Le lettrage partiel se fait manuellement via l'API en sélectionnant les lignes concernées.
Le système ACCEPTE le lettrage même si débit ≠ crédit au niveau des lignes individuelles,
du moment que la SOMME des débits = SOMME des crédits sur l'ensemble des lignes sélectionnées.

### Sur l'équilibre du lettrage
Exemple valide (paiement groupé de 2 factures) :
```
Ligne 1 : FAC/001  Débit 411000  = 300 000
Ligne 2 : FAC/002  Débit 411000  = 200 000
Ligne 3 : Paiement Crédit 411000 = 500 000
Total débit = 500 000 = Total crédit → lettrage OK → code "A" attribué aux 3 lignes
```

### Sur la numérotation des codes
La séquence est par compte : le compte 411000 peut avoir A, B, C...
et le compte 401000 peut aussi avoir A, B, C... indépendamment.
Deux comptes différents peuvent avoir le même code lettre sans conflit.

### Sur la performance
Si un compte a beaucoup de lignes, `findFirst + orderBy letteredAt desc` est rapide
car `letteredAt` doit être indexé en production. Pour l'instant aucun index n'est
nécessaire au niveau du prompt — c'est une optimisation future.

### Sur la sécurité
Un utilisateur avec `accounting:write` peut lettrer/délettrer.
Un utilisateur avec `accounting:read` peut seulement voir les lignes non lettrées.
La permission `accounting:lock` (pour clôture de période) ne concerne pas le lettrage.

### Sur le lettrage auto dans accountingEngine
Le lettrage auto (étapes 2 et 3) ne fonctionne que si :
1. L'écriture comptable de la facture a déjà été créée (invoice issued)
2. Les deux écritures (facture + paiement) existent en DB au moment du lettrage
3. Les lignes 411/401 ne sont pas déjà lettrées (paiement partiel précédent)
Si une de ces conditions n'est pas remplie → silencieux, pas d'erreur.
