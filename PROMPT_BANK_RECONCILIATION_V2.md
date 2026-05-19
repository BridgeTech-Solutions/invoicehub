# PROMPT — Rapprochement Bancaire V2 : Import Professionnel + Algorithmes de Matching
# InvoiceHub v2.0 — Bridge Technologies Solutions (BTS)
# Niveau cible : équivalent Sage 50 / Odoo 17 / QuickBooks Enterprise

---

## RÈGLE ABSOLUE — À RESPECTER AVANT CHAQUE ÉTAPE

> **Lire INTÉGRALEMENT les fichiers concernés avant toute modification.**
> Ne jamais supposer le contenu d'un fichier. Ne jamais réécrire un fichier entier
> quand un Edit ciblé suffit. Vérifier `pnpm build` après chaque étape.
> Si une étape échoue au build, corriger avant de passer à la suivante.

---

## Contexte technique

- Backend : `bridge-backend/` — Node.js + Express + TypeScript + Prisma + PostgreSQL
- Jobs async : BullMQ + Redis (déjà en place dans `src/jobs/`)
- Module concerné : `src/modules/bank/`
- Upload fichiers : multer (déjà installé)

**Fichiers à lire AVANT de commencer quoi que ce soit :**
```
src/modules/bank/bank.service.ts
src/modules/bank/bank.controller.ts
src/modules/bank/bank.routes.ts
src/modules/bank/bank.schema.ts
src/app.ts                          ← pour enregistrer les nouvelles routes
src/jobs/queues.ts                  ← pour ajouter la queue d'import
src/jobs/workers.ts                 ← pour déclarer le worker d'import
prisma/schema.prisma                ← modèles BankAccount, BankTransaction,
                                       BankStatementImport, BankReconciliation
package.json                        ← dépendances disponibles
```

---

## PARTIE 1 — IMPORT DE RELEVÉ BANCAIRE PROFESSIONNEL (PIPELINE 6 PHASES)

### Problème fondamental : chaque banque a son propre format

> ⚠️ **AVERTISSEMENT IMPORTANT SUR LES PROFILS BANCAIRES**
>
> Aucune documentation publique officielle n'existe sur les formats CSV des banques
> camerounaises (Afriland, SCB, UBA, BICEC, Ecobank). La COBAC/BEAC ne standardise
> pas les formats d'export client. Les profils fournis dans `bank.profiles.ts` sont
> des **estimations basées sur les standards régionaux** (format FR pour banques
> francophones, format EN pour UBA) — ils ne sont PAS des formats vérifiés.
>
> **Conséquence sur l'implémentation** :
> - Les profils pré-configurés sont des SUGGESTIONS DE DÉPART, jamais des certitudes
> - Le système doit TOUJOURS proposer une correction manuelle du mapping détecté
> - Le profil réel confirmé par le comptable doit être sauvegardé et prend le dessus
> - L'interface doit clairement indiquer "Profil estimé — veuillez vérifier"
>
> **Stratégie de construction progressive** : à chaque import validé par un comptable,
> le profil confirmé est sauvegardé. Après 3+ validations du même profil sur un compte,
> il devient "vérifié" (`verified: true`). Les profils vérifiés s'affichent en premier
> dans la liste et sans avertissement.

Les banques camerounaises n'ont pas de format standard public. Les formats estimés
ci-dessous sont basés sur les pratiques régionales observées :

```
Afriland First Bank (estimé — banque francophone CEMAC) :
Date;Libellé;Débit;Crédit;Solde
15/04/2026;VIRT TOTAL PETROLEUM;500 000,00;;1 500 000,00

SCB Cameroun / Attijariwafa (estimé — groupe marocain) :
DATE OPERATION,LIBELLE,MONTANT,SENS,SOLDE PROGRESSIF
2026-04-15,VIREMENT TOTAL,500000.00,D,1500000.00

UBA Cameroun (estimé — confirmé pour UBA Ghana : export CSV/Excel disponible) :
Transaction Date | Description | Withdrawals | Deposits | Balance
Apr 15 2026 | TOTAL PETROLEUM | 500,000.00 | | 1,500,000.00

Ecobank Cameroun (estimé — banque panafricaine francophone) :
"Dt Opé";"Dt Val";"Libellé";"Réf";"Débit";"Crédit"
"15/04/26";"17/04/26";"VIRT TOTAL PETROLEUM";"REF001";"500000,00";""

Société Générale Cameroun (estimé — groupe français, format SG standard) :
Date opération;Date valeur;Libellé;Montant;Devise
15/04/2026;17/04/2026;VIRT TOTAL PETROLEUM;-500000.00;XAF
```

Problèmes à résoudre automatiquement :
- Noms de colonnes différents selon la banque
- Format de date : DD/MM/YYYY, YYYY-MM-DD, MMM DD YYYY, DD/MM/YY
- Montant : débit+crédit séparés, ou montant+sens (D/C), ou montant signé (négatif=débit)
- Séparateur numérique : "500 000,00" (FR) vs "500,000.00" (EN) vs "500000.00"
- Encodage : UTF-8, Windows-1252, UTF-16
- Délimiteur : ; , | tabulation
- Lignes à ignorer : totaux, en-têtes secondaires, lignes vides

### Architecture cible

```
Phase 1 — DETECT   → analyser le fichier, détecter format/banque/colonnes automatiquement
Phase 2 — PREVIEW  → retourner le mapping détecté pour validation humaine (sans écrire)
Phase 3 — PARSE    → parser avec le mapping confirmé, détecter erreurs et doublons
Phase 4 — CONFIRM  → le comptable valide l'aperçu → déclenche le traitement
Phase 5 — PROCESS  → créer en base (async BullMQ si > 200 lignes)
Phase 6 — ROLLBACK → annuler un import si besoin
```

Jamais de données créées en base avant la Phase 4 (confirmation humaine).
L'ancienne route `POST /bank/import` reste pour rétrocompatibilité mais est dépréciée.

---

### Étape 1 — Nouveau modèle Prisma : `contentHash` + `jobId` + `previewData`

**Avant de coder :**
1. Lire le modèle `BankTransaction` dans `prisma/schema.prisma`
   — identifier tous les champs existants : `source`, `importId`, `metadata`
2. Lire le modèle `BankStatementImport` dans `prisma/schema.prisma`
   — identifier `status`, `errorMessage`, `processedAt`, `nbMatched`, `nbUnmatched`
3. Lire le modèle `BankAccount` dans `prisma/schema.prisma`
   — confirmer la présence du champ `metadata Json`

**Modifications Prisma :**

Sur `BankTransaction`, ajouter après le champ `source` :
```prisma
contentHash   String?  @map("content_hash") @db.VarChar(64)
```
Hash SHA-256 (64 chars hex) pour déduplication absolue au niveau PostgreSQL.
Formule : `sha256(bankAccountId|date_YYYY-MM-DD|amount|type|normalize(label))`
`normalize` = toLowerCase().trim().replace(/\s+/g, ' ')

Sur `BankStatementImport`, ajouter après `errorMessage` :
```prisma
jobId         String?  @map("job_id") @db.VarChar(100)
previewData   Json?    @map("preview_data")
detectedFormat Json?   @map("detected_format")
```
- `jobId` : référence BullMQ pour les gros imports asynchrones
- `previewData` : résultat du parsing stocké temporairement avant confirmation
- `detectedFormat` : mapping colonnes détecté automatiquement (retourné au frontend)

Ajouter contrainte unique sur `BankTransaction` :
```prisma
@@unique([bankAccountId, contentHash], name: "uq_bank_transaction_hash")
```

Après modification : `pnpm prisma generate` → vérifier EXIT 0.

---

### Étape 2 — Bibliothèque de profils bancaires : estimés + appris

**Avant de coder :**
1. Vérifier dans `package.json` si `iconv-lite` est installé
2. Lire l'existant dans `bank.service.ts` : fonctions `parseCsvLine()` et `importCsv()`
3. Lire le modèle `BankAccount` dans `prisma/schema.prisma` — champ `metadata Json`

**Installation :**
```bash
pnpm add iconv-lite
```

**Nouveau modèle Prisma — `BankProfileOverride`** :

Les profils pré-configurés sont statiques dans le code. Les profils confirmés par les
comptables sont stockés en base pour survivre aux mises à jour du code.

Ajouter dans `prisma/schema.prisma` :
```prisma
model BankProfileOverride {
  id            String      @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  bankAccountId String      @unique @map("bank_account_id") @db.Uuid
  bankAccount   BankAccount @relation("BankProfileOverride", fields: [bankAccountId], references: [id], onDelete: Cascade)
  profileData   Json        @map("profile_data")   // mapping colonnes confirmé
  verifiedCount Int         @default(1) @map("verified_count")  // nb d'imports validés
  isVerified    Boolean     @default(false) @map("is_verified")  // true si verifiedCount >= 3
  createdById   String      @map("created_by") @db.Uuid
  createdBy     User        @relation("BankProfileCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedAt     DateTime    @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()
  createdAt     DateTime    @default(now()) @map("created_at") @db.Timestamptz()

  @@map("bank_profile_overrides")
}
```

Ajouter les relations inverses sur `BankAccount` et `User` (lire ces modèles avant).

Après ajout : `pnpm prisma generate` → vérifier EXIT 0.

**Créer `src/modules/bank/bank.profiles.ts`** :

Ce fichier contient les profils ESTIMÉS des banques connues de la zone CEMAC.
**Ces profils sont des points de départ, pas des vérités.**
Il ne doit JAMAIS contenir de logique métier — uniquement des données de configuration.

```typescript
export interface BankProfile {
  id: string;
  name: string;
  country: string;

  // ── Statut de fiabilité ──────────────────────────────────────────────────────
  source: 'estimated' | 'community' | 'verified';
  // 'estimated'  = profil supposé basé sur les standards régionaux (jamais testé)
  // 'community'  = profil soumis par un utilisateur, plausible mais non certifié
  // 'verified'   = confirmé par ≥3 imports réels validés par des comptables BTS
  verificationNote?: string;  // ex: "Basé sur format bancaire francophone standard CEMAC"

  fileFormat: 'csv' | 'ofx' | 'mt940';
  encoding: 'utf-8' | 'win1252' | 'iso-8859-1' | 'utf-16le';
  delimiter: ',' | ';' | '\t' | '|';
  dateFormat: string;
  numberFormat: {
    thousands: string;
    decimal: string;
  };
  columns: {
    date: string | string[];
    label: string | string[];
    debit?: string | string[];
    credit?: string | string[];
    amount?: string | string[];
    direction?: string | string[];
    reference?: string | string[];
    balanceAfter?: string | string[];
    valueDate?: string | string[];
  };
  directionValues?: {
    debit: string[];
    credit: string[];
  };
  amountSign?: 'negative-is-debit' | 'positive-is-credit';
  skipRowsContaining?: string[];
  skipFirstRows?: number;
  headerRow?: number;
}

export const BANK_PROFILES: BankProfile[] = [
  {
    id: 'afriland-first-bank-cmr',
    name: 'Afriland First Bank (Cameroun)',
    country: 'CM',
    source: 'estimated',
    verificationNote: 'Profil estimé — banque francophone CEMAC. Format non confirmé publiquement. À valider lors du premier import réel.',
    fileFormat: 'csv',
    encoding: 'win1252',
    delimiter: ';',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { thousands: ' ', decimal: ',' },
    columns: {
      date:         ['Date', 'DATE', 'Date Opération', 'Date Operation', 'Date Ope'],
      label:        ['Libellé', 'Libelle', 'LIBELLE', 'Motif', 'MOTIF'],
      debit:        ['Débit', 'Debit', 'DEBIT', 'Sortie', 'SORTIE'],
      credit:       ['Crédit', 'Credit', 'CREDIT', 'Entrée', 'Entree', 'ENTREE'],
      reference:    ['Référence', 'Reference', 'Réf', 'Ref', 'REF'],
      balanceAfter: ['Solde', 'SOLDE', 'Solde Progressif', 'SOLDE PROGRESSIF'],
    },
    skipRowsContaining: ['SOLDE ANCIEN', 'TOTAL MOUVEMENTS', 'REPORT', 'A NOUVEAU', 'ANCIEN SOLDE'],
  },
  {
    id: 'scb-cameroun',
    name: 'SCB Cameroun — Attijariwafa Bank',
    country: 'CM',
    source: 'estimated',
    verificationNote: 'Profil estimé — groupe Attijariwafa (Maroc). Format inspiré des exports Attijariwafa France. À valider.',
    fileFormat: 'csv',
    encoding: 'utf-8',
    delimiter: ',',
    dateFormat: 'YYYY-MM-DD',
    numberFormat: { thousands: '', decimal: '.' },
    columns: {
      date:         ['DATE OPERATION', 'DATE_OPERATION', 'date_operation', 'DATE', 'Date'],
      label:        ['LIBELLE', 'libelle', 'DESCRIPTION', 'Description'],
      amount:       ['MONTANT', 'montant', 'AMOUNT'],
      direction:    ['SENS', 'sens', 'TYPE', 'DR_CR', 'Nature'],
      balanceAfter: ['SOLDE PROGRESSIF', 'SOLDE', 'BALANCE', 'Solde'],
    },
    directionValues: {
      debit:  ['D', 'DB', 'DEBIT', 'DR', 'Débit'],
      credit: ['C', 'CR', 'CREDIT', 'Crédit'],
    },
  },
  {
    id: 'uba-cameroun',
    name: 'UBA Cameroun (United Bank for Africa)',
    country: 'CM',
    source: 'community',
    verificationNote: 'Export CSV confirmé pour UBA Ghana (guide officiel UBA 2021). UBA Cameroun suit probablement le même format groupe. À valider.',
    fileFormat: 'csv',
    encoding: 'utf-8',
    delimiter: '|',
    dateFormat: 'MMM DD YYYY',
    numberFormat: { thousands: ',', decimal: '.' },
    columns: {
      date:         ['Transaction Date', 'Date', 'VALUE DATE', 'Trans Date'],
      label:        ['Description', 'Narration', 'DESCRIPTION', 'Details'],
      debit:        ['Withdrawals', 'Debit', 'DR', 'DEBIT'],
      credit:       ['Deposits', 'Credit', 'CR', 'CREDIT'],
      balanceAfter: ['Balance', 'BALANCE', 'Running Balance', 'Ledger Balance'],
    },
    skipRowsContaining: ['Opening Balance', 'Closing Balance', 'Total', 'TOTAL'],
  },
  {
    id: 'ecobank-cameroun',
    name: 'Ecobank Cameroun',
    country: 'CM',
    source: 'estimated',
    verificationNote: 'Profil estimé — groupe Ecobank panafricain. Format inspiré du portail Ecobank Côte d\'Ivoire. À valider pour le Cameroun.',
    fileFormat: 'csv',
    encoding: 'win1252',
    delimiter: ';',
    dateFormat: 'DD/MM/YY',
    numberFormat: { thousands: '', decimal: ',' },
    columns: {
      date:         ['Dt Opé', 'Dt Ope', 'Date Opé', 'Date Ope', 'Date'],
      label:        ['Libellé', 'Libelle', 'Description', 'LIBELLE'],
      debit:        ['Débit', 'Debit', 'DEBIT'],
      credit:       ['Crédit', 'Credit', 'CREDIT'],
      reference:    ['Réf', 'Ref', 'Référence', 'Reference'],
      valueDate:    ['Dt Val', 'Date Val', 'Date Valeur', 'Valeur'],
    },
  },
  {
    id: 'sgc-cameroun',
    name: 'Société Générale Cameroun',
    country: 'CM',
    source: 'estimated',
    verificationNote: 'Profil estimé — groupe Société Générale France. Format identique au portail SG France (montant signé). À confirmer.',
    fileFormat: 'csv',
    encoding: 'utf-8',
    delimiter: ';',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { thousands: '', decimal: '.' },
    columns: {
      date:         ['Date opération', 'Date operation', 'Date', 'DATE'],
      label:        ['Libellé', 'Libelle', 'LIBELLE'],
      amount:       ['Montant', 'Amount', 'MONTANT'],
      valueDate:    ['Date valeur', 'Date Valeur', 'Valeur'],
    },
    amountSign: 'negative-is-debit',
    skipRowsContaining: ['Solde au', 'TOTAL', 'Ancien solde'],
  },
  {
    id: 'bicec-cameroun',
    name: 'BICEC — Banque Internationale du Cameroun',
    country: 'CM',
    source: 'estimated',
    verificationNote: 'Profil estimé — groupe BNP Paribas (BICEC = BNP Cameroun). Format inspiré du standard BNP francophone. À valider.',
    fileFormat: 'csv',
    encoding: 'win1252',
    delimiter: ';',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { thousands: ' ', decimal: ',' },
    columns: {
      date:         ['Date', 'DATE OPE', 'DATE OPERATION', 'Date Opé'],
      label:        ['Libellé', 'LIBELLE', 'MOTIF', 'Motif'],
      debit:        ['Débit', 'DEBIT', 'MONTANT DEBIT', 'Débit (XAF)'],
      credit:       ['Crédit', 'CREDIT', 'MONTANT CREDIT', 'Crédit (XAF)'],
      balanceAfter: ['Solde', 'SOLDE', 'Solde (XAF)'],
    },
    skipRowsContaining: ['SOLDE INITIAL', 'TOTAL', 'Solde au'],
  },
  {
    id: 'generic-fr',
    name: 'Format générique francophone (fallback)',
    country: '*',
    source: 'estimated',
    verificationNote: 'Profil générique basé sur le standard CSV francophone. Utilisé quand aucun profil spécifique ne correspond.',
    fileFormat: 'csv',
    encoding: 'utf-8',
    delimiter: ';',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { thousands: ' ', decimal: ',' },
    columns: {
      date:         ['date', 'Date', 'DATE'],
      label:        ['libelle', 'Libellé', 'libellé', 'label', 'description'],
      debit:        ['debit', 'Débit', 'débit', 'sortie'],
      credit:       ['credit', 'Crédit', 'crédit', 'entrée', 'entree'],
    },
  },
  {
    id: 'generic-en',
    name: 'Format générique anglophone (fallback)',
    country: '*',
    source: 'estimated',
    verificationNote: 'Profil générique basé sur le standard CSV anglophone. Utilisé pour les banques anglophones (UBA, Stanbic, Banque Atlantique anglophone).',
    fileFormat: 'csv',
    encoding: 'utf-8',
    delimiter: ',',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { thousands: ',', decimal: '.' },
    columns: {
      date:         ['Date', 'Transaction Date', 'Trans Date', 'VALUE DATE'],
      label:        ['Description', 'Narration', 'Details', 'Particulars'],
      debit:        ['Debit', 'Withdrawals', 'DR', 'Debit Amount'],
      credit:       ['Credit', 'Deposits', 'CR', 'Credit Amount'],
      balanceAfter: ['Balance', 'Running Balance', 'Ledger Balance'],
    },
  },
];

export function findProfileById(id: string): BankProfile | undefined {
  return BANK_PROFILES.find(p => p.id === id);
}

export function getVerifiedProfiles(): BankProfile[] {
  return BANK_PROFILES.filter(p => p.source === 'verified');
}

export function getProfilesByCountry(country: string): BankProfile[] {
  return BANK_PROFILES.filter(p => p.country === country || p.country === '*');
}
```

---

### Étape 3 — Moteur de détection automatique de format

**Avant de coder :**
1. Lire `bank.profiles.ts` (créé à l'étape 2) — structure complète de `BankProfile`
2. Vérifier dans `package.json` qu'`iconv-lite` est bien installé

**Créer `src/modules/bank/bank.parsers.ts`** :

Ce fichier contient toute la logique de parsing et de détection.

#### 3a — Décodage d'encodage

```typescript
import iconv from 'iconv-lite';
import crypto from 'crypto';

export function decodeBuffer(
  buffer: Buffer,
  hint: 'auto' | 'utf-8' | 'win1252' | 'iso-8859-1' | 'utf-16le' = 'auto'
): string {
  if (hint !== 'auto') return iconv.decode(buffer, hint);

  // BOM UTF-8 : EF BB BF
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.slice(3).toString('utf-8');
  }
  // BOM UTF-16 LE : FF FE
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return iconv.decode(buffer.slice(2), 'utf-16le');
  }
  // Essai UTF-8 — si caractères de remplacement → Windows-1252
  const utf8 = buffer.toString('utf-8');
  if (utf8.includes('\uFFFD')) return iconv.decode(buffer, 'win1252');
  return utf8;
}
```

#### 3b — Détection du délimiteur

```typescript
export function detectDelimiter(firstLine: string): ',' | ';' | '\t' | '|' {
  const counts = {
    ';': (firstLine.match(/;/g) ?? []).length,
    ',': (firstLine.match(/,/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
    '|': (firstLine.match(/\|/g) ?? []).length,
  };
  // Le délimiteur le plus fréquent gagne
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0]) as any;
}
```

#### 3c — Normalisation des noms de colonnes

```typescript
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // supprimer accents
    .replace(/[^a-z0-9\s]/g, '')                      // supprimer ponctuation
    .trim()
    .replace(/\s+/g, ' ');
}

// Dictionnaire universel de synonymes de colonnes
const COLUMN_SYNONYMS = {
  date: ['date', 'dt', 'date operation', 'date ope', 'transaction date',
         'date val', 'posting date', 'value date', 'dt ope'],
  label: ['libelle', 'label', 'description', 'detail', 'motif', 'objet',
          'narration', 'reference libelle', 'intitule'],
  debit: ['debit', 'montant debit', 'withdrawal', 'withdrawals', 'sortie',
          'charge', 'dr', 'mouvement debiteur'],
  credit: ['credit', 'montant credit', 'deposit', 'deposits', 'entree',
           'versement', 'cr', 'mouvement crediteur'],
  amount: ['montant', 'amount', 'valeur', 'mouvement'],
  direction: ['sens', 'type', 'dr cr', 'd c', 'nature', 'sens operation'],
  reference: ['reference', 'ref', 'numero', 'id', 'fitid', 'numero operation'],
  balanceAfter: ['solde', 'balance', 'solde progressif', 'running balance',
                 'solde apres', 'new balance'],
  valueDate: ['date valeur', 'date val', 'dt val', 'value date'],
};
```

#### 3d — Détection du format de date

```typescript
export type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY' |
                         'DD/MM/YY' | 'MMM DD YYYY' | 'DD-MMM-YYYY';

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  janv: 1, fevr: 2, mars: 3, avri: 4, mai: 5, juin: 6,
  juil: 7, aout: 8, sept: 9, octo: 10, nove: 11, dece: 12,
};

export function detectDateFormat(samples: string[]): DateFormat | null {
  const validSamples = samples.filter(s => s && s.trim().length > 0).slice(0, 5);
  if (validSamples.length === 0) return null;

  const formats: Array<{ fmt: DateFormat; regex: RegExp; parse: (m: RegExpMatchArray) => boolean }> = [
    {
      fmt: 'YYYY-MM-DD',
      regex: /^(\d{4})-(\d{2})-(\d{2})$/,
      parse: m => parseInt(m[1]!) >= 2000 && parseInt(m[2]!) <= 12 && parseInt(m[3]!) <= 31,
    },
    {
      fmt: 'DD/MM/YYYY',
      regex: /^(\d{2})\/(\d{2})\/(\d{4})$/,
      parse: m => parseInt(m[1]!) <= 31 && parseInt(m[2]!) <= 12 && parseInt(m[3]!) >= 2000,
    },
    {
      fmt: 'MM/DD/YYYY',
      regex: /^(\d{2})\/(\d{2})\/(\d{4})$/,
      parse: m => parseInt(m[1]!) <= 12 && parseInt(m[2]!) <= 31 && parseInt(m[3]!) >= 2000,
    },
    {
      fmt: 'DD/MM/YY',
      regex: /^(\d{2})\/(\d{2})\/(\d{2})$/,
      parse: m => parseInt(m[1]!) <= 31 && parseInt(m[2]!) <= 12,
    },
    {
      fmt: 'MMM DD YYYY',
      regex: /^([A-Za-z]{3,4})\s+(\d{1,2})\s+(\d{4})$/,
      parse: m => !!MONTH_NAMES[m[1]!.toLowerCase().slice(0, 4)],
    },
    {
      fmt: 'DD-MMM-YYYY',
      regex: /^(\d{2})-([A-Za-z]{3})-(\d{4})$/,
      parse: m => !!MONTH_NAMES[m[2]!.toLowerCase()],
    },
  ];

  for (const { fmt, regex, parse } of formats) {
    const matches = validSamples.filter(s => {
      const m = s.trim().match(regex);
      return m && parse(m);
    });
    if (matches.length >= Math.min(3, validSamples.length)) return fmt;
  }
  return null;
}
```

#### 3e — Détection du format numérique

```typescript
export interface NumberFormat { thousands: string; decimal: string; }

export function detectNumberFormat(samples: string[]): NumberFormat {
  const validSamples = samples
    .filter(s => s && s.trim().length > 0 && s.replace(/[\d.,\s]/g, '').length === 0)
    .slice(0, 10);

  // Compter les occurrences de chaque motif
  const hasSpace    = validSamples.some(s => /\d \d/.test(s));
  const hasCommaK   = validSamples.some(s => /\d,\d{3}/.test(s)); // virgule séparateur milliers
  const endsComma   = validSamples.some(s => /,\d{1,2}$/.test(s)); // virgule décimale
  const endsPoint   = validSamples.some(s => /\.\d{1,2}$/.test(s)); // point décimal

  if (hasSpace && endsComma)  return { thousands: ' ', decimal: ',' };  // FR : 500 000,00
  if (hasCommaK && endsPoint) return { thousands: ',', decimal: '.' };  // EN : 500,000.00
  if (endsComma && !hasCommaK) return { thousands: '', decimal: ',' };  // 500000,00
  return { thousands: '', decimal: '.' };                               // 500000.00 (défaut)
}

export function parseAmount(raw: string, fmt: NumberFormat): number {
  if (!raw || raw.trim() === '') return 0;
  let s = raw.trim().replace(/\s/g, '');
  if (fmt.thousands) s = s.split(fmt.thousands).join('');
  if (fmt.decimal === ',') s = s.replace(',', '.');
  return parseFloat(s) || 0;
}
```

#### 3f — Détection automatique complète : `detectCsvFormat()`

C'est la fonction centrale. Elle prend le contenu brut et retourne un mapping
complet avec un score de confiance pour chaque champ détecté.

```typescript
export interface DetectedFormat {
  delimiter: ',' | ';' | '\t' | '|';
  dateFormat: DateFormat | null;
  numberFormat: NumberFormat;
  encoding: string;
  columns: {
    date?:        { name: string; index: number; confidence: 'high' | 'medium' | 'low' };
    label?:       { name: string; index: number; confidence: 'high' | 'medium' | 'low' };
    debit?:       { name: string; index: number; confidence: 'high' | 'medium' | 'low' };
    credit?:      { name: string; index: number; confidence: 'high' | 'medium' | 'low' };
    amount?:      { name: string; index: number; confidence: 'high' | 'medium' | 'low' };
    direction?:   { name: string; index: number; confidence: 'high' | 'medium' | 'low' };
    reference?:   { name: string; index: number; confidence: 'high' | 'medium' | 'low' };
    balanceAfter?:{ name: string; index: number; confidence: 'high' | 'medium' | 'low' };
  };
  mode: 'debit-credit' | 'amount-direction' | 'signed-amount';
  matchedProfile: string | null;  // ID du profil banque si détecté
  overallConfidence: number;      // 0 à 100
  warnings: string[];             // avertissements non bloquants
}

export function detectCsvFormat(content: string, knownEncoding?: string): DetectedFormat {
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) throw new Error('Fichier trop court (moins de 2 lignes)');

  const delimiter = detectDelimiter(lines[0]!);
  const rawHeaders = lines[0]!.split(delimiter).map(h => h.replace(/^"|"$/g, '').trim());
  const normalizedHeaders = rawHeaders.map(normalizeHeader);

  // Extraire 5 lignes de données pour détecter les formats
  const sampleRows = lines.slice(1, 6).map(l =>
    l.split(delimiter).map(c => c.replace(/^"|"$/g, '').trim())
  );

  // --- Mapper les colonnes ---
  const columns: DetectedFormat['columns'] = {};
  const warnings: string[] = [];

  function findColumn(type: keyof typeof COLUMN_SYNONYMS) {
    const synonyms = COLUMN_SYNONYMS[type];
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const h = normalizedHeaders[i]!;
      // Match exact
      if (synonyms.includes(h)) {
        return { name: rawHeaders[i]!, index: i, confidence: 'high' as const };
      }
      // Match partiel (le header contient un synonyme)
      if (synonyms.some(s => h.includes(s) || s.includes(h))) {
        return { name: rawHeaders[i]!, index: i, confidence: 'medium' as const };
      }
    }
    return undefined;
  }

  columns.date        = findColumn('date');
  columns.label       = findColumn('label');
  columns.debit       = findColumn('debit');
  columns.credit      = findColumn('credit');
  columns.amount      = findColumn('amount');
  columns.direction   = findColumn('direction');
  columns.reference   = findColumn('reference');
  columns.balanceAfter = findColumn('balanceAfter');

  // --- Déterminer le mode montant ---
  let mode: DetectedFormat['mode'] = 'debit-credit';
  if (columns.debit && columns.credit) {
    mode = 'debit-credit';
  } else if (columns.amount && columns.direction) {
    mode = 'amount-direction';
  } else if (columns.amount) {
    // Vérifier si les montants sont signés (négatifs)
    const amountSamples = sampleRows.map(r => r[columns.amount!.index] ?? '');
    if (amountSamples.some(s => s.startsWith('-'))) {
      mode = 'signed-amount';
    } else {
      mode = 'amount-direction';
      warnings.push('Colonne de montant détectée sans colonne de sens — supposé crédit si positif');
    }
  }

  // --- Détecter le format de date ---
  const dateSamples = columns.date
    ? sampleRows.map(r => r[columns.date!.index] ?? '').filter(Boolean)
    : [];
  const dateFormat = detectDateFormat(dateSamples);
  if (!dateFormat && columns.date) {
    warnings.push(`Format de date non reconnu sur les valeurs : ${dateSamples.slice(0, 3).join(', ')}`);
  }

  // --- Détecter le format numérique ---
  const amountSamples = [columns.debit, columns.credit, columns.amount]
    .filter(Boolean)
    .flatMap(col => sampleRows.map(r => r[col!.index] ?? ''))
    .filter(s => s.length > 0);
  const numberFormat = detectNumberFormat(amountSamples);

  // --- Tenter de matcher un profil banque connu ---
  let matchedProfile: string | null = null;
  // (import BANK_PROFILES depuis bank.profiles.ts)
  for (const profile of BANK_PROFILES) {
    if (profile.delimiter !== delimiter) continue;
    const profileCols = Object.values(profile.columns).flat();
    const matchCount = rawHeaders.filter(h =>
      profileCols.some(pc =>
        normalizeHeader(typeof pc === 'string' ? pc : pc[0] ?? '')
          === normalizeHeader(h)
      )
    ).length;
    if (matchCount >= 3) { matchedProfile = profile.id; break; }
  }

  // --- Score de confiance global ---
  let score = 0;
  if (columns.date)  score += columns.date.confidence  === 'high' ? 25 : 15;
  if (columns.label) score += columns.label.confidence === 'high' ? 20 : 10;
  if (mode === 'debit-credit' && columns.debit && columns.credit) score += 30;
  if (mode === 'amount-direction' && columns.amount) score += 25;
  if (mode === 'signed-amount' && columns.amount) score += 20;
  if (dateFormat) score += 15;
  if (matchedProfile) score += 10;

  return {
    delimiter, dateFormat, numberFormat,
    encoding: knownEncoding ?? 'auto',
    columns, mode, matchedProfile,
    overallConfidence: Math.min(100, score),
    warnings,
  };
}
```

#### 3g — Parser de ligne CSV avec le format détecté

```typescript
export interface ParsedTransaction {
  date: Date;
  label: string;
  amount: number;
  type: 'debit' | 'credit';
  reference?: string;
  balanceAfter?: number;
  valueDate?: Date;
  rawLine: string;          // ligne brute pour le rapport d'erreur
  lineNumber: number;
}

export function parseLine(
  cols: string[],
  lineNumber: number,
  rawLine: string,
  fmt: DetectedFormat,
): ParsedTransaction | { error: string; lineNumber: number; rawLine: string } {

  // Date
  const rawDate = cols[fmt.columns.date?.index ?? -1]?.trim() ?? '';
  const date = parseDate(rawDate, fmt.dateFormat!);
  if (!date) return { error: `Date invalide : "${rawDate}"`, lineNumber, rawLine };

  // Libellé
  const label = (cols[fmt.columns.label?.index ?? -1] ?? '').trim();
  if (!label) return { error: 'Libellé vide', lineNumber, rawLine };

  // Montant selon le mode
  let amount = 0;
  let type: 'debit' | 'credit' = 'credit';

  if (fmt.mode === 'debit-credit') {
    const debitRaw  = parseAmount(cols[fmt.columns.debit?.index  ?? -1] ?? '', fmt.numberFormat);
    const creditRaw = parseAmount(cols[fmt.columns.credit?.index ?? -1] ?? '', fmt.numberFormat);
    if (debitRaw > 0)       { amount = debitRaw;  type = 'debit';  }
    else if (creditRaw > 0) { amount = creditRaw; type = 'credit'; }
    else return { error: 'Montant nul ou manquant', lineNumber, rawLine };

  } else if (fmt.mode === 'amount-direction') {
    amount = parseAmount(cols[fmt.columns.amount?.index ?? -1] ?? '', fmt.numberFormat);
    const dir = (cols[fmt.columns.direction?.index ?? -1] ?? '').trim().toUpperCase();
    type = ['D', 'DB', 'DEBIT', 'DR', 'OUT'].includes(dir) ? 'debit' : 'credit';
    if (amount <= 0) return { error: 'Montant nul ou manquant', lineNumber, rawLine };

  } else { // signed-amount
    const raw = parseAmount(cols[fmt.columns.amount?.index ?? -1] ?? '', fmt.numberFormat);
    if (raw === 0) return { error: 'Montant nul', lineNumber, rawLine };
    type   = raw < 0 ? 'debit' : 'credit';
    amount = Math.abs(raw);
  }

  const reference   = fmt.columns.reference   ? (cols[fmt.columns.reference.index]   ?? '').trim() || undefined : undefined;
  const balRaw      = fmt.columns.balanceAfter ? (cols[fmt.columns.balanceAfter.index] ?? '') : '';
  const balanceAfter = balRaw ? parseAmount(balRaw, fmt.numberFormat) || undefined : undefined;

  return { date, label, amount, type, reference, balanceAfter, rawLine, lineNumber };
}
```

#### 3h — Parsers OFX et MT940

```typescript
export function parseOfx(content: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  let lineNumber = 0;

  for (const block of blocks) {
    lineNumber++;
    const get = (tag: string) => block.match(new RegExp(`<${tag}>([^<\n]+)`, 'i'))?.[1]?.trim() ?? '';
    const dtposted = get('DTPOSTED');
    const trnamt   = parseFloat(get('TRNAMT').replace(',', '.'));
    const name     = get('NAME') || get('MEMO');
    const fitid    = get('FITID');

    const year = parseInt(dtposted.slice(0, 4));
    const month = parseInt(dtposted.slice(4, 6)) - 1;
    const day   = parseInt(dtposted.slice(6, 8));
    const date  = new Date(year, month, day);
    if (isNaN(date.getTime()) || isNaN(trnamt) || !name) continue;

    results.push({
      date, label: name, amount: Math.abs(trnamt),
      type: trnamt >= 0 ? 'credit' : 'debit',
      reference: fitid || undefined,
      rawLine: block.slice(0, 80), lineNumber,
    });
  }
  return results;
}

export function parseMt940(content: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith(':61:')) continue;

    const m = line.match(/:61:(\d{6})(\d{4})?(C|D)N?(\d+,\d{2})/);
    if (!m) continue;

    const yy = parseInt(m[1]!.slice(0, 2));
    const mm = parseInt(m[1]!.slice(2, 4)) - 1;
    const dd = parseInt(m[1]!.slice(4, 6));
    const date = new Date(yy < 50 ? 2000 + yy : 1900 + yy, mm, dd);
    const amount = parseFloat(m[4]!.replace(',', '.'));

    let label = '';
    if (lines[i + 1]?.startsWith(':86:')) { label = lines[i + 1]!.slice(4).trim(); i++; }

    results.push({
      date, label: label || 'Transaction MT940',
      amount, type: m[3] === 'C' ? 'credit' : 'debit',
      rawLine: line, lineNumber: i + 1,
    });
  }
  return results;
}
```

#### 3i — Dispatcher principal

```typescript
export type FileFormat = 'csv' | 'ofx' | 'mt940' | 'unknown';

export function detectFileFormat(filename: string, content: string): FileFormat {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'ofx' || ext === 'qfx') return 'ofx';
  if (ext === 'sta' || content.startsWith(':20:')) return 'mt940';
  if (content.includes('<OFX>') || content.includes('OFXHEADER:')) return 'ofx';
  return 'csv';
}

export function parseStatementFile(
  buffer: Buffer,
  filename: string,
  overrideFormat?: Partial<DetectedFormat>,
): {
  transactions: Array<ParsedTransaction | { error: string; lineNumber: number; rawLine: string }>;
  detectedFormat: DetectedFormat;
  fileFormat: FileFormat;
} {
  const content    = decodeBuffer(buffer);
  const fileFormat = detectFileFormat(filename, content);

  if (fileFormat === 'ofx') {
    const transactions = parseOfx(content);
    return { transactions, detectedFormat: {} as any, fileFormat };
  }
  if (fileFormat === 'mt940') {
    const transactions = parseMt940(content);
    return { transactions, detectedFormat: {} as any, fileFormat };
  }

  // CSV — détecter le format puis parser ligne par ligne
  const detectedFormat = { ...detectCsvFormat(content), ...overrideFormat };
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  const transactions = lines.slice(1).map((rawLine, idx) => {
    const lineNumber = idx + 2; // +2 car idx=0 = ligne 2 (après header)
    const cols = rawLine.split(detectedFormat.delimiter).map(c => c.replace(/^"|"$/g, '').trim());
    return parseLine(cols, lineNumber, rawLine, detectedFormat);
  });

  return { transactions, detectedFormat, fileFormat };
}
```

#### 3j — Hash de contenu pour déduplication

```typescript
export function computeContentHash(
  bankAccountId: string,
  date: Date,
  amount: number,
  type: string,
  label: string,
): string {
  const normalized = [
    bankAccountId,
    date.toISOString().slice(0, 10),
    amount.toFixed(2),
    type,
    label.toLowerCase().trim().replace(/\s+/g, ' '),
  ].join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 64);
}
```

---

### Étape 4 — Route de détection : `POST /bank/import/detect`

**Avant de coder :**
1. Lire `bank.controller.ts` — pattern des handlers existants
2. Lire `bank.routes.ts` — comment multer est utilisé
3. Lire `bank.parsers.ts` (créé à l'étape 3) — `parseStatementFile()` et `DetectedFormat`

**Ajouter dans `bank.service.ts`** — fonction `detectImportFormat()` :

```typescript
export async function detectImportFormat(
  buffer: Buffer,
  filename: string,
  bankAccountId: string,
) {
  const account = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, deletedAt: null }
  });
  if (!account) throw AppError.notFound('Compte bancaire introuvable');

  const { detectedFormat, fileFormat } = parseStatementFile(buffer, filename);

  // Lire le profil sauvegardé sur ce compte
  const savedConfig = (account.metadata as any)?.importConfig ?? {};

  // Prévisualiser les 3 premières lignes avec le format détecté
  const content = decodeBuffer(buffer);
  const previewLines = content.split(/\r?\n/).filter(l => l.trim()).slice(1, 4);

  return {
    fileFormat,
    detectedFormat,
    matchedProfile: detectedFormat.matchedProfile
      ? BANK_PROFILES.find(p => p.id === detectedFormat.matchedProfile)?.name
      : null,
    savedConfig,
    previewLines,
    overallConfidence: detectedFormat.overallConfidence,
    warnings: detectedFormat.warnings,
    // Ce que le frontend doit afficher pour correction manuelle si besoin :
    availableColumns: content.split(/\r?\n/)[0]
      ?.split(detectedFormat.delimiter)
      .map((h, i) => ({ index: i, name: h.trim() })) ?? [],
  };
}
```

**Ajouter dans `bank.controller.ts`** :
```typescript
export async function detectImportFormat(req, res, next) {
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) throw { statusCode: 400, message: 'Fichier requis' };
    const { bankAccountId } = z.object({ bankAccountId: z.string().uuid() }).parse(req.body);
    const data = await service.detectImportFormat(file.buffer, file.originalname, bankAccountId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
```

**Ajouter dans `bank.routes.ts`** :
```
POST /bank/import/detect   upload.single('file') → detectImportFormat  (bank:manage)
```

Cette route est appelée en premier par le frontend. Elle retourne le mapping détecté
et le comptable peut corriger avant d'appeler `/bank/import/parse`.

---

### Étape 5 — Phase PARSE + PREVIEW : `POST /bank/import/parse`

**Avant de coder :**
1. Lire `bank.service.ts` — fonction `importCsv()` existante en entier
2. Lire `bank.parsers.ts` — `parseStatementFile()` et `computeContentHash()`
3. Lire `bank.schema.ts` — schémas existants

**Modifier `bank.schema.ts`** — nouveaux schémas :

```typescript
export const parseImportSchema = z.object({
  bankAccountId:       z.string().uuid(),
  profileId:           z.string().optional(),          // profil banque connu
  // Surcharges manuelles du format détecté (optionnelles)
  delimiter:           z.enum([',', ';', '\t', '|']).optional(),
  dateFormat:          z.string().optional(),
  encoding:            z.enum(['auto', 'utf-8', 'win1252', 'iso-8859-1']).optional(),
  // Mapping colonnes manuel (si auto-détection insuffisante)
  dateColumnIndex:     z.coerce.number().int().optional(),
  labelColumnIndex:    z.coerce.number().int().optional(),
  debitColumnIndex:    z.coerce.number().int().optional(),
  creditColumnIndex:   z.coerce.number().int().optional(),
  amountColumnIndex:   z.coerce.number().int().optional(),
  directionColumnIndex: z.coerce.number().int().optional(),
  referenceColumnIndex: z.coerce.number().int().optional(),
  mode:                z.enum(['debit-credit', 'amount-direction', 'signed-amount']).optional(),
  openingBalance:      z.coerce.number().optional(),
  skipDuplicates:      z.boolean().default(true),
  saveAsProfile:       z.boolean().default(false),     // sauvegarder le mapping pour ce compte
});

export const confirmImportSchema = z.object({
  importId:             z.string().uuid(),
  applyAll:             z.boolean().default(true),
  selectedLineIndexes:  z.array(z.number().int()).optional(),
});
```

**Ajouter dans `bank.service.ts`** la fonction `parseImport()** :

1. Charger le compte bancaire — lire le `importConfig` dans `metadata`
2. Appeler `parseStatementFile(buffer, filename, overrideFormat)` en appliquant :
   - Le profil banque si `profileId` fourni
   - Les surcharges manuelles du schéma
   - Le `importConfig` sauvegardé comme fallback
3. Séparer les résultats en `valid`, `errors`
4. Pour les lignes valides : calculer `contentHash` et détecter les doublons
   en chargeant les transactions existantes sur la période en UNE SEULE requête
5. Calculer `balanceAfter` cumulatif si `openingBalance` fourni
6. Si `saveAsProfile = true` : mettre à jour `BankAccount.metadata.importConfig`
7. Créer un `BankStatementImport` avec `status = 'preview'`, stocker dans `previewData`
8. Retourner le rapport de preview complet (voir structure dans Partie 1 — Architecture)

---

### Étape 6 — Phase CONFIRM + PROCESS asynchrone

**Avant de coder :**
1. Lire `src/jobs/queues.ts` — comment déclarer une nouvelle queue BullMQ
2. Lire `src/jobs/workers.ts` — comment déclarer un worker
3. Lire `bank.service.ts` — fonction `parseImport()` de l'étape 5

**Créer `src/jobs/processors/bank-import.processor.ts`** :

```typescript
import { Job } from 'bullmq';
import { prisma } from '../../config/database';

export async function processBankImportJob(job: Job) {
  const { importId, lines, bankAccountId } = job.data;
  let imported = 0;

  await prisma.$transaction(async (tx) => {
    // Insérer par batch de 100 pour ne pas saturer la transaction
    for (let i = 0; i < lines.length; i += 100) {
      const batch = lines.slice(i, i + 100);
      await tx.bankTransaction.createMany({
        data: batch,
        skipDuplicates: true, // contrainte unique contentHash
      });
      imported += batch.length;
      await job.updateProgress(Math.round((imported / lines.length) * 100));
    }

    const net = lines.reduce((s: number, t: any) =>
      s + (t.type === 'credit' ? Number(t.amount) : -Number(t.amount)), 0);

    await tx.bankAccount.update({
      where: { id: bankAccountId },
      data:  { currentBalance: { increment: net } },
    });
    await tx.bankStatementImport.update({
      where: { id: importId },
      data:  { status: 'completed', nbTransactions: imported, processedAt: new Date() },
    });
  });
}
```

Déclarer dans `src/jobs/queues.ts` :
```typescript
export const bankImportQueue = new Queue('bank-import', { connection: redisConnection });
```

Déclarer dans `src/jobs/workers.ts` :
```typescript
new Worker('bank-import', processBankImportJob, { connection: redisConnection, concurrency: 2 });
```

**Ajouter dans `bank.service.ts`** — `confirmImport()` :

- Si lignes ≤ 200 → traitement synchrone dans `prisma.$transaction`
- Si lignes > 200 → `bankImportQueue.add(...)`, retourner `{ status: 'processing', jobId }`

---

### Étape 7 — Phase STATUS + ROLLBACK

**Ajouter dans `bank.service.ts`** :

`getImportStatus(importId)` :
- Charger `BankStatementImport`
- Si `jobId` présent → interroger BullMQ : `const job = await bankImportQueue.getJob(jobId)`
- Retourner `{ status, progress, nbImported, nbSkipped }`

`rollbackImport(importId)` :
- Vérifier qu'aucune transaction de cet import n'est déjà rapprochée
- Calculer le delta inverse (crédits deviennent débits et vice-versa)
- `deleteMany({ where: { importId } })` + `update currentBalance` dans une transaction
- Mettre `status = 'cancelled'` sur le `BankStatementImport`

**Routes :**
```
GET    /bank/import/:id/status   → getImportStatus
DELETE /bank/import/:id          → rollbackImport  (auditMiddleware)
```

---

### Étape 8 — Profil de mapping sauvegardé par compte

**Avant de coder :**
1. Lire `bank.service.ts` — `updateAccount()` et `getAccountById()`
2. Lire le modèle `BankAccount` dans `prisma/schema.prisma` — champ `metadata`

**Modifier `updateAccount()`** : si `importConfig` fourni dans le body,
le merger dans `metadata` sans écraser les autres clés.

**Nouvelle fonction `getImportConfig(accountId)`** : retourne le profil sauvegardé
fusionné avec les valeurs par défaut.

**Routes :**
```
GET /bank/accounts/:id/import-config   → getImportConfig
```

---

### Étape 9 — Toutes les nouvelles routes dans controller + routes

**Avant de coder :**
1. Lire `bank.controller.ts` en entier — pattern des handlers
2. Lire `bank.routes.ts` en entier — ordre des routes (attention : `/detect` et
   `/parse` et `/confirm` AVANT `/:id` sinon Express les confond avec un UUID)

**Routes complètes dans `bank.routes.ts`** (ordre impératif) :
```
POST   /bank/import/detect              upload.single('file') → detectImportFormat
POST   /bank/import/parse               upload.single('file') → parseImport
POST   /bank/import/confirm             confirmImport
GET    /bank/import/:id/status          getImportStatus
DELETE /bank/import/:id                 rollbackImport
GET    /bank/accounts/:id/import-config getImportConfig

# Route dépréciée (maintenue)
POST   /bank/import                     importCsvLegacy  (header Deprecation: true)
```

---

## PARTIE 2 — ALGORITHMES DE MATCHING

### Étape 10 — Score pondéré + Distance de Levenshtein

**Avant de coder :**
1. Lire `bank.service.ts` — `getSuggestions()` en entier — identifier la fonction `score()` à remplacer
2. Lire les champs `label`, `reference` sur `Payment`, `SupplierPayment`, `Expense` dans Prisma

**Créer `src/modules/bank/bank.matching.ts`** avec :

- `levenshtein(a, b)` — implémentation itérative O(m×n) avec 2 lignes seulement (pas matrice complète)
- `textSimilarity(a, b)` — 1.0 si identiques, 0.85 si l'un contient l'autre, sinon Levenshtein normalisé
- `computeScore(input)` — score pondéré :
  - Montant : 45 pts (exact=45, ±0.1%=35, ±1%=20, sinon=0)
  - Date : 30 pts (même jour=30, ±2j=22, ±5j=14, ±10j=6, sinon=0)
  - Libellé : 15 pts (textSimilarity × 15)
  - Référence : 10 pts (textSimilarity × 10 si les deux existent)
- Retourner `{ total: 0-100, detail: { montant, date, label, reference } }`

**Modifier `getSuggestions()`** dans `bank.service.ts` :
- Importer `computeScore` depuis `bank.matching.ts`
- Élargir la fenêtre à ±10 jours
- Exposer `scoreDetail` dans la réponse

---

### Étape 11 — Subset Sum : 1 transaction → N paiements

Ajouter dans `bank.matching.ts` :
- `subsetSum(candidates, target, tolerance, maxSize=6)` — backtracking avec élagage
  branch & bound : trier les candidats par montant décroissant, élaguer si la somme
  de tous les restants ne peut pas atteindre la cible.
- Retourner max 5 combinaisons

Ajouter dans `bank.service.ts` — `findSubsetMatches(transactionId)`.

Modifier `reconcileTransactionSchema` — accepter `matchedEntities[]` en plus du format ancien.

**Route :** `GET /bank/transactions/:id/subset-matches`

---

### Étape 12 — Hungarian Algorithm : affectation optimale globale

Ajouter dans `bank.matching.ts` :
- `hungarian(costMatrix)` — Kuhn-Munkres complet O(n³) avec potentiels
- Gérer matrices non carrées et cellules INF (assignations interdites)

Ajouter dans `bank.service.ts` — `getAutoMatchBatch(reconciliationId, applyHighConfidence)` :
- `high` (score ≥ 80) → appliqué automatiquement si `applyHighConfidence = true`
- `medium` (50-79) → retourné pour validation
- `low` (<50) → ignoré

**Route :** `POST /bank/reconciliations/:id/auto-match`

---

### Étape 13 — Règles de rapprochement apprises

**Nouveau modèle Prisma `BankMatchingRule`** (lire `prisma/schema.prisma` avant) :
```prisma
model BankMatchingRule {
  id            String      @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  bankAccountId String?     @map("bank_account_id") @db.Uuid
  bankAccount   BankAccount? @relation("BankMatchingRules", ...)
  labelContains String      @map("label_contains") @db.VarChar(255)
  amountMin     Decimal?    @map("amount_min") @db.Decimal(15, 2)
  amountMax     Decimal?    @map("amount_max") @db.Decimal(15, 2)
  entityType    String      @map("entity_type") @db.VarChar(50)
  entityId      String?     @map("entity_id") @db.Uuid
  category      String?     @db.VarChar(100)
  confidence    Int         @default(1)
  isActive      Boolean     @default(true) @map("is_active")
  isAutoApply   Boolean     @default(false) @map("is_auto_apply")
  createdById   String      @map("created_by") @db.Uuid
  createdBy     User        @relation("BankMatchingRuleCreatedBy", ...)
  createdAt     DateTime    @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt     DateTime    @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()

  @@map("bank_matching_rules")
}
```

Ajouter les relations inverses sur `BankAccount` et `User` (lire ces modèles avant).

**Apprentissage** dans `reconcileTransaction()` : après confirmation, extraire les
tokens significatifs du libellé (mots > 3 lettres, non numériques) et upsert la règle.

**Application** dans `getSuggestions()` : bonus +15 pts si règle active avec `confidence ≥ 3`.

**Routes CRUD :**
```
GET    /bank/matching-rules
POST   /bank/matching-rules
PUT    /bank/matching-rules/:id
DELETE /bank/matching-rules/:id
```

---

## PARTIE 3 — VÉRIFICATION FINALE

### Étape 14 — Build final et checklist

**Avant de commencer :**
1. Lire `src/app.ts` — vérifier que le router bank est monté
2. Lire `prisma/schema.prisma` en entier — vérifier toutes les relations symétriques
3. Lire `src/config/seedRoles.ts` — ajouter les permissions manquantes

**Checklist :**

☐ `pnpm prisma generate` → EXIT 0
☐ `pnpm build` → EXIT 0 sans warning TypeScript
☐ Contrainte unique `@@unique([bankAccountId, contentHash])` dans Prisma
☐ Relations symétriques `BankMatchingRule ↔ BankAccount ↔ User`
☐ Worker `bank-import` déclaré dans `workers.ts`
☐ Queue `bank-import` déclarée dans `queues.ts`
☐ Routes ordonnées (chemins fixes AVANT paramètres dynamiques) :
   `/import/detect` AVANT `/import/:id/status`
☐ Nouvelles permissions dans `seedRoles.ts` :
   `bank:import-parse`, `bank:import-confirm`, `bank:auto-match`, `bank:rules`
☐ Rétrocompatibilité `POST /bank/import` (ancienne route) → header `Deprecation: true`
☐ `reconcileTransaction()` accepte l'ancien format `{ matchedEntityType, matchedEntityId }`

---

## Résumé complet des routes

```
# Import pipeline professionnel
POST   /bank/import/detect              Phase DETECT — détection auto du format
POST   /bank/import/parse               Phase PARSE+PREVIEW — sans écrire en base
POST   /bank/import/confirm             Phase CONFIRM — écrit (async si > 200 lignes)
GET    /bank/import/:id/status          Progression du job async
DELETE /bank/import/:id                 Rollback complet de l'import
GET    /bank/accounts/:id/import-config Profil de mapping sauvegardé

# Import legacy (déprécié, maintenu)
POST   /bank/import                     One-shot direct (header Deprecation: true)

# Matching enrichi
GET    /bank/transactions/:id/suggestions    Score Levenshtein + règles apprises
GET    /bank/transactions/:id/subset-matches Combinaisons N paiements → 1 transaction

# Batch Hungarian
POST   /bank/reconciliations/:id/auto-match  Affectation optimale globale

# Rapport d'écart
GET    /bank/reconciliations/:id/report      Solde relevé vs système

# Règles apprises
GET    /bank/matching-rules
POST   /bank/matching-rules
PUT    /bank/matching-rules/:id
DELETE /bank/matching-rules/:id
```

---

## Ordre d'exécution

```
PARTIE 1 — Import pipeline
  Étape  1 → Prisma (contentHash, jobId, previewData)    → pnpm prisma generate
  Étape  2 → bank.profiles.ts (profils banques CEMAC)    → pnpm build
  Étape  3 → bank.parsers.ts  (détection + parsers)      → pnpm build
  Étape  4 → Route /detect + service detectImportFormat  → pnpm build
  Étape  5 → Route /parse  + service parseImport         → pnpm build
  Étape  6 → Route /confirm + worker BullMQ              → pnpm build
  Étape  7 → Routes /status + rollback                   → pnpm build
  Étape  8 → Profil mapping par compte                   → pnpm build
  Étape  9 → Toutes les routes dans controller + routes  → pnpm build

PARTIE 2 — Algorithmes
  Étape 10 → bank.matching.ts + Levenshtein              → pnpm build
  Étape 11 → Subset Sum                                  → pnpm build
  Étape 12 → Hungarian Algorithm                         → pnpm build
  Étape 13 → Prisma BankMatchingRule + règles apprises   → pnpm prisma generate + pnpm build

PARTIE 3 — Vérification
  Étape 14 → Checklist finale                            → pnpm build EXIT 0
```
