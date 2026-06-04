# Guide — Module Comptabilité SYSCOHADA

**InvoiceHub v2.0 — Bridge Technologies Solutions, Douala**

---

## Sommaire

1. [État des lieux](#1-état-des-lieux)
2. [Architecture générale](#2-architecture-générale)
3. [Phase 1 — Grand livre, Balance, Journaux](#3-phase-1--grand-livre-balance-journaux)
4. [Phase 2 — Lettrage et Rapprochement bancaire](#4-phase-2--lettrage-et-rapprochement-bancaire)
5. [Phase 3 — États financiers SYSCOHADA et TVA](#5-phase-3--états-financiers-syscohada-et-tva)
6. [Phase 4 — Clôture d'exercice](#6-phase-4--clôture-dexercice)
7. [Récapitulatif et planning](#7-récapitulatif-et-planning)

---

## 1. État des lieux

### Ce qui existe déjà

Le schéma de base de données est **entièrement en place** depuis le script SQL v3. L'`accountingEngine` génère automatiquement les écritures lors des événements métier.

**Tables DB disponibles**

| Table | Rôle |
|---|---|
| `chart_of_accounts` | Plan comptable SYSCOHADA (classes 1 à 9) |
| `accounting_journals` | Journaux JV, JA, JB, JC, OD |
| `journal_entries` | Écritures comptables (entête) |
| `journal_entry_lines` | Lignes d'écriture avec lettrage |
| `fiscal_periods` | Périodes fiscales mensuelles + annuelles |
| `bank_transactions` | Mouvements bancaires importés ou saisis |
| `bank_reconciliations` | Sessions de rapprochement bancaire |
| `tax_declarations` | Déclarations TVA |

**`accountingEngine.ts` — triggers déjà actifs**

```
onInvoiceIssued()    → écriture JV : 411xxx / 70xxx / 447200
onInvoiceCancelled() → contre-passation avoir
onExpensePaid()      → écriture JA/JB selon mode de paiement
```

### Ce qui manque

```
❌  Module NestJS  src/modules/accounting/   → aucune route API exposée
❌  Pages frontend /accounting/*             → aucune interface utilisateur
```

**L'objectif de ce guide** : construire le backend API et le frontend pour exposer ce qui est déjà en base de données.

---

## 2. Architecture générale

### Structure backend à créer

```
invoicehub-api/src/modules/accounting/
├── accounting.module.ts
├── accounting.service.ts          ← Grand livre, Balance
├── accounting.schema.ts           ← Validation Zod
├── accounting.controller.ts       ← GET /accounting/grand-livre, /balance
├── journals.controller.ts         ← GET/POST /accounting/journals/*
├── chart-of-accounts.controller.ts
├── fiscal-periods.controller.ts
├── lettering.controller.ts        ← POST /accounting/lettering/*
├── bank-reconciliation.controller.ts
├── reports.controller.ts          ← Bilan, Compte de résultat
├── tax.controller.ts              ← Déclarations TVA
└── closing.controller.ts          ← Clôture d'exercice
```

### Structure frontend à créer

```
bridge-frontend/src/
├── app/(dashboard)/accounting/
│   ├── page.tsx                   ← Dashboard comptable
│   ├── grand-livre/page.tsx
│   ├── balance/page.tsx
│   ├── balance-agee/page.tsx
│   ├── journaux/
│   │   ├── page.tsx
│   │   └── [code]/page.tsx
│   ├── lettrage/page.tsx
│   ├── rapprochement/page.tsx
│   ├── bilan/page.tsx
│   ├── compte-resultat/page.tsx
│   ├── tva/page.tsx
│   └── cloture/page.tsx
└── features/accounting/
    ├── api.ts
    ├── hooks.ts
    └── types.ts
```

### Enregistrement du module

Dans `app.module.ts`, ajouter `AccountingModule` dans les imports.

```typescript
// accounting.module.ts
@Module({
  imports: [PrismaModule],
  controllers: [
    AccountingController,
    JournalsController,
    ChartOfAccountsController,
    FiscalPeriodsController,
    LetteringController,
    BankReconciliationController,
    ReportsController,
    TaxController,
    ClosingController,
  ],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
```

---

## 3. Phase 1 — Grand livre, Balance, Journaux

**Durée estimée : 2 à 3 semaines**

### Objectif utilisateur

Le comptable peut :
- Consulter toutes les écritures d'un compte avec solde cumulé (grand livre)
- Voir la balance de tous les comptes sur une période donnée
- Parcourir les journaux JV, JA, JB, JC, OD entrée par entrée
- Créer une écriture manuelle (OD)

---

### 3.1 Backend

#### Endpoints `accounting.controller.ts`

**Grand livre**

```
GET /accounting/grand-livre
  Query : accountNumber (obligatoire), dateFrom, dateTo, page, limit
  Réponse :
  {
    account: { number, name },
    openingBalance: number,
    lines: [{ date, entryNumber, journalCode, label, debit, credit, runningBalance }],
    totalDebit: number,
    totalCredit: number,
    closingBalance: number,
    total: number,
    page: number,
    totalPages: number
  }
```

**Balance générale**

```
GET /accounting/balance
  Query : dateFrom, dateTo, class (1-9), onlyActive (boolean)
  Réponse : [{ accountNumber, name, debitTotal, creditTotal, solde, nature }]
```

**Balance âgée clients**

```
GET /accounting/balance-agee
  Query : accountNumber (ex: 411), dateRef
  Réponse : [{
    clientName, accountNumber,
    current: number,      // < 30 jours
    days30: number,       // 30 - 60 jours
    days60: number,       // 60 - 90 jours
    days90plus: number,   // > 90 jours
    total: number
  }]
```

---

#### Endpoints `journals.controller.ts`

```
GET    /accounting/journals
       → liste des journaux actifs

GET    /accounting/journals/:code/entries
       Query : fiscalPeriodId, page, limit, status
       → écritures du journal avec leurs lignes

GET    /accounting/journals/entries/:id
       → détail d'une écriture + lignes complètes

POST   /accounting/journals/entries
       @Permission('accounting:write')
       Body : { journalCode, entryDate, label, description?, lines[] }
       Règle : sum(debit) === sum(credit), sinon 400
       → crée une écriture draft + lignes

PUT    /accounting/journals/entries/:id/validate
       @Permission('accounting:validate')
       → passe status draft → validated
       Règle : écriture non modifiable après validation

DELETE /accounting/journals/entries/:id
       → soft-delete uniquement si status === 'draft'
```

---

#### Endpoints `chart-of-accounts.controller.ts`

```
GET  /accounting/chart-of-accounts
     Query : class, search, activeOnly
     → liste plate ou arbre hiérarchique (param tree=true)

GET  /accounting/chart-of-accounts/:number
     → détail du compte
```

---

#### Endpoints `fiscal-periods.controller.ts`

```
GET  /accounting/fiscal-periods
     Query : fiscalYear, status
     → liste des périodes avec status (open/closed/locked)

POST /accounting/fiscal-periods
     @Permission('accounting:admin')
     Body : { name, fiscalYear, periodType, startDate, endDate }
     → crée une période fiscale
```

---

#### Service — méthodes clés

```typescript
// accounting.service.ts

async getGrandLivre(params: {
  accountNumber: string
  dateFrom: Date
  dateTo: Date
  page: number
  limit: number
}): Promise<GrandLivreResult> {
  // 1. Solde d'ouverture = sum(debit) - sum(credit) sur les lignes
  //    dont accountingDate < dateFrom et entry.status = 'validated'
  // 2. Lignes de la période ordonnées par accountingDate ASC
  // 3. Calcul du solde courant cumulé ligne par ligne
  // 4. Pagination
}

async getBalance(params: {
  dateFrom: Date
  dateTo: Date
  classFilter?: number
}): Promise<BalanceLine[]> {
  // GROUP BY accountNumber sur journal_entry_lines
  // JOIN chart_of_accounts pour name + accountNature
  // WHERE entry.status = 'validated' AND date BETWEEN dateFrom AND dateTo
  // Calculer solde selon nature (débit_normal → solde = D - C, sinon C - D)
}

async createManualEntry(data: CreateJournalEntryInput, userId: string) {
  // 1. Vérifier sum(lines.debit) === sum(lines.credit)
  // 2. Vérifier que la période fiscale est 'open'
  // 3. Générer entryNumber via nextEntryNumber() de accountingEngine
  // 4. Créer JournalEntry + JournalEntryLine[] en transaction
}
```

---

### 3.2 Frontend

#### Maquette Grand livre

```
┌────────────────────────────────────────────────────────────────────┐
│  Compte  [411000 — Clients ▼]  Du [01/01/2026]  Au [31/05/2026]   │
│                                                       [Filtrer]    │
├──────────┬────────────┬──────────────────────────┬────────┬────────┤
│ Date     │ N° pièce   │ Libellé                  │  Débit │ Crédit │  Solde  │
├──────────┼────────────┼──────────────────────────┼────────┼────────┤
│          │            │ Solde d'ouverture         │        │        │       0 │
│ 12/01    │ JV-2026-001│ FAC001 — Client Dupont    │ 590 000│        │ 590 000 │
│ 22/01    │ JB-2026-004│ Encaissement FAC001       │        │ 590 000│       0 │
│ 18/02    │ JV-2026-012│ FAC008 — Client Martin    │ 250 000│        │ 250 000 │
├──────────┼────────────┼──────────────────────────┼────────┼────────┤
│ TOTAUX   │            │                           │ 840 000│ 590 000│ 250 000 │
└──────────┴────────────┴──────────────────────────┴────────┴────────┘
```

> **Note technique** : utiliser TanStack Virtual pour la virtualisation si > 500 lignes.

#### Maquette Balance

```
┌─────────────────────────────────────────────────────────────────────┐
│  Du [01/01/2026]  Au [31/05/2026]   Classe [Toutes ▼]  [Exporter]  │
├────────┬──────────────────────┬────────────┬────────────┬───────────┤
│ Compte │ Intitulé             │    Débit   │   Crédit   │   Solde   │
├────────┼──────────────────────┼────────────┼────────────┼───────────┤
│ 101000 │ Capital social       │            │ 50 000 000 │ 50 000 000│
│ 411000 │ Clients              │  8 500 000 │  6 000 000 │  2 500 000│
│ 401000 │ Fournisseurs         │  1 200 000 │  3 000 000 │  1 800 000│
│ 521000 │ Banque BGFI          │  5 200 000 │  3 400 000 │  1 800 000│
├────────┴──────────────────────┼────────────┼────────────┼───────────┤
│ TOTAL                         │ 14 900 000 │ 62 400 000 │           │
└───────────────────────────────┴────────────┴────────────┴───────────┘
```

Bouton **Exporter Excel** → librairie `xlsx` côté client, format `.xlsx`.

#### Maquette Journaux

```
Onglets : [JV — Ventes] [JA — Achats] [JB — Banque] [JC — Caisse] [OD — Divers]

┌──────────┬────────────┬──────────────────────────────┬──────────┬──────────┐
│ Date     │ N° pièce   │ Libellé                      │   Débit  │  Crédit  │
├──────────┼────────────┼──────────────────────────────┼──────────┼──────────┤
│ 12/01/26 │ JV-2026-001│ FAC001 BTS → Dupont          │  590 000 │  590 000 │
│ 25/01/26 │ JV-2026-002│ FAC002 BTS → Martin          │  250 000 │  250 000 │
└──────────┴────────────┴──────────────────────────────┴──────────┴──────────┘

→ Cliquer sur une ligne : affiche le détail des lignes de l'écriture
→ Bouton [+ Écriture OD] visible uniquement sur l'onglet OD
```

#### types.ts

```typescript
// features/accounting/types.ts

export interface GrandLivreLine {
  id:             string
  date:           string
  entryNumber:    string
  journalCode:    string
  label:          string
  debit:          number
  credit:         number
  runningBalance: number
  sourceType:     string | null
  sourceId:       string | null
}

export interface GrandLivreResult {
  account:        { number: string; name: string }
  openingBalance: number
  lines:          GrandLivreLine[]
  totalDebit:     number
  totalCredit:    number
  closingBalance: number
  total:          number
  page:           number
  totalPages:     number
}

export interface BalanceLine {
  accountNumber: string
  name:          string
  debitTotal:    number
  creditTotal:   number
  solde:         number
  nature:        'debit_normal' | 'credit_normal'
}

export interface JournalEntryLine {
  id:            string
  accountNumber: string
  accountName:   string
  label:         string
  debit:         number
  credit:        number
  letteringCode: string | null
  analyticAxis1: string | null
}

export interface JournalEntry {
  id:          string
  entryNumber: string
  entryDate:   string
  label:       string
  status:      'draft' | 'validated'
  totalDebit:  number
  totalCredit: number
  sourceType:  string | null
  lines:       JournalEntryLine[]
}
```

---

## 4. Phase 2 — Lettrage et Rapprochement bancaire

**Durée estimée : 2 à 3 semaines**

### Objectif utilisateur

- Cocher des lignes opposées sur un même compte tiers (ex : 411xxx) → elles reçoivent un code lettre (A, B, C…) et disparaissent de la balance âgée
- Importer un relevé bancaire CSV et pointer les mouvements contre les écritures comptables
- Clore le rapprochement quand le solde relevé = solde système

---

### 4.1 Backend — Lettrage

> **Note** : `nextLetteringCode()` est déjà implémentée dans `accountingEngine.ts`.

#### Endpoints `lettering.controller.ts`

```
GET  /accounting/lettering/:accountNumber
     Query : status (unlettered | lettered | all)
     → lignes JournalEntryLine avec info écriture parente (date, n° pièce)

POST /accounting/lettering/apply
     @Permission('accounting:write')
     Body : { lineIds: string[] }
     Règle :
       - Toutes les lignes doivent être sur le même accountNumber
       - sum(debit) === sum(credit) à 0,01 XAF près
       - Aucune ligne déjà lettrée
     → assigne letteringCode unique + letteredAt + letteredById

DELETE /accounting/lettering/:letteringCode/:accountNumber
       @Permission('accounting:write')
       → délettrage : remet letteringCode = null, letteredAt = null
         sur toutes les lignes qui portent ce code
```

#### Service — `applyLettering()`

```typescript
async applyLettering(lineIds: string[], userId: string) {
  const lines = await this.prisma.journalEntryLine.findMany({
    where: { id: { in: lineIds } },
    include: { journalEntry: { select: { status: true } } },
  })

  // Toutes les lignes sur le même compte
  const accounts = new Set(lines.map(l => l.accountNumber))
  if (accounts.size > 1)
    throw AppError.badRequest('Toutes les lignes doivent appartenir au même compte')

  // Lignes appartenant à des écritures validées uniquement
  const unvalidated = lines.filter(l => l.journalEntry.status !== 'validated')
  if (unvalidated.length > 0)
    throw AppError.badRequest('Seules les lignes d\'écritures validées peuvent être lettrées')

  // Équilibre débit/crédit
  const totalDebit  = lines.reduce((s, l) => s + Number(l.debit),  0)
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0)
  if (Math.abs(totalDebit - totalCredit) > 0.01)
    throw AppError.badRequest('Les lignes sélectionnées ne s\'équilibrent pas')

  const accountNumber = [...accounts][0]!
  const code = await this.getNextLetteringCode(accountNumber)  // réutilise accountingEngine

  await this.prisma.journalEntryLine.updateMany({
    where: { id: { in: lineIds } },
    data:  { letteringCode: code, letteredAt: new Date(), letteredById: userId },
  })

  return { code, lineCount: lineIds.length, accountNumber }
}
```

---

### 4.2 Backend — Rapprochement bancaire

#### Endpoints `bank-reconciliation.controller.ts`

```
GET  /accounting/bank-reconciliation
     Query : bankAccountId, status (in_progress | completed)
     → liste des sessions de rapprochement

POST /accounting/bank-reconciliation
     Body : { bankAccountId, periodStart, periodEnd, openingBalance }
     → crée une nouvelle session

GET  /accounting/bank-reconciliation/:id
     → session + transactions non pointées + écritures non pointées + delta

POST /accounting/bank-reconciliation/:id/match
     Body : { bankTransactionId, journalEntryLineId }
     → pointe une transaction contre une ligne d'écriture
     → met reconciliationStatus = 'reconciled' sur BankTransaction

POST /accounting/bank-reconciliation/:id/unmatch
     Body : { bankTransactionId }
     → dé-pointe

POST /accounting/bank-reconciliation/:id/auto-match
     → algorithme de suggestion :
         score = (montant identique ? 50pt) + (date ±3j ? 30pt) + (libellé similaire ? 20pt)
     → retourne suggestions[] triées par score décroissant, sans modifier la DB

POST /accounting/bank-reconciliation/:id/close
     @Permission('accounting:validate')
     Règle : closingBalanceStatement === closingBalanceSystem (à 1 XAF près)
     → passe status = 'completed', completedAt, completedById
```

#### Service — algorithme d'auto-matching

```typescript
async autoMatch(reconciliationId: string) {
  const session = await this.prisma.bankReconciliation.findUnique(...)

  const [transactions, entryLines] = await Promise.all([
    this.prisma.bankTransaction.findMany({
      where: { bankAccountId: session.bankAccountId,
               reconciliationStatus: 'pending',
               transactionDate: { gte: session.periodStart, lte: session.periodEnd } }
    }),
    this.prisma.journalEntryLine.findMany({
      where: { account: { linkedBankAccountId: session.bankAccountId },
               journalEntry: { status: 'validated',
                               accountingDate: { gte: session.periodStart, lte: session.periodEnd } } }
    }),
  ])

  const suggestions = []
  for (const tx of transactions) {
    for (const line of entryLines) {
      let score = 0
      // Même montant
      if (Math.abs(Number(tx.amount) - Math.abs(Number(line.debit) - Number(line.credit))) < 1)
        score += 50
      // Date proche ±3 jours
      const daysDiff = Math.abs(tx.transactionDate.getTime() - new Date(line.journalEntry.accountingDate).getTime()) / 86400000
      if (daysDiff <= 3) score += 30
      // Libellé similaire (simpliste — peut être amélioré avec Levenshtein)
      if (tx.label.toLowerCase().includes(line.label.toLowerCase().slice(0, 10)))
        score += 20

      if (score >= 50) suggestions.push({ bankTransactionId: tx.id, journalEntryLineId: line.id, score })
    }
  }

  return suggestions.sort((a, b) => b.score - a.score)
}
```

---

### 4.3 Frontend

#### Maquette Lettrage

```
Compte  [411000 — Clients ▼]     Afficher  [Non lettrés ▼]

┌──────────────────────────────────────────────────────────────────────┐
│ ☐  15/01  JV-2026-001  FAC001 — Dupont SARL       Débit   590 000   │
│ ☐  22/01  JB-2026-004  Encaissement FAC001         Crédit  590 000   │
│                                                                      │
│ ☐  18/02  JV-2026-012  FAC008 — Martin & Fils      Débit   250 000   │
│ ☐  05/03  JB-2026-009  Encaissement FAC008         Crédit  250 000   │
└──────────────────────────────────────────────────────────────────────┘

  Sélectionné :  Débit  590 000 XAF   Crédit  590 000 XAF   ✓ Équilibré
                                                 [Lettrer la sélection]
```

**Règles UX :**
- Bouton "Lettrer" activé uniquement si débit sélectionné = crédit sélectionné
- Lignes lettrées affichées avec badge code lettre (A, B, C…) sur fond vert pâle
- Clic sur le badge → dé-lettrage avec confirmation

#### Maquette Rapprochement bancaire

```
Compte bancaire  [521000 — BGFI Douala ▼]   Période  [Mai 2026 ▼]   [Ouvrir]

╔══════════════════════════════╗   ╔══════════════════════════════════════╗
║  RELEVÉ BANCAIRE             ║   ║  ÉCRITURES COMPTABLES                ║
╠══════════════════════════════╣   ╠══════════════════════════════════════╣
║ ✅ 02/05  +1 500 000         ║ ← ║ ✅ 02/05  JB-2026-012  1 500 000     ║
║    Virement BTS              ║   ║    Encaissement FAC003               ║
╠══════════════════════════════╣   ╠══════════════════════════════════════╣
║ ⬜ 08/05  -320 000           ║   ║ ⬜ 08/05  JB-2026-015    320 000     ║
║    Loyer bureau              ║   ║    Règlement loyer mai               ║
╚══════════════════════════════╝   ╚══════════════════════════════════════╝

  ┌──────────────────────────────────────────────────────────────────┐
  │  Solde relevé bancaire   :   2 850 000 XAF                       │
  │  Solde système comptable :   2 850 000 XAF                       │
  │  Écart                   :           0 XAF  ✓                    │
  └──────────────────────────────────────────────────────────────────┘
                                        [Clore le rapprochement]
```

---

## 5. Phase 3 — États financiers SYSCOHADA et TVA

**Durée estimée : 3 à 4 semaines**

### Objectif utilisateur

- Générer le **Bilan** SYSCOHADA actif/passif à une date donnée
- Générer le **Compte de résultat** sur un exercice
- Préparer et exporter la **déclaration TVA mensuelle** (format DGI Cameroun)
- Consulter et soumettre l'historique des déclarations

---

### 5.1 Correspondances comptes SYSCOHADA

#### Bilan Actif

| Rubrique | Comptes SYSCOHADA |
|---|---|
| Immobilisations incorporelles | 21xxxx |
| Immobilisations corporelles | 22xxxx à 24xxxx |
| Immobilisations financières | 26xxxx, 27xxxx |
| Stocks et en-cours | 31xxxx à 38xxxx |
| Créances clients | 411xxx (solde débiteur) |
| Autres créances | 40xxxx (hors 401), 48xxxx |
| Trésorerie | 52xxxx, 57xxxx |

#### Bilan Passif

| Rubrique | Comptes SYSCOHADA |
|---|---|
| Capital social | 101xxx |
| Réserves | 111xxx à 119xxx |
| Report à nouveau | 121xxx, 129xxx |
| Résultat de l'exercice | 130xxx |
| Emprunts long terme | 16xxxx |
| Dettes fournisseurs | 401xxx (solde créditeur) |
| Dettes fiscales | 44xxxx |
| Dettes sociales | 42xxxx, 43xxxx |

#### Compte de résultat

| Rubrique | Comptes | Nature |
|---|---|---|
| Chiffre d'affaires | 70xxxx | Crédit (produit) |
| Production stockée | 73xxxx | Crédit |
| Achats consommés | 60xxxx | Débit (charge) |
| Services extérieurs | 61xxxx, 62xxxx | Débit |
| Impôts et taxes | 64xxxx | Débit |
| Charges de personnel | 66xxxx | Débit |
| Dotations amortissements | 68xxxx | Débit |
| Produits financiers | 77xxxx | Crédit |
| Charges financières | 67xxxx | Débit |
| Produits exceptionnels | 78xxxx | Crédit |
| Charges exceptionnelles | 69xxxx | Débit |

---

### 5.2 Backend

#### Endpoints `reports.controller.ts`

```
GET /accounting/reports/bilan
    Query : dateRef (ex: 2026-12-31)
    Réponse :
    {
      actif: {
        immobilisations: { incorporelles, corporelles, financieres, total }
        actifCirculant:  { stocks, creancesClients, autresCreances, tresorerie, total }
        totalActif:      number
      },
      passif: {
        capitauxPropres: { capital, reserves, reportANouveau, resultat, total }
        dettesLT:        { emprunts, total }
        detesCT:         { fournisseurs, fiscales, sociales, autresDettes, total }
        totalPassif:     number
      },
      isBalanced: boolean,   // totalActif === totalPassif
      dateRef: string
    }

GET /accounting/reports/compte-resultat
    Query : dateFrom, dateTo
    Réponse :
    {
      produits: [{ label, accountRange, amount }]
      charges:  [{ label, accountRange, amount }]
      resultatExploitation: number
      resultatFinancier:    number
      resultatAvantIS:      number
      is:                   number
      resultatNet:          number
      periode:              { from, to }
    }
```

#### Endpoints `tax.controller.ts`

```
GET  /accounting/tax/declarations
     Query : year, status
     → liste des déclarations avec montants

POST /accounting/tax/declarations
     @Permission('accounting:write')
     Body : { periodStart, periodEnd }
     → calcule TVA depuis les écritures (447200 - 447100)
     → crée TaxDeclaration avec status = 'draft'

GET  /accounting/tax/declarations/:id
     → détail avec lignes TVA et montant net

POST /accounting/tax/declarations/:id/submit
     @Permission('accounting:validate')
     → passe status = 'submitted', génère référence

GET  /accounting/tax/declarations/:id/export
     Query : format (pdf | excel)
     → télécharger le formulaire formaté DGI Cameroun
```

#### Service — calcul TVA

```typescript
async computeTaxDeclaration(periodStart: Date, periodEnd: Date) {
  const dateFilter = { gte: periodStart, lte: periodEnd }

  const [collected, deductible] = await Promise.all([
    // TVA collectée = mouvements crédit sur 447200
    this.prisma.journalEntryLine.aggregate({
      where: {
        accountNumber: { startsWith: '447200' },
        journalEntry: { status: 'validated', accountingDate: dateFilter },
      },
      _sum: { credit: true },
    }),
    // TVA déductible = mouvements débit sur 447100
    this.prisma.journalEntryLine.aggregate({
      where: {
        accountNumber: { startsWith: '447100' },
        journalEntry: { status: 'validated', accountingDate: dateFilter },
      },
      _sum: { debit: true },
    }),
  ])

  const tvaCollected  = Number(collected._sum.credit  ?? 0)
  const tvaDeductible = Number(deductible._sum.debit  ?? 0)
  const tvaNet        = tvaCollected - tvaDeductible

  return {
    tvaCollected,
    tvaDeductible,
    tvaNet,
    tvaCredit:  tvaNet < 0 ? Math.abs(tvaNet) : 0,  // crédit reportable
    tvaPayable: tvaNet > 0 ? tvaNet            : 0,  // montant à verser DGI
    periodStart,
    periodEnd,
  }
}
```

---

### 5.3 Frontend

#### Maquette Bilan

```
┌─ BILAN AU 31/12/2026 ──────────────────────────────────────────────────────┐
│                    ACTIF                  │           PASSIF                │
├───────────────────────────────────────────┼────────────────────────────────┤
│ ACTIF IMMOBILISÉ          15 000 000      │ CAPITAUX PROPRES               │
│   Immob. incorporelles     2 500 000      │   Capital social    50 000 000  │
│   Immob. corporelles      12 500 000      │   Réserves           3 000 000  │
│                                           │   Résultat N         8 500 000  │
│ ACTIF CIRCULANT           18 700 000      │                     61 500 000  │
│   Stocks                   5 000 000      │                                 │
│   Créances clients         8 500 000      │ DETTES LONG TERME               │
│   Trésorerie               5 200 000      │   Emprunts           5 200 000  │
│                                           │                                 │
│                                           │ DETTES COURT TERME              │
│                                           │   Fournisseurs       4 500 000  │
│                                           │   Fiscales           2 500 000  │
│                                           │                     12 200 000  │
├───────────────────────────────────────────┼────────────────────────────────┤
│ TOTAL ACTIF               33 700 000      │ TOTAL PASSIF        33 700 000  │
└───────────────────────────────────────────┴────────────────────────────────┘
                  [Exporter PDF]   [Exporter Excel]
```

#### Maquette Déclaration TVA

```
┌─ DÉCLARATION TVA — MAI 2026 ───────────────────────────────────────────────┐
│                                                                             │
│  TVA collectée        (compte 447200)   +  1 850 000 XAF                   │
│  TVA déductible       (compte 447100)   -    320 000 XAF                   │
│  ─────────────────────────────────────────────────────────────────────────  │
│  TVA nette                                 1 530 000 XAF                   │
│  Crédit du mois précédent               -          0 XAF                   │
│  ─────────────────────────────────────────────────────────────────────────  │
│  MONTANT À VERSER À LA DGI              =  1 530 000 XAF                   │
│                                                                             │
│  Date limite de daiement : 15/06/2026                                      │
│                                                                             │
│  Statut : [BROUILLON]                                                       │
│                                                                             │
│  [Sauvegarder]    [Soumettre]    [Exporter PDF DGI]    [Exporter Excel]    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Phase 4 — Clôture d'exercice

**Durée estimée : 1 à 2 semaines**

### Objectif utilisateur

- Fermer les périodes fiscales mensuelles une à une après vérification
- Lancer la simulation de clôture annuelle (prévisualisation des écritures sans modifier la DB)
- Exécuter la clôture : solde des comptes 6/7, génération de l'écriture résultat (130xxx), report à nouveau N+1
- Verrouiller définitivement l'exercice N

---

### 6.1 Logique de clôture SYSCOHADA

```
Étape 1 — Vérifications préalables
  Toutes les périodes mensuelles au status 'closed'
  Toutes les déclarations TVA soumises
  Tous les rapprochements bancaires clôturés
  Aucune écriture au status 'draft'

Étape 2 — Calcul du résultat
  Produits (70xxx à 79xxx) : sum crédit - sum débit
  Charges  (60xxx à 69xxx) : sum débit  - sum crédit
  Résultat net = Produits - Charges

Étape 3 — Écriture de clôture (OD de résultat)
  Si bénéfice (résultat > 0) :
    Débit  130100 Résultat en cours     pour le montant
    Crédit 130200 Bénéfice net          pour le montant

  Si perte (résultat < 0) :
    Débit  130200 Perte nette           pour |résultat|
    Crédit 130100 Résultat en cours     pour |résultat|

  Les comptes 60xxx à 79xxx sont soldés via leurs contre-écritures

Étape 4 — Création des périodes N+1
  12 périodes mensuelles créées automatiquement pour l'année N+1

Étape 5 — Verrouillage de N
  Toutes les FiscalPeriod de l'année N passent à status = 'locked'
  Aucune écriture ne peut plus être créée ou modifiée sur N
```

---

### 6.2 Backend

#### Endpoints `closing.controller.ts`

```
GET  /accounting/closing/status/:fiscalYear
     → état des vérifications préalables :
     {
       periodsOpen:          number,   // périodes encore ouvertes
       draftEntries:         number,   // écritures non validées
       pendingTaxDecl:       number,   // déclarations TVA non soumises
       openReconciliations:  number,   // rapprochements en cours
       canClose:             boolean   // true si tout à 0
     }

POST /accounting/closing/period/:periodId/close
     @Permission('accounting:validate')
     Prérequis : plus d'écriture draft dans la période
     → FiscalPeriod.status = 'closed'

POST /accounting/closing/year/:fiscalYear/preview
     → simule la clôture SANS écrire en DB
     Réponse :
     {
       resultatNet:    number,
       type:           'benefice' | 'perte',
       closingEntries: [{ accountNumber, label, debit, credit }],
       nextYearPeriods: [{ name, startDate, endDate }]
     }

POST /accounting/closing/year/:fiscalYear/execute
     @Permission('accounting:close')
     Exécuté en une seule $transaction Prisma :
       1. Crée l'écriture OD de résultat
       2. Crée les 12 périodes de l'exercice N+1
       3. Passe toutes les FiscalPeriod de N à status = 'locked'
     → { success: true, resultatNet, closedYear, openedYear }
```

#### Service — `executeYearClosing()` (squelette)

```typescript
async executeYearClosing(fiscalYear: number, userId: string) {
  // 1. Vérifications
  const status = await this.getClosingStatus(fiscalYear)
  if (!status.canClose) throw AppError.badRequest('Des vérifications préalables sont requises')

  return this.prisma.$transaction(async (tx) => {
    // 2. Calculer le résultat
    const { resultatNet } = await this.computeYearResult(tx, fiscalYear)

    // 3. Écriture OD de clôture
    const odJournal    = await getDefaultJournal(tx, 'OD')
    const lastPeriod   = await tx.fiscalPeriod.findFirst({ where: { fiscalYear, status: 'closed' }, orderBy: { endDate: 'desc' } })
    const entryNumber  = await nextEntryNumber(tx, odJournal.code, new Date(fiscalYear, 11, 31))

    await tx.journalEntry.create({
      data: {
        journalId:     odJournal.id,
        fiscalPeriodId: lastPeriod!.id,
        entryNumber,
        entryDate:     new Date(fiscalYear, 11, 31),
        accountingDate: new Date(fiscalYear, 11, 31),
        label:         `Clôture exercice ${fiscalYear}`,
        status:        'validated',
        totalDebit:    Math.abs(resultatNet),
        totalCredit:   Math.abs(resultatNet),
        createdById:   userId,
        lines: {
          create: resultatNet >= 0
            ? [
                { accountNumber: '130100', label: 'Résultat en cours', debit: resultatNet, credit: 0, sortOrder: 1 },
                { accountNumber: '130200', label: 'Bénéfice net',       debit: 0, credit: resultatNet, sortOrder: 2 },
              ]
            : [
                { accountNumber: '130200', label: 'Perte nette',        debit: Math.abs(resultatNet), credit: 0, sortOrder: 1 },
                { accountNumber: '130100', label: 'Résultat en cours',  debit: 0, credit: Math.abs(resultatNet), sortOrder: 2 },
              ],
        },
      },
    })

    // 4. Créer les périodes N+1
    const nextYear = fiscalYear + 1
    for (let month = 0; month < 12; month++) {
      const start = new Date(nextYear, month, 1)
      const end   = new Date(nextYear, month + 1, 0)
      await tx.fiscalPeriod.create({
        data: {
          name:        `${start.toLocaleString('fr-FR', { month: 'long' })} ${nextYear}`,
          fiscalYear:  nextYear,
          periodType:  'month',
          startDate:   start,
          endDate:     end,
          status:      'open',
          createdById: userId,
        },
      })
    }

    // 5. Verrouiller toutes les périodes de N
    await tx.fiscalPeriod.updateMany({
      where: { fiscalYear },
      data:  { status: 'locked', lockedAt: new Date(), lockedById: userId },
    })

    return { success: true, resultatNet, closedYear: fiscalYear, openedYear: nextYear }
  })
}
```

---

### 6.3 Frontend

#### Maquette Clôture

```
┌─ CLÔTURE EXERCICE 2026 ────────────────────────────────────────────────────┐
│                                                                             │
│  PÉRIODES MENSUELLES                                                        │
│  ✅ Janvier    Clôturé   ✅ Février    Clôturé   ✅ Mars       Clôturé     │
│  ✅ Avril      Clôturé   ⚠️  Mai        3 écritures non validées            │
│  🔒 Juin → Décembre   Non ouverts                                           │
│                                                                             │
│  VÉRIFICATIONS PRÉALABLES À LA CLÔTURE ANNUELLE                            │
│  ✅ Toutes les périodes clôturées                                           │
│  ✅ Déclarations TVA soumises                          (12/12)              │
│  ⚠️  Rapprochements bancaires                          (1 en cours)          │
│  ✅ Aucune écriture en brouillon                                            │
│                                                                             │
│  SIMULATION                                                                 │
│  Résultat net simulé :  + 8 450 000 XAF  (BÉNÉFICE)                        │
│  Écriture générée    :  OD-2026-XXX  —  Débit 130100 / Crédit 130200       │
│                                                                             │
│  [Voir le détail des écritures de clôture]                                 │
│                                                                             │
│  [Exécuter la clôture 2026 et ouvrir 2027]                                 │
│   ↑ Bouton désactivé tant que des vérifications sont en ⚠️                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Règles UX :**
- Le bouton "Exécuter" est désactivé tant que `canClose === false`
- Un modal de confirmation avec recap (résultat net + écritures) s'affiche avant l'exécution
- Action irréversible : l'exercice verrouillé ne peut plus être modifié

---

## 7. Récapitulatif et planning

### Vue d'ensemble

| Phase | Module | Priorité | Durée estimée |
|---|---|---|---|
| **1** | Grand livre + Balance + Journaux | Critique | 2 – 3 semaines |
| **2** | Lettrage + Rapprochement bancaire | Haute | 2 – 3 semaines |
| **3** | États SYSCOHADA + TVA | Haute | 3 – 4 semaines |
| **4** | Clôture d'exercice | Normale | 1 – 2 semaines |

**Total estimé : 8 à 12 semaines** en développement continu.

---

### Point de départ recommandé

Commencer par `GET /accounting/grand-livre`. C'est :
1. Le premier écran qu'un comptable ouvrira
2. La validation que l'`accountingEngine` écrit correctement dans `journal_entry_lines`
3. La brique qui permet de tester la qualité des données existantes avant de construire la balance et les états financiers

---

### Permissions RBAC à ajouter

```typescript
// À ajouter dans le seed roles :
'accounting:read'      // lecture grand livre, balance, journaux
'accounting:write'     // saisie manuelle OD, lettrage
'accounting:validate'  // validation écritures, clôture périodes
'accounting:close'     // clôture exercice annuel
'accounting:export'    // export PDF/Excel états financiers
```

---

### Dépendances techniques

| Besoin | Librairie recommandée |
|---|---|
| Export Excel | `xlsx` (npm) — côté frontend |
| Export PDF bilan/compte de résultat | `@nestjs/serve-static` + `puppeteer` ou `pdfmake` — côté backend |
| Virtualisation tableau grand livre | `@tanstack/react-virtual` — pour > 500 lignes |
| Import relevé bancaire CSV | Parser existant dans `src/lib/csv.ts` |

---

*Guide rédigé pour InvoiceHub v2.0 — Bridge Technologies Solutions, Douala, Cameroun.*
*Dernière mise à jour : mai 2026.*
