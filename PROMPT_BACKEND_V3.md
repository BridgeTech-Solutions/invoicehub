# PROMPT — Implémentation Backend v3
# InvoiceHub — Bridge Technologies Solutions (BTS), Douala, Cameroun
# À suivre étape par étape, dans l'ordre exact défini ici.

---

## CONTEXTE GÉNÉRAL

**Projet** : InvoiceHub v3 — ERP complet SYSCOHADA pour BTS  
**Stack** : Node.js + Express + TypeScript + Prisma + PostgreSQL + Redis + BullMQ + Socket.io  
**Backend dir** : `D:/Bel/projets/BRIDGE/bridge-backend/`  
**Schéma DB** : `invoicehub_schema_v3.sql` — 60 tables, 36 ENUMs, 9 vues  
**Prisma** : `bridge-backend/prisma/schema.prisma` — à jour (v3 complet)  

### Architecture conservée (MVC Modulaire Express)
```
Routes → Controller → Service → Prisma → PostgreSQL
           ↓
      BullMQ / Socket.io / EventBus
```

### Pattern de chaque module (obligatoire, sans exception)
```
src/modules/<nom>/
  <nom>.routes.ts      # Express Router + middleware chains
  <nom>.controller.ts  # Parse req, appelle service, retourne JSON
  <nom>.service.ts     # Toute la logique métier, pas de req/res
  <nom>.schema.ts      # Schemas Zod (validation input)
```

---

## RÈGLES DE CODE (à respecter dans tous les fichiers)

1. **TypeScript strict** — pas de `any`, pas de cast sauvage
2. **Zod** — toute entrée utilisateur validée avec `.parse()` dans le controller
3. **AppError** — toutes les erreurs métier via `AppError.notFound()`, `AppError.forbidden()`, etc.
4. **Soft delete** — jamais de `DELETE` SQL, toujours `deletedAt: new Date()`
5. **Prisma transactions** — toute opération multi-table dans `prisma.$transaction()`
6. **Pas de `console.log`** — utiliser `logger` de Winston (importé depuis `../../config/logger` ou `../../lib/logger`)
7. **Audit** — les routes de mutation (POST/PUT/PATCH/DELETE) utilisent `auditMiddleware`
8. **Pagination** — toutes les listes : `page`, `limit` (max 100), `search`, filtres spécifiques
9. **Response format** :
   - Succès liste : `{ success: true, data: [...], meta: { total, page, limit, totalPages } }`
   - Succès item : `{ success: true, data: {...} }`
   - Succès action : `{ success: true, message: '...' }`
10. **Numérotation documents** — toujours via `prisma.$queryRaw` appelant `fn_next_document_number()`, jamais en JS
11. **Permissions** — utiliser `authorizePermission('module:action')` (nouveau RBAC v3), pas `authorize('admin')`

---

## ÉTAPE 0 — REFACTORING RBAC DYNAMIQUE
### Priorité : 🔴 CRITIQUE — bloque toutes les autres étapes

### Contexte
Le fichier `src/core/middleware/rbac.ts` utilise `UserRole` enum hardcodé de Prisma.  
En v3, les rôles sont dans la table `roles` avec un champ `permissions TEXT[]`.  
Format permission : `'module:action'` — ex: `'invoices:create'`, `'purchases:approve'`, `'*'` (admin)

### Fichiers à créer / modifier

#### 0.1 — `src/core/types/express.d.ts` (modifier)
Remplacer `role: UserRole` par :
```typescript
import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        roleId: string;
        roleName: string;        // slug: 'admin', 'commercial', 'employee'
        permissions: string[];   // ['invoices:create', 'clients:read', ...]
        firstName: string;
        lastName: string;
      };
    }
  }
}
```

#### 0.2 — `src/core/middleware/auth.ts` (modifier)
Le `prisma.user.findFirst()` doit inclure la relation `role` :
```typescript
select: {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  roleId: true,
  role: {
    select: { name: true, permissions: true }
  }
}
```
Puis construire `req.user` avec `roleName` et `permissions`.  
Mettre en cache Redis : `rbac:user:{userId}` TTL 5 minutes.  
Si cache hit → skip la requête DB.  
Si cache miss → charger depuis DB + écrire cache.

#### 0.3 — `src/core/middleware/rbac.ts` (réécrire complètement)
Créer deux middlewares :

**`authorize(...roleNames: string[])`** — compatibilité ascendante, vérifie par nom de rôle  
**`authorizePermission(...permissions: string[])`** — nouveau, vérifie par permission granulaire

```typescript
// Logique authorizePermission :
// 1. Si user.permissions contient '*' → admin → passe toujours
// 2. Si user.permissions inclut AU MOINS UNE des permissions requises → passe
// 3. Sinon → AppError.forbidden()
```

#### 0.4 — `src/lib/rbacCache.ts` (créer)
```typescript
// invalidateUserRbacCache(userId: string): Promise<void>
// → redis.del(`rbac:user:${userId}`)
// Appelé quand : changement de rôle, modification permissions du rôle
```

#### 0.5 — Seed des rôles système (créer `src/config/seedRoles.ts`)
Appelé au démarrage si la table `roles` est vide :
```typescript
const SYSTEM_ROLES = [
  { name: 'admin',      displayName: 'Administrateur',  isSystem: true, permissions: ['*'] },
  { name: 'commercial', displayName: 'Commercial',       isSystem: true, permissions: [
    'clients:*', 'invoices:*', 'proformas:*', 'payments:create',
    'products:read', 'reports:read', 'dashboard:read'
  ]},
  { name: 'employee',   displayName: 'Employé',          isSystem: true, permissions: [
    'clients:read', 'invoices:read', 'proformas:read',
    'payments:create', 'products:read', 'dashboard:read'
  ]},
];
```

#### 0.6 — Module `src/modules/roles/` (créer)
CRUD complet sur les rôles (admin seulement).  
Routes :
- `GET    /api/roles` — liste tous les rôles
- `POST   /api/roles` — créer un rôle custom
- `GET    /api/roles/:id` — détail + liste des users avec ce rôle
- `PUT    /api/roles/:id` — modifier (impossible si `isSystem = true`)
- `DELETE /api/roles/:id` — soft delete (impossible si `isSystem = true` ou users assignés)
- `GET    /api/roles/permissions` — liste toutes les permissions disponibles (référence)

#### 0.7 — Mettre à jour tous les modules existants
Remplacer `authorize('admin')` → `authorizePermission('module:action')` dans :
- `auth.routes.ts` — `authorize('admin')` → `authorizePermission('users:manage')`
- `users.routes.ts` — selon action
- `invoices.routes.ts`, `proformas.routes.ts`, `payments.routes.ts`
- `clients.routes.ts`, `products.routes.ts`
- `settings.routes.ts`, `audit.routes.ts`, `reports.routes.ts`

**Mapping de référence** :
```
admin                     → '*'
commercial + admin        → 'invoices:create' (ou selon module)
tous authentifiés         → pas de authorizePermission (juste authenticate)
```

---

## ÉTAPE 1 — MODULE FOURNISSEURS (`suppliers`)
### Dépend de : Étape 0 (RBAC)

### Tables Prisma concernées
`Supplier`, `SupplierContact`

### Permissions à utiliser
```
suppliers:read, suppliers:create, suppliers:update, suppliers:delete
```

### Routes — `GET /api/suppliers`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `suppliers:read` | Liste paginée + search + filtres (status, category) |
| POST | `/` | `suppliers:create` | Créer fournisseur |
| GET | `/:id` | `suppliers:read` | Détail + contacts + stats |
| PUT | `/:id` | `suppliers:update` | Modifier |
| DELETE | `/:id` | `suppliers:delete` | Soft delete |
| GET | `/:id/contacts` | `suppliers:read` | Liste contacts |
| POST | `/:id/contacts` | `suppliers:update` | Ajouter contact |
| PUT | `/:id/contacts/:contactId` | `suppliers:update` | Modifier contact |
| DELETE | `/:id/contacts/:contactId` | `suppliers:update` | Supprimer contact |
| GET | `/:id/purchase-orders` | `purchases:read` | BCs du fournisseur |
| GET | `/:id/invoices` | `purchases:read` | Factures du fournisseur |
| GET | `/:id/financial-summary` | `suppliers:read` | Vue v_supplier_financial_summary |

### Règles métier
- `supplier_code` unique, généré auto si absent : `FOUR-{YYYYMM}-{SEQ:03}` (ex: `FOUR-202601-001`)
- Un seul contact `isPrimary = true` par fournisseur (enforced en service)
- Soft delete impossible si des `supplier_invoices` non payées existent
- Recherche full-text sur `name` via `to_tsvector('french', name)` (index existant)

### Schema Zod clés
```typescript
createSupplierSchema: name(required), type, email, phone, country, taxNumber,
  currency(default XAF), defaultDueDays(default 30), paymentMethod, status,
  category, rating(1-5), bankName, bankAccount

createContactSchema: firstName(required), lastName, position, email, phone, isPrimary
```

---

## ÉTAPE 2 — MODULE BONS DE COMMANDE (`purchase-orders`)
### Dépend de : Étape 1

### Tables Prisma concernées
`PurchaseOrder`, `PurchaseOrderLine`, `PurchaseOrderStatusHistory`

### Permissions
```
purchases:read, purchases:create, purchases:update, purchases:approve, purchases:delete
```

### Routes — `GET /api/purchase-orders`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `purchases:read` | Liste paginée + filtres (status, supplierId, dateRange) |
| POST | `/` | `purchases:create` | Créer BC (numérotation auto) |
| GET | `/:id` | `purchases:read` | Détail + lignes + historique statut |
| PUT | `/:id` | `purchases:update` | Modifier (seulement si `draft`) |
| DELETE | `/:id` | `purchases:delete` | Soft delete (seulement si `draft`) |
| POST | `/:id/send` | `purchases:update` | draft → sent (génère PDF, envoie email) |
| POST | `/:id/confirm` | `purchases:approve` | sent → confirmed |
| POST | `/:id/receive` | `purchases:update` | Marquer réception (partielle ou totale) |
| POST | `/:id/cancel` | `purchases:approve` | Annuler |
| GET | `/:id/pdf` | `purchases:read` | Générer PDF bon de commande |
| POST | `/compute` | `purchases:create` | Dry-run calcul montants (sans persistance) |

### Numérotation SYSCOHADA
```
Format : BTS/{OFFICE_CODE}/{YYYY}/{MM}/bc{SEQ:03}
Exemple: BTS/DC/2026/01/bc001
```
Via `fn_next_document_number('purchase_order', officeId)`

### Règles métier
- Calcul lignes identique aux invoices : `subtotal_ht`, `net_ht` (après remise), `tax_amount`, `total_ttc`
- `deliveryStatus` calculé : pending → partial (si quantité reçue < commandée) → complete
- Si `approvalRequired = true` et montant > seuil config → statut `pending_approval` avant `sent`
- Réception partielle : met à jour `quantityReceived` sur chaque ligne
- À réception complète : déclenche un mouvement de stock (`StockMovement` type `purchase_receipt`)
- Historique de statut enregistré dans `PurchaseOrderStatusHistory` à chaque transition

---

## ÉTAPE 3 — MODULE FACTURES FOURNISSEURS (`supplier-invoices`)
### Dépend de : Étape 2

### Tables Prisma concernées
`SupplierInvoice`, `SupplierInvoiceLine`, `SupplierInvoiceStatusHistory`, `SupplierPayment`

### Permissions
```
purchases:read, purchases:create, purchases:validate, purchases:pay
```

### Routes — `/api/supplier-invoices`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `purchases:read` | Liste paginée + filtres (status, supplierId, dueDateRange) |
| POST | `/` | `purchases:create` | Saisir facture reçue (numérotation interne ff001) |
| GET | `/:id` | `purchases:read` | Détail + lignes + paiements |
| PUT | `/:id` | `purchases:update` | Modifier (seulement si `draft` ou `received`) |
| DELETE | `/:id` | `purchases:delete` | Soft delete (seulement si `draft`) |
| POST | `/:id/validate` | `purchases:validate` | received → validated |
| POST | `/:id/dispute` | `purchases:validate` | → disputed + raison |
| POST | `/:id/pay` | `purchases:pay` | Enregistrer paiement fournisseur |
| GET | `/:id/payments` | `purchases:read` | Historique paiements |
| GET | `/:id/pdf` | `purchases:read` | PDF de la facture fournisseur |

### Règles métier
- Numérotation interne : `BTS/DC/2026/01/ff001` via `fn_next_document_number`
- `balanceDue = totalTtc - amountPaid` mis à jour après chaque paiement
- Statut auto : `partially_paid` si `0 < amountPaid < totalTtc`, `paid` si `amountPaid >= totalTtc`
- Paiement : crée un `SupplierPayment`, met à jour `amountPaid` et `balanceDue` sur la facture
- Enregistre `SupplierInvoiceStatusHistory` à chaque transition de statut

---

## ÉTAPE 4 — MODULE DÉPENSES (`expenses`)
### Dépend de : Étape 0 (RBAC)

### Tables Prisma concernées
`ExpenseCategory`, `Expense`, `ExpenseStatusHistory`, `ExpenseBudget`

### Permissions
```
expenses:read, expenses:create, expenses:submit, expenses:approve, expenses:pay
```

### Routes — `/api/expenses`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `expenses:read` | Liste paginée + filtres |
| POST | `/` | `expenses:create` | Créer dépense (numérotation dep001) |
| GET | `/:id` | `expenses:read` | Détail + historique statut |
| PUT | `/:id` | `expenses:update` | Modifier (draft seulement) |
| DELETE | `/:id` | `expenses:delete` | Soft delete (draft seulement) |
| POST | `/:id/submit` | `expenses:submit` | draft → submitted |
| POST | `/:id/approve` | `expenses:approve` | submitted → approved |
| POST | `/:id/reject` | `expenses:approve` | submitted → rejected + raison |
| POST | `/:id/pay` | `expenses:pay` | approved → paid |
| POST | `/:id/cancel` | `expenses:approve` | Annuler |

### Routes — `/api/expense-categories`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `expenses:read` | Liste catégories actives |
| POST | `/` | `expenses:manage` | Créer catégorie |
| PUT | `/:id` | `expenses:manage` | Modifier |
| DELETE | `/:id` | `expenses:manage` | Soft delete |

### Routes — `/api/expense-budgets`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `expenses:read` | Budgets + réalisé par catégorie/période |
| POST | `/` | `expenses:manage` | Définir budget |
| PUT | `/:id` | `expenses:manage` | Modifier budget |

### Règles métier
- Numérotation : `BTS/DC/2026/01/dep001`
- `amountTtc = amountHt * (1 + taxRate/100)` calculé en service
- Workflow : `draft → submitted → approved/rejected → paid`
- Note de frais (`isEmployeeExpense = true`) : reimbursed_at rempli à l'approbation du paiement
- Budget vs Réalisé : agréger les dépenses `paid` par catégorie et période

---

## ÉTAPE 5 — MODULE STOCK (`stock`)
### Dépend de : Étape 2 (réceptions BC)

### Tables Prisma concernées
`StockMovement` (+ champs stock sur `Product`)

### Permissions
```
stock:read, stock:adjust
```

### Routes — `/api/stock`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/movements` | `stock:read` | Journal de stock paginé + filtres (productId, type, dateRange) |
| GET | `/movements/:id` | `stock:read` | Détail mouvement |
| POST | `/movements/adjust` | `stock:adjust` | Ajustement manuel (adjustment_in / adjustment_out) |
| GET | `/levels` | `stock:read` | Niveaux de stock actuels de tous les produits (track_stock=true) |
| GET | `/levels/:productId` | `stock:read` | Historique stock d'un produit |
| GET | `/alerts` | `stock:read` | Produits sous seuil minimum (stock_quantity < stock_min_level) |

### Règles métier
- `StockMovement` est IMMUABLE — pas de PUT/DELETE (règle SQL en place)
- `quantity` positif = entrée, négatif = sortie
- Après chaque mouvement : mettre à jour `products.stock_quantity`
- Ajustement manuel : requiert `notes` obligatoire (traçabilité)
- Service `createStockMovement(data)` centralisé, appelé par :
  - `purchase-orders.service.ts` (réception BC → `purchase_receipt`)
  - `invoices.service.ts` (vente → `sale`)
  - `stock.service.ts` (ajustement manuel)

---

## ÉTAPE 6 — MODULE BANQUE (`bank`)
### Dépend de : Étape 0

### Tables Prisma concernées
`BankAccount`, `BankTransaction`, `BankStatementImport`, `BankReconciliation`

### Permissions
```
bank:read, bank:manage, bank:reconcile, bank:import
```

### Routes — `/api/bank`

#### Comptes bancaires `/api/bank/accounts`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `bank:read` | Liste comptes + soldes |
| POST | `/` | `bank:manage` | Créer compte |
| GET | `/:id` | `bank:read` | Détail + solde + dernières transactions |
| PUT | `/:id` | `bank:manage` | Modifier |
| DELETE | `/:id` | `bank:manage` | Soft delete (si solde = 0) |

#### Transactions `/api/bank/transactions`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `bank:read` | Liste paginée + filtres (accountId, type, dateRange, reconciliationStatus) |
| POST | `/` | `bank:manage` | Saisie manuelle transaction |
| GET | `/:id` | `bank:read` | Détail |
| POST | `/:id/reconcile` | `bank:reconcile` | Rapprocher avec une pièce comptable |
| POST | `/:id/unmatch` | `bank:reconcile` | Annuler rapprochement |
| POST | `/:id/ignore` | `bank:reconcile` | Marquer comme ignoré |

#### Imports relevés `/api/bank/imports`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `bank:read` | Historique imports |
| POST | `/` | `bank:import` | Upload CSV/OFX relevé bancaire |
| GET | `/:id` | `bank:read` | Détail import + transactions créées |

#### Rapprochements `/api/bank/reconciliations`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `bank:read` | Sessions de rapprochement |
| POST | `/` | `bank:reconcile` | Ouvrir session rapprochement |
| GET | `/:id` | `bank:read` | Détail session |
| POST | `/:id/complete` | `bank:reconcile` | Clôturer session |

### Règles métier
- Import CSV : parser ligne par ligne, créer `BankTransaction`, mettre à jour `currentBalance`
- Rapprochement auto : proposer des matches si `amount` et `date` proches d'un paiement/dépense
- `BankAccount.currentBalance` = `openingBalance` + Σ(crédits) - Σ(débits)
- Un seul compte `isDefault = true` (index unique partiel en DB)

---

## ÉTAPE 7 — MODULE COMPTABILITÉ (`accounting`)
### Dépend de : Étapes 1-6

### Tables Prisma concernées
`ChartOfAccount`, `FiscalPeriod`, `AccountingJournal`, `JournalEntry`, `JournalEntryLine`, `TaxDeclaration`

### Permissions
```
accounting:read, accounting:write, accounting:validate, accounting:lock, accounting:export
```

### Routes — `/api/accounting`

#### Plan comptable `/api/accounting/chart`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `accounting:read` | Plan comptable SYSCOHADA (hiérarchique) |
| POST | `/` | `accounting:write` | Ajouter compte custom |
| PUT | `/:accountNumber` | `accounting:write` | Modifier (si !isSystem) |

#### Périodes fiscales `/api/accounting/periods`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `accounting:read` | Liste périodes + statut |
| POST | `/` | `accounting:write` | Créer période |
| POST | `/:id/close` | `accounting:lock` | Clôturer période (aucune écriture après) |
| POST | `/:id/lock` | `accounting:lock` | Verrouiller définitivement |

#### Journaux `/api/accounting/journals`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `accounting:read` | Liste journaux |
| POST | `/` | `accounting:write` | Créer journal custom |

#### Écritures `/api/accounting/entries`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `accounting:read` | Liste écritures paginées + filtres |
| POST | `/` | `accounting:write` | Saisir écriture manuelle |
| GET | `/:id` | `accounting:read` | Détail + lignes |
| PUT | `/:id` | `accounting:write` | Modifier (draft seulement) |
| POST | `/:id/validate` | `accounting:validate` | draft → validated |
| POST | `/:id/lock` | `accounting:lock` | validated → locked |

#### Grand livre / Balance `/api/accounting/reports`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/balance` | `accounting:read` | Balance des comptes (v_account_balance) |
| GET | `/ledger/:accountNumber` | `accounting:read` | Grand livre d'un compte |
| GET | `/trial-balance` | `accounting:read` | Balance de vérification |
| GET | `/export/sage` | `accounting:export` | Export CSV format Sage |
| GET | `/export/ciel` | `accounting:export` | Export CSV format Ciel |

#### Déclarations fiscales `/api/accounting/tax-declarations`
| Méthode | Route | Permission | Description |
|---------|-------|-----------|-------------|
| GET | `/` | `accounting:read` | Liste déclarations TVA/DSF |
| POST | `/` | `accounting:write` | Créer déclaration |
| GET | `/:id` | `accounting:read` | Détail |
| POST | `/:id/submit` | `accounting:validate` | Soumettre |
| GET | `/:id/export` | `accounting:export` | Export DSF XML |

### Règles métier CRITIQUES
- Toute écriture via `prisma.$transaction()` — atomique
- Invariant : `SUM(debit) = SUM(credit)` sur toutes les lignes → sinon `AppError.badRequest('Écriture non équilibrée')`
- Période `closed` ou `locked` → refuse toute nouvelle écriture
- Génération automatique d'écritures lors de :
  - Émission facture client → Journal VTE (débit 411xxx, crédit 70xxxx + 447xxx TVA)
  - Paiement client reçu → Journal BQ (débit 521xxx, crédit 411xxx)
  - Validation facture fournisseur → Journal ACH (débit 60xxxx + 447xxx, crédit 401xxx)
  - Paiement fournisseur → Journal BQ (débit 401xxx, crédit 521xxx)
  - Dépense payée → Journal selon catégorie (débit 6xxxxx, crédit 521xxx)

---

## ÉTAPE 8 — MODULE PARAMÈTRES AVANCÉS (`settings-advanced`)
### Dépend de : Étape 0

### Tables Prisma concernées
`DocumentTemplate`, `CustomField`, `CustomFieldValue`, `WorkflowRule`, `Webhook`, `WebhookDelivery`, `ApiKey`, `IpWhitelist`, `ExportJob`

### Permissions
```
settings:read, settings:manage, webhooks:manage, api-keys:manage
```

### Sous-modules et routes

#### Templates documents `/api/settings/templates`
- CRUD complet — prévisualisation HTML → PDF

#### Champs personnalisés `/api/settings/custom-fields`
- CRUD par `entityType`
- `/api/settings/custom-fields/values/:entityType/:entityId` — CRUD valeurs EAV

#### Règles workflow `/api/settings/workflow-rules`
- CRUD + toggle `isActive`

#### Webhooks `/api/webhooks`
- CRUD + test manuel + historique livraisons

#### Clés API `/api/api-keys`
- Créer (retourne la clé en clair UNE SEULE FOIS) + lister + révoquer

#### IP Whitelist `/api/settings/ip-whitelist`
- CRUD (admin seulement)

#### Export jobs `/api/exports`
- `POST /` — soumettre un job d'export (async via BullMQ)
- `GET /` — lister mes jobs
- `GET /:id` — statut + lien téléchargement
- `GET /:id/download` — télécharger le fichier

---

## ÉTAPE 9 — GÉNÉRATION AUTOMATIQUE DES ÉCRITURES COMPTABLES
### Dépend de : Étape 7

### Fichier à créer : `src/lib/accountingEngine.ts`

Ce service centralise la création des écritures comptables à partir des événements métier.

```typescript
interface AccountingEngine {
  onInvoiceIssued(invoiceId: string, tx: PrismaTransaction): Promise<void>
  onPaymentReceived(paymentId: string, tx: PrismaTransaction): Promise<void>
  onSupplierInvoiceValidated(supplierInvoiceId: string, tx: PrismaTransaction): Promise<void>
  onSupplierPaymentMade(supplierPaymentId: string, tx: PrismaTransaction): Promise<void>
  onExpensePaid(expenseId: string, tx: PrismaTransaction): Promise<void>
}
```

Appelé depuis les services respectifs, dans la même transaction Prisma.

---

## ÉTAPE 10 — EVENT BUS INTERNE
### Dépend de : Étapes 1-8

### Fichier à créer : `src/lib/eventBus.ts`

EventEmitter Node.js natif, typage fort.

```typescript
type BridgeEvents = {
  'invoice.issued': { invoiceId: string; amount: number; clientId: string }
  'invoice.paid': { invoiceId: string }
  'purchase_order.sent': { purchaseOrderId: string; supplierId: string }
  'expense.approved': { expenseId: string; amount: number }
  'supplier_invoice.validated': { supplierInvoiceId: string }
  // ... etc
}
```

Listeners enregistrés au démarrage :
1. **WorkflowEngine** — évalue les `workflow_rules` actives
2. **WebhookDispatcher** — enqueue dans BullMQ un job `webhook` pour chaque webhook abonné
3. **NotificationService** — crée notifications in-app + Socket.io emit

---

## ÉTAPE 11 — NOUVEAU WORKER BullMQ : EXPORTS
### Dépend de : Étape 8

### Fichier à créer : `src/jobs/processors/export.processor.ts`

Formats supportés :
- `csv` — export générique tabular
- `excel` — via `exceljs`
- `pdf` — via Puppeteer (rapport PDF)
- `sage_csv` — format spécifique Sage Cameroun
- `ciel_csv` — format Ciel Compta
- `dsf_xml` — Déclaration Statistique et Fiscale XML (format DGI Cameroun)

Queue : `export` — concurrence 2, pas de retry (fichier peut être régénéré)  
Expiration : 24h après complétion

---

## ÉTAPE 12 — DASHBOARD v3 KPIs ÉTENDUS
### Dépend de : Étapes 1-7

Mettre à jour `src/modules/dashboard/dashboard.service.ts` pour inclure :

- `totalPurchasesMonth` — depuis `v_dashboard_kpis`
- `totalOutstandingPayables` — encours fournisseurs
- `totalExpensesMonth` — dépenses du mois
- `grossMarginMonth` — marge brute (ventes - achats)
- `cashPosition` — Σ soldes comptes bancaires actifs
- `topSuppliers` — top 5 fournisseurs par volume achats
- `expensesByCategory` — répartition dépenses par catégorie (graphique)
- `stockAlerts` — nombre de produits sous seuil min

Cache Redis : TTL 5 minutes (inchangé)

---

## CHECKLIST DE VALIDATION PAR MODULE

Avant de marquer un module terminé, vérifier :

- [ ] Schema Zod complet (create, update, query params)
- [ ] Controller : validation input, appel service, réponse normalisée
- [ ] Service : logique métier pure, pas de req/res, transactions Prisma
- [ ] Routes : authenticate + authorizePermission sur chaque route
- [ ] auditMiddleware sur toutes les mutations
- [ ] Pagination sur toutes les listes (page, limit, total, totalPages)
- [ ] Soft delete respecté (deletedAt, not deletedAt: null dans les WHERE)
- [ ] Erreurs métier via AppError (jamais throw Error directement)
- [ ] Module enregistré dans `src/app.ts`
- [ ] TypeScript compile sans erreur (`npx tsc --noEmit`)

---

## ORDRE D'EXÉCUTION FINAL

```
Étape 0  → RBAC dynamique (critique, bloque tout)
Étape 1  → Module suppliers
Étape 2  → Module purchase-orders
Étape 3  → Module supplier-invoices
Étape 4  → Module expenses
Étape 5  → Module stock
Étape 6  → Module bank
Étape 7  → Module accounting
Étape 8  → Module settings-advanced
Étape 9  → accountingEngine (écritures auto)
Étape 10 → eventBus (workflow + webhooks)
Étape 11 → Worker export BullMQ
Étape 12 → Dashboard v3 KPIs
```

---

## FICHIERS DE RÉFÉRENCE

| Besoin | Fichier |
|--------|---------|
| Schéma SQL complet | `D:/Bel/projets/BRIDGE/invoicehub_schema_v3.sql` |
| Schéma Prisma complet | `bridge-backend/prisma/schema.prisma` |
| AppError | `src/core/errors/AppError.ts` |
| auditMiddleware | `src/core/middleware/audit.ts` |
| authenticate | `src/core/middleware/auth.ts` |
| Exemple module complet | `src/modules/invoices/` |
| Numérotation docs | `src/lib/documentNumber.ts` |
| PDF generation | `src/lib/pdf.ts` |
| BullMQ queues | `src/jobs/queues.ts` |
| Socket.io broadcast | `src/lib/broadcast.ts` |
| Logger Winston | `src/lib/logger.ts` (ou `config/logger.ts`) |
