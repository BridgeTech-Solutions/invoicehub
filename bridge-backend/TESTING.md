# InvoiceHub v2.0 — Plan de tests Jest
### Bridge Technologies Solutions — Douala, Cameroun

---

## Table des matières

1. [Installation et configuration](#1-installation-et-configuration)
2. [Lancer les tests](#2-lancer-les-tests)
3. [Fonctions critiques à tester](#3-fonctions-critiques-à-tester)
4. [Fonctions priorité haute](#4-fonctions-priorité-haute)
5. [Fonctions priorité moyenne](#5-fonctions-priorité-moyenne)
6. [Structure des fichiers de test](#6-structure-des-fichiers-de-test)
7. [Exemples de tests](#7-exemples-de-tests)

---

## 1. Installation et configuration

```bash
cd bridge-backend
pnpm add -D jest @types/jest ts-jest supertest @types/supertest
```

Créer `jest.config.ts` à la racine de `bridge-backend/` :

```ts
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: { lines: 70 },
  },
}
```

Ajouter dans `package.json` :

```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage"
}
```

---

## 2. Lancer les tests

```bash
# Tous les tests
pnpm test

# Mode watch (relance à chaque modification)
pnpm test:watch

# Avec rapport de couverture
pnpm test:coverage

# Un fichier spécifique
pnpm test src/__tests__/lib/document-math.test.ts
```

---

## 3. Fonctions critiques à tester

> Ces tests doivent passer avant tout déploiement. Un échec bloque `deploy.bat`.

---

### 3.1 Calculs financiers — `invoices.service.ts`

Fonctions : `computeLine()` · `computeTotals()`

| Cas à tester | Description |  
|-------------|-------------|
| TVA 19.25% | `100 000 HT` → `119 250 TTC` |
| Remise % | `100 000 - 10%` → `90 000 HT net` |
| Remise montant fixe | `100 000 - 5 000` → `95 000 HT net` |
| Remise globale % | Appliquée sur totalHt après agrégation des lignes |
| Remise globale montant | Déduite du totalHt final |
| Arrondi 2 décimales | Pas de dérive sur grands montants |
| Ligne à 0 | `qty=0` → tous les champs à 0 |
| Plusieurs lignes | Somme correcte des netHt, taxAmount, totalTtc |
| `hideDetails=true` | Ligne visible avec designation + PT uniquement |

---

### 3.2 Calculs frontend — `document-math.ts` (frontend)

> Doit être un miroir **exact** du calcul backend.

| Cas à tester | Description |
|-------------|-------------|
| `computeLineValues()` | Résultats identiques au backend pour les mêmes inputs |
| `computeDocumentTotals()` | Totaux identiques pour un jeu de lignes donné |
| `uuid()` polyfill | Retourne une chaîne UUID valide même sans `crypto.randomUUID` |
| `makeBlankLine()` | Retourne bien `qty=1`, `taxRate=19.25`, `unit='forfait'` |

---

### 3.3 Authentification — `auth.service.ts`

| Cas à tester | Description |
|-------------|-------------|
| Login correct sans 2FA | Retourne `accessToken` + `refreshToken` |
| Login incorrect (mauvais MDP) | Retourne 401, incrémente `failedLoginAttempts` |
| Login verrouillé | Après N tentatives → retourne 423 ACCOUNT_LOCKED |
| Login avec TOTP valide | Retourne les tokens |
| Login avec TOTP invalide | Retourne 401 |
| Login avec backup code valide | Retourne les tokens, marque le code comme utilisé |
| Login avec backup code déjà utilisé | Retourne 401 |
| Refresh token valide | Retourne nouveaux tokens, révoque l'ancien |
| Refresh token expiré/révoqué | Retourne 401 |
| Reset password : token valide | Nouveau mot de passe accepté, toutes sessions révoquées |
| Reset password : token expiré | Retourne 400 |

---

### 3.4 Paiements — `payments.service.ts`

| Cas à tester | Description |
|-------------|-------------|
| Paiement total | `balanceDue = 0` → statut `paid` |
| Paiement partiel | `balanceDue > 0` → statut `partially_paid` |
| Paiement sur facture `overdue` | Reste `overdue` si non soldé |
| Paiement total sur `overdue` | Passe à `paid`, `reminderEscalationLevel = 0` |
| Paiement > balanceDue | Retourne erreur 400 |
| Suppression paiement | Recalcule `balanceDue`, revient à `issued` si nécessaire |
| Transaction atomique | Paiement + mise à jour facture dans une seule transaction |

---

### 3.5 Compute dry-run — `invoices.service.ts::compute`

| Cas à tester | Description |
|-------------|-------------|
| Calculs corrects | Totaux identiques à `computeTotals()` |
| Warning : client impayé | Détecté si client a des factures overdue |
| Warning : montant anormal | Détecté si montant > seuil configurable |
| Warning : doublon | Détecté si facture similaire récente existe |
| Pas d'écriture en DB | Dry-run ne crée rien |

---

### 3.6 Cycle acompte/solde — `invoices.service.ts`

| Cas à tester | Description |
|-------------|-------------|
| `soldePrefill` correct | `montantSolde = totalTtc - somme(acomptes encaissés)` |
| Solde déjà existant | Retourne erreur si un solde non annulé existe déjà |
| Acomptes multiples | Somme de tous les acomptes déduite correctement |
| Acompte annulé | Non compté dans la déduction |

---

### 3.7 Middleware d'authentification — `auth.ts`

| Cas à tester | Description |
|-------------|-------------|
| Token valide | `req.user` correctement injecté |
| Token absent | Retourne 401 |
| Token expiré | Retourne 401 |
| Token forgé (mauvaise signature) | Retourne 401 |
| User désactivé | Retourne 401 même avec token valide |

---

### 3.8 RBAC — `rbac.ts`

| Cas à tester | Description |
|-------------|-------------|
| `admin` accède à `authorize('admin')` | Autorisé |
| `commercial` accède à `authorize('admin')` | Retourne 403 |
| `employee` accède à `authorize('commercial')` | Retourne 403 |
| `admin` accède à `authorize('admin','commercial')` | Autorisé (liste explicite) |
| `admin` accède à `authorize('commercial')` | Retourne 403 (pas de hiérarchie implicite) |

---

### 3.9 Rotation des tokens — `api-client.ts` (frontend)

| Cas à tester | Description |
|-------------|-------------|
| Requête 401 → refresh automatique | Retry avec nouveau token |
| File d'attente | Plusieurs requêtes 401 simultanées → une seule requête refresh |
| Erreur refresh | Déconnexion + redirect `/login` |
| Timeout session | Redirect `/login?reason=timeout` |

---

## 4. Fonctions priorité haute

### 4.1 JWT — `lib/jwt.ts`

| Cas à tester | Description |
|-------------|-------------|
| `signAccessToken` | Token valide, payload correct, expiration 15m |
| `verifyAccessToken` | Token valide décodé sans erreur |
| `verifyAccessToken` expiré | Lève une erreur |
| `verifyAccessToken` forgé | Lève une erreur |
| `signRefreshToken` | Token valide, expiration 7j |
| `verifyRefreshToken` | Identique aux access tokens |

---

### 4.2 TOTP — `lib/totp.ts`

| Cas à tester | Description |
|-------------|-------------|
| `generateTotpSecret` | Retourne chaîne non vide |
| `verifyTotpToken` valide | Retourne `true` |
| `verifyTotpToken` invalide | Retourne `false` |
| `verifyTotpToken` code périmé | Retourne `false` |
| `getTotpUri` | Contient le bon issuer et email |

---

### 4.3 Bcrypt — `lib/bcrypt.ts`

| Cas à tester | Description |
|-------------|-------------|
| `hashPassword` | Hash différent du mot de passe original |
| `comparePassword` correct | Retourne `true` |
| `comparePassword` incorrect | Retourne `false` |
| `comparePassword` hash différent | Retourne `false` |

---

### 4.4 Création facture — `invoices.service.ts::create`

| Cas à tester | Description |
|-------------|-------------|
| Facture standard | Créée avec statut `draft`, numéro SYSCOHADA |
| Facture acompte | `type=acompte`, `acomptePercentage` calculé |
| Facture solde | `type=solde`, liée à l'acompte parent |
| Lignes stockées en snapshot | Prix enregistré au moment de la création |
| Client inexistant | Retourne 404 |
| Lignes vides | Retourne 400 |

---

### 4.5 Annulation + avoir auto — `invoices.service.ts::cancel`

| Cas à tester | Description |
|-------------|-------------|
| Annulation d'une facture `issued` | Crée un avoir automatiquement |
| Annulation d'une facture `draft` | Suppression simple, pas d'avoir |
| Avoir créé avec bon montant | `totalTtc` identique à la facture annulée |
| Facture déjà annulée | Retourne 400 |

---

### 4.6 Conversion proforma → facture — `proformas.service.ts::convertToInvoice`

| Cas à tester | Description |
|-------------|-------------|
| Proforma `accepted` | Facture créée avec les mêmes lignes |
| Proforma `draft` ou `sent` | Retourne 400 |
| Numéros distincts | Facture a un numéro FAC, proforma garde son numéro PFM |
| Lignes copiées en snapshot | Prix et quantités identiques |

---

### 4.7 Middleware errorHandler — `errorHandler.ts`

| Cas à tester | Description |
|-------------|-------------|
| `AppError` 400 | Retourne `{ success: false, code, message }` avec status 400 |
| `AppError` 404 | Status 404 |
| `ZodError` | Status 400 avec détail des champs invalides |
| Erreur Prisma `P2002` (unique) | Status 409 CONFLICT |
| Erreur Prisma `P2025` (not found) | Status 404 NOT_FOUND |
| Erreur inconnue en production | Status 500, message générique (pas de stack trace) |
| Erreur inconnue en développement | Stack trace exposée |

---

## 5. Fonctions priorité moyenne

### 5.1 CSV — `lib/csv.ts`

| Cas à tester |
|-------------|
| `toCsv` avec données simples → chaîne CSV correcte |
| BOM UTF-8 présent (compatibilité Excel) |
| Virgules dans les valeurs → correctement échappées avec guillemets |

---

### 5.2 Clients — `clients.service.ts`

| Cas à tester |
|-------------|
| `quickFill` retourne contact + 5 dernières factures |
| `getSummary` calcule correctement le CA total et les impayés |
| `archive` passe `deleted_at` et non supprime physiquement |

---

### 5.3 Rapports — `reports.service.ts`

| Cas à tester |
|-------------|
| `getTaxSummary` calcule TVA proportionnée sur acomptes |
| `getRevenueByClient` trie par CA décroissant |
| `getUnpaid` exclut les factures `draft` et `cancelled` |

---

### 5.4 AppError — `core/errors/AppError.ts`

| Cas à tester |
|-------------|
| `AppError.badRequest('msg')` → `statusCode=400`, `code='BAD_REQUEST'` |
| `AppError.notFound('msg')` → `statusCode=404` |
| `AppError.forbidden('msg')` → `statusCode=403` |
| `AppError.conflict('msg')` → `statusCode=409` |
| `new AppError('msg', 422, 'CUSTOM')` → statusCode et code personnalisés |

---

## 6. Structure des fichiers de test

```
bridge-backend/src/__tests__/
├── lib/
│   ├── jwt.test.ts
│   ├── bcrypt.test.ts
│   ├── totp.test.ts
│   └── csv.test.ts
├── core/
│   ├── middleware/
│   │   ├── auth.test.ts
│   │   ├── rbac.test.ts
│   │   └── errorHandler.test.ts
│   └── errors/
│       └── AppError.test.ts
├── modules/
│   ├── invoices/
│   │   ├── invoices.service.test.ts      ← computeLine, computeTotals, compute, soldePrefill
│   │   ├── invoices.create.test.ts       ← create, issue, cancel, avoir auto
│   │   └── invoices.integration.test.ts  ← flux complet draft→issued→paid
│   ├── proformas/
│   │   └── proformas.service.test.ts     ← create, convert, cycle statut
│   ├── payments/
│   │   └── payments.service.test.ts      ← create, balance, statut transitions
│   ├── auth/
│   │   ├── auth.login.test.ts            ← login, brute-force, 2FA
│   │   └── auth.tokens.test.ts           ← refresh, rotation, révocation
│   ├── clients/
│   │   └── clients.service.test.ts       ← quickFill, getSummary
│   └── reports/
│       └── reports.service.test.ts       ← taxSummary, revenue

bridge-frontend/src/__tests__/
└── lib/
    ├── document-math.test.ts             ← computeLineValues, computeDocumentTotals, uuid
    └── api-client.test.ts                ← intercepteurs, rotation tokens
```

---

## 7. Exemples de tests

### Calcul d'une ligne de facture

```ts
// src/__tests__/modules/invoices/invoices.service.test.ts
import { computeLine, computeTotals } from '../../../modules/invoices/invoices.service'

describe('computeLine', () => {
  it('calcule correctement sans remise', () => {
    const result = computeLine({
      quantity: 2,
      unitPriceHt: 100_000,
      discountType: null,
      discountValue: null,
      taxRate: 19.25,
    })
    expect(result.subtotalHt).toBe(200_000)
    expect(result.discountAmount).toBe(0)
    expect(result.netHt).toBe(200_000)
    expect(result.taxAmount).toBe(38_500)
    expect(result.totalTtc).toBe(238_500)
  })

  it('applique une remise en pourcentage', () => {
    const result = computeLine({
      quantity: 1,
      unitPriceHt: 100_000,
      discountType: 'percentage',
      discountValue: 10,
      taxRate: 19.25,
    })
    expect(result.netHt).toBe(90_000)
    expect(result.taxAmount).toBe(17_325)
    expect(result.totalTtc).toBe(107_325)
  })

  it('applique une remise en montant fixe', () => {
    const result = computeLine({
      quantity: 1,
      unitPriceHt: 100_000,
      discountType: 'fixed',
      discountValue: 5_000,
      taxRate: 19.25,
    })
    expect(result.netHt).toBe(95_000)
    expect(result.totalTtc).toBe(113_287.50)
  })
})
```

---

### Login et gestion du brute-force

```ts
// src/__tests__/modules/auth/auth.login.test.ts
describe('AuthService.login', () => {
  it('retourne les tokens avec identifiants corrects', async () => {
    const result = await authService.login(
      { email: 'admin@bts.cm', password: 'MotDePasse!123' },
      '127.0.0.1', 'Jest'
    )
    expect(result.accessToken).toBeDefined()
    expect(result.refreshToken).toBeDefined()
    expect(result.user.email).toBe('admin@bts.cm')
  })

  it('rejette un mauvais mot de passe', async () => {
    await expect(
      authService.login({ email: 'admin@bts.cm', password: 'mauvais' }, '127.0.0.1', 'Jest')
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('verrouille le compte après trop de tentatives', async () => {
    for (let i = 0; i < 5; i++) {
      await authService.login({ email: 'admin@bts.cm', password: 'mauvais' }, '127.0.0.1', 'Jest')
        .catch(() => {})
    }
    await expect(
      authService.login({ email: 'admin@bts.cm', password: 'MotDePasse!123' }, '127.0.0.1', 'Jest')
    ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' })
  })
})
```

---

### Paiement et mise à jour du statut

```ts
// src/__tests__/modules/payments/payments.service.test.ts
describe('PaymentsService.create', () => {
  it('passe la facture à paid après paiement total', async () => {
    const invoice = await createTestInvoice({ totalTtc: 100_000 })
    await issueInvoice(invoice.id)

    await paymentsService.create(invoice.id, {
      amount: 100_000, method: 'bank_transfer', paymentDate: new Date(),
    }, userId)

    const updated = await invoicesService.findById(invoice.id)
    expect(updated.status).toBe('paid')
    expect(updated.balanceDue).toBe(0)
  })

  it('passe à partially_paid après paiement partiel', async () => {
    const invoice = await createTestInvoice({ totalTtc: 100_000 })
    await issueInvoice(invoice.id)

    await paymentsService.create(invoice.id, {
      amount: 40_000, method: 'cash', paymentDate: new Date(),
    }, userId)

    const updated = await invoicesService.findById(invoice.id)
    expect(updated.status).toBe('partially_paid')
    expect(updated.balanceDue).toBe(60_000)
  })

  it('refuse un paiement supérieur au solde dû', async () => {
    const invoice = await createTestInvoice({ totalTtc: 100_000 })
    await issueInvoice(invoice.id)

    await expect(
      paymentsService.create(invoice.id, { amount: 150_000, method: 'cash', paymentDate: new Date() }, userId)
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
```

---

*InvoiceHub v2.0 — Bridge Technologies Solutions — Douala, Cameroun*
