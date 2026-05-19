# PROMPT CLAUDE CODE — Migration Schéma InvoiceHub v2 → v3
# BTS ERP Complet : RBAC + Achats + Dépenses + Banques + Comptabilité + Paramètres

---

## CONTEXTE & OBJECTIF

Tu es en charge de mettre à jour le schéma PostgreSQL de l'application **InvoiceHub** (Bridge Technologies Solutions — Douala, Cameroun). Le fichier de schéma actuel est `invoicehub_schema_v2.sql`.

L'objectif est de produire un fichier `invoicehub_schema_v3.sql` **complet, autonome et prêt à appliquer en production** qui transforme l'application d'un outil de facturation en un **ERP de niveau entreprise** comparable à Sage ou Odoo, conforme **SYSCOHADA**, avec 6 modules supplémentaires.

> ⚠️ **RÈGLES ABSOLUES à respecter tout au long du travail :**
> - Ne rien supprimer du schéma existant sans raison explicite — tout modifier/étendre proprement
> - Chaque table doit avoir ses index, contraintes CHECK, triggers `updated_at` et commentaires
> - Chaque ENUM modifié → créer un nouveau type et migrer (pas de DROP/RECREATE si des données existent)
> - Toutes les FK avec les bons comportements `ON DELETE` (RESTRICT pour les entités comptables, CASCADE pour les sous-entités, SET NULL pour les références optionnelles)
> - Le fichier final doit être exécutable d'un bout à l'autre dans l'ordre, sans erreur
> - Travailler **étape par étape**, valider chaque étape avant de passer à la suivante
> - À la fin de chaque étape, lister ce qui a été fait et vérifier qu'il ne manque rien

---

## ÉTAPE 1 — RBAC DYNAMIQUE (Remplace le système de rôles hardcodés)

### 1.1 Analyser l'existant à modifier
L'actuel schéma contient :
- `CREATE TYPE user_role AS ENUM ('admin', 'commercial', 'employee');`
- `users.role user_role NOT NULL DEFAULT 'employee'`
- `audit_logs.user_role user_role` (snapshot)

Ces 3 éléments doivent tous être migrés.

### 1.2 Créer la table `roles`

```sql
CREATE TABLE roles (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL UNIQUE,     -- slug machine : 'admin', 'responsable_achat'
    display_name    VARCHAR(255) NOT NULL,             -- affiché en UI : 'Responsable Achats'
    description     TEXT,
    color           CHAR(7),                           -- couleur HEX badge UI : '#2D7DD2'
    icon            VARCHAR(50),                       -- icône lucide-react
    is_system       BOOLEAN      NOT NULL DEFAULT FALSE, -- rôles système = non supprimables, non modifiables
    permissions     TEXT[]       NOT NULL DEFAULT '{}',  -- tableau des permissions accordées
    created_by      UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT chk_role_name_format CHECK (name ~ '^[a-z0-9_]+$')
);
CREATE TRIGGER tg_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_roles_name       ON roles(name);
CREATE INDEX idx_roles_is_system  ON roles(is_system);
COMMENT ON TABLE roles IS 'Rôles RBAC dynamiques. Les rôles système (is_system=true) ne peuvent être ni supprimés ni modifiés.';
COMMENT ON COLUMN roles.permissions IS 'Tableau des permissions accordées. Format : module:action — ex: invoices:create, purchases:approve, roles:manage';
```

### 1.3 Liste exhaustive des permissions à définir (comme constante de seed)

Insérer un commentaire SQL documentant TOUTES les permissions disponibles par module, organisées en groupes. Voici la liste complète :

**Module Facturation (ventes)**
- `invoices:read`, `invoices:create`, `invoices:edit`, `invoices:issue`, `invoices:cancel`, `invoices:delete`

**Module Proformas / Devis**
- `proformas:read`, `proformas:create`, `proformas:edit`, `proformas:send`, `proformas:delete`

**Module Clients**
- `clients:read`, `clients:create`, `clients:edit`, `clients:archive`, `clients:delete`

**Module Produits & Catalogue**
- `products:read`, `products:create`, `products:edit`, `products:delete`

**Module Paiements (encaissements)**
- `payments:read`, `payments:create`, `payments:delete`

**Module Achats & Fournisseurs**
- `suppliers:read`, `suppliers:create`, `suppliers:edit`, `suppliers:archive`
- `purchases:read`, `purchases:create`, `purchases:edit`, `purchases:approve`, `purchases:receive`, `purchases:delete`
- `supplier_invoices:read`, `supplier_invoices:create`, `supplier_invoices:validate`, `supplier_invoices:delete`
- `supplier_payments:read`, `supplier_payments:create`, `supplier_payments:delete`

**Module Stock**
- `stock:read`, `stock:adjust`, `stock:write_off`

**Module Dépenses**
- `expenses:read`, `expenses:create`, `expenses:edit`, `expenses:approve`, `expenses:reject`, `expenses:delete`
- `expense_categories:manage`

**Module Banques & Trésorerie**
- `banks:read`, `banks:create`, `banks:edit`
- `bank_transactions:read`, `bank_transactions:create`
- `bank_reconciliation:read`, `bank_reconciliation:manage`

**Module Comptabilité**
- `accounting:read`, `accounting:write`, `accounting:validate`, `accounting:export`
- `chart_of_accounts:read`, `chart_of_accounts:manage`
- `fiscal_periods:manage`

**Module Rapports**
- `reports:read`, `reports:export`

**Module Utilisateurs**
- `users:read`, `users:create`, `users:edit`, `users:suspend`

**Module Rôles (méta-permission)**
- `roles:read`, `roles:manage`

**Module Paramètres**
- `settings:read`, `settings:edit`
- `templates:manage`
- `custom_fields:manage`
- `webhooks:manage`
- `api_keys:manage`

**Module Audit**
- `audit:read`

**Wildcard admin**
- `*` (toutes les permissions — uniquement pour le rôle admin système)

### 1.4 Modifier la table `users`

Ajouter la colonne `role_id` et migrer les données avant de supprimer l'ancienne colonne `role` :

```sql
-- 1. Ajouter la nouvelle colonne (nullable d'abord)
ALTER TABLE users ADD COLUMN role_id UUID REFERENCES roles(id) ON DELETE RESTRICT;

-- 2. Après le seed des rôles système (étape 1.6), mettre à jour :
-- UPDATE users SET role_id = (SELECT id FROM roles WHERE name = users.role::TEXT);

-- 3. Rendre NOT NULL
-- ALTER TABLE users ALTER COLUMN role_id SET NOT NULL;

-- 4. Supprimer l'ancienne colonne
-- ALTER TABLE users DROP COLUMN role;
```

> Note : les commentaires SQL ci-dessus doivent être exécutés dans le bon ordre dans le fichier final — ne pas les laisser commentés.

### 1.5 Modifier `audit_logs`

Le champ `user_role user_role` doit devenir `user_role_name VARCHAR(100)` pour stocker le nom du rôle dynamique (snapshot texte).

```sql
ALTER TABLE audit_logs ADD COLUMN user_role_name VARCHAR(100);
-- Migrer: UPDATE audit_logs SET user_role_name = user_role::TEXT WHERE user_role IS NOT NULL;
ALTER TABLE audit_logs DROP COLUMN user_role;
```

### 1.6 Seed des 3 rôles système

Insérer les 3 rôles système avec leurs permissions exactes :

**admin** : permissions = `ARRAY['*']`, is_system = TRUE
**commercial** : permissions = `ARRAY['invoices:read','invoices:create','invoices:edit','invoices:issue','proformas:read','proformas:create','proformas:edit','proformas:send','clients:read','clients:create','clients:edit','products:read','purchases:read','purchases:create','payments:read','payments:create','reports:read','notifications:read','stock:read']`, is_system = TRUE
**employee** : permissions = `ARRAY['invoices:read','proformas:read','clients:read','products:read','payments:read','reports:read','stock:read']`, is_system = TRUE

### 1.7 Supprimer l'ancien ENUM (en dernier, après migration complète)

```sql
DROP TYPE IF EXISTS user_role;
```

### 1.8 Table de jonction `role_permissions_audit` (traçabilité des modifications de rôles)

```sql
CREATE TABLE role_change_history (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id         UUID        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    changed_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(20) NOT NULL,  -- 'CREATED', 'PERMISSIONS_UPDATED', 'DELETED'
    previous_perms  TEXT[],
    new_perms       TEXT[],
    reason          TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_role_change_history_role_id ON role_change_history(role_id);
COMMENT ON TABLE role_change_history IS 'Traçabilité immuable de toutes les modifications de permissions sur les rôles.';
```

### 1.9 Vérification étape 1

À la fin de cette étape, vérifier que :
- [ ] Table `roles` créée avec tous les champs, index, trigger et commentaire
- [ ] `users.role_id` migré et NOT NULL, ancienne colonne `role` supprimée
- [ ] `audit_logs.user_role_name` remplace `audit_logs.user_role`
- [ ] 3 rôles système insérés (admin, commercial, employee)
- [ ] Table `role_change_history` créée
- [ ] ENUM `user_role` supprimé
- [ ] Toutes les requêtes s'enchaînent sans erreur

---

## ÉTAPE 2 — EXTENSIONS DU SCHÉMA EXISTANT

### 2.1 Étendre `company_settings`

Ajouter les colonnes manquantes pour les nouveaux modules :

```sql
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS
    -- Paramètres comptabilité
    fiscal_year_start_month     SMALLINT    NOT NULL DEFAULT 1,  -- 1=janvier, 7=juillet
    default_accounting_currency CHAR(3)     NOT NULL DEFAULT 'XAF',
    syscohada_company_type      VARCHAR(50) DEFAULT 'PME',       -- PME, GE, TPE

    -- Paramètres achats
    default_purchase_due_days   SMALLINT    NOT NULL DEFAULT 30,
    purchase_approval_threshold NUMERIC(15,2),  -- seuil d'approbation en XAF (NULL = pas de seuil)

    -- Paramètres dépenses
    expense_approval_required   BOOLEAN     NOT NULL DEFAULT TRUE,
    expense_approval_threshold  NUMERIC(15,2) DEFAULT 50000,     -- seuil d'approbation dépenses

    -- Paramètres banques
    default_bank_account_id     UUID,  -- FK ajoutée après création de bank_accounts

    -- Branding avancé
    primary_color               CHAR(7)     DEFAULT '#4F46E5',
    secondary_color             CHAR(7)     DEFAULT '#10B981',
    app_custom_name             VARCHAR(100) DEFAULT 'InvoiceHub',
    document_footer_legal       TEXT,       -- mentions légales pied de page

    -- Politique de mots de passe
    password_min_length         SMALLINT    NOT NULL DEFAULT 8,
    password_require_uppercase  BOOLEAN     NOT NULL DEFAULT TRUE,
    password_require_number     BOOLEAN     NOT NULL DEFAULT TRUE,
    password_require_special    BOOLEAN     NOT NULL DEFAULT FALSE,
    password_expiry_days        SMALLINT,   -- NULL = pas d'expiration

    -- Workflow approbation factures
    invoice_approval_required   BOOLEAN     NOT NULL DEFAULT FALSE,
    invoice_approval_threshold  NUMERIC(15,2),

    -- Webhooks & intégrations
    webhooks_enabled            BOOLEAN     NOT NULL DEFAULT FALSE;
```

### 2.2 Étendre le type `document_type` ENUM

```sql
-- PostgreSQL ne permet pas ALTER TYPE ADD VALUE dans une transaction.
-- Utiliser une nouvelle valeur ou recréer proprement :
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'purchase_order';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'supplier_invoice';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'expense';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'delivery_note';  -- bon de livraison
```

### 2.3 Étendre les ENUMs existants

```sql
-- Étendre payment_method pour les achats fournisseurs
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'prelevement';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'lettre_de_change';

-- Étendre audit_action pour les nouveaux modules
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'APPROVAL_REQUESTED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'RECONCILED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'STOCK_ADJUSTED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'JOURNAL_ENTRY_CREATED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'JOURNAL_ENTRY_VALIDATED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'FISCAL_PERIOD_CLOSED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'ROLE_PERMISSION_CHANGED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'WEBHOOK_TRIGGERED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'BANK_IMPORT';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'EXPENSE_SUBMITTED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'EXPENSE_APPROVED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'EXPENSE_REJECTED';

-- Étendre notification_status pour les nouveaux modules
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'purchase_order_created';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'purchase_order_approved';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'purchase_order_rejected';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'supplier_invoice_received';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'supplier_invoice_due';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'expense_submitted';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'expense_approved';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'expense_rejected';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'low_stock_alert';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'bank_reconciliation_pending';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'fiscal_period_closing';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'role_changed';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'approval_requested';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'budget_exceeded';
```

### 2.4 Étendre la table `products` pour le stock et les achats

```sql
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS track_stock         BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS stock_quantity      NUMERIC(10,3) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stock_min_level     NUMERIC(10,3),  -- seuil d'alerte stock bas
    ADD COLUMN IF NOT EXISTS stock_max_level     NUMERIC(10,3),  -- seuil de surstock
    ADD COLUMN IF NOT EXISTS stock_unit          VARCHAR(20),    -- unité de stockage (si diff. unité de vente)
    ADD COLUMN IF NOT EXISTS purchase_price_ht   NUMERIC(15,2),  -- prix d'achat standard fournisseur
    ADD COLUMN IF NOT EXISTS cost_price_ht       NUMERIC(15,2),  -- prix de revient (peut inclure transport etc.)
    ADD COLUMN IF NOT EXISTS barcode             VARCHAR(100),   -- code-barres EAN13/QR
    ADD COLUMN IF NOT EXISTS weight_kg           NUMERIC(8,3),   -- poids pour calcul transport
    ADD COLUMN IF NOT EXISTS default_supplier_id UUID;           -- FK vers suppliers (ajoutée après)

COMMENT ON COLUMN products.track_stock IS 'Si TRUE, les mouvements de stock sont tracés automatiquement sur les ventes et achats.';
COMMENT ON COLUMN products.stock_quantity IS 'Stock actuel en temps réel. Mis à jour automatiquement par les mouvements.';
COMMENT ON COLUMN products.purchase_price_ht IS 'Prix d''achat standard chez le fournisseur par défaut. Utilisé pour calcul de marge.';
COMMENT ON COLUMN products.cost_price_ht IS 'Prix de revient complet (achat + transport + douane). Utilisé pour la marge réelle.';
```

### 2.5 Étendre `payments` pour lien banque

```sql
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS bank_account_id    UUID,  -- FK vers bank_accounts (ajoutée après)
    ADD COLUMN IF NOT EXISTS bank_transaction_id UUID, -- FK vers bank_transactions (ajoutée après)
    ADD COLUMN IF NOT EXISTS reconciled_at      TIMESTAMPTZ,  -- date de rapprochement bancaire
    ADD COLUMN IF NOT EXISTS reconciled_by      UUID REFERENCES users(id) ON DELETE SET NULL;
```

### 2.6 Étendre `clients` — Contact principal et données CRM légères

```sql
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS contact_first_name  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS contact_last_name   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS contact_position    VARCHAR(100),  -- 'Directeur Financier'
    ADD COLUMN IF NOT EXISTS contact_phone       VARCHAR(50),
    ADD COLUMN IF NOT EXISTS contact_email       VARCHAR(255),
    ADD COLUMN IF NOT EXISTS credit_limit        NUMERIC(15,2),  -- plafond crédit accordé
    ADD COLUMN IF NOT EXISTS credit_days         SMALLINT DEFAULT 30,
    ADD COLUMN IF NOT EXISTS risk_level          VARCHAR(20) DEFAULT 'normal',  -- 'low','normal','high','blocked'
    ADD COLUMN IF NOT EXISTS assigned_to         UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tags                TEXT[] DEFAULT '{}';  -- labels libres
```

### 2.7 Vérification étape 2

- [ ] `company_settings` étendu avec tous les nouveaux champs
- [ ] ENUMs `document_type`, `payment_method`, `audit_action`, `notification_status` enrichis
- [ ] `products` avec colonnes stock et achat
- [ ] `payments` avec liens banque
- [ ] `clients` avec CRM léger
- [ ] Aucune rupture de compatibilité avec les données existantes

---

## ÉTAPE 3 — MODULE ACHATS & FOURNISSEURS

### 3.1 ENUMs spécifiques achats

```sql
CREATE TYPE supplier_status       AS ENUM ('active', 'suspended', 'archived');
CREATE TYPE purchase_order_status AS ENUM ('draft','sent','confirmed','partially_received','received','cancelled','closed');
CREATE TYPE supplier_invoice_status AS ENUM ('draft','received','validated','partially_paid','paid','disputed','cancelled');
CREATE TYPE stock_movement_type   AS ENUM ('purchase_receipt','sale','adjustment_in','adjustment_out','write_off','return_supplier','return_customer','initial_stock','transfer_in','transfer_out');
CREATE TYPE delivery_status       AS ENUM ('pending','partial','complete','cancelled');
```

### 3.2 Table `suppliers` — Annuaire fournisseurs

```sql
CREATE TABLE suppliers (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identité
    name                VARCHAR(255) NOT NULL,
    trade_name          VARCHAR(255),               -- nom commercial si différent
    type                VARCHAR(20)  NOT NULL DEFAULT 'company', -- 'company', 'individual'

    -- Coordonnées
    email               VARCHAR(255),
    phone               VARCHAR(50),
    phone_2             VARCHAR(50),
    fax                 VARCHAR(50),
    website             VARCHAR(255),

    -- Adresse
    address             TEXT,
    city                VARCHAR(100),
    country             VARCHAR(100) NOT NULL DEFAULT 'Cameroun',
    postal_box          VARCHAR(50),

    -- Identifiants légaux
    tax_number          VARCHAR(100),               -- NIU
    rccm                VARCHAR(100),               -- RCCM
    statistical_number  VARCHAR(100),               -- Numéro statistique

    -- Contact principal
    contact_first_name  VARCHAR(100),
    contact_last_name   VARCHAR(100),
    contact_position    VARCHAR(100),
    contact_phone       VARCHAR(50),
    contact_email       VARCHAR(255),

    -- Conditions commerciales
    currency            CHAR(3)      NOT NULL DEFAULT 'XAF',
    default_payment_terms TEXT,
    default_due_days    SMALLINT     NOT NULL DEFAULT 30,
    payment_method      payment_method NOT NULL DEFAULT 'virement',

    -- Coordonnées bancaires fournisseur
    bank_name           VARCHAR(255),
    bank_account        VARCHAR(100),
    bank_rib             VARCHAR(100),
    bank_swift           VARCHAR(20),

    -- Classification & performance
    category            VARCHAR(100),               -- 'informatique', 'bureautique', 'telecom'...
    rating              SMALLINT     DEFAULT 3,     -- note interne 1-5
    is_preferred        BOOLEAN      NOT NULL DEFAULT FALSE,
    credit_limit        NUMERIC(15,2),              -- plafond encours max chez ce fournisseur

    -- Statut
    status              supplier_status NOT NULL DEFAULT 'active',
    internal_notes      TEXT,                       -- CONFIDENTIEL
    tags                TEXT[]       DEFAULT '{}',

    -- Compte comptable SYSCOHADA (classe 4 fournisseurs)
    accounting_account  VARCHAR(20)  DEFAULT '401000',  -- ex: 401100 pour sous-compte spécifique

    -- Champs flexibles
    metadata            JSONB        NOT NULL DEFAULT '{}',

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID         REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_supplier_rating CHECK (rating BETWEEN 1 AND 5)
);
CREATE TRIGGER tg_suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_suppliers_name      ON suppliers USING gin(to_tsvector('french', name));
CREATE INDEX idx_suppliers_status    ON suppliers(status);
CREATE INDEX idx_suppliers_category  ON suppliers(category);
CREATE INDEX idx_suppliers_active    ON suppliers(id) WHERE deleted_at IS NULL;
COMMENT ON TABLE suppliers IS 'Annuaire des fournisseurs BTS. Miroir de clients pour le circuit d''achats.';

-- Rattacher le fournisseur par défaut aux produits
ALTER TABLE products
    ADD CONSTRAINT fk_products_default_supplier
    FOREIGN KEY (default_supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
```

### 3.3 Table `supplier_contacts` — Contacts multiples par fournisseur

```sql
CREATE TABLE supplier_contacts (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id     UUID        NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100),
    position        VARCHAR(100),
    email           VARCHAR(255),
    phone           VARCHAR(50),
    phone_2         VARCHAR(50),
    is_primary      BOOLEAN     NOT NULL DEFAULT FALSE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER tg_supplier_contacts_updated_at BEFORE UPDATE ON supplier_contacts
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_supplier_contacts_supplier_id ON supplier_contacts(supplier_id);
```

### 3.4 Table `purchase_orders` — Bons de commande fournisseur

```sql
CREATE TABLE purchase_orders (
    id                      UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Numérotation SYSCOHADA : BTS/DC/2026/01/bc001
    number                  VARCHAR(50)           NOT NULL UNIQUE,
    office_id               UUID                  NOT NULL REFERENCES agency_offices(id) ON DELETE RESTRICT,

    -- Parties
    supplier_id             UUID                  NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    created_by              UUID                  NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_to             UUID                  REFERENCES users(id) ON DELETE SET NULL,
    approved_by             UUID                  REFERENCES users(id) ON DELETE SET NULL,

    -- Dates
    issue_date              DATE                  NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date  DATE,
    confirmed_delivery_date DATE,
    delivered_at            TIMESTAMPTZ,

    -- En-tête
    subject                 VARCHAR(500),
    supplier_reference      VARCHAR(100),         -- référence BC chez le fournisseur
    delivery_address        TEXT,
    notes                   TEXT,
    internal_notes          TEXT,
    payment_conditions      TEXT,

    -- Devise
    currency                CHAR(3)               NOT NULL DEFAULT 'XAF',

    -- Calculs financiers
    subtotal_ht             NUMERIC(15,2)         NOT NULL DEFAULT 0,
    global_discount_type    discount_type         NOT NULL DEFAULT 'none',
    global_discount_value   NUMERIC(15,2)         NOT NULL DEFAULT 0,
    global_discount_amount  NUMERIC(15,2)         NOT NULL DEFAULT 0,
    total_ht                NUMERIC(15,2)         NOT NULL DEFAULT 0,
    total_tax               NUMERIC(15,2)         NOT NULL DEFAULT 0,
    total_ttc               NUMERIC(15,2)         NOT NULL DEFAULT 0,

    -- Réception
    delivery_status         delivery_status       NOT NULL DEFAULT 'pending',
    amount_received_ht      NUMERIC(15,2)         NOT NULL DEFAULT 0,

    -- Facturation fournisseur (lien)
    fully_invoiced          BOOLEAN               NOT NULL DEFAULT FALSE,

    -- Workflow approbation
    approval_required       BOOLEAN               NOT NULL DEFAULT FALSE,
    approved_at             TIMESTAMPTZ,
    approval_notes          TEXT,

    -- Statut
    status                  purchase_order_status NOT NULL DEFAULT 'draft',

    -- Fichiers
    pdf_path                VARCHAR(500),
    pdf_generated_at        TIMESTAMPTZ,
    attachment_paths        TEXT[]                DEFAULT '{}',

    metadata                JSONB                 NOT NULL DEFAULT '{}',

    created_at              TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,

    CONSTRAINT chk_po_subtotal    CHECK (subtotal_ht >= 0),
    CONSTRAINT chk_po_total_ttc   CHECK (total_ttc   >= 0)
);
CREATE TRIGGER tg_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_po_supplier_id  ON purchase_orders(supplier_id);
CREATE INDEX idx_po_created_by   ON purchase_orders(created_by);
CREATE INDEX idx_po_status       ON purchase_orders(status);
CREATE INDEX idx_po_issue_date   ON purchase_orders(issue_date);
CREATE INDEX idx_po_active       ON purchase_orders(id) WHERE deleted_at IS NULL;
COMMENT ON TABLE purchase_orders IS 'Bons de commande fournisseur. Numérotation SYSCOHADA BC001. Miroir des proformas côté achats.';
```

### 3.5 Table `purchase_order_lines` — Lignes de bons de commande

```sql
CREATE TABLE purchase_order_lines (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID       NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id      UUID         REFERENCES products(id) ON DELETE SET NULL,
    sort_order      SMALLINT     NOT NULL DEFAULT 0,

    designation     VARCHAR(500) NOT NULL,
    description     TEXT,
    unit            product_unit NOT NULL DEFAULT 'piece',
    supplier_reference VARCHAR(100),     -- référence fournisseur pour cette ligne

    -- Quantités
    quantity_ordered  NUMERIC(10,3) NOT NULL DEFAULT 1,
    quantity_received NUMERIC(10,3) NOT NULL DEFAULT 0,
    quantity_invoiced NUMERIC(10,3) NOT NULL DEFAULT 0,

    -- Prix (prix d'achat HT)
    unit_price_ht   NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Remise fournisseur
    discount_type   discount_type NOT NULL DEFAULT 'none',
    discount_value  NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Taxe déductible
    tax_rate        NUMERIC(5,2)  NOT NULL DEFAULT 19.25,

    -- Totaux
    subtotal_ht     NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_ht          NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ttc       NUMERIC(15,2) NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_pol_qty_ordered   CHECK (quantity_ordered > 0),
    CONSTRAINT chk_pol_qty_received  CHECK (quantity_received >= 0),
    CONSTRAINT chk_pol_price         CHECK (unit_price_ht >= 0),
    CONSTRAINT chk_pol_tax_rate      CHECK (tax_rate BETWEEN 0 AND 100)
);
CREATE TRIGGER tg_po_lines_updated_at BEFORE UPDATE ON purchase_order_lines
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_pol_purchase_order_id ON purchase_order_lines(purchase_order_id);
```

### 3.6 Table `purchase_order_status_history`

```sql
CREATE TABLE purchase_order_status_history (
    id              UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID               NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    changed_by      UUID                 NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    previous_status purchase_order_status,
    new_status      purchase_order_status NOT NULL,
    reason          TEXT,
    changed_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_po_status_hist ON purchase_order_status_history(purchase_order_id);
```

### 3.7 Table `supplier_invoices` — Factures fournisseurs reçues

```sql
CREATE TABLE supplier_invoices (
    id                      UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Numérotation interne : BTS/DC/2026/01/ff001
    number                  VARCHAR(50)             NOT NULL UNIQUE,
    office_id               UUID                    NOT NULL REFERENCES agency_offices(id) ON DELETE RESTRICT,

    -- Numéro de la facture du fournisseur (externe)
    supplier_invoice_number VARCHAR(100)            NOT NULL,

    -- Parties
    supplier_id             UUID                    NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_order_id       UUID                    REFERENCES purchase_orders(id) ON DELETE SET NULL,
    created_by              UUID                    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    validated_by            UUID                    REFERENCES users(id) ON DELETE SET NULL,

    -- Dates
    invoice_date            DATE                    NOT NULL,  -- date sur la facture fournisseur
    received_date           DATE                    NOT NULL DEFAULT CURRENT_DATE,
    due_date                DATE                    NOT NULL,

    -- En-tête
    description             TEXT,
    notes                   TEXT,
    payment_conditions      TEXT,

    -- Devise
    currency                CHAR(3)                 NOT NULL DEFAULT 'XAF',

    -- Calculs financiers
    subtotal_ht             NUMERIC(15,2)           NOT NULL DEFAULT 0,
    global_discount_type    discount_type           NOT NULL DEFAULT 'none',
    global_discount_value   NUMERIC(15,2)           NOT NULL DEFAULT 0,
    global_discount_amount  NUMERIC(15,2)           NOT NULL DEFAULT 0,
    total_ht                NUMERIC(15,2)           NOT NULL DEFAULT 0,
    total_tax               NUMERIC(15,2)           NOT NULL DEFAULT 0,  -- TVA déductible
    total_ttc               NUMERIC(15,2)           NOT NULL DEFAULT 0,

    -- Paiements
    amount_paid             NUMERIC(15,2)           NOT NULL DEFAULT 0,
    balance_due             NUMERIC(15,2)           NOT NULL DEFAULT 0,

    -- Statut
    status                  supplier_invoice_status NOT NULL DEFAULT 'draft',
    validated_at            TIMESTAMPTZ,

    -- Fichiers
    scan_path               VARCHAR(500),           -- scan de la facture reçue
    pdf_path                VARCHAR(500),

    -- Compte comptable fournisseur
    accounting_account      VARCHAR(20)             DEFAULT '401000',

    metadata                JSONB                   NOT NULL DEFAULT '{}',

    created_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,

    CONSTRAINT chk_si_due_date    CHECK (due_date >= invoice_date),
    CONSTRAINT chk_si_subtotal    CHECK (subtotal_ht >= 0),
    CONSTRAINT chk_si_total_ttc   CHECK (total_ttc   >= 0),
    CONSTRAINT chk_si_amount_paid CHECK (amount_paid >= 0)
);
CREATE TRIGGER tg_supplier_invoices_updated_at BEFORE UPDATE ON supplier_invoices
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_si_supplier_id   ON supplier_invoices(supplier_id);
CREATE INDEX idx_si_po_id         ON supplier_invoices(purchase_order_id);
CREATE INDEX idx_si_status        ON supplier_invoices(status);
CREATE INDEX idx_si_due_date      ON supplier_invoices(due_date);
CREATE INDEX idx_si_active        ON supplier_invoices(id) WHERE deleted_at IS NULL;
COMMENT ON TABLE supplier_invoices IS 'Factures reçues des fournisseurs. Numérotation FF001. Miroir des invoices côté achats.';
```

### 3.8 Table `supplier_invoice_lines`

```sql
CREATE TABLE supplier_invoice_lines (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_invoice_id UUID         NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
    product_id          UUID         REFERENCES products(id) ON DELETE SET NULL,
    purchase_order_line_id UUID      REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
    sort_order          SMALLINT     NOT NULL DEFAULT 0,

    designation         VARCHAR(500) NOT NULL,
    description         TEXT,
    unit                product_unit NOT NULL DEFAULT 'piece',
    quantity            NUMERIC(10,3) NOT NULL DEFAULT 1,
    unit_price_ht       NUMERIC(15,2) NOT NULL DEFAULT 0,

    discount_type       discount_type NOT NULL DEFAULT 'none',
    discount_value      NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,

    tax_rate            NUMERIC(5,2)  NOT NULL DEFAULT 19.25,
    subtotal_ht         NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_ht              NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ttc           NUMERIC(15,2) NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_sil_qty      CHECK (quantity > 0),
    CONSTRAINT chk_sil_price    CHECK (unit_price_ht >= 0),
    CONSTRAINT chk_sil_tax_rate CHECK (tax_rate BETWEEN 0 AND 100)
);
CREATE TRIGGER tg_supplier_invoice_lines_updated_at BEFORE UPDATE ON supplier_invoice_lines
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_sil_supplier_invoice_id ON supplier_invoice_lines(supplier_invoice_id);
```

### 3.9 Table `supplier_payments` — Paiements aux fournisseurs

```sql
CREATE TABLE supplier_payments (
    id                  UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_invoice_id UUID           NOT NULL REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
    payment_date        DATE           NOT NULL DEFAULT CURRENT_DATE,
    amount              NUMERIC(15,2)  NOT NULL,
    method              payment_method NOT NULL DEFAULT 'virement',
    reference           VARCHAR(255),
    notes               TEXT,
    attachment_path     VARCHAR(500),

    -- Lien bancaire
    bank_account_id     UUID,          -- FK vers bank_accounts (ajoutée après)
    bank_transaction_id UUID,          -- FK vers bank_transactions (ajoutée après)
    reconciled_at       TIMESTAMPTZ,
    reconciled_by       UUID           REFERENCES users(id) ON DELETE SET NULL,

    created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT chk_spay_amount CHECK (amount > 0)
);
CREATE TRIGGER tg_supplier_payments_updated_at BEFORE UPDATE ON supplier_payments
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_spay_invoice_id  ON supplier_payments(supplier_invoice_id);
CREATE INDEX idx_spay_date        ON supplier_payments(payment_date);
CREATE INDEX idx_spay_active      ON supplier_payments(id) WHERE deleted_at IS NULL;
COMMENT ON TABLE supplier_payments IS 'Paiements effectués aux fournisseurs. Miroir de payments côté achats.';
```

### 3.10 Table `stock_movements` — Mouvements de stock traçables

```sql
CREATE TABLE stock_movements (
    id                  UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id          UUID                 NOT NULL REFERENCES products(id) ON DELETE RESTRICT,

    -- Type et direction
    type                stock_movement_type  NOT NULL,
    quantity            NUMERIC(10,3)        NOT NULL,  -- positif = entrée, négatif = sortie
    quantity_before     NUMERIC(10,3)        NOT NULL,  -- stock avant mouvement
    quantity_after      NUMERIC(10,3)        NOT NULL,  -- stock après mouvement

    -- Coût unitaire au moment du mouvement (pour valorisation FIFO/CMUP)
    unit_cost_ht        NUMERIC(15,2),
    total_cost_ht       NUMERIC(15,2),

    -- Source du mouvement (polymorphique)
    source_type         VARCHAR(50),       -- 'purchase_order', 'invoice', 'adjustment', 'supplier_return'
    source_id           UUID,              -- ID de la pièce source
    source_label        VARCHAR(255),      -- ex: 'BC BTS/DC/2026/01/bc001'

    -- Entrepôt/Localisation (extensible)
    location            VARCHAR(100)       DEFAULT 'Magasin Principal',

    notes               TEXT,
    created_by          UUID               REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_sm_quantity_before  CHECK (quantity_before >= 0),
    CONSTRAINT chk_sm_quantity_after   CHECK (quantity_after  >= 0)
);
CREATE INDEX idx_sm_product_id  ON stock_movements(product_id);
CREATE INDEX idx_sm_type        ON stock_movements(type);
CREATE INDEX idx_sm_source      ON stock_movements(source_type, source_id);
CREATE INDEX idx_sm_created_at  ON stock_movements(created_at DESC);
COMMENT ON TABLE stock_movements IS 'Journal des mouvements de stock. Immuable — pas de UPDATE/DELETE. Source de vérité pour le stock.';
-- Empêcher la modification des mouvements de stock (journal immuable)
CREATE RULE no_update_stock_movements AS ON UPDATE TO stock_movements DO INSTEAD NOTHING;
CREATE RULE no_delete_stock_movements AS ON DELETE TO stock_movements DO INSTEAD NOTHING;
```

### 3.11 Numérotation SYSCOHADA pour les nouveaux types de documents

Mettre à jour la fonction `fn_next_document_number` pour supporter `purchase_order` (→ `bc`) et `supplier_invoice` (→ `ff`) :

```sql
CREATE OR REPLACE FUNCTION fn_next_document_number(
    p_office_id UUID,
    p_doc_type  document_type,
    p_year      SMALLINT DEFAULT NULL,
    p_month     SMALLINT DEFAULT NULL
) RETURNS VARCHAR LANGUAGE plpgsql AS $$
DECLARE
    v_year        SMALLINT := COALESCE(p_year,  EXTRACT(YEAR  FROM NOW())::SMALLINT);
    v_month       SMALLINT := COALESCE(p_month, EXTRACT(MONTH FROM NOW())::SMALLINT);
    v_seq         INTEGER;
    v_office_code VARCHAR(10);
    v_doc_prefix  VARCHAR(5);
BEGIN
    SELECT code INTO STRICT v_office_code FROM agency_offices WHERE id = p_office_id;

    INSERT INTO document_sequences (office_id, document_type, year, month, last_sequence)
    VALUES (p_office_id, p_doc_type, v_year, v_month, 1)
    ON CONFLICT (office_id, document_type, year, month)
    DO UPDATE SET last_sequence = document_sequences.last_sequence + 1
    RETURNING last_sequence INTO v_seq;

    v_doc_prefix := CASE p_doc_type
        WHEN 'proforma'         THEN 'pfm'
        WHEN 'invoice'          THEN 'fac'
        WHEN 'purchase_order'   THEN 'bc'
        WHEN 'supplier_invoice' THEN 'ff'
        WHEN 'expense'          THEN 'dep'
        WHEN 'delivery_note'    THEN 'bl'
        ELSE 'doc'
    END;

    RETURN format('BTS/%s/%s/%s/%s%s',
        v_office_code, v_year,
        lpad(v_month::TEXT, 2, '0'),
        v_doc_prefix,
        lpad(v_seq::TEXT, 3, '0')
    );
END;
$$;
```

### 3.12 Vue `v_supplier_financial_summary`

```sql
CREATE VIEW v_supplier_financial_summary AS
SELECT
    s.id                                                                    AS supplier_id,
    s.name                                                                  AS supplier_name,
    s.status                                                                AS supplier_status,
    COUNT(DISTINCT si.id) FILTER (WHERE si.deleted_at IS NULL)              AS total_invoices,
    COALESCE(SUM(si.total_ttc)
        FILTER (WHERE si.status != 'cancelled' AND si.deleted_at IS NULL), 0) AS total_purchased,
    COALESCE(SUM(si.amount_paid)
        FILTER (WHERE si.deleted_at IS NULL), 0)                            AS total_paid,
    COALESCE(SUM(si.balance_due)
        FILTER (WHERE si.status IN ('validated','partially_paid') AND si.deleted_at IS NULL), 0) AS outstanding_balance,
    COUNT(DISTINCT si.id) FILTER (WHERE si.status = 'partially_paid')       AS nb_partially_paid,
    COUNT(DISTINCT si.id) FILTER (WHERE si.due_date < CURRENT_DATE
        AND si.status IN ('validated','partially_paid'))                     AS nb_overdue
FROM suppliers s
LEFT JOIN supplier_invoices si ON si.supplier_id = s.id
WHERE s.deleted_at IS NULL
GROUP BY s.id, s.name, s.status;
COMMENT ON VIEW v_supplier_financial_summary IS 'Synthèse financière par fournisseur : achats, paiements, encours, retards.';
```

### 3.13 Vérification étape 3

- [ ] `suppliers` + `supplier_contacts` créés avec tous les champs
- [ ] `purchase_orders` + `purchase_order_lines` + `purchase_order_status_history`
- [ ] `supplier_invoices` + `supplier_invoice_lines`
- [ ] `supplier_payments`
- [ ] `stock_movements` (immuable, journal)
- [ ] Fonction `fn_next_document_number` mise à jour
- [ ] Vue `v_supplier_financial_summary`
- [ ] FK `products.default_supplier_id` rattachée
- [ ] Tous les index présents

---

## ÉTAPE 4 — MODULE DÉPENSES

### 4.1 ENUMs dépenses

```sql
CREATE TYPE expense_status   AS ENUM ('draft','submitted','approved','rejected','paid','cancelled');
CREATE TYPE expense_frequency AS ENUM ('once','weekly','monthly','quarterly','annual');
```

### 4.2 Table `expense_categories` — Catégories de dépenses

```sql
CREATE TABLE expense_categories (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(100) NOT NULL UNIQUE,
    description         TEXT,
    icon                VARCHAR(50),
    color               CHAR(7),
    sort_order          SMALLINT    NOT NULL DEFAULT 0,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,

    -- Compte comptable SYSCOHADA lié (classe 6 charges)
    accounting_account  VARCHAR(20),  -- ex: '621000' loyer, '641000' salaires, '606000' petit mat.
    accounting_account_label VARCHAR(100),

    -- Budget mensuel de référence (optionnel)
    monthly_budget      NUMERIC(15,2),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID        REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER tg_expense_categories_updated_at BEFORE UPDATE ON expense_categories
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
COMMENT ON TABLE expense_categories IS 'Catégories de dépenses opérationnelles hors achats fournisseurs. Liées aux comptes SYSCOHADA classe 6.';

-- Catégories préconfigurées BTS
INSERT INTO expense_categories (name, description, icon, color, sort_order, accounting_account, accounting_account_label) VALUES
    ('Loyer & Charges',   'Loyer bureaux, électricité, eau, gardiennage',                     'building',   '#3B82F6', 1,  '621000', 'Loyers et charges locatives'),
    ('Personnel',         'Salaires, primes, charges sociales, CNPS',                         'users',      '#10B981', 2,  '641000', 'Charges de personnel'),
    ('Transport',         'Carburant, taxi, déplacements professionnels, frais de mission',   'car',        '#F59E0B', 3,  '624000', 'Transport et déplacements'),
    ('Télécom & Internet','Abonnements téléphone, internet, mobile money professionnel',       'wifi',       '#8B5CF6', 4,  '626000', 'Frais de télécommunication'),
    ('Marketing',         'Publicité, flyers, cartes de visite, réseaux sociaux, événements', 'megaphone',  '#EF4444', 5,  '623000', 'Publicité et marketing'),
    ('Maintenance',       'Entretien équipements, réparations, consommables techniques',       'wrench',     '#64748B', 6,  '615000', 'Entretien et réparations'),
    ('Fournitures',       'Papier, stylos, cartouches, fournitures bureau',                   'package',    '#6366F1', 7,  '606000', 'Achats de fournitures'),
    ('Formation',         'Cours, certifications, abonnements e-learning, conférences',        'graduation', '#0EA5E9', 8,  '632000', 'Formation du personnel'),
    ('Fiscalité & Légal', 'Impôts, taxes, honoraires notaire, frais juridiques',              'scale',      '#DC2626', 9,  '635000', 'Taxes et charges fiscales'),
    ('Divers',            'Dépenses diverses non classifiées ailleurs',                        'more-horizontal', '#94A3B8', 10, '658000', 'Charges diverses');
```

### 4.3 Table `expenses` — Dépenses opérationnelles

```sql
CREATE TABLE expenses (
    id                  UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Numérotation interne
    number              VARCHAR(50)       NOT NULL UNIQUE,
    office_id           UUID              NOT NULL REFERENCES agency_offices(id) ON DELETE RESTRICT,

    -- Classification
    category_id         UUID              NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,

    -- Parties
    created_by          UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    submitted_by        UUID              REFERENCES users(id) ON DELETE SET NULL,
    approved_by         UUID              REFERENCES users(id) ON DELETE SET NULL,
    rejected_by         UUID              REFERENCES users(id) ON DELETE SET NULL,
    paid_by             UUID              REFERENCES users(id) ON DELETE SET NULL,

    -- Bénéficiaire
    beneficiary_name    VARCHAR(255),     -- nom du fournisseur/personne payée
    supplier_id         UUID              REFERENCES suppliers(id) ON DELETE SET NULL,

    -- Dates
    expense_date        DATE              NOT NULL DEFAULT CURRENT_DATE,
    submitted_at        TIMESTAMPTZ,
    approved_at         TIMESTAMPTZ,
    rejected_at         TIMESTAMPTZ,
    paid_at             TIMESTAMPTZ,
    due_date            DATE,             -- date limite de remboursement (notes de frais)

    -- Description
    title               VARCHAR(500)      NOT NULL,
    description         TEXT,

    -- Montants
    amount_ht           NUMERIC(15,2)     NOT NULL DEFAULT 0,
    tax_rate            NUMERIC(5,2)      NOT NULL DEFAULT 0,   -- TVA déductible ou 0
    tax_amount          NUMERIC(15,2)     NOT NULL DEFAULT 0,
    amount_ttc          NUMERIC(15,2)     NOT NULL DEFAULT 0,

    -- Paiement
    payment_method      payment_method,
    paid_amount         NUMERIC(15,2)     NOT NULL DEFAULT 0,
    bank_account_id     UUID,             -- FK vers bank_accounts (ajoutée après)
    bank_transaction_id UUID,             -- FK vers bank_transactions (ajoutée après)
    reference           VARCHAR(255),     -- n° de chèque, virement, etc.

    -- Récurrence
    is_recurring        BOOLEAN           NOT NULL DEFAULT FALSE,
    frequency           expense_frequency,
    next_occurrence_date DATE,
    end_date            DATE,
    parent_expense_id   UUID              REFERENCES expenses(id) ON DELETE SET NULL,

    -- Note de frais (remboursement employé)
    is_employee_expense BOOLEAN           NOT NULL DEFAULT FALSE,  -- dépense à rembourser à l'employé
    reimbursed_at       TIMESTAMPTZ,
    reimbursement_reference VARCHAR(255),

    -- Statut
    status              expense_status    NOT NULL DEFAULT 'draft',
    rejection_reason    TEXT,

    -- Compte comptable SYSCOHADA
    accounting_account  VARCHAR(20),      -- hérite de la catégorie si NULL

    -- Fichiers
    attachment_paths    TEXT[]            DEFAULT '{}',   -- justificatifs (photos reçus, scans)

    metadata            JSONB             NOT NULL DEFAULT '{}',

    created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT chk_exp_amount_ht  CHECK (amount_ht  >= 0),
    CONSTRAINT chk_exp_amount_ttc CHECK (amount_ttc >= 0),
    CONSTRAINT chk_exp_tax_rate   CHECK (tax_rate BETWEEN 0 AND 100)
);
CREATE TRIGGER tg_expenses_updated_at BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_exp_category_id  ON expenses(category_id);
CREATE INDEX idx_exp_created_by   ON expenses(created_by);
CREATE INDEX idx_exp_status       ON expenses(status);
CREATE INDEX idx_exp_date         ON expenses(expense_date);
CREATE INDEX idx_exp_is_recurring ON expenses(is_recurring) WHERE is_recurring = TRUE;
CREATE INDEX idx_exp_active       ON expenses(id) WHERE deleted_at IS NULL;
COMMENT ON TABLE expenses IS 'Dépenses opérationnelles BTS hors achats fournisseurs (loyer, salaires, carburant, etc.). Workflow d''approbation intégré.';
```

### 4.4 Table `expense_status_history`

```sql
CREATE TABLE expense_status_history (
    id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id      UUID           NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    changed_by      UUID           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    previous_status expense_status,
    new_status      expense_status NOT NULL,
    reason          TEXT,
    changed_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_exp_status_hist ON expense_status_history(expense_id);
```

### 4.5 Table `expense_budgets` — Budgets par catégorie et période

```sql
CREATE TABLE expense_budgets (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id     UUID        NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
    year            SMALLINT    NOT NULL,
    month           SMALLINT,   -- NULL = budget annuel
    budget_amount   NUMERIC(15,2) NOT NULL,
    notes           TEXT,
    created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_expense_budget UNIQUE (category_id, year, month),
    CONSTRAINT chk_budget_month  CHECK (month IS NULL OR month BETWEEN 1 AND 12),
    CONSTRAINT chk_budget_amount CHECK (budget_amount > 0)
);
CREATE TRIGGER tg_expense_budgets_updated_at BEFORE UPDATE ON expense_budgets
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
COMMENT ON TABLE expense_budgets IS 'Budgets prévisionnels par catégorie de dépenses. Comparatif Budget vs Réalisé dans les rapports.';
```

### 4.6 Vérification étape 4

- [ ] `expense_categories` + seed des 10 catégories BTS
- [ ] `expenses` avec tous les champs (récurrence, note de frais, remboursement, workflow)
- [ ] `expense_status_history`
- [ ] `expense_budgets`
- [ ] Index présents sur toutes les tables

---

## ÉTAPE 5 — MODULE BANQUES & TRÉSORERIE

### 5.1 ENUMs banques

```sql
CREATE TYPE bank_account_type       AS ENUM ('checking','savings','petty_cash','mobile_money','term_deposit');
CREATE TYPE bank_transaction_type   AS ENUM ('debit','credit');
CREATE TYPE reconciliation_status   AS ENUM ('pending','reconciled','unmatched','ignored');
CREATE TYPE bank_import_status      AS ENUM ('pending','processing','completed','failed');
```

### 5.2 Table `bank_accounts` — Comptes bancaires de BTS

```sql
CREATE TABLE bank_accounts (
    id                  UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identité
    name                VARCHAR(255)       NOT NULL,      -- 'Compte Courant Afriland'
    account_type        bank_account_type  NOT NULL DEFAULT 'checking',
    bank_name           VARCHAR(255)       NOT NULL,      -- 'Afriland First Bank', 'SCB Cameroun'
    branch_name         VARCHAR(255),
    account_number      VARCHAR(100),
    iban                VARCHAR(50),
    swift_bic           VARCHAR(20),
    currency            CHAR(3)            NOT NULL DEFAULT 'XAF',

    -- Solde
    opening_balance     NUMERIC(15,2)      NOT NULL DEFAULT 0,
    opening_balance_date DATE              NOT NULL DEFAULT CURRENT_DATE,
    current_balance     NUMERIC(15,2)      NOT NULL DEFAULT 0,  -- calculé automatiquement
    last_reconciled_date DATE,

    -- Paramètres
    is_default          BOOLEAN            NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN            NOT NULL DEFAULT TRUE,
    color               CHAR(7),           -- couleur UI pour identification rapide
    icon                VARCHAR(50),

    -- Compte comptable SYSCOHADA (classe 5)
    accounting_account  VARCHAR(20)        DEFAULT '521000', -- 521000 = Banques locales

    -- Alertes
    low_balance_alert   NUMERIC(15,2),     -- seuil d'alerte solde bas
    alert_email         VARCHAR(255),

    notes               TEXT,
    metadata            JSONB              NOT NULL DEFAULT '{}',

    created_at          TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID               REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_ba_opening_balance CHECK (opening_balance >= 0)
);
CREATE TRIGGER tg_bank_accounts_updated_at BEFORE UPDATE ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE UNIQUE INDEX uq_bank_accounts_default ON bank_accounts (is_default) WHERE is_default = TRUE;
CREATE INDEX idx_ba_is_active ON bank_accounts(is_active);
COMMENT ON TABLE bank_accounts IS 'Comptes bancaires de BTS (Afriland, SCB, UBA...). Supporte les comptes courants, épargne, petite caisse et mobile money.';

-- Rattacher le compte par défaut aux company_settings
ALTER TABLE company_settings
    ADD CONSTRAINT fk_cs_default_bank_account
    FOREIGN KEY (default_bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;

-- Rattacher bank_account_id sur payments, supplier_payments, expenses
ALTER TABLE payments
    ADD CONSTRAINT fk_payments_bank_account
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;

ALTER TABLE supplier_payments
    ADD CONSTRAINT fk_supplier_payments_bank_account
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;

ALTER TABLE expenses
    ADD CONSTRAINT fk_expenses_bank_account
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;
```

### 5.3 Table `bank_transactions` — Transactions bancaires

```sql
CREATE TABLE bank_transactions (
    id                  UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id     UUID                    NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,

    -- Données transaction
    transaction_date    DATE                    NOT NULL,
    value_date          DATE,                   -- date de valeur (peut différer)
    type                bank_transaction_type   NOT NULL,
    amount              NUMERIC(15,2)           NOT NULL,
    balance_after       NUMERIC(15,2),          -- solde après transaction (import relevé)

    -- Description
    label               VARCHAR(500)            NOT NULL,   -- libellé brut du relevé
    reference           VARCHAR(255),           -- référence interne banque
    category            VARCHAR(100),           -- catégorie détectée automatiquement

    -- Source
    source              VARCHAR(50)             NOT NULL DEFAULT 'manual', -- 'manual', 'import', 'system'
    import_id           UUID,                   -- FK vers bank_statement_imports

    -- Rapprochement
    reconciliation_status reconciliation_status NOT NULL DEFAULT 'pending',
    reconciled_at       TIMESTAMPTZ,
    reconciled_by       UUID                    REFERENCES users(id) ON DELETE SET NULL,

    -- Lien avec paiements/dépenses (rapprochement automatique)
    matched_entity_type VARCHAR(50),            -- 'payment', 'supplier_payment', 'expense'
    matched_entity_id   UUID,

    notes               TEXT,
    metadata            JSONB                   NOT NULL DEFAULT '{}',

    created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    created_by          UUID                    REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_bt_amount CHECK (amount > 0)
);
CREATE TRIGGER tg_bank_transactions_updated_at BEFORE UPDATE ON bank_transactions
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_bt_account_id     ON bank_transactions(bank_account_id);
CREATE INDEX idx_bt_date           ON bank_transactions(transaction_date DESC);
CREATE INDEX idx_bt_rec_status     ON bank_transactions(reconciliation_status);
CREATE INDEX idx_bt_matched        ON bank_transactions(matched_entity_type, matched_entity_id);
COMMENT ON TABLE bank_transactions IS 'Transactions bancaires (import relevé ou saisie manuelle). Support du rapprochement bancaire.';

-- Rattacher bank_transaction_id sur payments, supplier_payments, expenses
ALTER TABLE payments
    ADD CONSTRAINT fk_payments_bank_transaction
    FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id) ON DELETE SET NULL;
ALTER TABLE supplier_payments
    ADD CONSTRAINT fk_supplier_payments_bank_transaction
    FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id) ON DELETE SET NULL;
ALTER TABLE expenses
    ADD CONSTRAINT fk_expenses_bank_transaction
    FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id) ON DELETE SET NULL;
```

### 5.4 Table `bank_statement_imports` — Imports de relevés bancaires

```sql
CREATE TABLE bank_statement_imports (
    id                  UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id     UUID             NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    filename            VARCHAR(255)     NOT NULL,
    file_path           VARCHAR(500),
    file_format         VARCHAR(20)      NOT NULL DEFAULT 'csv',  -- 'csv', 'excel', 'ofx', 'pdf'
    period_start        DATE             NOT NULL,
    period_end          DATE             NOT NULL,
    total_credits       NUMERIC(15,2)    NOT NULL DEFAULT 0,
    total_debits        NUMERIC(15,2)    NOT NULL DEFAULT 0,
    nb_transactions     INTEGER          NOT NULL DEFAULT 0,
    nb_matched          INTEGER          NOT NULL DEFAULT 0,
    nb_unmatched        INTEGER          NOT NULL DEFAULT 0,
    status              bank_import_status NOT NULL DEFAULT 'pending',
    error_message       TEXT,
    imported_by         UUID             REFERENCES users(id) ON DELETE SET NULL,
    imported_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ,

    CONSTRAINT chk_bsi_period CHECK (period_end >= period_start)
);
CREATE INDEX idx_bsi_bank_account_id ON bank_statement_imports(bank_account_id);
COMMENT ON TABLE bank_statement_imports IS 'Imports de relevés bancaires CSV/Excel/OFX. Chaque import déclenche la création de bank_transactions.';

-- Rattacher l'import_id sur bank_transactions
ALTER TABLE bank_transactions
    ADD CONSTRAINT fk_bt_import
    FOREIGN KEY (import_id) REFERENCES bank_statement_imports(id) ON DELETE SET NULL;
```

### 5.5 Table `bank_reconciliations` — Sessions de rapprochement bancaire

```sql
CREATE TABLE bank_reconciliations (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id     UUID        NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    period_start        DATE        NOT NULL,
    period_end          DATE        NOT NULL,
    opening_balance     NUMERIC(15,2) NOT NULL DEFAULT 0,
    closing_balance_statement NUMERIC(15,2) NOT NULL DEFAULT 0,  -- solde selon relevé banque
    closing_balance_system    NUMERIC(15,2) NOT NULL DEFAULT 0,  -- solde calculé en base
    difference          NUMERIC(15,2) GENERATED ALWAYS AS (closing_balance_system - closing_balance_statement) STORED,
    is_balanced         BOOLEAN     NOT NULL DEFAULT FALSE,
    status              VARCHAR(20) NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'reviewed'
    notes               TEXT,
    completed_at        TIMESTAMPTZ,
    completed_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by         UUID        REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID        REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_brc_period CHECK (period_end >= period_start)
);
CREATE TRIGGER tg_bank_reconciliations_updated_at BEFORE UPDATE ON bank_reconciliations
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_brc_bank_account_id ON bank_reconciliations(bank_account_id);
COMMENT ON TABLE bank_reconciliations IS 'Sessions de rapprochement bancaire. Compare les mouvements système avec le relevé bancaire.';
```

### 5.6 Vue `v_cash_position` — Position de trésorerie en temps réel

```sql
CREATE VIEW v_cash_position AS
SELECT
    ba.id                   AS bank_account_id,
    ba.name                 AS account_name,
    ba.bank_name,
    ba.account_type,
    ba.currency,
    ba.current_balance,
    ba.last_reconciled_date,
    ba.accounting_account,
    -- Entrées à venir (factures clients non payées)
    COALESCE((
        SELECT SUM(i.balance_due)
        FROM invoices i
        WHERE i.status IN ('issued', 'partially_paid', 'overdue')
          AND i.deleted_at IS NULL
    ), 0)                   AS incoming_receivables,
    -- Sorties à venir (factures fournisseurs non payées)
    COALESCE((
        SELECT SUM(si.balance_due)
        FROM supplier_invoices si
        WHERE si.status IN ('validated', 'partially_paid')
          AND si.deleted_at IS NULL
    ), 0)                   AS outgoing_payables
FROM bank_accounts ba
WHERE ba.deleted_at IS NULL AND ba.is_active = TRUE;
COMMENT ON VIEW v_cash_position IS 'Position de trésorerie consolidée : solde actuel + créances à encaisser + dettes à payer.';
```

### 5.7 Vérification étape 5

- [ ] `bank_accounts` avec tous les champs, trigger, index, commentaire
- [ ] `bank_transactions` avec rapprochement
- [ ] `bank_statement_imports`
- [ ] `bank_reconciliations`
- [ ] FK bank_account_id et bank_transaction_id rattachées sur payments, supplier_payments, expenses
- [ ] Vue `v_cash_position`
- [ ] FK company_settings.default_bank_account_id rattachée

---

## ÉTAPE 6 — MODULE COMPTABILITÉ SYSCOHADA

### 6.1 ENUMs comptabilité

```sql
CREATE TYPE journal_type        AS ENUM ('sales','purchases','bank','cash','operations','misc','opening','closing');
CREATE TYPE account_class       AS ENUM ('1','2','3','4','5','6','7','8');
CREATE TYPE account_nature      AS ENUM ('debit_normal','credit_normal');
CREATE TYPE entry_status        AS ENUM ('draft','validated','locked');
CREATE TYPE fiscal_period_status AS ENUM ('open','closed','locked');
```

### 6.2 Table `chart_of_accounts` — Plan comptable SYSCOHADA

```sql
CREATE TABLE chart_of_accounts (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_number      VARCHAR(20)     NOT NULL UNIQUE,  -- '411000', '707100'
    account_class       account_class   NOT NULL,         -- '4' pour classe 4
    name                VARCHAR(255)    NOT NULL,
    short_name          VARCHAR(100),
    account_nature      account_nature  NOT NULL DEFAULT 'debit_normal',

    -- Hiérarchie (pour balance + comptes de regroupement)
    parent_account_number VARCHAR(20)   REFERENCES chart_of_accounts(account_number) ON DELETE SET NULL,
    is_detail_account   BOOLEAN         NOT NULL DEFAULT TRUE,  -- FALSE = compte de regroupement

    -- Paramètres SYSCOHADA
    is_system           BOOLEAN         NOT NULL DEFAULT FALSE,  -- comptes système non supprimables
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    allows_reconciliation BOOLEAN       NOT NULL DEFAULT FALSE,  -- comptes 4xx (clients/fourn.)
    is_bank_account     BOOLEAN         NOT NULL DEFAULT FALSE,  -- comptes 5xx

    -- Lien avec les modules
    linked_bank_account_id UUID         REFERENCES bank_accounts(id) ON DELETE SET NULL,

    description         TEXT,
    notes               TEXT,

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by          UUID            REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER tg_chart_of_accounts_updated_at BEFORE UPDATE ON chart_of_accounts
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_coa_class          ON chart_of_accounts(account_class);
CREATE INDEX idx_coa_parent         ON chart_of_accounts(parent_account_number);
CREATE INDEX idx_coa_is_active      ON chart_of_accounts(is_active);
COMMENT ON TABLE chart_of_accounts IS 'Plan comptable SYSCOHADA. Classes 1-8 pré-chargées. Personnalisable par BTS avec sous-comptes spécifiques.';
```

### 6.3 Seed du plan comptable SYSCOHADA — Comptes principaux

Insérer les comptes SYSCOHADA les plus utilisés par une PME camerounaise IT. Minimum requis (à compléter avec tous les sous-comptes standard) :

**Classe 1 — Ressources durables**
- `101000` Capital social, `111000` Réserves légales, `161000` Emprunts bancaires

**Classe 2 — Actif immobilisé**
- `211000` Terrains, `221000` Bâtiments, `241000` Matériel et outillage, `244000` Matériel informatique, `281000` Amortissement bâtiments, `284000` Amortissement matériel

**Classe 3 — Stocks**
- `310000` Marchandises, `371000` Stocks matériels informatiques

**Classe 4 — Tiers**
- `411000` Clients (débit normal), `419000` Avances clients, `401000` Fournisseurs (crédit normal), `408000` Factures à recevoir, `421000` Personnel, `431000` CNPS, `441000` État — TVA collectée, `445000` État — TVA déductible, `447000` État — autres taxes, `462000` Associés — comptes courants

**Classe 5 — Trésorerie**
- `521000` Banque principale, `521001` Afriland First Bank, `521002` SCB Cameroun, `531000` Caisse, `561000` Mobile money

**Classe 6 — Charges**
- `601000` Achats marchandises, `602000` Achats matières, `606000` Fournitures, `611000` Transport, `615000` Entretien et réparations, `621000` Loyers, `623000` Publicité, `624000` Transports et déplacements, `626000` Frais télécommunication, `632000` Formation, `641000` Salaires bruts, `645000` Charges sociales CNPS, `661000` Charges d'intérêts, `681000` Dotations aux amortissements

**Classe 7 — Produits**
- `707000` Ventes marchandises, `701000` Ventes produits finis, `706000` Prestations de services, `758000` Autres produits, `791000` Produits financiers

**Classe 8 — Résultat**
- `130000` Résultat de l'exercice
NB : jai mis a la racine un fichier JSON CONTENANT TOUT LES COMPTE DU PLAN COMPTABLE OHADA TU L'UTILISERA  LE FICHIER S'APPELLE : chart-of-accounts-ohada.json
Pour chaque compte, préciser : account_number, account_class, name, account_nature (debit_normal/credit_normal), is_system=TRUE, is_detail_account.

### 6.4 Table `fiscal_periods` — Exercices et périodes fiscales

```sql
CREATE TABLE fiscal_periods (
    id                  UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(100)         NOT NULL,    -- 'Exercice 2026', 'Janvier 2026'
    fiscal_year         SMALLINT             NOT NULL,
    period_type         VARCHAR(20)          NOT NULL DEFAULT 'month',  -- 'month', 'quarter', 'year'
    start_date          DATE                 NOT NULL,
    end_date            DATE                 NOT NULL,
    status              fiscal_period_status NOT NULL DEFAULT 'open',
    closed_at           TIMESTAMPTZ,
    closed_by           UUID                 REFERENCES users(id) ON DELETE SET NULL,
    locked_at           TIMESTAMPTZ,
    locked_by           UUID                 REFERENCES users(id) ON DELETE SET NULL,
    notes               TEXT,
    created_at          TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ          NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_fiscal_period UNIQUE (fiscal_year, period_type, start_date),
    CONSTRAINT chk_fp_dates CHECK (end_date > start_date)
);
CREATE TRIGGER tg_fiscal_periods_updated_at BEFORE UPDATE ON fiscal_periods
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
COMMENT ON TABLE fiscal_periods IS 'Exercices et périodes comptables. Une période clôturée ne peut plus recevoir d''écritures.';
```

### 6.5 Table `accounting_journals` — Journaux comptables

```sql
CREATE TABLE accounting_journals (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    code                VARCHAR(20)  NOT NULL UNIQUE,  -- 'VTE', 'ACH', 'BQ', 'CAI', 'OD'
    name                VARCHAR(100) NOT NULL,
    type                journal_type NOT NULL,
    bank_account_id     UUID         REFERENCES bank_accounts(id) ON DELETE SET NULL,
    is_default          BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
    sequence_prefix     VARCHAR(10),  -- préfixe numérotation : 'VTE', 'ACH'
    last_sequence       INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE TRIGGER tg_accounting_journals_updated_at BEFORE UPDATE ON accounting_journals
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Journaux SYSCOHADA de base
INSERT INTO accounting_journals (code, name, type, is_default) VALUES
    ('VTE', 'Journal des Ventes',              'sales',     TRUE),
    ('ACH', 'Journal des Achats',              'purchases', FALSE),
    ('BQ',  'Journal de Banque',               'bank',      FALSE),
    ('CAI', 'Journal de Caisse',               'cash',      FALSE),
    ('OD',  'Journal des Opérations Diverses', 'misc',      FALSE),
    ('AN',  'Journal d''À Nouveau',            'opening',   FALSE),
    ('CL',  'Journal de Clôture',              'closing',   FALSE);
```

### 6.6 Table `journal_entries` — Écritures comptables (en-têtes)

```sql
CREATE TABLE journal_entries (
    id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    journal_id          UUID          NOT NULL REFERENCES accounting_journals(id) ON DELETE RESTRICT,
    fiscal_period_id    UUID          NOT NULL REFERENCES fiscal_periods(id) ON DELETE RESTRICT,

    -- Numérotation
    entry_number        VARCHAR(50)   NOT NULL UNIQUE,  -- VTE-2026-001, ACH-2026-001

    -- Dates
    entry_date          DATE          NOT NULL,
    accounting_date     DATE          NOT NULL,  -- peut différer (ex: régularisation de fin de mois)

    -- Description
    label               VARCHAR(500)  NOT NULL,
    description         TEXT,

    -- Source (polymorphique — génération automatique)
    source_type         VARCHAR(50),   -- 'invoice', 'payment', 'supplier_invoice', 'supplier_payment', 'expense', 'manual'
    source_id           UUID,          -- ID de la pièce source

    -- Validation
    status              entry_status  NOT NULL DEFAULT 'draft',
    validated_by        UUID          REFERENCES users(id) ON DELETE SET NULL,
    validated_at        TIMESTAMPTZ,
    locked_at           TIMESTAMPTZ,

    -- Contrôle équilibre
    total_debit         NUMERIC(15,2) NOT NULL DEFAULT 0,  -- Σ lignes débit
    total_credit        NUMERIC(15,2) NOT NULL DEFAULT 0,  -- Σ lignes crédit
    is_balanced         BOOLEAN GENERATED ALWAYS AS (total_debit = total_credit) STORED,

    metadata            JSONB         NOT NULL DEFAULT '{}',

    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by          UUID          REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_je_amounts CHECK (total_debit >= 0 AND total_credit >= 0)
);
CREATE TRIGGER tg_journal_entries_updated_at BEFORE UPDATE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_je_journal_id      ON journal_entries(journal_id);
CREATE INDEX idx_je_fiscal_period   ON journal_entries(fiscal_period_id);
CREATE INDEX idx_je_entry_date      ON journal_entries(entry_date DESC);
CREATE INDEX idx_je_source          ON journal_entries(source_type, source_id);
CREATE INDEX idx_je_status          ON journal_entries(status);
COMMENT ON TABLE journal_entries IS 'En-têtes des écritures comptables. Chaque pièce (facture, paiement, achat, dépense) génère automatiquement ses écritures.';
```

### 6.7 Table `journal_entry_lines` — Lignes d'écritures (Plan comptable)

```sql
CREATE TABLE journal_entry_lines (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    journal_entry_id    UUID         NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_number      VARCHAR(20)  NOT NULL REFERENCES chart_of_accounts(account_number) ON DELETE RESTRICT,

    sort_order          SMALLINT     NOT NULL DEFAULT 0,
    label               VARCHAR(500) NOT NULL,
    description         TEXT,

    -- Montants (un des deux doit être > 0, l'autre = 0)
    debit               NUMERIC(15,2) NOT NULL DEFAULT 0,
    credit              NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Lettrage (rapprochement comptable clients/fournisseurs)
    lettering_code      VARCHAR(20),   -- ex: 'A001' — même code sur débit/crédit correspondants
    lettered_at         TIMESTAMPTZ,
    lettered_by         UUID          REFERENCES users(id) ON DELETE SET NULL,

    -- Analytique (ventilation par centre de coût)
    analytic_axis_1     VARCHAR(100),  -- ex: 'Projet_BTS_ERP', 'Agence_Douala'
    analytic_axis_2     VARCHAR(100),

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_jel_debit_credit   CHECK (debit >= 0 AND credit >= 0),
    CONSTRAINT chk_jel_not_both       CHECK (NOT (debit > 0 AND credit > 0)),
    CONSTRAINT chk_jel_not_zero       CHECK (debit > 0 OR credit > 0)
);
CREATE INDEX idx_jel_journal_entry_id ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_jel_account_number   ON journal_entry_lines(account_number);
CREATE INDEX idx_jel_lettering        ON journal_entry_lines(lettering_code) WHERE lettering_code IS NOT NULL;
COMMENT ON TABLE journal_entry_lines IS 'Lignes de plan comptable. Principe : somme débits = somme crédits par écriture.';
```

### 6.8 Vue `v_account_balance` — Grand Livre / Balance des comptes

```sql
CREATE VIEW v_account_balance AS
SELECT
    coa.account_number,
    coa.name                    AS account_name,
    coa.account_class,
    coa.account_nature,
    COALESCE(SUM(jel.debit),  0) AS total_debit,
    COALESCE(SUM(jel.credit), 0) AS total_credit,
    CASE coa.account_nature
        WHEN 'debit_normal'  THEN COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0)
        WHEN 'credit_normal' THEN COALESCE(SUM(jel.credit), 0) - COALESCE(SUM(jel.debit), 0)
    END                         AS balance,
    COUNT(jel.id)               AS nb_entries
FROM chart_of_accounts coa
LEFT JOIN journal_entry_lines jel ON jel.account_number = coa.account_number
LEFT JOIN journal_entries     je  ON je.id = jel.journal_entry_id
    AND je.status IN ('validated', 'locked')
WHERE coa.is_active = TRUE AND coa.is_detail_account = TRUE
GROUP BY coa.account_number, coa.name, coa.account_class, coa.account_nature
ORDER BY coa.account_number;
COMMENT ON VIEW v_account_balance IS 'Balance des comptes SYSCOHADA. Mouvements débit/crédit et solde par compte. Base du bilan et du compte de résultat.';
```

### 6.9 Table `tax_declarations` — Déclarations fiscales TVA / DSF

```sql
CREATE TABLE tax_declarations (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    declaration_type    VARCHAR(50) NOT NULL,  -- 'TVA_mensuelle', 'DSF_annuelle', 'IS_annuel'
    fiscal_period_id    UUID        REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
    period_start        DATE        NOT NULL,
    period_end          DATE        NOT NULL,

    -- TVA
    tva_collected       NUMERIC(15,2) NOT NULL DEFAULT 0,  -- TVA sur ventes (441)
    tva_deductible      NUMERIC(15,2) NOT NULL DEFAULT 0,  -- TVA sur achats (445)
    tva_net             NUMERIC(15,2) GENERATED ALWAYS AS (tva_collected - tva_deductible) STORED,
    tva_credit          NUMERIC(15,2) NOT NULL DEFAULT 0,  -- crédit TVA reporté

    -- Statut
    status              VARCHAR(20) NOT NULL DEFAULT 'draft', -- 'draft', 'submitted', 'paid'
    submitted_at        TIMESTAMPTZ,
    submitted_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
    payment_date        DATE,
    payment_amount      NUMERIC(15,2),
    payment_reference   VARCHAR(255),

    -- Fichier export
    export_path         VARCHAR(500),
    notes               TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID        REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_td_period CHECK (period_end >= period_start)
);
CREATE TRIGGER tg_tax_declarations_updated_at BEFORE UPDATE ON tax_declarations
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
COMMENT ON TABLE tax_declarations IS 'Déclarations fiscales TVA (mensuelle) et DSF (annuelle). Obligation légale camerounaise.';
```

### 6.10 Vérification étape 6

- [ ] `chart_of_accounts` créé + seed complet SYSCOHADA (min. 50 comptes des 8 classes)
- [ ] `fiscal_periods` créé
- [ ] `accounting_journals` créé + seed 7 journaux
- [ ] `journal_entries` créé avec `is_balanced` calculé
- [ ] `journal_entry_lines` créé avec contraintes débit/crédit
- [ ] Vue `v_account_balance`
- [ ] `tax_declarations`
- [ ] Tous les index présents

---

## ÉTAPE 7 — MODULE PARAMÈTRES AVANCÉS

### 7.1 Table `document_templates` — Templates HTML des PDFs

```sql
CREATE TABLE document_templates (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_type       document_type NOT NULL,  -- 'invoice', 'proforma', 'purchase_order'
    name                VARCHAR(255) NOT NULL,
    description         TEXT,
    html_content        TEXT         NOT NULL,   -- template HTML/CSS avec variables {{}}
    css_content         TEXT,                    -- CSS supplémentaire
    is_default          BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN      NOT NULL DEFAULT TRUE,

    -- Variables disponibles pour ce type de document
    available_variables JSONB        NOT NULL DEFAULT '[]',  -- [{name, description, example}]

    -- Paramètres de page PDF
    page_format         VARCHAR(10)  NOT NULL DEFAULT 'A4',
    page_orientation    VARCHAR(15)  NOT NULL DEFAULT 'portrait',
    margin_top_mm       SMALLINT     NOT NULL DEFAULT 10,
    margin_bottom_mm    SMALLINT     NOT NULL DEFAULT 10,
    margin_left_mm      SMALLINT     NOT NULL DEFAULT 15,
    margin_right_mm     SMALLINT     NOT NULL DEFAULT 15,

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID         REFERENCES users(id) ON DELETE SET NULL,
    updated_by          UUID         REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER tg_document_templates_updated_at BEFORE UPDATE ON document_templates
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE UNIQUE INDEX uq_doc_template_default
    ON document_templates (document_type) WHERE is_default = TRUE AND deleted_at IS NULL;
COMMENT ON TABLE document_templates IS 'Templates HTML personnalisables des PDFs (factures, proformas, BC). Variables {{client.name}} injectées au rendu.';
```

### 7.2 Table `custom_fields` — Champs personnalisés dynamiques

```sql
CREATE TYPE custom_field_type AS ENUM ('text','number','date','boolean','select','multi_select','textarea','email','phone','url');
CREATE TYPE custom_field_entity AS ENUM ('client','product','invoice','proforma','supplier','purchase_order','expense','user');

CREATE TABLE custom_fields (
    id                  UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type         custom_field_entity NOT NULL,
    name                VARCHAR(100)        NOT NULL,   -- slug machine : 'secteur_activite'
    label               VARCHAR(255)        NOT NULL,   -- affiché : 'Secteur d''activité'
    field_type          custom_field_type   NOT NULL DEFAULT 'text',
    placeholder         VARCHAR(255),
    help_text           TEXT,
    options             JSONB,                          -- pour select/multi_select : [{value, label}]
    is_required         BOOLEAN             NOT NULL DEFAULT FALSE,
    is_visible_on_pdf   BOOLEAN             NOT NULL DEFAULT FALSE,
    is_searchable       BOOLEAN             NOT NULL DEFAULT FALSE,
    sort_order          SMALLINT            NOT NULL DEFAULT 0,
    is_active           BOOLEAN             NOT NULL DEFAULT TRUE,
    validation_regex    VARCHAR(500),
    default_value       TEXT,
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    created_by          UUID                REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT uq_custom_field_name_entity UNIQUE (entity_type, name)
);
CREATE TRIGGER tg_custom_fields_updated_at BEFORE UPDATE ON custom_fields
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
COMMENT ON TABLE custom_fields IS 'Champs personnalisés dynamiques par type d''entité. Pas de code nécessaire pour ajouter un champ métier.';

CREATE TABLE custom_field_values (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    custom_field_id     UUID        NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
    entity_type         custom_field_entity NOT NULL,
    entity_id           UUID        NOT NULL,
    value_text          TEXT,
    value_number        NUMERIC(15,4),
    value_date          DATE,
    value_boolean       BOOLEAN,
    value_json          JSONB,       -- pour multi_select
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_cfv_field_entity UNIQUE (custom_field_id, entity_id)
);
CREATE TRIGGER tg_cfv_updated_at BEFORE UPDATE ON custom_field_values
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_cfv_field_id   ON custom_field_values(custom_field_id);
CREATE INDEX idx_cfv_entity     ON custom_field_values(entity_type, entity_id);
COMMENT ON TABLE custom_field_values IS 'Valeurs des champs personnalisés par entité. Design EAV (Entity-Attribute-Value).';
```

### 7.3 Table `workflow_rules` — Règles de workflow configurables

```sql
CREATE TABLE workflow_rules (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(255) NOT NULL,
    description         TEXT,
    module              VARCHAR(50) NOT NULL,  -- 'invoices', 'purchases', 'expenses'
    trigger_event       VARCHAR(100) NOT NULL, -- 'before_issue', 'on_amount_exceed', 'on_overdue'
    conditions          JSONB       NOT NULL DEFAULT '{}', -- {field, operator, value}
    actions             JSONB       NOT NULL DEFAULT '[]', -- [{type, params}]
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    priority            SMALLINT    NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID        REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER tg_workflow_rules_updated_at BEFORE UPDATE ON workflow_rules
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
COMMENT ON TABLE workflow_rules IS 'Règles de workflow configurables sans code. Ex : facture > 500000 XAF → approbation admin requise.';
```

### 7.4 Table `webhooks` — Webhooks sortants

```sql
CREATE TABLE webhooks (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(255) NOT NULL,
    url                 VARCHAR(500) NOT NULL,
    secret              VARCHAR(255),         -- HMAC secret pour signature des payloads
    events              TEXT[]      NOT NULL DEFAULT '{}', -- ['invoice.paid', 'purchase.approved']
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    headers             JSONB       NOT NULL DEFAULT '{}', -- headers supplémentaires
    last_triggered_at   TIMESTAMPTZ,
    last_status_code    SMALLINT,
    failure_count       SMALLINT    NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID        REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER tg_webhooks_updated_at BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
COMMENT ON TABLE webhooks IS 'Webhooks sortants. Notifie des systèmes tiers (Zapier, N8N, apps custom) lors d''événements InvoiceHub.';

CREATE TABLE webhook_deliveries (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id          UUID        NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event               VARCHAR(100) NOT NULL,
    payload             JSONB       NOT NULL DEFAULT '{}',
    status_code         SMALLINT,
    response_body       TEXT,
    duration_ms         INTEGER,
    success             BOOLEAN     NOT NULL DEFAULT FALSE,
    error_message       TEXT,
    retry_count         SMALLINT    NOT NULL DEFAULT 0,
    next_retry_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wd_webhook_id  ON webhook_deliveries(webhook_id);
CREATE INDEX idx_wd_created_at  ON webhook_deliveries(created_at DESC);
COMMENT ON TABLE webhook_deliveries IS 'Historique des appels webhooks avec réponse, latence et gestion des retry.';
```

### 7.5 Table `api_keys` — Clés API pour accès tiers

```sql
CREATE TABLE api_keys (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(255) NOT NULL,
    key_hash            VARCHAR(255) NOT NULL UNIQUE,  -- SHA-256 de la clé brute
    key_prefix          VARCHAR(10)  NOT NULL,          -- 8 premiers caractères visibles : 'bts_liv_'
    permissions         TEXT[]      NOT NULL DEFAULT '{}',
    allowed_ips         INET[],                         -- NULL = tous les IPs autorisés
    expires_at          TIMESTAMPTZ,
    last_used_at        TIMESTAMPTZ,
    last_used_ip        INET,
    usage_count         INTEGER     NOT NULL DEFAULT 0,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at          TIMESTAMPTZ,
    revoked_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_by          UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TRIGGER tg_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE revoked_at IS NULL;
COMMENT ON TABLE api_keys IS 'Clés API pour intégrations tierces. Jamais stockées en clair, permissions granulaires RBAC.';
```

### 7.6 Table `ip_whitelist` — Liste blanche IPs admin

```sql
CREATE TABLE ip_whitelist (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_address  CIDR        NOT NULL,    -- supporte CIDR ex: 192.168.1.0/24
    label       VARCHAR(255) NOT NULL,   -- 'Bureau Douala', 'VPN BTS'
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT uq_ip_whitelist UNIQUE (ip_address)
);
COMMENT ON TABLE ip_whitelist IS 'IPs autorisées pour les actions admin sensibles. Supporte les plages CIDR.';
```

### 7.7 Table `export_jobs` — Jobs d'exports asynchrones

```sql
CREATE TYPE export_format AS ENUM ('csv','excel','pdf','json','sage_csv','ciel_csv','dsf_xml');
CREATE TYPE export_status AS ENUM ('pending','running','completed','failed','expired');

CREATE TABLE export_jobs (
    id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    module          VARCHAR(50)   NOT NULL,   -- 'invoices', 'accounting', 'expenses'
    format          export_format NOT NULL,
    filters         JSONB         NOT NULL DEFAULT '{}',
    file_path       VARCHAR(500),
    file_size_bytes BIGINT,
    status          export_status NOT NULL DEFAULT 'pending',
    progress        SMALLINT      NOT NULL DEFAULT 0,  -- 0-100
    error_message   TEXT,
    expires_at      TIMESTAMPTZ   NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by      UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX idx_ej_created_by  ON export_jobs(created_by);
CREATE INDEX idx_ej_status      ON export_jobs(status);
COMMENT ON TABLE export_jobs IS 'Jobs d''export asynchrones (comptabilité Sage/Ciel, DSF XML, rapports PDF/Excel). Expire après 24h.';
```

### 7.8 Vérification étape 7

- [ ] `document_templates` créé
- [ ] `custom_fields` + `custom_field_values` créés (design EAV)
- [ ] `workflow_rules` créé
- [ ] `webhooks` + `webhook_deliveries` créés
- [ ] `api_keys` créé
- [ ] `ip_whitelist` créé
- [ ] `export_jobs` créé
- [ ] ENUMs `custom_field_type`, `custom_field_entity`, `export_format`, `export_status` créés

---

## ÉTAPE 8 — VUES ÉTENDUES, INDEXES FINAUX & COMMENTAIRES

### 8.1 Vue `v_dashboard_kpis` — Mettre à jour pour inclure les achats et dépenses

Modifier la vue existante `v_dashboard_kpis` pour ajouter :
- `total_purchases_month` — achats fournisseurs du mois
- `total_expenses_month` — dépenses opérationnelles du mois
- `gross_margin_month` — CA ventes - coût achats du mois
- `total_outstanding_payables` — dettes fournisseurs à payer

### 8.2 Vue `v_product_margin` — Marges par produit en temps réel

```sql
CREATE VIEW v_product_margin AS
SELECT
    p.id                    AS product_id,
    p.name                  AS product_name,
    pc.name                 AS category_name,
    p.unit_price_ht         AS selling_price_ht,
    COALESCE(p.purchase_price_ht, 0)    AS purchase_price_ht,
    COALESCE(p.cost_price_ht, p.purchase_price_ht, 0) AS cost_price_ht,
    CASE
        WHEN p.unit_price_ht > 0 AND p.cost_price_ht > 0
        THEN ROUND(((p.unit_price_ht - p.cost_price_ht) / p.unit_price_ht * 100), 2)
        ELSE NULL
    END                     AS margin_pct,
    CASE
        WHEN p.unit_price_ht > 0 AND p.cost_price_ht > 0
        THEN p.unit_price_ht - p.cost_price_ht
        ELSE NULL
    END                     AS margin_amount_ht,
    p.track_stock           AS tracks_stock,
    p.stock_quantity        AS current_stock,
    p.stock_min_level       AS min_stock_level
FROM products p
LEFT JOIN product_categories pc ON pc.id = p.category_id
WHERE p.deleted_at IS NULL AND p.is_active = TRUE;
COMMENT ON VIEW v_product_margin IS 'Marges par produit (prix vente vs prix d''achat/revient). Utilisé dans le badge marge du formulaire de vente.';
```

### 8.3 Vue `v_expense_vs_budget` — Budget vs Réalisé

```sql
CREATE VIEW v_expense_vs_budget AS
SELECT
    ec.id                               AS category_id,
    ec.name                             AS category_name,
    ec.accounting_account,
    eb.year,
    eb.month,
    COALESCE(eb.budget_amount, 0)       AS budget_amount,
    COALESCE(SUM(e.amount_ttc)
        FILTER (WHERE e.status IN ('approved','paid')
            AND e.deleted_at IS NULL), 0) AS actual_amount,
    COALESCE(eb.budget_amount, 0) -
    COALESCE(SUM(e.amount_ttc)
        FILTER (WHERE e.status IN ('approved','paid')
            AND e.deleted_at IS NULL), 0) AS remaining_budget,
    CASE WHEN COALESCE(eb.budget_amount, 0) > 0
        THEN ROUND(COALESCE(SUM(e.amount_ttc)
            FILTER (WHERE e.status IN ('approved','paid')
                AND e.deleted_at IS NULL), 0) / eb.budget_amount * 100, 2)
        ELSE NULL
    END                                 AS budget_used_pct
FROM expense_categories ec
LEFT JOIN expense_budgets eb  ON eb.category_id = ec.id
LEFT JOIN expenses e ON e.category_id = ec.id
    AND (eb.year IS NULL OR EXTRACT(YEAR FROM e.expense_date) = eb.year)
    AND (eb.month IS NULL OR EXTRACT(MONTH FROM e.expense_date) = eb.month)
WHERE ec.deleted_at IS NULL
GROUP BY ec.id, ec.name, ec.accounting_account, eb.year, eb.month, eb.budget_amount;
COMMENT ON VIEW v_expense_vs_budget IS 'Comparatif Budget vs Réalisé par catégorie de dépenses.';
```

### 8.4 Commentaires COMMENT ON TABLE pour tous les nouveaux objets

Ajouter un `COMMENT ON TABLE` pour chaque table créée dans les étapes 3, 4, 5, 6, 7 qui n'en aurait pas encore.

### 8.5 Indexes manquants à vérifier

Vérifier et ajouter si manquants :
- Index full-text sur `suppliers.name` (`gin(to_tsvector('french', name))`)
- Index partiel `WHERE deleted_at IS NULL` sur toutes les tables soft-deletable
- Index composite sur `journal_entry_lines(journal_entry_id, account_number)`
- Index sur `expenses(expense_date, category_id)`
- Index sur `bank_transactions(bank_account_id, transaction_date DESC)`
- Index sur `stock_movements(product_id, created_at DESC)`

### 8.6 Vérification finale globale — CHECKLIST COMPLÈTE

Avant de soumettre le fichier final, vérifier que :

**RBAC**
- [ ] Table `roles` + `role_change_history`
- [ ] `users.role_id` FK vers roles, ancienne colonne supprimée
- [ ] `audit_logs.user_role_name` (TEXT, pas ENUM)
- [ ] Enum `user_role` supprimé
- [ ] 3 rôles système insérés avec toutes leurs permissions

**Extensions existantes**
- [ ] `company_settings` étendu (20+ nouveaux champs)
- [ ] ENUMs enrichis (document_type, payment_method, audit_action, notification_status)
- [ ] `products` avec champs stock
- [ ] `payments` avec lien banque
- [ ] `clients` avec CRM léger

**Module Achats**
- [ ] `suppliers` + `supplier_contacts`
- [ ] `purchase_orders` + lignes + historique statuts
- [ ] `supplier_invoices` + lignes
- [ ] `supplier_payments`
- [ ] `stock_movements` (immuable)
- [ ] `fn_next_document_number` mise à jour

**Module Dépenses**
- [ ] `expense_categories` + seed 10 catégories
- [ ] `expenses` + `expense_status_history`
- [ ] `expense_budgets`

**Module Banques**
- [ ] `bank_accounts`
- [ ] `bank_transactions`
- [ ] `bank_statement_imports`
- [ ] `bank_reconciliations`
- [ ] FK banque rattachées sur payments, supplier_payments, expenses

**Module Comptabilité**
- [ ] `chart_of_accounts` + seed SYSCOHADA complet
- [ ] `fiscal_periods`
- [ ] `accounting_journals` + seed 7 journaux
- [ ] `journal_entries` + `journal_entry_lines`
- [ ] `tax_declarations`

**Module Paramètres**
- [ ] `document_templates`
- [ ] `custom_fields` + `custom_field_values`
- [ ] `workflow_rules`
- [ ] `webhooks` + `webhook_deliveries`
- [ ] `api_keys`
- [ ] `ip_whitelist`
- [ ] `export_jobs`

**Vues**
- [ ] `v_client_financial_summary` (existante — vérifier qu'elle est toujours valide)
- [ ] `v_dashboard_kpis` (mise à jour)
- [ ] `v_supplier_financial_summary`
- [ ] `v_cash_position`
- [ ] `v_account_balance`
- [ ] `v_product_margin`
- [ ] `v_expense_vs_budget`

**Qualité**
- [ ] Tout le fichier s'exécute de bout en bout sans erreur
- [ ] Toutes les FK ont les bons ON DELETE
- [ ] Tous les triggers `updated_at` sont en place
- [ ] Toutes les tables ont un `COMMENT ON TABLE`
- [ ] Toutes les colonnes critiques ont un `COMMENT ON COLUMN`
- [ ] Aucun nom de colonne réservé PostgreSQL utilisé
- [ ] Toutes les contraintes CHECK sont logiques et correctes
- [ ] Les règles d'immuabilité (audit_logs, stock_movements) sont en place

---

## FORMAT DE LIVRAISON

Le fichier produit doit :
1. S'appeler `invoicehub_schema_v3.sql`
2. Commencer par un en-tête de documentation complet (version, date, auteur, modules inclus)
3. Être structuré en sections numérotées avec des séparateurs clairs `-- ====`
4. Inclure tous les commentaires COMMENT ON TABLE/COLUMN
5. Se terminer par une section `-- FIN DU SCHÉMA v3` avec le nombre total d'objets créés

---

## NOTE IMPORTANTE SUR LA MIGRATION

Ce schéma est produit pour un environnement Docker en production. La migration se fera via `psql` directement, **pas via `prisma migrate`**. Le fichier doit donc être un SQL pur PostgreSQL 15+, exécutable directement via :

```bash
psql -U invoicehub -d invoicehub_db -f invoicehub_schema_v3.sql
```

Tous les `ALTER TABLE ADD COLUMN IF NOT EXISTS` doivent être utilisés pour les modifications sur tables existantes afin de rendre le script idempotent dans la mesure du possible.
