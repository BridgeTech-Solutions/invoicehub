-- ================================================================
--  InvoiceHub PostgreSQL Schema v3.0
--  Bridge Technologies Solutions (BTS) — Douala, Cameroun
--  Conforme SYSCOHADA — ERP niveau entreprise
--  Auteur   : Claude (Anthropic) — Avril 2026
--  DB       : PostgreSQL 15+
--
--  MODULES INCLUS :
--    v2 : Facturation, Proformas, Clients, Produits, Paiements
--         Récurrence, Notifications, Audit, Sécurité JWT/2FA
--    v3 : + RBAC Dynamique (rôles & permissions personnalisables)
--         + Module Achats & Fournisseurs (BC, FF, Stock)
--         + Module Dépenses opérationnelles
--         + Module Banques & Trésorerie
--         + Module Comptabilité SYSCOHADA (Plan comptable OHADA)
--         + Module Paramètres Avancés (webhooks, API keys, templates)
--
--  UTILISATION :
--    psql -U invoicehub -d invoicehub_db -f invoicehub_schema_v3.sql
-- ================================================================

-- ================================================================
-- EXTENSIONS
-- ================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ================================================================
-- ENUMS — v2 conservés (user_role supprimé → remplacé par roles)
-- ================================================================

-- user_role N'EST PLUS CRÉÉ — remplacé par la table `roles` (RBAC dynamique)

CREATE TYPE user_status   AS ENUM ('active', 'suspended', 'pending_activation');

CREATE TYPE client_type   AS ENUM ('company', 'individual');
CREATE TYPE client_status AS ENUM ('active', 'archived');

CREATE TYPE product_type  AS ENUM ('product', 'service');
CREATE TYPE product_unit  AS ENUM ('heure', 'jour', 'forfait', 'piece', 'licence', 'mois', 'annee');

CREATE TYPE document_type AS ENUM ('proforma', 'invoice', 'purchase_order', 'supplier_invoice', 'expense', 'delivery_note');
CREATE TYPE discount_type AS ENUM ('none', 'percentage', 'fixed');

CREATE TYPE proforma_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired');

CREATE TYPE invoice_type   AS ENUM ('standard', 'acompte', 'solde', 'avoir', 'recurring');
CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'cancelled', 'overdue');

CREATE TYPE payment_method AS ENUM ('virement', 'especes', 'cheque', 'mobile_money', 'autre');

CREATE TYPE recurring_interval AS ENUM ('monthly', 'quarterly', 'biannual', 'annual');

CREATE TYPE backup_status AS ENUM ('pending', 'running', 'success', 'failed');

CREATE TYPE audit_action AS ENUM (
    'CREATE', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'RESTORE',
    'LOGIN', 'LOGOUT', 'LOGIN_FAILED',
    'PASSWORD_CHANGE', 'PASSWORD_RESET', 'ROLE_CHANGE',
    'STATUS_CHANGE', 'CONVERT_TO_INVOICE',
    'PAYMENT_REGISTERED', 'PAYMENT_DELETED',
    'EMAIL_SENT', 'PDF_GENERATED', 'EXPORT'
);

CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'both');
CREATE TYPE notification_status  AS ENUM (
    'proforma_sent', 'proforma_accepted', 'proforma_rejected', 'proforma_expired',
    'invoice_issued', 'invoice_paid', 'invoice_partially_paid', 'invoice_overdue',
    'payment_registered', 'reminder_sent', 'user_created', 'system'
);

-- ================================================================
-- FONCTION UTILITAIRE : mise à jour auto de updated_at
-- ================================================================
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ================================================================
-- ████████████████████████████████████████████████████████████████
-- ÉTAPE 1 — RBAC DYNAMIQUE
-- Table `roles` créée AVANT `users` (users.role_id → roles.id)
-- ████████████████████████████████████████████████████████████████
-- ================================================================

-- ================================================================
-- ROLES — Rôles RBAC dynamiques (remplace l'enum user_role)
-- Les rôles système (is_system=TRUE) ne peuvent être ni supprimés
-- ni modifiés par les utilisateurs, même admin.
-- ================================================================
CREATE TABLE roles (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL UNIQUE,      -- slug machine : 'admin', 'responsable_achat'
    display_name    VARCHAR(255) NOT NULL,              -- affiché en UI : 'Responsable Achats'
    description     TEXT,
    color           CHAR(7),                            -- couleur HEX badge : '#2D7DD2'
    icon            VARCHAR(50),                        -- icône lucide-react
    is_system       BOOLEAN      NOT NULL DEFAULT FALSE, -- TRUE = non supprimable, non modifiable
    permissions     TEXT[]       NOT NULL DEFAULT '{}', -- ex: ['invoices:create', 'clients:read', '*']
    created_by      UUID,        -- FK vers users(id) ajoutée après création de users
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT chk_role_name_format CHECK (name ~ '^[a-z0-9_]+$')
);
CREATE TRIGGER tg_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_roles_name      ON roles(name);
CREATE INDEX idx_roles_is_system ON roles(is_system);
CREATE INDEX idx_roles_active    ON roles(id) WHERE deleted_at IS NULL;

COMMENT ON TABLE  roles             IS 'Rôles RBAC dynamiques. Les rôles système (is_system=true) ne peuvent être ni supprimés ni modifiés.';
COMMENT ON COLUMN roles.name        IS 'Slug machine unique, lettres minuscules, chiffres et underscore uniquement.';
COMMENT ON COLUMN roles.permissions IS 'Tableau des permissions. Format : module:action — ex: invoices:create, purchases:approve. Valeur "*" = toutes permissions (admin uniquement).';
COMMENT ON COLUMN roles.is_system   IS 'TRUE pour les rôles admin/commercial/employee. Protégés contre suppression et modification des permissions depuis l''UI.';

-- ================================================================
-- LISTE EXHAUSTIVE DES PERMISSIONS DISPONIBLES (référence seed)
-- ================================================================
-- Module Facturation (ventes)
--   invoices:read, invoices:create, invoices:edit, invoices:issue,
--   invoices:cancel, invoices:delete
-- Module Proformas / Devis
--   proformas:read, proformas:create, proformas:edit, proformas:send,
--   proformas:delete
-- Module Clients
--   clients:read, clients:create, clients:edit, clients:archive,
--   clients:delete
-- Module Produits & Catalogue
--   products:read, products:create, products:edit, products:delete
-- Module Paiements (encaissements)
--   payments:read, payments:create, payments:delete
-- Module Achats & Fournisseurs
--   suppliers:read, suppliers:create, suppliers:edit, suppliers:archive
--   purchases:read, purchases:create, purchases:edit, purchases:approve,
--   purchases:receive, purchases:delete
--   supplier_invoices:read, supplier_invoices:create,
--   supplier_invoices:validate, supplier_invoices:delete
--   supplier_payments:read, supplier_payments:create,
--   supplier_payments:delete
-- Module Stock
--   stock:read, stock:adjust, stock:write_off
-- Module Dépenses
--   expenses:read, expenses:create, expenses:edit, expenses:approve,
--   expenses:reject, expenses:delete
--   expense_categories:manage
-- Module Banques & Trésorerie
--   banks:read, banks:create, banks:edit
--   bank_transactions:read, bank_transactions:create
--   bank_reconciliation:read, bank_reconciliation:manage
-- Module Comptabilité
--   accounting:read, accounting:write, accounting:validate,
--   accounting:export
--   chart_of_accounts:read, chart_of_accounts:manage
--   fiscal_periods:manage
-- Module Rapports
--   reports:read, reports:export
-- Module Utilisateurs
--   users:read, users:create, users:edit, users:suspend
-- Module Rôles (méta-permission)
--   roles:read, roles:manage
-- Module Paramètres
--   settings:read, settings:edit
--   templates:manage, custom_fields:manage
--   webhooks:manage, api_keys:manage
-- Module Audit
--   audit:read
-- Wildcard admin
--   * (toutes les permissions)
-- ================================================================

-- ================================================================
-- 1. COMPANY_SETTINGS — Paramètres globaux de BTS
-- ================================================================
CREATE TABLE company_settings (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identité légale
    company_name            VARCHAR(255) NOT NULL,
    legal_form              VARCHAR(100),
    tax_number              VARCHAR(100),
    rccm                    VARCHAR(100),

    -- Coordonnées
    address                 TEXT         NOT NULL,
    city                    VARCHAR(100) NOT NULL DEFAULT 'Douala',
    country                 VARCHAR(100) NOT NULL DEFAULT 'Cameroun',
    postal_box              VARCHAR(50),
    phone                   VARCHAR(50)  NOT NULL,
    email                   VARCHAR(255) NOT NULL,
    website                 VARCHAR(255),

    -- Branding
    logo_path               VARCHAR(500),
    stamp_path              VARCHAR(500),
    signature_path          VARCHAR(500),
    header_image_path       VARCHAR(500),
    footer_image_path       VARCHAR(500),
    footer_safe_zone_px     SMALLINT     NOT NULL DEFAULT 0,

    -- Paramètres financiers
    default_currency        CHAR(3)      NOT NULL DEFAULT 'XAF',
    default_tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 19.25,

    -- Numérotation SYSCOHADA
    company_code            VARCHAR(10)  NOT NULL DEFAULT 'BTS',

    -- Délais par défaut (en jours)
    default_proforma_validity_days  SMALLINT NOT NULL DEFAULT 30,
    default_invoice_due_days        SMALLINT NOT NULL DEFAULT 30,

    -- Sécurité
    session_timeout_minutes SMALLINT    NOT NULL DEFAULT 30,
    max_login_attempts      SMALLINT    NOT NULL DEFAULT 5,
    require_2fa             BOOLEAN     NOT NULL DEFAULT false,

    -- Relances automatiques
    auto_reminder_days      SMALLINT[]           DEFAULT ARRAY[7, 14, 30],
    reminder_escalation     JSONB                NOT NULL DEFAULT '{}',

    -- Comptes comptables
    initial_stock_account         VARCHAR(20) NOT NULL DEFAULT '1042',
    escompte_accounting_account   VARCHAR(20) NOT NULL DEFAULT '673',
    collected_tax_account         VARCHAR(20) NOT NULL DEFAULT '4431',
    deductible_tax_account        VARCHAR(20) NOT NULL DEFAULT '4452',
    stock_account                 VARCHAR(20) NOT NULL DEFAULT '3111',
    stock_variation_account       VARCHAR(20) NOT NULL DEFAULT '6031',
    stock_loss_account            VARCHAR(20) NOT NULL DEFAULT '6032',
    default_client_account        VARCHAR(20) NOT NULL DEFAULT '4111',
    default_supplier_account      VARCHAR(20) NOT NULL DEFAULT '4011',
    default_bank_account          VARCHAR(20) NOT NULL DEFAULT '5211',
    default_sales_goods_account   VARCHAR(20) NOT NULL DEFAULT '7011',
    default_sales_service_account VARCHAR(20) NOT NULL DEFAULT '7061',
    default_purchase_account      VARCHAR(20) NOT NULL DEFAULT '6011',
    default_expense_account       VARCHAR(20) NOT NULL DEFAULT '6251',

    -- Champs flexibles
    metadata                JSONB        NOT NULL DEFAULT '{}',

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_cs_tax_rate    CHECK (default_tax_rate    BETWEEN 0 AND 100),
    CONSTRAINT chk_cs_proforma_vd CHECK (default_proforma_validity_days > 0),
    CONSTRAINT chk_cs_invoice_dd  CHECK (default_invoice_due_days > 0)
);
CREATE TRIGGER tg_company_settings_updated_at
    BEFORE UPDATE ON company_settings
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
COMMENT ON TABLE company_settings IS 'Configuration globale de BTS : identité légale, branding, paramètres financiers et sécurité.';

-- ================================================================
-- 2. AGENCY_OFFICES — Bureaux/Agences
-- ================================================================
CREATE TABLE agency_offices (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        VARCHAR(10)  NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    city        VARCHAR(100),
    address     TEXT,
    is_default  BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);
CREATE TRIGGER tg_agency_offices_updated_at
    BEFORE UPDATE ON agency_offices
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE UNIQUE INDEX uq_agency_offices_default
    ON agency_offices (is_default) WHERE is_default = TRUE;

COMMENT ON TABLE agency_offices IS 'Bureaux/agences BTS. Le code (DC, YDE...) est intégré dans la numérotation SYSCOHADA des documents.';

INSERT INTO agency_offices (code, name, city, is_default)
VALUES ('DC', 'Direction Commerciale — Douala', 'Douala', TRUE);

-- ================================================================
-- 3. TAX_RATES — Taux de taxes (SYSCOHADA multi-taxes)
-- ================================================================
CREATE TABLE tax_rates (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL,
    code        VARCHAR(20)  NOT NULL UNIQUE,
    rate        NUMERIC(5,2) NOT NULL,
    description TEXT,
    is_default  BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    collected_tax_account       VARCHAR(20) NOT NULL DEFAULT '4431',
    deductible_tax_account      VARCHAR(20) NOT NULL DEFAULT '4452',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,

    CONSTRAINT chk_tax_rate_range CHECK (rate BETWEEN 0 AND 100)
);
CREATE TRIGGER tg_tax_rates_updated_at
    BEFORE UPDATE ON tax_rates
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE UNIQUE INDEX uq_tax_rates_default ON tax_rates (is_default) WHERE is_default = TRUE;

COMMENT ON TABLE tax_rates IS 'Taux de taxes configurables. Supporte la multi-taxation SYSCOHADA (TVA 19,25%, exonéré, etc.).';

INSERT INTO tax_rates (name, code, rate, description, is_default)
VALUES ('TVA Cameroun', 'TVA_19_25', 19.25, 'Taxe sur la Valeur Ajoutée — Taux standard Cameroun (SYSCOHADA)', TRUE);
INSERT INTO tax_rates (name, code, rate, description)
VALUES ('Exonéré', 'EXONERE', 0.00, 'Produit ou service exonéré de TVA');

-- ================================================================
-- 4. USERS — Employés BTS avec RBAC dynamique
-- role_id remplace l'ancien enum user_role (RBAC v3)
-- ================================================================
CREATE TABLE users (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identité
    first_name              VARCHAR(100) NOT NULL,
    last_name               VARCHAR(100) NOT NULL,
    email                   VARCHAR(255) NOT NULL UNIQUE,
    phone                   VARCHAR(50),
    avatar_path             VARCHAR(500),
    signature_path          VARCHAR(500),

    -- Authentification
    password_hash           VARCHAR(255) NOT NULL,

    -- RBAC v3 : rôle dynamique (remplace l'ancien enum user_role)
    role_id                 UUID         NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,

    status                  user_status  NOT NULL DEFAULT 'pending_activation',
    must_change_password    BOOLEAN      NOT NULL DEFAULT TRUE,

    -- Sécurité anti-brute-force
    failed_login_attempts   SMALLINT     NOT NULL DEFAULT 0,
    last_failed_login_at    TIMESTAMPTZ,
    locked_at               TIMESTAMPTZ,
    lock_reason             VARCHAR(255),

    -- 2FA (TOTP)
    two_factor_enabled      BOOLEAN      NOT NULL DEFAULT FALSE,
    two_factor_secret       TEXT,
    two_factor_enabled_at   TIMESTAMPTZ,
    two_factor_backup_codes TEXT[]       NOT NULL DEFAULT '{}',

    -- Préférences UI
    language                CHAR(2)      NOT NULL DEFAULT 'fr',
    timezone                VARCHAR(50)  NOT NULL DEFAULT 'Africa/Douala',
    theme                   VARCHAR(20)  NOT NULL DEFAULT 'system',
    email_notifications     BOOLEAN      NOT NULL DEFAULT TRUE,
    invoice_notifications   BOOLEAN      NOT NULL DEFAULT TRUE,

    -- Département/Service
    department              VARCHAR(100),
    job_title               VARCHAR(100),
    employee_id             VARCHAR(50) UNIQUE,
    office_id               UUID,

    -- Tracking
    last_login_at           TIMESTAMPTZ,
    last_activity_at        TIMESTAMPTZ,
    last_summary_sent_at    TIMESTAMPTZ,

    -- Champs flexibles
    metadata                JSONB        NOT NULL DEFAULT '{}',

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID        REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_email_format CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$')
);
CREATE TRIGGER tg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_users_role_id    ON users(role_id);
CREATE INDEX idx_users_status     ON users(status);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

COMMENT ON TABLE  users          IS 'Employés BTS avec RBAC dynamique (role_id → roles). Soft-delete = suspension. Documents conservés.';
COMMENT ON COLUMN users.role_id  IS 'Lien vers la table roles. Remplace l''ancien enum user_role. Permet des rôles personnalisés.';

-- ================================================================
-- RBAC — FK roles.created_by → users(id) (ajout post-création users)
-- ================================================================
ALTER TABLE roles
    ADD CONSTRAINT fk_roles_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- ================================================================
-- RBAC — TABLE role_change_history (traçabilité immuable des rôles)
-- ================================================================
CREATE TABLE role_change_history (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id         UUID        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    changed_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(30) NOT NULL,   -- 'CREATED', 'PERMISSIONS_UPDATED', 'RENAMED', 'DELETED'
    previous_perms  TEXT[],
    new_perms       TEXT[],
    previous_name   VARCHAR(255),
    new_name        VARCHAR(255),
    reason          TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_role_change_history_role_id  ON role_change_history(role_id);
CREATE INDEX idx_role_change_history_date     ON role_change_history(changed_at DESC);

COMMENT ON TABLE role_change_history IS 'Traçabilité immuable de toutes les modifications de permissions sur les rôles. Non modifiable.';
CREATE RULE no_update_role_change_history AS ON UPDATE TO role_change_history DO INSTEAD NOTHING;
CREATE RULE no_delete_role_change_history AS ON DELETE TO role_change_history DO INSTEAD NOTHING;

-- ================================================================
-- RBAC — SEED : 3 rôles système (non modifiables, non supprimables)
-- Inséré AVANT toute création d'utilisateur pour satisfaire la FK
-- ================================================================
INSERT INTO roles (name, display_name, description, color, icon, is_system, permissions) VALUES
(
    'admin',
    'Administrateur',
    'Accès complet à toutes les fonctionnalités. Rôle système protégé.',
    '#EF4444', 'shield-check', TRUE,
    ARRAY['*']
),
(
    'commercial',
    'Commercial',
    'Gestion des ventes, clients, proformas, factures et paiements.',
    '#2D7DD2', 'briefcase', TRUE,
    ARRAY[
        'invoices:read','invoices:create','invoices:edit','invoices:issue',
        'proformas:read','proformas:create','proformas:edit','proformas:send',
        'clients:read','clients:create','clients:edit',
        'products:read',
        'purchases:read','purchases:create',
        'payments:read','payments:create',
        'reports:read','notifications:read','stock:read'
    ]
),
(
    'employee',
    'Employé',
    'Accès en lecture aux documents et données. Rôle par défaut.',
    '#10B981', 'user', TRUE,
    ARRAY[
        'invoices:read','proformas:read','clients:read',
        'products:read','payments:read','reports:read','stock:read'
    ]
);

-- ================================================================
-- 5. REFRESH_TOKENS — Gestion des tokens JWT révocables
-- ================================================================
CREATE TABLE refresh_tokens (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash       VARCHAR(255) NOT NULL UNIQUE,
    device_name      VARCHAR(255),
    device_info      JSONB        NOT NULL DEFAULT '{}',
    ip_address       INET,
    expires_at       TIMESTAMPTZ  NOT NULL,
    revoked_at       TIMESTAMPTZ,
    revoke_reason    VARCHAR(100),
    last_activity_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user_id    ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_cleanup    ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;

COMMENT ON TABLE refresh_tokens IS 'Tokens JWT refresh stockés et révocables. Sécurité accrue contre le vol de session.';

-- ================================================================
-- 6. LOGIN_HISTORY — Historique connexions (audit RGPD)
-- ================================================================
CREATE TABLE login_history (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
    email          VARCHAR(255) NOT NULL,
    ip_address     INET,
    user_agent     TEXT,
    success        BOOLEAN      NOT NULL DEFAULT FALSE,
    failure_reason VARCHAR(100),
    session_id     UUID,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_login_history_user_id    ON login_history(user_id);
CREATE INDEX idx_login_history_created_at ON login_history(created_at);

COMMENT ON TABLE login_history IS 'Historique complet des connexions, incluant les tentatives échouées. Audit de sécurité.';

-- ================================================================
-- 7. PASSWORD_RESET_TOKENS — Réinitialisation mot de passe
-- ================================================================
CREATE TABLE password_reset_tokens (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ  NOT NULL,
    used_at     TIMESTAMPTZ,
    ip_address  INET,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_prt_expires CHECK (expires_at > created_at)
);
CREATE INDEX idx_prt_user_id    ON password_reset_tokens(user_id);
CREATE INDEX idx_prt_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX idx_prt_active     ON password_reset_tokens(token_hash) WHERE used_at IS NULL;

COMMENT ON TABLE password_reset_tokens IS 'Tokens de réinitialisation de mot de passe. Usage unique, durée 1h, jamais stockés en clair.';

-- ================================================================
-- 8. PRODUCT_CATEGORIES — Catalogue catégories
-- ================================================================
CREATE TABLE product_categories (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon        VARCHAR(50),
    color       CHAR(7),
    sort_order  SMALLINT     NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    created_by  UUID        REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER tg_product_categories_updated_at
    BEFORE UPDATE ON product_categories
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE product_categories IS 'Catégories du catalogue produits/services, gérables par l''admin.';

INSERT INTO product_categories (name, description, icon, color, sort_order) VALUES
    ('Infrastructure',  'Installation réseau, câblage, switch, routeur, borne Wi-Fi, rack serveur', 'network',   '#3B82F6', 1),
    ('Sécurité',        'Firewall, antivirus, audit sécurité, caméra Hikvision, contrôle d''accès', 'shield',    '#EF4444', 2),
    ('Cloud',           'Hébergement, sauvegarde cloud (AWS/Azure/GCP), migration, VPN',             'cloud',     '#8B5CF6', 3),
    ('Maintenance',     'Contrats de maintenance, interventions sur site, support distance',          'wrench',    '#F59E0B', 4),
    ('Conseil / DSI',   'Audit IT, schéma directeur, DSI externe, formation, consulting',            'briefcase', '#10B981', 5),
    ('Logiciels',       'Licences Microsoft, ERP/CRM, développement sur mesure',                    'code',      '#6366F1', 6),
    ('Matériels',       'PC, serveurs Dell/HP, imprimantes, NAS Synology, accessoires, onduleurs',   'cpu',       '#64748B', 7);

-- ================================================================
-- 9. PRODUCTS — Catalogue produits et services
-- ================================================================
CREATE TABLE products (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id     UUID        REFERENCES product_categories(id) ON DELETE SET NULL,

    name            VARCHAR(255) NOT NULL,
    reference       VARCHAR(100),
    type            product_type NOT NULL DEFAULT 'product',
    description     TEXT,

    unit            product_unit NOT NULL DEFAULT 'piece',
    unit_price_ht   NUMERIC(15,2) NOT NULL DEFAULT 0,

    tax_rate_id     UUID        REFERENCES tax_rates(id) ON DELETE RESTRICT,
    tax_rate_value  NUMERIC(5,2) NOT NULL DEFAULT 19.25,

    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,

    metadata        JSONB        NOT NULL DEFAULT '{}',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT uq_product_name_category UNIQUE (name, category_id),
    CONSTRAINT chk_product_price    CHECK (unit_price_ht >= 0),
    CONSTRAINT chk_product_tax_rate CHECK (tax_rate_value BETWEEN 0 AND 100)
);
CREATE TRIGGER tg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_is_active   ON products(is_active);
CREATE INDEX idx_products_name        ON products USING gin(to_tsvector('french', name));

COMMENT ON TABLE products IS 'Catalogue de produits et services. Prix de référence modifiable à la volée sur chaque document.';

-- ================================================================
-- 10. CLIENTS — Annuaire clients (entreprises et particuliers)
-- ================================================================
CREATE TABLE clients (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    type            client_type  NOT NULL DEFAULT 'company',

    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(50),
    phone_2         VARCHAR(50),

    address         TEXT,
    city            VARCHAR(100),
    country         VARCHAR(100) NOT NULL DEFAULT 'Cameroun',
    postal_box      VARCHAR(50),

    tax_number      VARCHAR(100),
    rccm            VARCHAR(100),

    currency        CHAR(3)       NOT NULL DEFAULT 'XAF',
    accounting_account VARCHAR(20)  DEFAULT '4111',
    default_payment_terms TEXT,

    status          client_status NOT NULL DEFAULT 'active',
    internal_notes  TEXT,

    metadata        JSONB        NOT NULL DEFAULT '{}',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT uq_client_name_email UNIQUE NULLS NOT DISTINCT (name, email)
);
CREATE TRIGGER tg_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_clients_name   ON clients USING gin(to_tsvector('french', name));
CREATE INDEX idx_clients_email  ON clients(email);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_type   ON clients(type);
CREATE INDEX idx_clients_city   ON clients(city);

COMMENT ON TABLE clients IS 'Annuaire clients. Les archivés sont préservés pour l''historique mais exclus des nouveaux documents.';
COMMENT ON COLUMN clients.internal_notes IS 'CONFIDENTIEL : notes internes, jamais affichées sur les PDFs envoyés au client.';
COMMENT ON COLUMN clients.accounting_account IS 'Compte auxiliaire OHADA classe 4. 4111 = Clients (collectif). Personnalisable par sous-compte.';

-- ================================================================
-- 11. DOCUMENT_SEQUENCES — Numérotation SYSCOHADA (sans trou, atomique)
-- ================================================================
CREATE TABLE document_sequences (
    id              UUID     PRIMARY KEY DEFAULT uuid_generate_v4(),
    office_id       UUID     NOT NULL REFERENCES agency_offices(id) ON DELETE RESTRICT,
    document_type   document_type NOT NULL,
    year            SMALLINT NOT NULL,
    month           SMALLINT NOT NULL,
    last_sequence   INTEGER  NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_doc_seq      UNIQUE (office_id, document_type, year, month),
    CONSTRAINT chk_seq_month   CHECK (month BETWEEN 1 AND 12),
    CONSTRAINT chk_seq_year    CHECK (year  >= 2020),
    CONSTRAINT chk_seq_counter CHECK (last_sequence >= 0)
);
CREATE TRIGGER tg_document_sequences_updated_at
    BEFORE UPDATE ON document_sequences
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE document_sequences IS 'Compteurs de séquences SYSCOHADA. Atomiques, sans trou, par type/bureau/année/mois.';

CREATE OR REPLACE FUNCTION fn_next_document_number(
    p_office_id     UUID,
    p_doc_type      document_type,
    p_year          SMALLINT DEFAULT NULL,
    p_month         SMALLINT DEFAULT NULL
) RETURNS VARCHAR LANGUAGE plpgsql AS $$
DECLARE
    v_year        SMALLINT := COALESCE(p_year,  EXTRACT(YEAR  FROM NOW())::SMALLINT);
    v_month       SMALLINT := COALESCE(p_month, EXTRACT(MONTH FROM NOW())::SMALLINT);
    v_seq         INTEGER;
    v_office_code VARCHAR(10);
    v_doc_prefix  VARCHAR(5);
BEGIN
    SELECT code INTO STRICT v_office_code
      FROM agency_offices WHERE id = p_office_id;

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
        v_office_code,
        v_year,
        lpad(v_month::TEXT, 2, '0'),
        v_doc_prefix,
        lpad(v_seq::TEXT, 3, '0')
    );
END;
$$;

COMMENT ON FUNCTION fn_next_document_number IS
    'Génère un numéro SYSCOHADA-conforme, sans trou, thread-safe. Mis à jour étape 3 pour bc/ff/dep/bl.';

-- ================================================================
-- 12. PROFORMAS — Devis commerciaux
-- ================================================================
CREATE TABLE proformas (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    number                  VARCHAR(50)  NOT NULL UNIQUE,
    office_id               UUID         NOT NULL REFERENCES agency_offices(id) ON DELETE RESTRICT,
    client_id               UUID         NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    created_by              UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_to             UUID         REFERENCES users(id) ON DELETE SET NULL,

    issue_date              DATE         NOT NULL DEFAULT CURRENT_DATE,
    valid_until             DATE         NOT NULL,

    subject                 VARCHAR(500),
    notes                   TEXT,
    payment_conditions      TEXT,
    delivery_delay          TEXT,
    warranty                TEXT,

    currency                CHAR(3)      NOT NULL DEFAULT 'XAF',

    subtotal_ht             NUMERIC(15,2) NOT NULL DEFAULT 0,
    global_discount_type    discount_type NOT NULL DEFAULT 'none',
    global_discount_value   NUMERIC(15,2) NOT NULL DEFAULT 0,
    global_discount_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ht                NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_tax               NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ttc               NUMERIC(15,2) NOT NULL DEFAULT 0,

    status                  proforma_status NOT NULL DEFAULT 'draft',

    last_sent_at                TIMESTAMPTZ,
    last_reminder_at            TIMESTAMPTZ,
    reminder_count              SMALLINT     NOT NULL DEFAULT 0,
    reminder_escalation_level   SMALLINT     NOT NULL DEFAULT 0,
    draft_reminder_level        SMALLINT     NOT NULL DEFAULT 0,

    -- Compte bancaire BTS sur lequel le client doit payer (FK ajoutée à l'étape 5)
    bank_account_id         UUID,

    qr_code_path            VARCHAR(500),
    pdf_path                VARCHAR(500),
    pdf_generated_at        TIMESTAMPTZ,

    metadata                JSONB        NOT NULL DEFAULT '{}',

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,

    CONSTRAINT chk_pfm_valid_until   CHECK (valid_until >= issue_date),
    CONSTRAINT chk_pfm_subtotal      CHECK (subtotal_ht >= 0),
    CONSTRAINT chk_pfm_total_ttc     CHECK (total_ttc   >= 0),
    CONSTRAINT chk_pfm_disc_value    CHECK (global_discount_value >= 0),
    CONSTRAINT chk_pfm_disc_pct      CHECK (
        global_discount_type != 'percentage' OR
        global_discount_value BETWEEN 0 AND 100
    )
);
CREATE TRIGGER tg_proformas_updated_at
    BEFORE UPDATE ON proformas
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_proformas_client_id   ON proformas(client_id);
CREATE INDEX idx_proformas_created_by  ON proformas(created_by);
CREATE INDEX idx_proformas_status      ON proformas(status);
CREATE INDEX idx_proformas_issue_date  ON proformas(issue_date);
CREATE INDEX idx_proformas_valid_until ON proformas(valid_until);
CREATE INDEX idx_proformas_active      ON proformas(id) WHERE deleted_at IS NULL;

COMMENT ON TABLE proformas IS 'Devis/proformas. Une proforma acceptée est verrouillée et peut être convertie en facture.';

-- ================================================================
-- 13. PROFORMA_LINES — Lignes de devis (snapshot prix)
-- ================================================================
CREATE TABLE proforma_lines (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    proforma_id     UUID        NOT NULL REFERENCES proformas(id) ON DELETE CASCADE,
    product_id      UUID        REFERENCES products(id) ON DELETE SET NULL,
    sort_order      SMALLINT    NOT NULL DEFAULT 0,
    designation     VARCHAR(500) NOT NULL,
    description     TEXT,
    unit            product_unit NOT NULL DEFAULT 'piece',
    quantity        NUMERIC(10,3) NOT NULL DEFAULT 1,
    unit_price_ht   NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_type   discount_type NOT NULL DEFAULT 'none',
    discount_value  NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 19.25,
    subtotal_ht     NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_ht          NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ttc       NUMERIC(15,2) NOT NULL DEFAULT 0,
    hide_details    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_pfl_quantity   CHECK (quantity > 0),
    CONSTRAINT chk_pfl_price      CHECK (unit_price_ht >= 0),
    CONSTRAINT chk_pfl_disc_value CHECK (discount_value >= 0),
    CONSTRAINT chk_pfl_tax_rate   CHECK (tax_rate BETWEEN 0 AND 100)
);
CREATE TRIGGER tg_proforma_lines_updated_at
    BEFORE UPDATE ON proforma_lines
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_proforma_lines_proforma_id ON proforma_lines(proforma_id);

COMMENT ON TABLE proforma_lines IS 'Lignes de devis avec snapshot des prix à la création. Indépendant du catalogue.';
COMMENT ON COLUMN proforma_lines.sort_order IS 'Ordre d''affichage (drag & drop). Correspond à l''ordre exact sur le PDF généré.';

-- ================================================================
-- 14. PROFORMA_STATUS_HISTORY
-- ================================================================
CREATE TABLE proforma_status_history (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    proforma_id     UUID            NOT NULL REFERENCES proformas(id) ON DELETE CASCADE,
    changed_by      UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    previous_status proforma_status,
    new_status      proforma_status NOT NULL,
    reason          TEXT,
    changed_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pfm_status_hist_pfm_id ON proforma_status_history(proforma_id);
CREATE INDEX idx_pfm_status_hist_date   ON proforma_status_history(changed_at);

COMMENT ON TABLE proforma_status_history IS 'Historique complet des changements de statut des proformas.';

-- ================================================================
-- 15. INVOICES — Toutes les factures
-- ================================================================
CREATE TABLE invoices (
    id                      UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    number                  VARCHAR(50)  NOT NULL UNIQUE,
    office_id               UUID         NOT NULL REFERENCES agency_offices(id) ON DELETE RESTRICT,
    type                    invoice_type NOT NULL DEFAULT 'standard',

    client_id               UUID         NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    created_by              UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_to             UUID         REFERENCES users(id) ON DELETE SET NULL,

    proforma_id             UUID         REFERENCES proformas(id) ON DELETE SET NULL,
    parent_invoice_id       UUID         REFERENCES invoices(id) ON DELETE SET NULL,
    credited_invoice_id     UUID         REFERENCES invoices(id) ON DELETE RESTRICT,
    recurring_template_id   UUID,

    issue_date              DATE         NOT NULL DEFAULT CURRENT_DATE,
    due_date                DATE         NOT NULL,

    subject                 VARCHAR(500),
    client_reference        VARCHAR(100),
    notes                   TEXT,
    payment_conditions      TEXT,

    currency                CHAR(3)      NOT NULL DEFAULT 'XAF',

    subtotal_ht             NUMERIC(15,2) NOT NULL DEFAULT 0,
    global_discount_type    discount_type NOT NULL DEFAULT 'none',
    global_discount_value   NUMERIC(15,2) NOT NULL DEFAULT 0,
    global_discount_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ht                NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_tax               NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ttc               NUMERIC(15,2) NOT NULL DEFAULT 0,

    acompte_percentage      NUMERIC(5,2),
    total_acomptes_deducted NUMERIC(15,2) NOT NULL DEFAULT 0,
    amount_due              NUMERIC(15,2) NOT NULL DEFAULT 0,
    amount_paid             NUMERIC(15,2) NOT NULL DEFAULT 0,
    balance_due             NUMERIC(15,2) NOT NULL DEFAULT 0,

    status                  invoice_status NOT NULL DEFAULT 'draft',

    last_sent_at            TIMESTAMPTZ,
    last_reminder_at        TIMESTAMPTZ,
    reminder_count          SMALLINT      NOT NULL DEFAULT 0,
    reminder_escalation_level SMALLINT    NOT NULL DEFAULT 0,
    draft_reminder_level    SMALLINT      NOT NULL DEFAULT 0,

    cancelled_at            TIMESTAMPTZ,
    cancel_reason           TEXT,
    cancelled_by            UUID          REFERENCES users(id) ON DELETE SET NULL,

    -- Compte bancaire BTS sur lequel le client doit payer (FK ajoutée à l'étape 5)
    bank_account_id         UUID,

    -- Escompte de règlement (réduction financière pour paiement anticipé — compte 673)
    escompte_rate           NUMERIC(5,2),           -- taux en % (ex: 2.00)
    escompte_deadline       DATE,                   -- date limite pour bénéficier de l'escompte
    escompte_amount         NUMERIC(15,2) NOT NULL DEFAULT 0, -- montant calculé = total_ttc * rate/100

    qr_code_path            VARCHAR(500),
    pdf_path                VARCHAR(500),
    pdf_generated_at        TIMESTAMPTZ,

    metadata                JSONB         NOT NULL DEFAULT '{}',

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,

    CONSTRAINT chk_inv_due_date    CHECK (due_date >= issue_date),
    CONSTRAINT chk_inv_subtotal    CHECK (subtotal_ht >= 0),
    CONSTRAINT chk_inv_total_ttc   CHECK (total_ttc   >= 0),
    CONSTRAINT chk_inv_amount_paid CHECK (amount_paid >= 0),
    CONSTRAINT chk_inv_balance_due CHECK (balance_due >= 0),
    CONSTRAINT chk_inv_disc_pct    CHECK (
        global_discount_type != 'percentage' OR
        global_discount_value BETWEEN 0 AND 100
    ),
    CONSTRAINT chk_avoir_must_ref  CHECK (
        (type = 'avoir'  AND credited_invoice_id IS NOT NULL) OR
        (type != 'avoir')
    ),
    CONSTRAINT chk_solde_must_ref  CHECK (
        (type = 'solde'  AND parent_invoice_id IS NOT NULL) OR
        (type != 'solde')
    ),
    CONSTRAINT chk_acompte_pct     CHECK (
        acompte_percentage IS NULL OR
        acompte_percentage BETWEEN 0.01 AND 100
    ),
    CONSTRAINT chk_inv_escompte_rate CHECK (
        escompte_rate IS NULL OR escompte_rate BETWEEN 0.01 AND 100
    ),
    CONSTRAINT chk_inv_escompte_deadline CHECK (
        escompte_deadline IS NULL OR escompte_deadline >= issue_date
    )
);
CREATE TRIGGER tg_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_invoices_client_id      ON invoices(client_id);
CREATE INDEX idx_invoices_created_by     ON invoices(created_by);
CREATE INDEX idx_invoices_status         ON invoices(status);
CREATE INDEX idx_invoices_type           ON invoices(type);
CREATE INDEX idx_invoices_issue_date     ON invoices(issue_date);
CREATE INDEX idx_invoices_due_date       ON invoices(due_date);
CREATE INDEX idx_invoices_proforma_id    ON invoices(proforma_id);
CREATE INDEX idx_invoices_parent_id      ON invoices(parent_invoice_id);
CREATE INDEX idx_invoices_credited_id    ON invoices(credited_invoice_id);
CREATE INDEX idx_invoices_active         ON invoices(id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_status_date    ON invoices(status, issue_date DESC);
CREATE INDEX idx_invoices_overdue        ON invoices(due_date, status)
    WHERE status IN ('issued', 'partially_paid') AND deleted_at IS NULL;

COMMENT ON TABLE  invoices                     IS 'Toutes les factures : standard, acompte, solde, avoir, récurrente. Lien inter-factures pour le cycle acompte/solde.';
COMMENT ON COLUMN invoices.type                IS 'standard=facture classique | acompte=facture partielle | solde=facture finale déduisant les acomptes | avoir=note de crédit | recurring=générée automatiquement';
COMMENT ON COLUMN invoices.parent_invoice_id   IS 'Pour solde : lien vers la première facture d''acompte du contrat.';
COMMENT ON COLUMN invoices.credited_invoice_id IS 'Pour avoir : référence obligatoire de la facture annulée/créditée.';
COMMENT ON COLUMN invoices.total_acomptes_deducted IS 'Pour facture solde : somme des acomptes déjà versés, déduite du total TTC.';
COMMENT ON COLUMN invoices.amount_due          IS 'Montant réellement dû = total_ttc - total_acomptes_deducted.';
COMMENT ON COLUMN invoices.escompte_rate       IS 'Taux d''escompte de règlement en % (ex: 2.00). NULL = pas d''escompte proposé.';
COMMENT ON COLUMN invoices.escompte_deadline   IS 'Date limite pour bénéficier de l''escompte. Paiement avant cette date = escompte accordé.';
COMMENT ON COLUMN invoices.escompte_amount     IS 'Montant de l''escompte calculé = total_ttc * escompte_rate / 100. Charge financière (compte 673 SYSCOHADA).';

-- ================================================================
-- 16. INVOICE_LINES — Lignes de facture (snapshot)
-- ================================================================
CREATE TABLE invoice_lines (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id      UUID         NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id      UUID         REFERENCES products(id) ON DELETE SET NULL,
    sort_order      SMALLINT     NOT NULL DEFAULT 0,
    designation     VARCHAR(500) NOT NULL,
    description     TEXT,
    unit            product_unit NOT NULL DEFAULT 'piece',
    quantity        NUMERIC(10,3) NOT NULL DEFAULT 1,
    unit_price_ht   NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_type   discount_type NOT NULL DEFAULT 'none',
    discount_value  NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 19.25,
    subtotal_ht     NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_ht          NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ttc       NUMERIC(15,2) NOT NULL DEFAULT 0,
    hide_details    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_invl_quantity   CHECK (quantity > 0),
    CONSTRAINT chk_invl_price      CHECK (unit_price_ht >= 0),
    CONSTRAINT chk_invl_disc_value CHECK (discount_value >= 0),
    CONSTRAINT chk_invl_tax_rate   CHECK (tax_rate BETWEEN 0 AND 100)
);
CREATE TRIGGER tg_invoice_lines_updated_at
    BEFORE UPDATE ON invoice_lines
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_invoice_lines_invoice_id ON invoice_lines(invoice_id);

COMMENT ON TABLE  invoice_lines           IS 'Lignes de facture avec snapshot complet pour intégrité historique totale.';
COMMENT ON COLUMN invoice_lines.sort_order IS 'Ordre d''affichage. Verrouillé après émission de la facture.';

-- ================================================================
-- 17. INVOICE_STATUS_HISTORY
-- ================================================================
CREATE TABLE invoice_status_history (
    id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id      UUID           NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    changed_by      UUID           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    previous_status invoice_status,
    new_status      invoice_status NOT NULL,
    reason          TEXT,
    changed_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_inv_status_hist_inv_id ON invoice_status_history(invoice_id);
CREATE INDEX idx_inv_status_hist_date   ON invoice_status_history(changed_at);

COMMENT ON TABLE invoice_status_history IS 'Historique complet des changements de statut des factures.';

-- ================================================================
-- 18. PAYMENTS — Enregistrement des paiements clients
-- ================================================================
CREATE TABLE payments (
    id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id      UUID           NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    payment_date    DATE           NOT NULL DEFAULT CURRENT_DATE,
    amount          NUMERIC(15,2)  NOT NULL,
    method          payment_method NOT NULL DEFAULT 'virement',
    reference       VARCHAR(255),
    notes           TEXT,
    attachment_path VARCHAR(500),

    -- Lien banque (FK ajoutée à l'étape 5 — bank_accounts)
    bank_account_id     UUID,
    bank_transaction_id UUID,
    reconciled_at       TIMESTAMPTZ,
    reconciled_by       UUID    REFERENCES users(id) ON DELETE SET NULL,

    -- Escompte de règlement appliqué lors de ce paiement
    escompte_applied    BOOLEAN        NOT NULL DEFAULT FALSE,
    escompte_amount     NUMERIC(15,2)  NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT chk_payment_amount    CHECK (amount > 0),
    CONSTRAINT chk_payment_escompte  CHECK (
        (escompte_applied = FALSE AND escompte_amount = 0) OR
        (escompte_applied = TRUE  AND escompte_amount > 0)
    )
);
CREATE TRIGGER tg_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_date       ON payments(payment_date);
CREATE INDEX idx_payments_created_by ON payments(created_by);
CREATE INDEX idx_payments_active     ON payments(invoice_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE payments IS 'Enregistrement des paiements clients. Soft-delete pour corrections. Met à jour automatiquement le statut de la facture.';
COMMENT ON COLUMN payments.escompte_applied IS 'TRUE si un escompte de règlement a été accordé lors de ce paiement (paiement anticipé).';
COMMENT ON COLUMN payments.escompte_amount  IS 'Montant de l''escompte accordé (compte 673). amount_paid facture = payment.amount + payment.escompte_amount.';

-- ================================================================
-- 19. RECURRING_INVOICE_TEMPLATES — Gabarits de facturation récurrente
-- ================================================================
CREATE TABLE recurring_invoice_templates (
    id                  UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id           UUID               NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    office_id           UUID               NOT NULL REFERENCES agency_offices(id) ON DELETE RESTRICT,
    interval            recurring_interval NOT NULL DEFAULT 'monthly',
    next_invoice_date   DATE               NOT NULL,
    end_date            DATE,
    subject             VARCHAR(500),
    notes               TEXT,
    payment_conditions  TEXT,
    currency            CHAR(3)            NOT NULL DEFAULT 'XAF',
    is_active           BOOLEAN            NOT NULL DEFAULT TRUE,
    last_generated_at   TIMESTAMPTZ,
    metadata            JSONB              NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID               NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT chk_recur_end_date CHECK (end_date IS NULL OR end_date > next_invoice_date)
);
CREATE TRIGGER tg_recurring_templates_updated_at
    BEFORE UPDATE ON recurring_invoice_templates
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE recurring_invoice_templates IS 'Gabarits de facturation récurrente (mensuelle, trimestrielle, annuelle).';

CREATE TABLE recurring_invoice_template_lines (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id     UUID         NOT NULL REFERENCES recurring_invoice_templates(id) ON DELETE CASCADE,
    product_id      UUID         REFERENCES products(id) ON DELETE SET NULL,
    sort_order      SMALLINT     NOT NULL DEFAULT 0,
    designation     VARCHAR(500) NOT NULL,
    description     TEXT,
    quantity        NUMERIC(10,3) NOT NULL DEFAULT 1,
    unit            product_unit NOT NULL DEFAULT 'piece',
    unit_price_ht   NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_type   discount_type NOT NULL DEFAULT 'none',
    discount_value  NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 19.25,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_recurl_qty   CHECK (quantity > 0),
    CONSTRAINT chk_recurl_price CHECK (unit_price_ht >= 0)
);
CREATE INDEX idx_recur_lines_template_id ON recurring_invoice_template_lines(template_id);

COMMENT ON TABLE recurring_invoice_template_lines IS 'Lignes modèles des factures récurrentes. Utilisées à chaque génération automatique.';

ALTER TABLE invoices
    ADD CONSTRAINT fk_invoices_recurring_template
    FOREIGN KEY (recurring_template_id)
    REFERENCES recurring_invoice_templates(id) ON DELETE SET NULL;

-- ================================================================
-- 20. NOTIFICATIONS — Fil de notifications in-app
-- ================================================================
CREATE TABLE notifications (
    id              UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID                NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            notification_status NOT NULL,
    title           VARCHAR(255)        NOT NULL,
    message         TEXT                NOT NULL,
    entity_type     VARCHAR(50),
    entity_id       UUID,
    entity_label    VARCHAR(255),
    is_read         BOOLEAN             NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    email_sent      BOOLEAN             NOT NULL DEFAULT FALSE,
    email_sent_at   TIMESTAMPTZ,
    metadata        JSONB               NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifs_user_id ON notifications(user_id);
CREATE INDEX idx_notifs_unread  ON notifications(user_id, created_at DESC)
    WHERE is_read = FALSE;
CREATE INDEX idx_notifs_entity  ON notifications(entity_type, entity_id);

COMMENT ON TABLE notifications IS 'Fil de notifications in-app par utilisateur.';

-- ================================================================
-- 21. NOTIFICATION_SETTINGS — Préférences de notification
-- ================================================================
CREATE TABLE notification_settings (
    id                  UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID                 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type                notification_status  NOT NULL,
    channel             notification_channel NOT NULL DEFAULT 'both',
    enabled             BOOLEAN              NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ          NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_notif_settings UNIQUE (user_id, type)
);
CREATE TRIGGER tg_notif_settings_updated_at
    BEFORE UPDATE ON notification_settings
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE notification_settings IS 'Préférences de notification par utilisateur et par type d''alerte.';

-- ================================================================
-- 22. EMAIL_TEMPLATES — Gabarits d'emails personnalisables
-- v4 : ajout locale (multi-langue fr/en), contrainte unique (type, locale)
-- ================================================================
CREATE TABLE email_templates (
    id          UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    type        notification_status NOT NULL,
    locale      VARCHAR(5)          NOT NULL DEFAULT 'fr',
    name        VARCHAR(255)        NOT NULL,
    subject     VARCHAR(500)        NOT NULL,
    body_html   TEXT                NOT NULL,
    body_text   TEXT,
    variables   JSONB               NOT NULL DEFAULT '[]',
    is_active   BOOLEAN             NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_by  UUID                REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT uq_email_template_type_locale UNIQUE (type, locale)
);
CREATE TRIGGER tg_email_templates_updated_at
    BEFORE UPDATE ON email_templates
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE email_templates IS 'Gabarits d''emails transactionnels personnalisables par l''admin. Un gabarit par (type, locale).';
COMMENT ON COLUMN email_templates.locale IS 'Langue du gabarit : fr (defaut) ou en. Fallback automatique vers fr si la locale demandee n''existe pas.';

-- ================================================================
-- 22b. EMAIL_TEMPLATE_VERSIONS — Historique des modifications
-- ================================================================
CREATE TABLE email_template_versions (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id     UUID        NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
    subject         VARCHAR(500) NOT NULL,
    body_html       TEXT        NOT NULL,
    edited_by_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_tpl_versions_template ON email_template_versions (template_id, created_at DESC);

COMMENT ON TABLE email_template_versions IS 'Historique des modifications des gabarits d''email. Sauvegarde automatique avant chaque PUT. Permet le rollback par version (max 20 versions affichees).';

-- ================================================================
-- 23. AUDIT_LOGS — Journal d'audit immuable (CDC §4.8)
-- v3 : user_role_name VARCHAR(100) remplace user_role user_role (enum supprimé)
-- ================================================================
CREATE TABLE audit_logs (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),

    user_id         UUID         REFERENCES users(id) ON DELETE SET NULL,
    user_email      VARCHAR(255),
    -- v3 : snapshot textuel du rôle (compatible avec les rôles dynamiques)
    user_role_name  VARCHAR(100),

    action          audit_action NOT NULL,

    entity_type     VARCHAR(100),
    entity_id       UUID,
    entity_label    VARCHAR(255),

    previous_state  JSONB,
    new_state       JSONB,

    description     TEXT,

    ip_address      INET,
    user_agent      TEXT,
    session_id      UUID,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id    ON audit_logs(user_id);
CREATE INDEX idx_audit_entity     ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_action     ON audit_logs(action);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_created_brin ON audit_logs USING BRIN (created_at);

CREATE RULE no_update_audit AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

COMMENT ON TABLE  audit_logs            IS 'Journal d''audit immuable. Toutes les actions sensibles avec état avant/après. Conforme SYSCOHADA.';
COMMENT ON COLUMN audit_logs.user_role_name IS 'Snapshot textuel du nom du rôle au moment de l''action (ex: "Administrateur"). Compatible RBAC dynamique.';

-- ================================================================
-- 24. BACKUPS — Suivi des sauvegardes
-- ================================================================
CREATE TABLE backups (
    id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename        VARCHAR(255)  NOT NULL,
    storage_disk    VARCHAR(50)   NOT NULL DEFAULT 'local',
    storage_path    VARCHAR(500),
    size_bytes      BIGINT        NOT NULL DEFAULT 0,
    status          backup_status NOT NULL DEFAULT 'pending',
    type            VARCHAR(20)   NOT NULL DEFAULT 'manual',
    checksum        VARCHAR(128),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error_message   TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by      UUID          REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_backups_status     ON backups(status);
CREATE INDEX idx_backups_created_at ON backups(created_at DESC);

COMMENT ON TABLE backups IS 'Suivi des sauvegardes de base de données (manuelles et planifiées).';

-- ================================================================
-- VUES MÉTIER — v3 (base v2 conservée, user_role → user_role_name)
-- ================================================================

CREATE VIEW v_client_financial_summary AS
SELECT
    c.id                                                                  AS client_id,
    c.name                                                                AS client_name,
    c.type                                                                AS client_type,
    c.status                                                              AS client_status,
    COUNT(DISTINCT i.id) FILTER (WHERE i.deleted_at IS NULL)              AS total_invoices,
    COALESCE(SUM(i.total_ttc)
        FILTER (WHERE i.status != 'cancelled' AND i.deleted_at IS NULL), 0) AS total_invoiced,
    COALESCE(SUM(i.amount_paid)
        FILTER (WHERE i.deleted_at IS NULL), 0)                           AS total_paid,
    COALESCE(SUM(i.balance_due)
        FILTER (WHERE i.status NOT IN ('paid','cancelled')
                  AND i.deleted_at IS NULL), 0)                           AS total_outstanding,
    MAX(i.issue_date)
        FILTER (WHERE i.deleted_at IS NULL)                               AS last_invoice_date,
    COUNT(DISTINCT p.id)
        FILTER (WHERE p.deleted_at IS NULL)                               AS total_proformas
FROM clients c
LEFT JOIN invoices  i ON i.client_id = c.id
LEFT JOIN proformas p ON p.client_id = c.id
GROUP BY c.id, c.name, c.type, c.status;

COMMENT ON VIEW v_client_financial_summary IS 'Résumé financier temps réel par client. Affiché en en-tête de la fiche client.';

CREATE VIEW v_invoice_overview AS
SELECT
    i.id,
    i.number,
    i.type,
    i.status,
    i.issue_date,
    i.due_date,
    i.total_ttc,
    i.amount_paid,
    i.balance_due,
    i.currency,
    c.name                                AS client_name,
    c.email                               AS client_email,
    c.type                                AS client_type,
    u.first_name || ' ' || u.last_name    AS created_by_name,
    r.display_name                        AS created_by_role,
    CASE
        WHEN i.status IN ('cancelled','paid') THEN 0
        ELSE GREATEST(0, CURRENT_DATE - i.due_date)
    END                                   AS days_overdue,
    (SELECT COUNT(*) FROM payments
      WHERE invoice_id = i.id AND deleted_at IS NULL) AS payment_count
FROM  invoices  i
JOIN  clients   c ON c.id = i.client_id
JOIN  users     u ON u.id = i.created_by
JOIN  roles     r ON r.id = u.role_id
WHERE i.deleted_at IS NULL;

COMMENT ON VIEW v_invoice_overview IS 'Vue enrichie des factures pour les listes et le tableau de bord. v3 : inclut display_name du rôle.';

CREATE VIEW v_product_usage_stats AS
SELECT
    p.id,
    p.name,
    p.type,
    p.unit,
    p.unit_price_ht,
    p.is_active,
    pc.name                              AS category_name,
    COUNT(DISTINCT il.invoice_id)        AS invoice_count,
    COUNT(DISTINCT pl.proforma_id)       AS proforma_count,
    COALESCE(SUM(il.total_ttc), 0)       AS total_revenue_invoiced,
    MAX(GREATEST(
        COALESCE((SELECT MAX(created_at) FROM invoice_lines  WHERE product_id = p.id), '1970-01-01'),
        COALESCE((SELECT MAX(created_at) FROM proforma_lines WHERE product_id = p.id), '1970-01-01')
    ))                                   AS last_used_at
FROM  products           p
LEFT JOIN product_categories pc ON pc.id = p.category_id
LEFT JOIN invoice_lines    il ON il.product_id = p.id
LEFT JOIN proforma_lines   pl ON pl.product_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name, p.type, p.unit, p.unit_price_ht, p.is_active, pc.name;

COMMENT ON VIEW v_product_usage_stats IS 'Statistiques d''utilisation par produit.';

-- v_dashboard_kpis déplacée après étape 4 (références supplier_invoices + expenses)

-- ================================================================
-- ████████████████████████████████████████████████████████████████
-- ÉTAPE 2 — EXTENSIONS DES TABLES ET ENUMS EXISTANTS
-- ████████████████████████████████████████████████████████████████
-- ================================================================

-- ================================================================
-- 2.1 Étendre `document_type` ENUM — nouveaux types de documents
-- ================================================================
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'purchase_order';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'supplier_invoice';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'expense';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'delivery_note';
-- ================================================================
-- 2.2 Étendre `payment_method` ENUM — nouveaux modes achats
-- ================================================================
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'prelevement';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'lettre_de_change';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'carte_bancaire';

-- ================================================================
-- 2.3 Étendre `audit_action` ENUM — nouveaux modules
-- ================================================================
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
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'JOB_FAILED';

-- ================================================================
-- 2.4 Étendre `notification_status` ENUM — nouveaux modules
-- ================================================================
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

-- ================================================================
-- 2.5 Étendre `company_settings` — paramètres nouveaux modules
-- ================================================================
ALTER TABLE company_settings
    ADD COLUMN IF NOT EXISTS fiscal_year_start_month     SMALLINT      NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS default_accounting_currency CHAR(3)       NOT NULL DEFAULT 'XAF',
    ADD COLUMN IF NOT EXISTS syscohada_company_type      VARCHAR(50)   DEFAULT 'PME',
    ADD COLUMN IF NOT EXISTS default_purchase_due_days   SMALLINT      NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS purchase_approval_threshold NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS expense_approval_required   BOOLEAN       NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS expense_approval_threshold  NUMERIC(15,2) DEFAULT 50000,
    ADD COLUMN IF NOT EXISTS default_bank_account_id     UUID,
    ADD COLUMN IF NOT EXISTS primary_color               CHAR(7)       DEFAULT '#2D7DD2',
    ADD COLUMN IF NOT EXISTS secondary_color             CHAR(7)       DEFAULT '#10B981',
    ADD COLUMN IF NOT EXISTS app_custom_name             VARCHAR(100)  DEFAULT 'InvoiceHub',
    ADD COLUMN IF NOT EXISTS document_footer_legal       TEXT,
    ADD COLUMN IF NOT EXISTS password_min_length         SMALLINT      NOT NULL DEFAULT 8,
    ADD COLUMN IF NOT EXISTS password_require_uppercase  BOOLEAN       NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS password_require_number     BOOLEAN       NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS password_require_special    BOOLEAN       NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS password_expiry_days        SMALLINT,
    ADD COLUMN IF NOT EXISTS invoice_approval_required   BOOLEAN       NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS invoice_approval_threshold  NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS webhooks_enabled            BOOLEAN       NOT NULL DEFAULT FALSE,
    -- Comptes comptables SYSCOHADA configurables (remplacent les valeurs en dur dans le moteur)
    ADD COLUMN IF NOT EXISTS initial_stock_account       VARCHAR(20)   NOT NULL DEFAULT '1042',
    ADD COLUMN IF NOT EXISTS escompte_accounting_account VARCHAR(20)   NOT NULL DEFAULT '673',
    ADD COLUMN IF NOT EXISTS collected_tax_account       VARCHAR(20)   NOT NULL DEFAULT '4431',
    ADD COLUMN IF NOT EXISTS deductible_tax_account      VARCHAR(20)   NOT NULL DEFAULT '4452',
    ADD COLUMN IF NOT EXISTS stock_account               VARCHAR(20)   NOT NULL DEFAULT '3111',
    ADD COLUMN IF NOT EXISTS stock_variation_account     VARCHAR(20)   NOT NULL DEFAULT '6031',
    ADD COLUMN IF NOT EXISTS stock_loss_account          VARCHAR(20)   NOT NULL DEFAULT '6032',
    ADD COLUMN IF NOT EXISTS default_client_account        VARCHAR(20) NOT NULL DEFAULT '4111',
    ADD COLUMN IF NOT EXISTS default_supplier_account      VARCHAR(20) NOT NULL DEFAULT '4011',
    ADD COLUMN IF NOT EXISTS default_bank_account          VARCHAR(20) NOT NULL DEFAULT '5211',
    ADD COLUMN IF NOT EXISTS default_sales_goods_account   VARCHAR(20) NOT NULL DEFAULT '7011',
    ADD COLUMN IF NOT EXISTS default_sales_service_account VARCHAR(20) NOT NULL DEFAULT '7061',
    ADD COLUMN IF NOT EXISTS default_purchase_account      VARCHAR(20) NOT NULL DEFAULT '6011',
    ADD COLUMN IF NOT EXISTS default_expense_account       VARCHAR(20) NOT NULL DEFAULT '6251';

COMMENT ON COLUMN company_settings.initial_stock_account       IS 'Compte de contrepartie pour les entrées de stock initial (1042 = Compte de l''exploitant OHADA).';
COMMENT ON COLUMN company_settings.escompte_accounting_account IS 'Compte de charge financière pour les escomptes de règlement accordés (673 = Escomptes accordés OHADA).';
COMMENT ON COLUMN company_settings.collected_tax_account       IS 'Compte TVA collectée sur ventes (4431 = T.V.A. facturée sur ventes OHADA).';
COMMENT ON COLUMN company_settings.deductible_tax_account      IS 'Compte TVA déductible sur achats (4452 = T.V.A. récupérable sur achats OHADA).';
COMMENT ON COLUMN company_settings.stock_account               IS 'Compte de stock par défaut, inventaire permanent (3111 = Marchandises A1 OHADA).';
COMMENT ON COLUMN company_settings.stock_variation_account     IS 'Compte de variation des stocks, contrepartie entrée/sortie (6031 = Variation stocks marchandises OHADA).';
COMMENT ON COLUMN company_settings.stock_loss_account          IS 'Compte de variation/manquant sur stock (6032 = Variation stocks matières premières OHADA).';

COMMENT ON COLUMN company_settings.fiscal_year_start_month    IS '1=janvier (défaut), 7=juillet pour les exercices décalés.';
COMMENT ON COLUMN company_settings.purchase_approval_threshold IS 'Seuil en XAF au-delà duquel un BC nécessite une approbation. NULL = pas de seuil.';
COMMENT ON COLUMN company_settings.expense_approval_threshold  IS 'Seuil en XAF au-delà duquel une dépense nécessite une approbation.';
COMMENT ON COLUMN company_settings.default_bank_account_id    IS 'Compte bancaire par défaut pour les paiements (FK ajoutée étape 5).';

-- ================================================================
-- 2.6 Étendre `products` — gestion des stocks et achats
-- ================================================================
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS track_stock              BOOLEAN       NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS stock_quantity           NUMERIC(10,3) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stock_min_level          NUMERIC(10,3),
    ADD COLUMN IF NOT EXISTS stock_max_level          NUMERIC(10,3),
    ADD COLUMN IF NOT EXISTS stock_unit               VARCHAR(20),
    ADD COLUMN IF NOT EXISTS purchase_price_ht        NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS cost_price_ht            NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS barcode                  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS weight_kg                NUMERIC(8,3),
    ADD COLUMN IF NOT EXISTS default_supplier_id      UUID,
    -- Valorisation stock (CMUP)
    ADD COLUMN IF NOT EXISTS stock_value              NUMERIC(15,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS image_url                VARCHAR(500),
    -- Comptes comptables SYSCOHADA (surcharge la catégorie si défini)
    ADD COLUMN IF NOT EXISTS stock_accounting_account VARCHAR(20),
    ADD COLUMN IF NOT EXISTS cogs_accounting_account  VARCHAR(20),
    ADD COLUMN IF NOT EXISTS loss_accounting_account  VARCHAR(20),
    ADD COLUMN IF NOT EXISTS sales_accounting_account VARCHAR(20);

COMMENT ON COLUMN products.track_stock              IS 'Si TRUE, les mouvements de stock sont tracés automatiquement sur les ventes et achats.';
COMMENT ON COLUMN products.stock_quantity           IS 'Stock actuel en temps réel. Mis à jour automatiquement par les mouvements de stock.';
COMMENT ON COLUMN products.stock_min_level          IS 'Seuil d''alerte réapprovisionnement. Une notification low_stock_alert est envoyée si stock < seuil.';
COMMENT ON COLUMN products.purchase_price_ht        IS 'Prix d''achat standard chez le fournisseur par défaut. Utilisé pour calcul de marge brute.';
COMMENT ON COLUMN products.cost_price_ht            IS 'CMUP (Coût Moyen Pondéré Unitaire). Mis à jour automatiquement à chaque entrée en stock.';
COMMENT ON COLUMN products.stock_value              IS 'Valeur totale du stock = stock_quantity × cost_price_ht (CMUP). Mis à jour à chaque mouvement.';
COMMENT ON COLUMN products.image_url                IS 'URL ou chemin relatif de l''image produit.';
COMMENT ON COLUMN products.default_supplier_id      IS 'Fournisseur privilégié pour ce produit (FK vers suppliers, ajoutée étape 3).';
COMMENT ON COLUMN products.stock_accounting_account IS 'Compte stock OHADA (classe 3, ex: 3111 = Marchandises A1). Surcharge la catégorie si défini.';
COMMENT ON COLUMN products.cogs_accounting_account  IS 'Compte variation de stocks / coût (ex: 6031 = Variations stocks marchandises). Surcharge la catégorie.';
COMMENT ON COLUMN products.loss_accounting_account  IS 'Compte pertes sur stocks (ex: 6032 = Variations stocks matières premières). Surcharge la catégorie.';
COMMENT ON COLUMN products.sales_accounting_account IS 'Compte de ventes OHADA (ex: 7011 = marchandises Région, 7061 = services Région). Surcharge la catégorie.';

CREATE INDEX IF NOT EXISTS idx_products_track_stock ON products(track_stock) WHERE track_stock = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_barcode     ON products(barcode) WHERE barcode IS NOT NULL;

-- ================================================================
-- 2.6b Étendre `product_categories` — comptes comptables par catégorie
-- ================================================================
ALTER TABLE product_categories
    ADD COLUMN IF NOT EXISTS stock_accounting_account VARCHAR(20) DEFAULT '3111',
    ADD COLUMN IF NOT EXISTS cogs_accounting_account  VARCHAR(20) DEFAULT '6031',
    ADD COLUMN IF NOT EXISTS loss_accounting_account  VARCHAR(20) DEFAULT '6032',
    ADD COLUMN IF NOT EXISTS sales_accounting_account VARCHAR(20) DEFAULT '7011';

COMMENT ON COLUMN product_categories.stock_accounting_account IS 'Compte stock par défaut pour tous les produits de cette catégorie (classe 3 SYSCOHADA).';
COMMENT ON COLUMN product_categories.cogs_accounting_account  IS 'Compte variation de stocks par défaut (classe 6 SYSCOHADA).';
COMMENT ON COLUMN product_categories.loss_accounting_account  IS 'Compte pertes sur stocks par défaut (ex: 6032 = Variations stocks matières premières OHADA).';
COMMENT ON COLUMN product_categories.sales_accounting_account IS 'Compte de ventes par défaut pour cette catégorie (classe 7 SYSCOHADA).';

-- ================================================================
-- 2.6c Étendre `tax_rates` — comptes TVA configurables
-- ================================================================
ALTER TABLE tax_rates
    ADD COLUMN IF NOT EXISTS collected_tax_account  VARCHAR(20) DEFAULT '4431',
    ADD COLUMN IF NOT EXISTS deductible_tax_account VARCHAR(20) DEFAULT '4452';

COMMENT ON COLUMN tax_rates.collected_tax_account  IS 'Compte TVA collectée sur ventes pour ce taux (4431 = T.V.A. facturée sur ventes OHADA).';
COMMENT ON COLUMN tax_rates.deductible_tax_account IS 'Compte TVA déductible sur achats pour ce taux (4452 = T.V.A. récupérable sur achats OHADA).';

-- ================================================================
-- 2.7 Étendre `payments` — lien avec le module banques
-- ================================================================
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS bank_account_id     UUID,
    ADD COLUMN IF NOT EXISTS bank_transaction_id UUID,
    ADD COLUMN IF NOT EXISTS reconciled_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reconciled_by       UUID REFERENCES users(id) ON DELETE SET NULL;

-- NB : Les FK bank_account_id et bank_transaction_id sont ajoutées
-- à l'étape 5, après création des tables bank_accounts et bank_transactions.

COMMENT ON COLUMN payments.bank_account_id     IS 'Compte bancaire ayant reçu le paiement (FK ajoutée étape 5).';
COMMENT ON COLUMN payments.bank_transaction_id IS 'Transaction bancaire correspondante pour le rapprochement (FK ajoutée étape 5).';
COMMENT ON COLUMN payments.reconciled_at       IS 'Date de rapprochement bancaire de ce paiement.';

-- ================================================================
-- 2.8 Étendre `clients` — contact principal et CRM léger
-- ================================================================
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS contact_first_name  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS contact_last_name   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS contact_position    VARCHAR(100),
    ADD COLUMN IF NOT EXISTS contact_phone       VARCHAR(50),
    ADD COLUMN IF NOT EXISTS contact_email       VARCHAR(255),
    ADD COLUMN IF NOT EXISTS credit_limit        NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS credit_days         SMALLINT      DEFAULT 30,
    ADD COLUMN IF NOT EXISTS risk_level          VARCHAR(20)   DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS assigned_to         UUID          REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tags                TEXT[]        DEFAULT '{}';

COMMENT ON COLUMN clients.credit_limit    IS 'Plafond de crédit accordé à ce client en XAF. NULL = pas de limite.';
COMMENT ON COLUMN clients.risk_level      IS 'Niveau de risque client : low, normal, high, blocked.';
COMMENT ON COLUMN clients.assigned_to     IS 'Commercial responsable de ce client.';
COMMENT ON COLUMN clients.contact_position IS 'Poste du contact principal : Directeur Financier, Responsable Achats, etc.';

CREATE INDEX IF NOT EXISTS idx_clients_assigned_to ON clients(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_risk_level  ON clients(risk_level);

-- ================================================================
-- 2.9 Étendre `users` — informations RH légères
-- ================================================================
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS department    VARCHAR(100),
    ADD COLUMN IF NOT EXISTS job_title     VARCHAR(100),
    ADD COLUMN IF NOT EXISTS employee_id   VARCHAR(50) UNIQUE,
    ADD COLUMN IF NOT EXISTS office_id     UUID REFERENCES agency_offices(id) ON DELETE SET NULL;

COMMENT ON COLUMN users.department   IS 'Département ou service : Informatique, Commercial, Finance, Direction.';
COMMENT ON COLUMN users.job_title    IS 'Intitulé du poste : Ingénieur Réseau, Responsable Commercial, etc.';
COMMENT ON COLUMN users.employee_id  IS 'Matricule employé unique. Utilisé dans les rapports RH et fiches de paie.';
COMMENT ON COLUMN users.office_id    IS 'Bureau/agence de rattachement de l''employé.';



-- ================================================================
-- ████████████████████████████████████████████████████████████████
-- ÉTAPE 3 — MODULE ACHATS & FOURNISSEURS
-- ████████████████████████████████████████████████████████████████
-- ================================================================

-- ================================================================
-- 3.1 ENUMs spécifiques au module achats
-- ================================================================
CREATE TYPE supplier_status         AS ENUM ('active', 'suspended', 'archived');
CREATE TYPE purchase_order_status   AS ENUM ('draft','sent','confirmed','partially_received','received','invoiced','cancelled','closed');
CREATE TYPE supplier_invoice_status AS ENUM ('draft','received','validated','partially_paid','paid','disputed','cancelled');
CREATE TYPE stock_movement_type     AS ENUM ('purchase_receipt','sale','adjustment_in','adjustment_out','write_off','return_supplier','return_customer','initial_stock','transfer_in','transfer_out');
CREATE TYPE delivery_status         AS ENUM ('pending','partial','complete','cancelled');

-- ================================================================
-- 3.2 TABLE `suppliers` — Annuaire fournisseurs
-- ================================================================
CREATE TABLE suppliers (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identité
    name                VARCHAR(255)    NOT NULL,
    trade_name          VARCHAR(255),
    type                VARCHAR(20)     NOT NULL DEFAULT 'company',

    -- Coordonnées
    email               VARCHAR(255),
    phone               VARCHAR(50),
    phone_2             VARCHAR(50),
    fax                 VARCHAR(50),
    website             VARCHAR(255),

    -- Adresse
    address             TEXT,
    city                VARCHAR(100),
    country             VARCHAR(100)    NOT NULL DEFAULT 'Cameroun',
    postal_box          VARCHAR(50),

    -- Identifiants légaux
    tax_number          VARCHAR(100),
    rccm                VARCHAR(100),
    statistical_number  VARCHAR(100),

    -- Contact principal
    contact_first_name  VARCHAR(100),
    contact_last_name   VARCHAR(100),
    contact_position    VARCHAR(100),
    contact_phone       VARCHAR(50),
    contact_email       VARCHAR(255),

    -- Conditions commerciales
    currency            CHAR(3)         NOT NULL DEFAULT 'XAF',
    default_payment_terms TEXT,
    default_due_days    SMALLINT        NOT NULL DEFAULT 30,
    payment_method      payment_method  NOT NULL DEFAULT 'virement',

    -- Coordonnées bancaires fournisseur
    bank_name           VARCHAR(255),
    bank_account        VARCHAR(100),
    bank_rib            VARCHAR(100),
    bank_swift          VARCHAR(20),

    -- Classification & performance
    supplier_code       VARCHAR(50)     UNIQUE,
    category            VARCHAR(100),
    rating              SMALLINT        DEFAULT 3,
    is_preferred        BOOLEAN         NOT NULL DEFAULT FALSE,
    credit_limit        NUMERIC(15,2),

    -- Statut
    status              supplier_status NOT NULL DEFAULT 'active',
    internal_notes      TEXT,
    tags                TEXT[]          DEFAULT '{}',

    -- Compte comptable OHADA classe 4 fournisseurs
    accounting_account  VARCHAR(20)     DEFAULT '4011',

    -- Champs flexibles
    metadata            JSONB           NOT NULL DEFAULT '{}',

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID            REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_supplier_rating CHECK (rating BETWEEN 1 AND 5)
);
CREATE TRIGGER tg_suppliers_updated_at
    BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_suppliers_name     ON suppliers USING gin(to_tsvector('french', name));
CREATE INDEX idx_suppliers_status   ON suppliers(status);
CREATE INDEX idx_suppliers_category ON suppliers(category);
CREATE INDEX idx_suppliers_active   ON suppliers(id) WHERE deleted_at IS NULL;

COMMENT ON TABLE  suppliers                   IS 'Annuaire des fournisseurs BTS. Miroir de clients pour le circuit d''achats.';
COMMENT ON COLUMN suppliers.supplier_code      IS 'Code interne BTS du fournisseur. Ex: FOURNISSEUR-001. Facultatif, unique.';
COMMENT ON COLUMN suppliers.accounting_account IS 'Compte OHADA classe 4 : 4011 = Fournisseurs. Personnalisable par sous-compte.';
COMMENT ON COLUMN suppliers.internal_notes     IS 'CONFIDENTIEL : jamais affiché sur les bons de commande.';

-- Rattacher le fournisseur par défaut aux produits (FK différée)
ALTER TABLE products
    ADD CONSTRAINT fk_products_default_supplier
    FOREIGN KEY (default_supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- ================================================================
-- 3.3 TABLE `supplier_contacts` — Contacts multiples par fournisseur
-- ================================================================
CREATE TABLE supplier_contacts (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id  UUID        NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    first_name   VARCHAR(100) NOT NULL,
    last_name    VARCHAR(100),
    position     VARCHAR(100),
    email        VARCHAR(255),
    phone        VARCHAR(50),
    phone_2      VARCHAR(50),
    is_primary   BOOLEAN     NOT NULL DEFAULT FALSE,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER tg_supplier_contacts_updated_at
    BEFORE UPDATE ON supplier_contacts
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_supplier_contacts_supplier_id ON supplier_contacts(supplier_id);

COMMENT ON TABLE supplier_contacts IS 'Contacts multiples par fournisseur. Un seul contact principal (is_primary=TRUE).';

-- ================================================================
-- 3.4 TABLE `purchase_orders` — Bons de commande fournisseur
-- ================================================================
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
    supplier_reference      VARCHAR(100),
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

    CONSTRAINT chk_po_subtotal  CHECK (subtotal_ht >= 0),
    CONSTRAINT chk_po_total_ttc CHECK (total_ttc   >= 0)
);
CREATE TRIGGER tg_purchase_orders_updated_at
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_po_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX idx_po_created_by  ON purchase_orders(created_by);
CREATE INDEX idx_po_status      ON purchase_orders(status);
CREATE INDEX idx_po_issue_date  ON purchase_orders(issue_date);
CREATE INDEX idx_po_active      ON purchase_orders(id) WHERE deleted_at IS NULL;

COMMENT ON TABLE purchase_orders IS 'Bons de commande fournisseur. Numérotation SYSCOHADA bc001. Miroir des proformas côté achats.';

-- ================================================================
-- 3.5 TABLE `purchase_order_lines` — Lignes de bons de commande
-- ================================================================
CREATE TABLE purchase_order_lines (
    id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID         NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id        UUID         REFERENCES products(id) ON DELETE SET NULL,
    sort_order        SMALLINT     NOT NULL DEFAULT 0,

    designation       VARCHAR(500) NOT NULL,
    description       TEXT,
    unit              product_unit NOT NULL DEFAULT 'piece',
    supplier_reference VARCHAR(100),

    quantity_ordered  NUMERIC(10,3) NOT NULL DEFAULT 1,
    quantity_received NUMERIC(10,3) NOT NULL DEFAULT 0,
    quantity_invoiced NUMERIC(10,3) NOT NULL DEFAULT 0,

    unit_price_ht     NUMERIC(15,2) NOT NULL DEFAULT 0,

    discount_type     discount_type NOT NULL DEFAULT 'none',
    discount_value    NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,

    tax_rate          NUMERIC(5,2)  NOT NULL DEFAULT 19.25,

    subtotal_ht       NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_ht            NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ttc         NUMERIC(15,2) NOT NULL DEFAULT 0,

    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_pol_qty_ordered  CHECK (quantity_ordered > 0),
    CONSTRAINT chk_pol_qty_received CHECK (quantity_received >= 0),
    CONSTRAINT chk_pol_price        CHECK (unit_price_ht >= 0),
    CONSTRAINT chk_pol_tax_rate     CHECK (tax_rate BETWEEN 0 AND 100)
);
CREATE TRIGGER tg_po_lines_updated_at
    BEFORE UPDATE ON purchase_order_lines
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_pol_purchase_order_id ON purchase_order_lines(purchase_order_id);

COMMENT ON TABLE purchase_order_lines IS 'Lignes de bons de commande. Suit les quantités commandées, reçues et facturées.';

-- ================================================================
-- 3.6 TABLE `purchase_order_status_history`
-- ================================================================
CREATE TABLE purchase_order_status_history (
    id                UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID                  NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    changed_by        UUID                  NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    previous_status   purchase_order_status,
    new_status        purchase_order_status NOT NULL,
    reason            TEXT,
    changed_at        TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_po_status_hist ON purchase_order_status_history(purchase_order_id);
CREATE INDEX idx_po_status_hist_date ON purchase_order_status_history(changed_at DESC);

COMMENT ON TABLE purchase_order_status_history IS 'Historique des changements de statut des bons de commande.';

-- ================================================================
-- 3.7 TABLE `supplier_invoices` — Factures fournisseurs reçues
-- ================================================================
CREATE TABLE supplier_invoices (
    id                      UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Numérotation interne : BTS/DC/2026/01/ff001
    number                  VARCHAR(50)             NOT NULL UNIQUE,
    office_id               UUID                    NOT NULL REFERENCES agency_offices(id) ON DELETE RESTRICT,

    -- Numéro sur la facture du fournisseur
    supplier_invoice_number VARCHAR(100)            NOT NULL,

    -- Parties
    supplier_id             UUID                    NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_order_id       UUID                    REFERENCES purchase_orders(id) ON DELETE SET NULL,
    created_by              UUID                    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    validated_by            UUID                    REFERENCES users(id) ON DELETE SET NULL,

    -- Dates
    invoice_date            DATE                    NOT NULL,
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
    total_tax               NUMERIC(15,2)           NOT NULL DEFAULT 0,
    total_ttc               NUMERIC(15,2)           NOT NULL DEFAULT 0,

    -- Paiements
    amount_paid             NUMERIC(15,2)           NOT NULL DEFAULT 0,
    balance_due             NUMERIC(15,2)           NOT NULL DEFAULT 0,

    -- Statut
    status                  supplier_invoice_status NOT NULL DEFAULT 'draft',
    validated_at            TIMESTAMPTZ,

    -- Fichiers
    scan_path               VARCHAR(500),
    pdf_path                VARCHAR(500),
    -- Document original reçu du fournisseur (pièce jointe : PDF/image). On ne génère
    -- jamais de PDF "Facture" à en-tête BTS pour une FF — on stocke le document source.
    attachment_path         VARCHAR(500),

    -- Compte d'achat (override). Sans défaut : l'engine comptable utilise
    -- defaultPurchaseAccount (60x) quand cette colonne est nulle.
    accounting_account      VARCHAR(20),

    metadata                JSONB                   NOT NULL DEFAULT '{}',

    created_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,

    CONSTRAINT chk_si_due_date    CHECK (due_date >= invoice_date),
    CONSTRAINT chk_si_subtotal    CHECK (subtotal_ht >= 0),
    CONSTRAINT chk_si_total_ttc   CHECK (total_ttc   >= 0),
    CONSTRAINT chk_si_amount_paid CHECK (amount_paid >= 0)
);
CREATE TRIGGER tg_supplier_invoices_updated_at
    BEFORE UPDATE ON supplier_invoices
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_si_supplier_id ON supplier_invoices(supplier_id);
CREATE INDEX idx_si_po_id       ON supplier_invoices(purchase_order_id);
CREATE INDEX idx_si_status      ON supplier_invoices(status);
CREATE INDEX idx_si_due_date    ON supplier_invoices(due_date);
CREATE INDEX idx_si_active      ON supplier_invoices(id) WHERE deleted_at IS NULL;

COMMENT ON TABLE supplier_invoices IS 'Factures reçues des fournisseurs. Numérotation interne ff001. Miroir des invoices côté achats.';

-- ================================================================
-- 3.8 TABLE `supplier_invoice_lines`
-- ================================================================
CREATE TABLE supplier_invoice_lines (
    id                     UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_invoice_id    UUID         NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
    product_id             UUID         REFERENCES products(id) ON DELETE SET NULL,
    purchase_order_line_id UUID         REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
    sort_order             SMALLINT     NOT NULL DEFAULT 0,

    designation            VARCHAR(500) NOT NULL,
    description            TEXT,
    unit                   product_unit NOT NULL DEFAULT 'piece',
    quantity               NUMERIC(10,3) NOT NULL DEFAULT 1,
    unit_price_ht          NUMERIC(15,2) NOT NULL DEFAULT 0,

    discount_type          discount_type NOT NULL DEFAULT 'none',
    discount_value         NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,

    tax_rate               NUMERIC(5,2)  NOT NULL DEFAULT 19.25,
    subtotal_ht            NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_ht                 NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_amount             NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ttc              NUMERIC(15,2) NOT NULL DEFAULT 0,

    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_sil_qty      CHECK (quantity > 0),
    CONSTRAINT chk_sil_price    CHECK (unit_price_ht >= 0),
    CONSTRAINT chk_sil_tax_rate CHECK (tax_rate BETWEEN 0 AND 100)
);
CREATE TRIGGER tg_supplier_invoice_lines_updated_at
    BEFORE UPDATE ON supplier_invoice_lines
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_sil_supplier_invoice_id ON supplier_invoice_lines(supplier_invoice_id);

COMMENT ON TABLE supplier_invoice_lines IS 'Lignes des factures fournisseurs. Lien optionnel avec la ligne de BC source.';

-- ================================================================
-- 3.9 TABLE `supplier_payments` — Paiements aux fournisseurs
-- ================================================================
CREATE TABLE supplier_payments (
    id                  UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_invoice_id UUID           NOT NULL REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
    payment_date        DATE           NOT NULL DEFAULT CURRENT_DATE,
    amount              NUMERIC(15,2)  NOT NULL,
    method              payment_method NOT NULL DEFAULT 'virement',
    reference           VARCHAR(255),
    notes               TEXT,
    attachment_path     VARCHAR(500),

    -- Lien bancaire (FK ajoutée étape 5)
    bank_account_id     UUID,
    bank_transaction_id UUID,
    reconciled_at       TIMESTAMPTZ,
    reconciled_by       UUID           REFERENCES users(id) ON DELETE SET NULL,

    created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT chk_spay_amount CHECK (amount > 0)
);
CREATE TRIGGER tg_supplier_payments_updated_at
    BEFORE UPDATE ON supplier_payments
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_spay_invoice_id ON supplier_payments(supplier_invoice_id);
CREATE INDEX idx_spay_date       ON supplier_payments(payment_date);
CREATE INDEX idx_spay_active     ON supplier_payments(id) WHERE deleted_at IS NULL;

COMMENT ON TABLE supplier_payments IS 'Paiements effectués aux fournisseurs. Miroir de payments côté achats.';

-- ================================================================
-- 3.10 TABLE `stock_movements` — Journal de stock (IMMUABLE)
-- ================================================================
CREATE TABLE stock_movements (
    id              UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID                NOT NULL REFERENCES products(id) ON DELETE RESTRICT,

    -- Type et direction
    type            stock_movement_type NOT NULL,
    quantity        NUMERIC(10,3)       NOT NULL,  -- positif = entrée, négatif = sortie
    quantity_before NUMERIC(10,3)       NOT NULL,
    quantity_after  NUMERIC(10,3)       NOT NULL,

    -- Valorisation (FIFO/CMUP)
    unit_cost_ht    NUMERIC(15,2),
    total_cost_ht   NUMERIC(15,2),

    -- Source polymorphique
    source_type     VARCHAR(50),   -- 'purchase_order', 'invoice', 'adjustment', 'supplier_return'
    source_id       UUID,
    source_label    VARCHAR(255),

    -- Localisation stock
    location        VARCHAR(100)   DEFAULT 'Magasin Principal',

    notes           TEXT,
    created_by      UUID           REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_sm_qty_before CHECK (quantity_before >= 0),
    CONSTRAINT chk_sm_qty_after  CHECK (quantity_after  >= 0)
);
CREATE INDEX idx_sm_product_id ON stock_movements(product_id);
CREATE INDEX idx_sm_type       ON stock_movements(type);
CREATE INDEX idx_sm_source     ON stock_movements(source_type, source_id);
CREATE INDEX idx_sm_created_at ON stock_movements(created_at DESC);
-- Index composite pour l'historique produit
CREATE INDEX idx_sm_product_date ON stock_movements(product_id, created_at DESC);

-- Journal IMMUABLE : les mouvements de stock ne peuvent pas être modifiés
CREATE RULE no_update_stock_movements AS ON UPDATE TO stock_movements DO INSTEAD NOTHING;
CREATE RULE no_delete_stock_movements AS ON DELETE TO stock_movements DO INSTEAD NOTHING;

COMMENT ON TABLE  stock_movements              IS 'Journal immuable des mouvements de stock. Source de vérité. Entrée positive, sortie négative.';
COMMENT ON COLUMN stock_movements.quantity     IS 'Quantité du mouvement. Positif = entrée en stock. Négatif = sortie de stock.';
COMMENT ON COLUMN stock_movements.unit_cost_ht IS 'Coût unitaire HT au moment du mouvement. Utilisé pour valorisation FIFO ou CMUP.';

-- ================================================================
-- 3.11 Mise à jour de fn_next_document_number — nouveaux types
-- ================================================================
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
    SELECT code INTO STRICT v_office_code
      FROM agency_offices WHERE id = p_office_id;

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
        v_office_code,
        v_year,
        lpad(v_month::TEXT, 2, '0'),
        v_doc_prefix,
        lpad(v_seq::TEXT, 3, '0')
    );
END;
$$;

COMMENT ON FUNCTION fn_next_document_number IS
    'Génère un numéro SYSCOHADA-conforme, sans trou, thread-safe. '
    'Formats : pfm=proforma | fac=facture | bc=bon commande | ff=facture fourn. | dep=dépense | bl=bon livraison';

-- ================================================================
-- 3.12 VUE `v_supplier_financial_summary`
-- ================================================================
CREATE VIEW v_supplier_financial_summary AS
SELECT
    s.id                                                                      AS supplier_id,
    s.name                                                                    AS supplier_name,
    s.supplier_code,
    s.status                                                                  AS supplier_status,
    COUNT(DISTINCT si.id) FILTER (WHERE si.deleted_at IS NULL)                AS total_invoices,
    COALESCE(SUM(si.total_ttc)
        FILTER (WHERE si.status != 'cancelled' AND si.deleted_at IS NULL), 0) AS total_purchased,
    COALESCE(SUM(si.amount_paid)
        FILTER (WHERE si.deleted_at IS NULL), 0)                              AS total_paid,
    COALESCE(SUM(si.balance_due)
        FILTER (WHERE si.status IN ('validated','partially_paid')
                  AND si.deleted_at IS NULL), 0)                              AS outstanding_balance,
    COUNT(DISTINCT si.id)
        FILTER (WHERE si.status = 'partially_paid')                           AS nb_partially_paid,
    COUNT(DISTINCT si.id)
        FILTER (WHERE si.due_date < CURRENT_DATE
                  AND si.status IN ('validated','partially_paid')
                  AND si.deleted_at IS NULL)                                  AS nb_overdue,
    COUNT(DISTINCT po.id)
        FILTER (WHERE po.deleted_at IS NULL)                                  AS total_purchase_orders,
    MAX(si.invoice_date)
        FILTER (WHERE si.deleted_at IS NULL)                                  AS last_invoice_date,
    MAX(sp.payment_date)
        FILTER (WHERE sp.deleted_at IS NULL)                                  AS last_payment_date
FROM suppliers s
LEFT JOIN supplier_invoices si ON si.supplier_id = s.id
LEFT JOIN supplier_payments sp ON sp.supplier_invoice_id = si.id
LEFT JOIN purchase_orders   po ON po.supplier_id = s.id
WHERE s.deleted_at IS NULL
GROUP BY s.id, s.name, s.supplier_code, s.status;

COMMENT ON VIEW v_supplier_financial_summary IS 'Synthèse financière par fournisseur : achats totaux, paiements, encours, retards, nombre de BCs.';

-- ================================================================
-- ████████████████████████████████████████████████████████████████
-- FIN ÉTAPE 3 — MODULE ACHATS & FOURNISSEURS
-- ████████████████████████████████████████████████████████████████
--
-- CHECKLIST ÉTAPE 3 :
-- [x] ENUMs : supplier_status, purchase_order_status,
--             supplier_invoice_status, stock_movement_type, delivery_status
-- [x] suppliers + supplier_contacts
-- [x] purchase_orders + purchase_order_lines + purchase_order_status_history
-- [x] supplier_invoices + supplier_invoice_lines
-- [x] supplier_payments
-- [x] stock_movements (journal IMMUABLE)
-- [x] fn_next_document_number mis à jour (bc, ff, dep, bl)
-- [x] FK products.default_supplier_id rattachée
-- [x] Vue v_supplier_financial_summary
-- [x] Tous les index présents
--
-- PROCHAINE ÉTAPE : étape 4 — Module Dépenses
-- ================================================================

-- ================================================================
-- ████████████████████████████████████████████████████████████████
-- ÉTAPE 4 — MODULE DÉPENSES OPÉRATIONNELLES
-- ████████████████████████████████████████████████████████████████
-- ================================================================

-- ================================================================
-- 4.1 ENUMs spécifiques au module dépenses
-- ================================================================
CREATE TYPE expense_status    AS ENUM ('draft','submitted','approved','rejected','paid','cancelled');
CREATE TYPE expense_frequency AS ENUM ('once','weekly','monthly','quarterly','annual');

-- ================================================================
-- 4.2 TABLE `expense_categories` — Catégories de dépenses
-- ================================================================
CREATE TABLE expense_categories (
    id                        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                      VARCHAR(100) NOT NULL UNIQUE,
    description               TEXT,
    icon                      VARCHAR(50),
    color                     CHAR(7),
    sort_order                SMALLINT    NOT NULL DEFAULT 0,
    is_active                 BOOLEAN     NOT NULL DEFAULT TRUE,

    -- Compte comptable SYSCOHADA classe 6 — charges
    accounting_account        VARCHAR(20),
    accounting_account_label  VARCHAR(100),

    -- Budget mensuel de référence
    monthly_budget            NUMERIC(15,2),

    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                TIMESTAMPTZ,
    created_by                UUID        REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER tg_expense_categories_updated_at
    BEFORE UPDATE ON expense_categories
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE expense_categories IS 'Catégories de dépenses opérationnelles hors achats fournisseurs. Liées aux comptes SYSCOHADA classe 6.';
COMMENT ON COLUMN expense_categories.accounting_account IS 'Compte OHADA classe 6 correspondant. Ex : 6222 = Locations bâtiments, 6611 = Salaires.';

-- Seed : 10 catégories préconfigurées BTS
INSERT INTO expense_categories
    (name, description, icon, color, sort_order, accounting_account, accounting_account_label) VALUES
    ('Loyer & Charges',    'Loyer bureaux, électricité, eau, gardiennage',                      'building',        '#3B82F6',  1, '6222',  'Locations de bâtiments'),
    ('Personnel',          'Salaires, primes, charges sociales, CNPS',                          'users',           '#10B981',  2, '6611',  'Appointements salaires et commissions'),
    ('Transport',          'Carburant, taxi, déplacements professionnels, frais de mission',    'car',             '#F59E0B',  3, '6181',  'Voyages et déplacements'),
    ('Télécom & Internet', 'Abonnements téléphone, internet, mobile money professionnel',       'wifi',            '#8B5CF6',  4, '6281',  'Frais de téléphone'),
    ('Marketing',          'Publicité, flyers, cartes de visite, réseaux sociaux, événements',  'megaphone',       '#EF4444',  5, '6271',  'Annonces, insertions'),
    ('Maintenance',        'Entretien équipements, réparations, consommables techniques',        'wrench',          '#64748B',  6, '6242',  'Entretien et réparations des biens mobiliers'),
    ('Fournitures',        'Papier, stylos, cartouches, fournitures bureau',                    'package',         '#6366F1',  7, '6041',  'Matières consommables'),
    ('Formation',          'Cours, certifications, abonnements e-learning, conférences',         'graduation-cap',  '#0EA5E9',  8, '633',   'Frais de formation du personnel'),
    ('Fiscalité & Légal',  'Impôts, taxes, honoraires notaire, frais juridiques',               'scale',           '#DC2626',  9, '6412',  'Patentes, licences et taxes annexes'),
    ('Divers',             'Dépenses diverses non classifiées',                                  'more-horizontal', '#94A3B8', 10, '6588',  'Autres charges diverses');

-- ================================================================
-- 4.3 TABLE `expenses` — Dépenses opérationnelles
-- ================================================================
CREATE TABLE expenses (
    id                      UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Numérotation interne : BTS/DC/2026/01/dep001
    number                  VARCHAR(50)       NOT NULL UNIQUE,
    office_id               UUID              NOT NULL REFERENCES agency_offices(id) ON DELETE RESTRICT,

    -- Classification
    category_id             UUID              NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,

    -- Parties
    created_by              UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    submitted_by            UUID              REFERENCES users(id) ON DELETE SET NULL,
    approved_by             UUID              REFERENCES users(id) ON DELETE SET NULL,
    rejected_by             UUID              REFERENCES users(id) ON DELETE SET NULL,
    paid_by                 UUID              REFERENCES users(id) ON DELETE SET NULL,

    -- Bénéficiaire
    beneficiary_name        VARCHAR(255),
    supplier_id             UUID              REFERENCES suppliers(id) ON DELETE SET NULL,

    -- Dates
    expense_date            DATE              NOT NULL DEFAULT CURRENT_DATE,
    submitted_at            TIMESTAMPTZ,
    approved_at             TIMESTAMPTZ,
    rejected_at             TIMESTAMPTZ,
    paid_at                 TIMESTAMPTZ,
    due_date                DATE,

    -- Description
    title                   VARCHAR(500)      NOT NULL,
    description             TEXT,

    -- Montants
    amount_ht               NUMERIC(15,2)     NOT NULL DEFAULT 0,
    tax_rate                NUMERIC(5,2)      NOT NULL DEFAULT 0,
    tax_amount              NUMERIC(15,2)     NOT NULL DEFAULT 0,
    amount_ttc              NUMERIC(15,2)     NOT NULL DEFAULT 0,

    -- Paiement
    payment_method          payment_method,
    paid_amount             NUMERIC(15,2)     NOT NULL DEFAULT 0,
    bank_account_id         UUID,
    bank_transaction_id     UUID,
    reference               VARCHAR(255),

    -- Récurrence
    is_recurring            BOOLEAN           NOT NULL DEFAULT FALSE,
    frequency               expense_frequency,
    next_occurrence_date    DATE,
    end_date                DATE,
    parent_expense_id       UUID              REFERENCES expenses(id) ON DELETE SET NULL,

    -- Note de frais (remboursement employé)
    is_employee_expense     BOOLEAN           NOT NULL DEFAULT FALSE,
    reimbursed_at           TIMESTAMPTZ,
    reimbursement_reference VARCHAR(255),

    -- Statut et workflow
    status                  expense_status    NOT NULL DEFAULT 'draft',
    rejection_reason        TEXT,

    -- Compte comptable SYSCOHADA (hérite catégorie si NULL)
    accounting_account      VARCHAR(20),

    -- Justificatifs
    attachment_paths        TEXT[]            DEFAULT '{}',

    metadata                JSONB             NOT NULL DEFAULT '{}',

    created_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,

    CONSTRAINT chk_exp_amount_ht  CHECK (amount_ht  >= 0),
    CONSTRAINT chk_exp_amount_ttc CHECK (amount_ttc >= 0),
    CONSTRAINT chk_exp_tax_rate   CHECK (tax_rate BETWEEN 0 AND 100)
);
CREATE TRIGGER tg_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_exp_category_id  ON expenses(category_id);
CREATE INDEX idx_exp_created_by   ON expenses(created_by);
CREATE INDEX idx_exp_status       ON expenses(status);
CREATE INDEX idx_exp_date         ON expenses(expense_date);
CREATE INDEX idx_exp_is_recurring ON expenses(is_recurring) WHERE is_recurring = TRUE;
CREATE INDEX idx_exp_active       ON expenses(id) WHERE deleted_at IS NULL;
-- Index composite rapport mensuel
CREATE INDEX idx_exp_date_category ON expenses(expense_date, category_id);

COMMENT ON TABLE  expenses                       IS 'Dépenses opérationnelles BTS (loyer, salaires, carburant, etc.). Workflow approbation intégré.';
COMMENT ON COLUMN expenses.is_employee_expense   IS 'TRUE = note de frais à rembourser à l''employé créateur.';
COMMENT ON COLUMN expenses.accounting_account    IS 'Compte SYSCOHADA classe 6. Hérite de la catégorie si NULL.';
COMMENT ON COLUMN expenses.attachment_paths      IS 'Chemins des justificatifs (photos reçus, scans). Tableau de chemins relatifs.';

-- ================================================================
-- 4.4 TABLE `expense_status_history`
-- ================================================================
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
CREATE INDEX idx_exp_status_hist_date ON expense_status_history(changed_at DESC);

COMMENT ON TABLE expense_status_history IS 'Historique des changements de statut des dépenses. Traçabilité du workflow d''approbation.';

-- ================================================================
-- 4.5 TABLE `expense_budgets` — Budgets par catégorie et période
-- ================================================================
CREATE TABLE expense_budgets (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id     UUID        NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
    year            SMALLINT    NOT NULL,
    month           SMALLINT,        -- NULL = budget annuel
    budget_amount   NUMERIC(15,2) NOT NULL,
    notes           TEXT,
    created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_expense_budget UNIQUE (category_id, year, month),
    CONSTRAINT chk_budget_month  CHECK (month IS NULL OR month BETWEEN 1 AND 12),
    CONSTRAINT chk_budget_amount CHECK (budget_amount > 0)
);
CREATE TRIGGER tg_expense_budgets_updated_at
    BEFORE UPDATE ON expense_budgets
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE expense_budgets IS 'Budgets prévisionnels par catégorie de dépenses. Comparatif Budget vs Réalisé dans les rapports.';

-- ================================================================
-- ████████████████████████████████████████████████████████████████
-- FIN ÉTAPE 4 — MODULE DÉPENSES
-- ████████████████████████████████████████████████████████████████
--
-- CHECKLIST ÉTAPE 4 :
-- [x] ENUMs : expense_status, expense_frequency
-- [x] expense_categories + seed 10 catégories BTS avec comptes SYSCOHADA
-- [x] expenses : workflow complet (draft → submitted → approved/rejected → paid)
--     récurrence, notes de frais, remboursement employé, liens banque
-- [x] expense_status_history
-- [x] expense_budgets (Budget vs Réalisé)
-- [x] Tous les index présents (dont composite date+catégorie)
--
-- PROCHAINE ÉTAPE : étape 5 — Module Banques & Trésorerie
-- ================================================================

-- ================================================================
-- VUE v_dashboard_kpis — placée ici car dépend de supplier_invoices (étape 3)
-- et expenses (étape 4), toutes deux créées avant ce point.
-- ================================================================
CREATE OR REPLACE VIEW v_dashboard_kpis AS
WITH
periods AS (
    SELECT
        DATE_TRUNC('month',  NOW())::DATE AS month_start,
        DATE_TRUNC('quarter',NOW())::DATE AS quarter_start,
        DATE_TRUNC('year',   NOW())::DATE AS year_start
),
active_invoices AS (
    SELECT i.*
    FROM invoices i, periods p
    WHERE i.deleted_at IS NULL
      AND i.status != 'cancelled'
      AND i.type    != 'avoir'
),
ca AS (
    SELECT
        COALESCE(SUM(total_ttc) FILTER (WHERE issue_date >= p.month_start),   0) AS ca_month,
        COALESCE(SUM(total_ttc) FILTER (WHERE issue_date >= p.quarter_start),  0) AS ca_quarter,
        COALESCE(SUM(total_ttc) FILTER (WHERE issue_date >= p.year_start),     0) AS ca_year,
        COALESCE(SUM(total_ttc),                                               0) AS ca_total
    FROM active_invoices, periods p
),
counts AS (
    SELECT
        COUNT(*) FILTER (WHERE status = 'issued')          AS nb_issued,
        COUNT(*) FILTER (WHERE status = 'partially_paid')  AS nb_partial,
        COUNT(*) FILTER (WHERE status = 'paid')            AS nb_paid,
        COUNT(*) FILTER (WHERE status = 'overdue')         AS nb_overdue,
        COUNT(*)                                           AS nb_total
    FROM active_invoices
),
creances AS (
    SELECT COALESCE(SUM(balance_due), 0) AS total_outstanding
    FROM active_invoices
    WHERE status IN ('issued', 'partially_paid', 'overdue')
),
purchases AS (
    SELECT
        COALESCE(SUM(total_ttc) FILTER (WHERE si.invoice_date >= p.month_start), 0) AS total_purchases_month,
        COALESCE(SUM(si.balance_due) FILTER (WHERE si.status IN ('received','validated','partially_paid')), 0) AS total_outstanding_payables
    FROM supplier_invoices si, periods p
    WHERE si.deleted_at IS NULL AND si.status != 'cancelled'
),
expenses_agg AS (
    SELECT COALESCE(SUM(amount_ttc) FILTER (WHERE e.expense_date >= p.month_start), 0) AS total_expenses_month
    FROM expenses e, periods p
    WHERE e.deleted_at IS NULL AND e.status IN ('approved', 'paid')
),
top_clients AS (
    SELECT
        c.id                    AS client_id,
        c.name                  AS client_name,
        SUM(i.total_ttc)        AS ca,
        COUNT(i.id)             AS nb_invoices
    FROM active_invoices i
    JOIN clients c ON c.id = i.client_id, periods p
    WHERE i.issue_date >= p.year_start
    GROUP BY c.id, c.name
    ORDER BY ca DESC
    LIMIT 5
),
top_products AS (
    SELECT
        p.id                    AS product_id,
        p.name                  AS product_name,
        pc.name                 AS category_name,
        SUM(il.total_ttc)       AS ca,
        SUM(il.quantity)        AS total_qty
    FROM invoice_lines il
    JOIN invoices  i  ON i.id  = il.invoice_id
    JOIN products  p  ON p.id  = il.product_id
    LEFT JOIN product_categories pc ON pc.id = p.category_id, periods per
    WHERE i.deleted_at IS NULL
      AND i.status != 'cancelled'
      AND i.issue_date >= per.year_start
    GROUP BY p.id, p.name, pc.name
    ORDER BY ca DESC
    LIMIT 5
),
monthly_evolution AS (
    SELECT
        DATE_TRUNC('month', issue_date)::DATE AS month,
        COALESCE(SUM(total_ttc), 0)           AS ca,
        COUNT(*)                              AS nb_invoices
    FROM active_invoices
    WHERE issue_date >= (NOW() - INTERVAL '12 months')::DATE
    GROUP BY 1
    ORDER BY 1
)
SELECT
    ca.ca_month,
    ca.ca_quarter,
    ca.ca_year,
    ca.ca_total,
    counts.nb_issued,
    counts.nb_partial,
    counts.nb_paid,
    counts.nb_overdue,
    counts.nb_total,
    creances.total_outstanding,
    purchases.total_purchases_month,
    purchases.total_outstanding_payables,
    expenses_agg.total_expenses_month,
    (ca.ca_month - purchases.total_purchases_month - expenses_agg.total_expenses_month) AS gross_margin_month,
    (SELECT jsonb_agg(jsonb_build_object(
        'client_id', client_id, 'client_name', client_name,
        'ca', ca, 'nb_invoices', nb_invoices
    ) ORDER BY ca DESC) FROM top_clients)  AS top_clients,
    (SELECT jsonb_agg(jsonb_build_object(
        'product_id', product_id, 'product_name', product_name,
        'category_name', category_name, 'ca', ca, 'total_qty', total_qty
    ) ORDER BY ca DESC) FROM top_products) AS top_products,
    (SELECT jsonb_agg(jsonb_build_object(
        'month', month, 'ca', ca, 'nb_invoices', nb_invoices
    ) ORDER BY month) FROM monthly_evolution) AS monthly_evolution
FROM ca, counts, creances, purchases, expenses_agg;

COMMENT ON VIEW v_dashboard_kpis IS 'KPIs consolides du tableau de bord. CA, achats, depenses, marge brute, creances, dettes fournisseurs, top 5 clients/produits, evolution 12 mois.';

-- ================================================================
-- ████████████████████████████████████████████████████████████████
-- ÉTAPE 5 — MODULE BANQUES & TRÉSORERIE
-- ████████████████████████████████████████████████████████████████
-- ================================================================

-- ================================================================
-- 5.1 ENUMs spécifiques au module banques
-- ================================================================
CREATE TYPE bank_account_type     AS ENUM ('checking','savings','petty_cash','mobile_money','term_deposit');
CREATE TYPE bank_transaction_type AS ENUM ('debit','credit');
CREATE TYPE reconciliation_status AS ENUM ('pending','reconciled','unmatched','ignored');
CREATE TYPE bank_import_status    AS ENUM ('pending','processing','completed','failed','cancelled');

-- ================================================================
-- 5.2 TABLE `bank_accounts` — Comptes bancaires de BTS
-- ================================================================
CREATE TABLE bank_accounts (
    id                   UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identité
    name                 VARCHAR(255)       NOT NULL,
    account_type         bank_account_type  NOT NULL DEFAULT 'checking',
    bank_name            VARCHAR(255)       NOT NULL,
    branch_name          VARCHAR(255),
    account_number       VARCHAR(100),
    iban                 VARCHAR(50),
    swift_bic            VARCHAR(20),
    currency             CHAR(3)            NOT NULL DEFAULT 'XAF',

    -- Soldes
    opening_balance      NUMERIC(15,2)      NOT NULL DEFAULT 0,
    opening_balance_date DATE               NOT NULL DEFAULT CURRENT_DATE,
    current_balance      NUMERIC(15,2)      NOT NULL DEFAULT 0,
    last_reconciled_date DATE,

    -- Paramètres UI
    is_default           BOOLEAN            NOT NULL DEFAULT FALSE,
    is_active            BOOLEAN            NOT NULL DEFAULT TRUE,
    color                CHAR(7),
    icon                 VARCHAR(50),

    -- Compte comptable OHADA classe 5 — trésorerie
    accounting_account   VARCHAR(20)        DEFAULT '5211',

    -- Alertes
    low_balance_alert    NUMERIC(15,2),
    alert_email          VARCHAR(255),

    notes                TEXT,
    metadata             JSONB              NOT NULL DEFAULT '{}',

    created_at           TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ,
    created_by           UUID               REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_ba_opening_balance CHECK (opening_balance >= 0)
);
CREATE TRIGGER tg_bank_accounts_updated_at
    BEFORE UPDATE ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE UNIQUE INDEX uq_bank_accounts_default
    ON bank_accounts (is_default) WHERE is_default = TRUE;
CREATE INDEX idx_ba_is_active ON bank_accounts(is_active) WHERE deleted_at IS NULL;

COMMENT ON TABLE  bank_accounts                   IS 'Comptes bancaires de BTS (Afriland, SCB, UBA...). Supporte courant, épargne, petite caisse et mobile money.';
COMMENT ON COLUMN bank_accounts.accounting_account IS 'Compte OHADA classe 5. 5211=Banques X (local), 5311=Caisse principale, 5611=Chèques postaux.';
COMMENT ON COLUMN bank_accounts.current_balance    IS 'Solde actuel calculé automatiquement à partir des transactions enregistrées.';

-- ================================================================
-- 5.3 Rattacher company_settings.default_bank_account_id
-- ================================================================
ALTER TABLE company_settings
    ADD CONSTRAINT fk_cs_default_bank_account
    FOREIGN KEY (default_bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;

-- ================================================================
-- 5.4 TABLE `bank_transactions` — Transactions bancaires
-- ================================================================
CREATE TABLE bank_transactions (
    id                    UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id       UUID                  NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,

    -- Données transaction
    transaction_date      DATE                  NOT NULL,
    value_date            DATE,
    type                  bank_transaction_type NOT NULL,
    amount                NUMERIC(15,2)         NOT NULL,
    balance_after         NUMERIC(15,2),

    -- Description
    label                 VARCHAR(500)          NOT NULL,
    reference             VARCHAR(255),
    category              VARCHAR(100),

    -- Source
    source                VARCHAR(50)           NOT NULL DEFAULT 'manual',
    import_id             UUID,

    -- Déduplication idempotente (SHA-256 de bankAccountId|date|amount|type|label normalisé)
    content_hash          VARCHAR(64),

    -- Rapprochement
    reconciliation_status reconciliation_status NOT NULL DEFAULT 'pending',
    reconciled_at         TIMESTAMPTZ,
    reconciled_by         UUID                  REFERENCES users(id) ON DELETE SET NULL,

    -- Correspondance pièce comptable
    matched_entity_type   VARCHAR(50),
    matched_entity_id     UUID,

    notes                 TEXT,
    metadata              JSONB                 NOT NULL DEFAULT '{}',

    created_at            TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    created_by            UUID                  REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_bt_amount CHECK (amount > 0)
);
CREATE TRIGGER tg_bank_transactions_updated_at
    BEFORE UPDATE ON bank_transactions
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_bt_account_id  ON bank_transactions(bank_account_id);
CREATE INDEX idx_bt_date        ON bank_transactions(transaction_date DESC);
CREATE INDEX idx_bt_rec_status  ON bank_transactions(reconciliation_status);
CREATE INDEX idx_bt_matched     ON bank_transactions(matched_entity_type, matched_entity_id);
-- Index composite performance rapprochement
CREATE INDEX idx_bt_account_date ON bank_transactions(bank_account_id, transaction_date DESC);
-- Contrainte d'idempotence : même hash = doublon ignoré (skipDuplicates Prisma)
CREATE UNIQUE INDEX uq_bank_transaction_hash
    ON bank_transactions (bank_account_id, content_hash)
    WHERE content_hash IS NOT NULL;

COMMENT ON TABLE  bank_transactions              IS 'Transactions bancaires (import relevé ou saisie manuelle). Support du rapprochement bancaire.';
COMMENT ON COLUMN bank_transactions.content_hash IS 'SHA-256 hex de (bank_account_id|date|amount|type|label_normalisé). Garantit l''idempotence des imports répétés.';

-- ================================================================
-- 5.5 TABLE `bank_statement_imports` — Imports de relevés
-- ================================================================
CREATE TABLE bank_statement_imports (
    id               UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id  UUID               NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    filename         VARCHAR(255)       NOT NULL,
    file_path        VARCHAR(500),
    file_format      VARCHAR(20)        NOT NULL DEFAULT 'csv',
    period_start     DATE               NOT NULL,
    period_end       DATE               NOT NULL,
    total_credits    NUMERIC(15,2)      NOT NULL DEFAULT 0,
    total_debits     NUMERIC(15,2)      NOT NULL DEFAULT 0,
    nb_transactions  INTEGER            NOT NULL DEFAULT 0,
    nb_matched       INTEGER            NOT NULL DEFAULT 0,
    nb_unmatched     INTEGER            NOT NULL DEFAULT 0,
    status           bank_import_status NOT NULL DEFAULT 'pending',
    error_message    TEXT,
    -- Pipeline import v2 : job async BullMQ + données preview
    job_id           VARCHAR(100),
    preview_data     JSONB,
    detected_format  JSONB,
    imported_by      UUID               REFERENCES users(id) ON DELETE SET NULL,
    imported_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    processed_at     TIMESTAMPTZ,

    CONSTRAINT chk_bsi_period CHECK (period_end >= period_start)
);
CREATE INDEX idx_bsi_bank_account_id ON bank_statement_imports(bank_account_id);

COMMENT ON TABLE bank_statement_imports IS 'Imports de relevés bancaires CSV/Excel/OFX. Chaque import déclenche la création de bank_transactions.';

-- Rattacher import_id sur bank_transactions
ALTER TABLE bank_transactions
    ADD CONSTRAINT fk_bt_import
    FOREIGN KEY (import_id) REFERENCES bank_statement_imports(id) ON DELETE SET NULL;

-- ================================================================
-- 5.6 TABLE `bank_reconciliations` — Sessions de rapprochement
-- ================================================================
CREATE TABLE bank_reconciliations (
    id                          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id             UUID        NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    period_start                DATE        NOT NULL,
    period_end                  DATE        NOT NULL,
    opening_balance             NUMERIC(15,2) NOT NULL DEFAULT 0,
    closing_balance_statement   NUMERIC(15,2) NOT NULL DEFAULT 0,
    closing_balance_system      NUMERIC(15,2) NOT NULL DEFAULT 0,
    difference NUMERIC(15,2) GENERATED ALWAYS AS
        (closing_balance_system - closing_balance_statement) STORED,
    is_balanced    BOOLEAN     NOT NULL DEFAULT FALSE,
    status         VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    notes          TEXT,
    completed_at   TIMESTAMPTZ,
    completed_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     UUID        REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_brc_period CHECK (period_end >= period_start)
);
CREATE TRIGGER tg_bank_reconciliations_updated_at
    BEFORE UPDATE ON bank_reconciliations
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_brc_bank_account_igd ON bank_reconciliations(bank_account_id);

COMMENT ON TABLE bank_reconciliations IS 'Sessions de rapprochement bancaire. Compare les mouvements système avec le relevé bancaire.';

-- ================================================================
-- 5.7 Rattacher les FK banque sur payments, supplier_payments, expenses
-- ================================================================
ALTER TABLE payments
    ADD CONSTRAINT fk_payments_bank_account
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE payments
    ADD CONSTRAINT fk_payments_bank_transaction
    FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id) ON DELETE SET NULL;

ALTER TABLE supplier_payments
    ADD CONSTRAINT fk_supplier_payments_bank_account
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE supplier_payments
    ADD CONSTRAINT fk_supplier_payments_bank_transaction
    FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id) ON DELETE SET NULL;

ALTER TABLE expenses
    ADD CONSTRAINT fk_expenses_bank_account
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE expenses
    ADD CONSTRAINT fk_expenses_bank_transaction
    FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id) ON DELETE SET NULL;

ALTER TABLE invoices
    ADD CONSTRAINT fk_invoices_bank_account
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;

ALTER TABLE proformas
    ADD CONSTRAINT fk_proformas_bank_account
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;

-- ================================================================
-- 5.8 TABLE `bank_profile_overrides` — Config import personnalisée par compte
-- ================================================================
-- Stocke le mapping de colonnes CSV défini manuellement par le comptable
-- pour les banques non reconnues automatiquement.
CREATE TABLE bank_profile_overrides (
    id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id UUID          NOT NULL UNIQUE REFERENCES bank_accounts(id) ON DELETE CASCADE,

    -- Mapping de colonnes + paramètres de parsing sérialisé en JSON
    -- Contient : profileId, delimiter, encoding, dateFormat, numberFormat,
    --            columnMapping, amountSign, directionValues, skipRowsContaining
    profile_data    JSONB         NOT NULL,

    -- Fiabilité progressive : incrémenté à chaque import confirmé avec ce profil
    verified_count  INTEGER       NOT NULL DEFAULT 1,
    -- Passage à TRUE quand le profil a été validé par un admin
    is_verified     BOOLEAN       NOT NULL DEFAULT FALSE,

    created_by      UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE TRIGGER tg_bank_profile_overrides_updated_at
    BEFORE UPDATE ON bank_profile_overrides
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE  bank_profile_overrides               IS 'Profils d''import CSV personnalisés par compte bancaire. Créés par le comptable, partagés avec le moteur de détection automatique.';
COMMENT ON COLUMN bank_profile_overrides.verified_count IS 'Nombre d''imports validés avec ce profil. Sert à faire monter la confiance (source community → verified).';

-- ================================================================
-- 5.9 TABLE `bank_matching_rules` — Règles de rapprochement apprises
-- ================================================================
-- Règles extraites automatiquement des rapprochements manuels :
-- chaque fois qu'un comptable lie une transaction à une pièce,
-- les tokens du libellé sont mémorisés pour bonus futur sur le score.
CREATE TABLE bank_matching_rules (
    id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- NULL = règle globale (toutes banques), sinon règle spécifique à un compte
    bank_account_id UUID          REFERENCES bank_accounts(id) ON DELETE SET NULL,

    -- Token ou fragment de libellé déclenchant la règle (ex : "ECOBANK", "PAIEMENT FAC")
    label_contains  VARCHAR(255)  NOT NULL,

    -- Type d'entité correspondante : 'payment' | 'supplier_payment' | 'expense'
    entity_type     VARCHAR(50)   NOT NULL,

    -- Entité spécifique préférée (optionnel — si NULL, règle de catégorie)
    entity_id       UUID,

    -- Catégorie comptable suggérée pour la transaction
    category        VARCHAR(100),

    -- Fourchette de montant optionnelle pour affiner la règle
    amount_min      NUMERIC(15,2),
    amount_max      NUMERIC(15,2),

    -- Confiance : incrémentée à chaque rapprochement confirmé avec cette règle.
    -- Bonus de +15 pts dans computeScore() si confidence >= 3
    confidence      INTEGER       NOT NULL DEFAULT 1,

    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    -- Si TRUE : rapprochement appliqué automatiquement sans validation manuelle
    is_auto_apply   BOOLEAN       NOT NULL DEFAULT FALSE,

    created_by      UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_bmr_entity_type CHECK (entity_type IN ('payment','supplier_payment','expense')),
    CONSTRAINT chk_bmr_confidence  CHECK (confidence >= 0),
    CONSTRAINT chk_bmr_amount      CHECK (amount_min IS NULL OR amount_max IS NULL OR amount_max >= amount_min)
);
CREATE TRIGGER tg_bank_matching_rules_updated_at
    BEFORE UPDATE ON bank_matching_rules
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_bmr_bank_account ON bank_matching_rules(bank_account_id) WHERE is_active = TRUE;
CREATE INDEX idx_bmr_label        ON bank_matching_rules(label_contains)  WHERE is_active = TRUE;
CREATE INDEX idx_bmr_confidence   ON bank_matching_rules(confidence DESC) WHERE is_active = TRUE;

COMMENT ON TABLE  bank_matching_rules             IS 'Règles de rapprochement apprises automatiquement. Extraites des libellés lors des rapprochements manuels.';
COMMENT ON COLUMN bank_matching_rules.confidence  IS 'Niveau de confiance (0..N). Bonus +15 pts dans le scoring si >= 3. Incrémenté à chaque rapprochement confirmé.';
COMMENT ON COLUMN bank_matching_rules.is_auto_apply IS 'Si TRUE, le rapprochement est appliqué sans validation humaine (réservé aux règles à haute confiance).';

-- ================================================================
-- 5.10 TABLE `bank_import_profiles` — Profils d'import de relevés
-- ================================================================
CREATE TABLE bank_import_profiles (
    id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identification
    name                  VARCHAR(255) NOT NULL,
    bank_name             VARCHAR(255),
    country               VARCHAR(10),

    -- Origine : 'system' (livré avec l'app) ou 'user' (créé par un utilisateur)
    source                VARCHAR(20)  NOT NULL DEFAULT 'user',

    -- Format du fichier
    file_format           VARCHAR(20)  NOT NULL DEFAULT 'csv',   -- csv | ofx | mt940 | qif
    encoding              VARCHAR(30)  NOT NULL DEFAULT 'utf-8',
    delimiter             VARCHAR(5)   NOT NULL DEFAULT ';',

    -- Parsing des données
    date_format           VARCHAR(30)  NOT NULL DEFAULT 'DD/MM/YYYY',
    number_format         JSONB        NOT NULL DEFAULT '{"decimal":",","thousands":"."}',
    column_mapping        JSONB        NOT NULL DEFAULT '{}',
    direction_values      JSONB,        -- ex: {"credit":"Crédit","debit":"Débit"}
    amount_sign           VARCHAR(50),  -- 'debit_negative' | 'credit_positive' | etc.
    skip_rows_containing  JSONB,        -- ex: ["***","SOLDE INITIAL"]
    skip_first_rows       INTEGER      NOT NULL DEFAULT 0,

    -- Visibilité
    is_public             BOOLEAN      NOT NULL DEFAULT false,

    -- Statistiques d'usage
    usage_count           INTEGER      NOT NULL DEFAULT 0,
    last_used_at          TIMESTAMPTZ,

    notes                 TEXT,

    -- Audit
    created_by            UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ
);

CREATE TRIGGER tg_bank_import_profiles_updated_at
    BEFORE UPDATE ON bank_import_profiles
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_bip_source     ON bank_import_profiles(source)     WHERE deleted_at IS NULL;
CREATE INDEX idx_bip_is_public  ON bank_import_profiles(is_public)  WHERE deleted_at IS NULL;
CREATE INDEX idx_bip_created_by ON bank_import_profiles(created_by) WHERE deleted_at IS NULL;

COMMENT ON TABLE  bank_import_profiles            IS 'Profils de configuration pour l''import de relevés bancaires (CSV, OFX, MT940). Réutilisables entre comptes.';
COMMENT ON COLUMN bank_import_profiles.source     IS 'system = livré avec l''application, user = créé par un utilisateur BTS.';
COMMENT ON COLUMN bank_import_profiles.is_public  IS 'Si TRUE, visible par tous les utilisateurs. Sinon, privé au créateur.';
COMMENT ON COLUMN bank_import_profiles.column_mapping IS 'Mapping des colonnes du fichier vers les champs internes : {date, label, debit, credit, balance, reference}.';

-- ================================================================
-- 5.11 VUE `v_cash_position` — Position de trésorerie temps réel
-- ================================================================
CREATE VIEW v_cash_position AS
SELECT
    ba.id                    AS bank_account_id,
    ba.name                  AS account_name,
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
    ), 0)                    AS incoming_receivables,
    -- Sorties à venir (factures fournisseurs non payées)
    COALESCE((
        SELECT SUM(si.balance_due)
        FROM supplier_invoices si
        WHERE si.status IN ('validated', 'partially_paid')
          AND si.deleted_at IS NULL
    ), 0)                    AS outgoing_payables,
    -- Solde net prévisionnel
    ba.current_balance +
    COALESCE((
        SELECT SUM(i.balance_due) FROM invoices i
        WHERE i.status IN ('issued', 'partially_paid', 'overdue') AND i.deleted_at IS NULL
    ), 0) -
    COALESCE((
        SELECT SUM(si.balance_due) FROM supplier_invoices si
        WHERE si.status IN ('validated', 'partially_paid') AND si.deleted_at IS NULL
    ), 0)                    AS net_forecast
FROM bank_accounts ba
WHERE ba.deleted_at IS NULL AND ba.is_active = TRUE;

COMMENT ON VIEW v_cash_position IS 'Position de trésorerie consolidée par compte : solde actuel + créances à encaisser + dettes à payer + solde net prévisionnel.';

-- ================================================================
-- ████████████████████████████████████████████████████████████████
-- FIN ÉTAPE 5 — MODULE BANQUES & TRÉSORERIE
-- ████████████████████████████████████████████████████████████████
--
-- CHECKLIST ÉTAPE 5 :
-- [x] ENUMs : bank_account_type, bank_transaction_type,
--             reconciliation_status, bank_import_status (+ cancelled)
-- [x] bank_accounts avec solde, alertes, compte SYSCOHADA
-- [x] bank_transactions avec rapprochement automatique
--     + content_hash (SHA-256) + uq_bank_transaction_hash (idempotence)
-- [x] bank_statement_imports (CSV/Excel/OFX/PDF)
--     + job_id, preview_data, detected_format (pipeline v2 async BullMQ)
-- [x] bank_reconciliations (différence calculée GENERATED)
-- [x] bank_profile_overrides (config import personnalisée, verified_count)
-- [x] bank_matching_rules (règles apprises, confidence, is_auto_apply)
-- [x] bank_import_profiles (profils d'import réutilisables, system + user, is_public)
-- [x] v_cash_position (solde + prévisionnel + créances + dettes)
-- [x] FK bank_account_id + bank_transaction_id sur :
--     payments, supplier_payments, expenses
-- [x] FK company_settings.default_bank_account_id rattachée
-- [x] Vue v_cash_position (solde + créances + dettes + forecast)
--
-- PROCHAINE ÉTAPE : étape 6 — Module Comptabilité SYSCOHADA
-- ================================================================

-- ================================================================
-- ████████████████████████████████████████████████████████████████

-- ================================================================
-- ÉTAPE 6 — MODULE COMPTABILITÉ SYSCOHADA
-- ================================================================

-- ---------------------------------------------------------------
-- 6.1 ENUMs comptabilité
-- ---------------------------------------------------------------
CREATE TYPE journal_type         AS ENUM ('sales','purchases','bank','cash','operations','misc','opening','closing');
CREATE TYPE account_class        AS ENUM ('1','2','3','4','5','6','7','8');
CREATE TYPE account_nature       AS ENUM ('debit_normal','credit_normal');
CREATE TYPE entry_status         AS ENUM ('draft','validated','locked','cancelled');
CREATE TYPE fiscal_period_status AS ENUM ('open','closed','locked');

-- ---------------------------------------------------------------
-- 6.2 Table chart_of_accounts — Plan comptable SYSCOHADA
-- ---------------------------------------------------------------
CREATE TABLE chart_of_accounts (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_number          VARCHAR(20)     NOT NULL UNIQUE,
    account_class           account_class   NOT NULL,
    name                    VARCHAR(255)    NOT NULL,
    short_name              VARCHAR(100),
    account_nature          account_nature  NOT NULL DEFAULT 'debit_normal',

    -- Hiérarchie
    parent_account_number   VARCHAR(20)     REFERENCES chart_of_accounts(account_number) ON DELETE SET NULL,
    is_detail_account       BOOLEAN         NOT NULL DEFAULT TRUE,

    -- Paramètres SYSCOHADA
    is_system               BOOLEAN         NOT NULL DEFAULT FALSE,
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    allows_reconciliation   BOOLEAN         NOT NULL DEFAULT FALSE,
    is_bank_account         BOOLEAN         NOT NULL DEFAULT FALSE,

    -- Lien avec les modules
    linked_bank_account_id  UUID            REFERENCES bank_accounts(id) ON DELETE SET NULL,

    description             TEXT,
    notes                   TEXT,

    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by              UUID            REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER tg_chart_of_accounts_updated_at
    BEFORE UPDATE ON chart_of_accounts
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_coa_class   ON chart_of_accounts(account_class);
CREATE INDEX idx_coa_parent  ON chart_of_accounts(parent_account_number);
CREATE INDEX idx_coa_active  ON chart_of_accounts(is_active);
COMMENT ON TABLE chart_of_accounts IS 'Plan comptable SYSCOHADA. Classes 1-8 pre-chargees (1347 comptes OHADA). Personnalisable par BTS avec sous-comptes specifiques.';

-- ---------------------------------------------------------------
-- 6.3 Seed du plan comptable SYSCOHADA (1347 comptes OHADA)
-- ---------------------------------------------------------------
INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('1', '1', 'COMPTES DE RESSOURCES DURABLES', 'credit_normal', NULL, FALSE, TRUE),
('10', '1', 'CAPITAL SOCIAL', 'credit_normal', '1', FALSE, TRUE),
('101', '1', 'CAPITAL SOCIAL', 'credit_normal', '10', FALSE, TRUE),
('1011', '1', 'Capital souscrit, non appelé', 'credit_normal', '101', TRUE, TRUE),
('1012', '1', 'Capital souscrit, appelé, non versé', 'credit_normal', '101', TRUE, TRUE),
('1013', '1', 'Capital souscrit, appelé, versé non amorti', 'credit_normal', '101', TRUE, TRUE),
('1014', '1', 'Capital souscrit, appelé, versé, amorti', 'credit_normal', '101', TRUE, TRUE),
('1018', '1', 'Capital souscrit soumis à des conditions particulières', 'credit_normal', '101', TRUE, TRUE),
('102', '1', 'CAPITAL PAR DOTATION', 'credit_normal', '10', FALSE, TRUE),
('1021', '1', 'Dotation initiale', 'credit_normal', '102', TRUE, TRUE),
('1022', '1', 'Dotation complémentaire', 'credit_normal', '102', TRUE, TRUE),
('1028', '1', 'Autres dotations', 'credit_normal', '102', TRUE, TRUE),
('103', '1', 'CAPITAL PERSONNEL', 'credit_normal', '10', FALSE, TRUE),
('104', '1', 'COMPTE DE L''EXPLOITANT', 'credit_normal', '10', FALSE, TRUE),
('1041', '1', 'Apport temporaire', 'credit_normal', '104', TRUE, TRUE),
('1042', '1', 'Opérations courantes', 'credit_normal', '104', TRUE, TRUE),
('1043', '1', 'Rémunérations, impôts et autres charges personnelles', 'credit_normal', '104', TRUE, TRUE),
('1047', '1', 'Prélèvement d''autoconsommation', 'credit_normal', '104', TRUE, TRUE),
('1048', '1', 'Autres prélèvements', 'credit_normal', '104', TRUE, TRUE),
('105', '1', 'PRIMES LIEES AUX CAPITAUX PROPRES', 'credit_normal', '10', FALSE, TRUE),
('1051', '1', 'Primes d''émission', 'credit_normal', '105', TRUE, TRUE),
('1052', '1', 'Primes d''apport', 'credit_normal', '105', TRUE, TRUE),
('1053', '1', 'Primes de fusion', 'credit_normal', '105', TRUE, TRUE),
('1054', '1', 'Primes de conversion', 'credit_normal', '105', TRUE, TRUE),
('1058', '1', 'Autres primes', 'credit_normal', '105', TRUE, TRUE),
('106', '1', 'ECART DE REEVALUATION', 'credit_normal', '10', FALSE, TRUE),
('1061', '1', 'Ecart de réévaluation légale', 'credit_normal', '106', TRUE, TRUE),
('1062', '1', 'Ecart de réévaluation libre', 'credit_normal', '106', TRUE, TRUE),
('109', '1', 'APPORTEUR, CAPITAL SOUSCRIT, NON APPELE', 'credit_normal', '10', FALSE, TRUE),
('11', '1', 'RESERVES', 'credit_normal', '1', FALSE, TRUE),
('111', '1', 'RESERVE LEGALE', 'credit_normal', '11', FALSE, TRUE),
('112', '1', 'RESERVES STATUTAIRES OU CONTRACTUELLES', 'credit_normal', '11', FALSE, TRUE),
('113', '1', 'RESERVES REGLEMENTEES', 'credit_normal', '11', FALSE, TRUE),
('1131', '1', 'Réserves de plus-values nettes à long terme', 'credit_normal', '113', TRUE, TRUE),
('1132', '1', 'Réserves d''attribution gratuite d''actions au personnel salarié et aux dirigeants', 'credit_normal', '113', TRUE, TRUE),
('1133', '1', 'Réserve consécutive à l''octroi de subvention d''investissement', 'credit_normal', '113', TRUE, TRUE),
('1134', '1', 'Réserve des valeurs mobilières donnant accès au capital', 'credit_normal', '113', TRUE, TRUE),
('1138', '1', 'Autres réserves réglementées', 'credit_normal', '113', TRUE, TRUE),
('118', '1', 'AUTRES RESERVES', 'credit_normal', '11', FALSE, TRUE),
('1181', '1', 'Réserves facultatives', 'credit_normal', '118', TRUE, TRUE),
('1188', '1', 'Réserves diverses', 'credit_normal', '118', TRUE, TRUE),
('12', '1', 'REPORT A NOUVEAU', 'credit_normal', '1', FALSE, TRUE),
('121', '1', 'REPORT A NOUVEAU CREDITEUR', 'credit_normal', '12', FALSE, TRUE),
('129', '1', 'REPORT A NOUVEAU DEBITEUR', 'credit_normal', '12', FALSE, TRUE),
('1291', '1', 'Perte nette à reporter', 'credit_normal', '129', TRUE, TRUE),
('1292', '1', 'Perte - Amortissements réputés différés', 'credit_normal', '129', TRUE, TRUE),
('13', '1', 'RESULTAT NET DE L''EXERCICE', 'credit_normal', '1', FALSE, TRUE),
('130', '1', 'RESULTAT EN INSTANCE D''AFFECTATION', 'credit_normal', '13', FALSE, TRUE),
('1301', '1', 'Résultat en instance d''affectation : Bénéfice', 'credit_normal', '130', TRUE, TRUE),
('1302', '1', 'Résultat en instance d''affectation : Perte', 'credit_normal', '130', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('131', '1', 'RESULTAT NET : BENEFICE', 'credit_normal', '13', FALSE, TRUE),
('132', '1', 'MARGE COMMERCIALE (MC)', 'credit_normal', '13', FALSE, TRUE),
('133', '1', 'VALEUR AJOUTEE (V.A)', 'credit_normal', '13', FALSE, TRUE),
('134', '1', 'EXCEDENT BRUT D''EXPLOITATION (E.B.E)', 'credit_normal', '13', FALSE, TRUE),
('135', '1', 'RESULTAT D''EXPLOITATION (R.E)', 'credit_normal', '13', FALSE, TRUE),
('136', '1', 'RESULTAT FINANCIER (R.F)', 'credit_normal', '13', FALSE, TRUE),
('137', '1', 'RESULTAT DES ACTIVITES ORDINAIRES (R.A.O)', 'credit_normal', '13', FALSE, TRUE),
('138', '1', 'RESULTAT HORS ACTIVITES ORDINAIRES (R.H.A.O)', 'credit_normal', '13', FALSE, TRUE),
('1381', '1', 'Résultat de fusion', 'credit_normal', '138', TRUE, TRUE),
('1382', '1', 'Résultat d''apport partiel d''actif', 'credit_normal', '138', TRUE, TRUE),
('1383', '1', 'Résultat de scission', 'credit_normal', '138', TRUE, TRUE),
('1384', '1', 'Résultat de liquidation', 'credit_normal', '138', TRUE, TRUE),
('139', '1', 'RESULTAT NET : PERTE', 'credit_normal', '13', FALSE, TRUE),
('14', '1', 'SUBVENTIONS D''INVESTISSEMENT', 'credit_normal', '1', FALSE, TRUE),
('141', '1', 'SUBVENTIONS D''EQUIPEMENT', 'credit_normal', '14', FALSE, TRUE),
('1411', '1', 'Etat', 'credit_normal', '141', TRUE, TRUE),
('1412', '1', 'Régions', 'credit_normal', '141', TRUE, TRUE),
('1413', '1', 'Départements', 'credit_normal', '141', TRUE, TRUE),
('1414', '1', 'Communes et collectivités publiques décentralisées', 'credit_normal', '141', TRUE, TRUE),
('1415', '1', 'Entités publiques ou mixtes', 'credit_normal', '141', TRUE, TRUE),
('1416', '1', 'Entités et organismes privés', 'credit_normal', '141', TRUE, TRUE),
('1417', '1', 'Organismes internationaux', 'credit_normal', '141', TRUE, TRUE),
('1418', '1', 'Autres', 'credit_normal', '141', TRUE, TRUE),
('148', '1', 'AUTRES SUBVENTIONS D''INVESTISSEMENT', 'credit_normal', '14', FALSE, TRUE),
('15', '1', 'PROVISIONS REGLEMENTEES ET FONDS ASSIMILES', 'credit_normal', '1', FALSE, TRUE),
('151', '1', 'AMORTISSEMENTS DEROGATOIRES', 'credit_normal', '15', FALSE, TRUE),
('152', '1', 'FONDS REGLEMENTES', 'credit_normal', '15', FALSE, TRUE),
('1531', '1', 'Fonds National', 'credit_normal', '15', TRUE, TRUE),
('1532', '1', 'Prélèvement pour le Budget', 'credit_normal', '15', TRUE, TRUE),
('154', '1', 'PROVISION SPECIALE DE REEVALUATION', 'credit_normal', '15', FALSE, TRUE),
('155', '1', 'PROVISIONS REGLEMENTEES RELATIVES AUX IMMOBILISATIONS', 'credit_normal', '15', FALSE, TRUE),
('1551', '1', 'Reconstitutions des gisements miniers et pétroliers', 'credit_normal', '155', TRUE, TRUE),
('156', '1', 'PROVISION REGLEMENTEES RELATIVES AUX STOCKS', 'credit_normal', '15', FALSE, TRUE),
('1561', '1', 'Hausse de prix', 'credit_normal', '156', TRUE, TRUE),
('1562', '1', 'Fluctuations des cours', 'credit_normal', '156', TRUE, TRUE),
('157', '1', 'PROVISION POUR INVESTISSEMENT', 'credit_normal', '15', FALSE, TRUE),
('158', '1', 'AUTRES PROVISIONS ET FONDS REGLEMENTES', 'credit_normal', '15', FALSE, TRUE),
('16', '1', 'EMPRUNTS ET DETTES ASSIMILEES', 'credit_normal', '1', FALSE, TRUE),
('161', '1', 'EMPRUNTS OBLIGATAIRES', 'credit_normal', '16', FALSE, TRUE),
('1611', '1', 'Emprunts obligataires ordinaires', 'credit_normal', '161', TRUE, TRUE),
('1612', '1', 'Emprunts obligataires convertibles en actions', 'credit_normal', '161', TRUE, TRUE),
('1613', '1', 'Emprunts obligataires remboursables en actions', 'credit_normal', '161', TRUE, TRUE),
('1618', '1', 'Autres emprunts obligataires', 'credit_normal', '161', TRUE, TRUE),
('162', '1', 'EMPRUNTS ET DETTES AUPRES DES ETABLISSEMENTS DE CREDIT', 'credit_normal', '16', FALSE, TRUE),
('163', '1', 'AVANCES RECUES DE L''ETAT', 'credit_normal', '16', FALSE, TRUE),
('164', '1', 'AVANCES RECUES ET COMPTES COURANTS BLOQUES', 'credit_normal', '16', FALSE, TRUE),
('165', '1', 'DEPOTS ET CAUTIONNEMENTS RECUS', 'credit_normal', '16', FALSE, TRUE),
('1651', '1', 'Dépôts', 'credit_normal', '165', TRUE, TRUE),
('1652', '1', 'Cautionnements', 'credit_normal', '165', TRUE, TRUE),
('166', '1', 'INTERETS COURUS', 'credit_normal', '16', FALSE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('1661', '1', 'sur emprunts obligataires', 'credit_normal', '166', TRUE, TRUE),
('1662', '1', 'sur emprunts et dettes auprès des établissements de crédit', 'credit_normal', '166', TRUE, TRUE),
('1663', '1', 'sur avances reçues de l''État', 'credit_normal', '166', TRUE, TRUE),
('1664', '1', 'sur avances reçues et comptes courants bloqués', 'credit_normal', '166', TRUE, TRUE),
('1667', '1', 'sur avances assorties de conditions particulières', 'credit_normal', '166', TRUE, TRUE),
('1668', '1', 'sur autres emprunts et dettes', 'credit_normal', '166', TRUE, TRUE),
('167', '1', 'AVANCES ASSORTIES DE CONDITIONS PARTICULIERES', 'credit_normal', '16', FALSE, TRUE),
('1671', '1', 'Avances bloquées pour augmentation du capital', 'credit_normal', '167', TRUE, TRUE),
('1672', '1', 'Avances conditionnées par l''État', 'credit_normal', '167', TRUE, TRUE),
('1673', '1', 'Avances conditionnées par les autres organismes africains', 'credit_normal', '167', TRUE, TRUE),
('1674', '1', 'Avances conditionnées par les organismes internationaux', 'credit_normal', '167', TRUE, TRUE),
('1676', '1', 'Droits du concédant exigibles en nature', 'credit_normal', '167', TRUE, TRUE),
('168', '1', 'AUTRES EMPRUNTS ET DETTES', 'credit_normal', '16', FALSE, TRUE),
('1681', '1', 'Rentes viagères capitalisées', 'credit_normal', '168', TRUE, TRUE),
('1682', '1', 'Billets de fonds', 'credit_normal', '168', TRUE, TRUE),
('1683', '1', 'Dettes consécutives à des titres empruntés', 'credit_normal', '168', TRUE, TRUE),
('1684', '1', 'Dettes du concédant exigibles en nature', 'credit_normal', '168', TRUE, TRUE),
('1685', '1', 'Emprunts participatifs', 'credit_normal', '168', TRUE, TRUE),
('17', '1', 'DETTES DE LOCATION ACQUISITION', 'credit_normal', '1', FALSE, TRUE),
('172', '1', 'DETTES DE LOCATION ACQUISITION/CREDIT-BAIL IMMOBILIER', 'credit_normal', '17', FALSE, TRUE),
('173', '1', 'DETTES DE LOCATION ACQUISITION/CREDIT-BAIL', 'credit_normal', '17', FALSE, TRUE),
('174', '1', 'DETTES DE LOCATION ACQUISITION/LOCATION VENTE', 'credit_normal', '17', FALSE, TRUE),
('176', '1', 'INTERETS COURUS', 'credit_normal', '17', FALSE, TRUE),
('1762', '1', 'sur dettes de location acquisition/ crédit-bail immobilier', 'credit_normal', '176', TRUE, TRUE),
('1763', '1', 'sur dettes de location acquisition/ crédit-bail mobilier', 'credit_normal', '176', TRUE, TRUE),
('1764', '1', 'sur dettes de location acquisition/location vente', 'credit_normal', '176', TRUE, TRUE),
('1768', '1', 'sur autres dettes de location acquisition', 'credit_normal', '176', TRUE, TRUE),
('178', '1', 'AUTRES DETTES DE LOCATION ACQUISITION', 'credit_normal', '17', FALSE, TRUE),
('18', '1', 'DETTES LIEES A DES PARTICIPATIONS ET COMPTES DE LIAISON DES ETABLISSEMENTS ET SOCIETES EN PARTICIPATIONS', 'credit_normal', '1', FALSE, TRUE),
('181', '1', 'DETTES LIEES A DES PARTICIPATIONS', 'credit_normal', '18', FALSE, TRUE),
('1811', '1', 'Dettes liées à des participations (groupe)', 'credit_normal', '181', TRUE, TRUE),
('1812', '1', 'Dettes liées à des participations (hors groupe)', 'credit_normal', '181', TRUE, TRUE),
('182', '1', 'DETTES LIEES A DES SOCIETES EN PARTICIPATION', 'credit_normal', '18', FALSE, TRUE),
('183', '1', 'INTERETS COURUS SUR DETTES LIEES A DES PARTICIPATIONS', 'credit_normal', '18', FALSE, TRUE),
('184', '1', 'COMPTES PERMANENTS BLOQUES DES ETABLISSEMENTS ET SUCCURSALES', 'credit_normal', '18', FALSE, TRUE),
('185', '1', 'COMPTES PERMANENTS NON BLOQUES DES ETABLISSEMENTS ET SUCCURSALES', 'credit_normal', '18', FALSE, TRUE),
('1851', '1', 'Comptes permanents non bloqués succursales', 'credit_normal', '185', TRUE, TRUE),
('1852', '1', 'Comptes permanents non bloqués siège', 'credit_normal', '185', TRUE, TRUE),
('186', '1', 'COMPTES DE LIAISON CHARGES', 'credit_normal', '18', FALSE, TRUE),
('187', '1', 'COMPTES DE LIAISON PRODUITS', 'credit_normal', '18', FALSE, TRUE),
('188', '1', 'COMPTES DE LIAISON DES SOCIETES EN PARTICIPATION', 'credit_normal', '18', FALSE, TRUE),
('19', '1', 'PROVISIONS FINANCIERES POUR RISQUES ET CHARGES', 'credit_normal', '1', FALSE, TRUE),
('191', '1', 'PROVISIONS POUR LITIGES', 'credit_normal', '19', FALSE, TRUE),
('192', '1', 'PROVISIONS POUR GARANTIES DONNEES AUX CLIENTS', 'credit_normal', '19', FALSE, TRUE),
('193', '1', 'PROVISIONS POUR PERTES SUR MARCHES A ACHÈVEMENT FUTUR', 'credit_normal', '19', FALSE, TRUE),
('194', '1', 'PROVISIONS POUR PERTES DE CHANGE', 'credit_normal', '19', FALSE, TRUE),
('195', '1', 'PROVISIONS POUR IMPÔTS', 'credit_normal', '19', FALSE, TRUE),
('196', '1', 'PROVISIONS POUR PENSIONS ET OBLIGATIONS SIMILAIRES', 'credit_normal', '19', FALSE, TRUE),
('1961', '1', 'Provisions pour pensions et obligations similaires - engagement de retraite', 'credit_normal', '196', TRUE, TRUE),
('1962', '1', 'Actifs du régime de retraite', 'credit_normal', '196', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('197', '1', 'PROVISION POUR RESTRUCTURATION', 'credit_normal', '19', FALSE, TRUE),
('198', '1', 'AUTRES PROVISIONS FINANCIERES POUR RISQUES ET CHARGES', 'credit_normal', '19', FALSE, TRUE),
('1981', '1', 'Provisions pour amendes et pénalités', 'credit_normal', '198', TRUE, TRUE),
('1983', '1', 'Provisions de propre assureur', 'credit_normal', '198', TRUE, TRUE),
('1984', '1', 'Provisions pour démantèlement et remise en état', 'credit_normal', '198', TRUE, TRUE),
('1985', '1', 'Provisions de droits à déduction (Chèques cadeaux, cartes de fidélité)', 'credit_normal', '198', TRUE, TRUE),
('2', '2', 'COMPTES D''ACTIF IMMOBILISE', 'debit_normal', NULL, FALSE, TRUE),
('21', '2', 'IMMOBILISATIONS INCORPORELLES', 'debit_normal', '2', FALSE, TRUE),
('211', '2', 'FRAIS DE DEVELOPPEMENT', 'debit_normal', '21', FALSE, TRUE),
('212', '2', 'BREVETS, LICENCES, CONCESSIONS ET DROITS SIMILAIRES', 'debit_normal', '21', FALSE, TRUE),
('2121', '2', 'Brevets', 'debit_normal', '212', TRUE, TRUE),
('2122', '2', 'Licences', 'debit_normal', '212', TRUE, TRUE),
('2123', '2', 'Concessions de service public', 'debit_normal', '212', TRUE, TRUE),
('2128', '2', 'Autres concessions et droits similaires', 'debit_normal', '212', TRUE, TRUE),
('213', '2', 'LOGICIELS ET SITES INTERNET', 'debit_normal', '21', FALSE, TRUE),
('2131', '2', 'Logiciels', 'debit_normal', '213', TRUE, TRUE),
('2132', '2', 'Sites internet', 'debit_normal', '213', TRUE, TRUE),
('214', '2', 'MARQUES', 'debit_normal', '21', FALSE, TRUE),
('215', '2', 'FONDS COMMERCIAL', 'debit_normal', '21', FALSE, TRUE),
('216', '2', 'DROIT AU BAIL', 'debit_normal', '21', FALSE, TRUE),
('217', '2', 'INVESTISSEMENTS DE CREATION', 'debit_normal', '21', FALSE, TRUE),
('218', '2', 'AUTRES DROITS ET VALEURS INCORPORELS', 'debit_normal', '21', FALSE, TRUE),
('2181', '2', 'Frais de prospection et d''évaluation de ressources minérales', 'debit_normal', '218', TRUE, TRUE),
('2182', '2', 'Coûts d''obtention du contrat', 'debit_normal', '218', TRUE, TRUE),
('2183', '2', 'Fichiers clients, notices, titres de journaux et magazines', 'debit_normal', '218', TRUE, TRUE),
('2184', '2', 'Coût de franchise', 'debit_normal', '218', TRUE, TRUE),
('2188', '2', 'Divers droits et valeurs incorporelles', 'debit_normal', '218', TRUE, TRUE),
('219', '2', 'IMMOBILISATIONS INCORPORELLES EN COURS', 'debit_normal', '21', FALSE, TRUE),
('2191', '2', 'Frais de développement', 'debit_normal', '219', TRUE, TRUE),
('2193', '2', 'Logiciels et internet', 'debit_normal', '219', TRUE, TRUE),
('2198', '2', 'Autres droits et valeurs incorporels', 'debit_normal', '219', TRUE, TRUE),
('22', '2', 'TERRAINS', 'debit_normal', '2', FALSE, TRUE),
('221', '2', 'TERRAINS AGRICOLES ET FORESTIERS', 'debit_normal', '22', FALSE, TRUE),
('2211', '2', 'Terrains d''exploitation agricole', 'debit_normal', '221', TRUE, TRUE),
('2212', '2', 'Terrains d''exploitation forestière', 'debit_normal', '221', TRUE, TRUE),
('2218', '2', 'Autres terrains', 'debit_normal', '221', TRUE, TRUE),
('222', '2', 'TERRAINS NUS', 'debit_normal', '22', FALSE, TRUE),
('2221', '2', 'Terrains à bâtir', 'debit_normal', '222', TRUE, TRUE),
('2228', '2', 'Autres terrains nus', 'debit_normal', '222', TRUE, TRUE),
('223', '2', 'TERRAINS BATIS', 'debit_normal', '22', FALSE, TRUE),
('2231', '2', 'pour bâtiments industriels et agricoles', 'debit_normal', '223', TRUE, TRUE),
('2232', '2', 'pour bâtiments administratifs et commerciaux', 'debit_normal', '223', TRUE, TRUE),
('2234', '2', 'pour bâtiments affectés aux autres opérations professionnelles', 'debit_normal', '223', TRUE, TRUE),
('2235', '2', 'pour bâtiments affectés aux autres opérations non professionnelles', 'debit_normal', '223', TRUE, TRUE),
('224', '2', 'TRAVAUX DE MISE EN VALEUR DES TERRAINS', 'debit_normal', '22', FALSE, TRUE),
('2241', '2', 'Plantation d''arbres et d''arbustes', 'debit_normal', '224', TRUE, TRUE),
('2245', '2', 'Améliorations du fonds', 'debit_normal', '224', TRUE, TRUE),
('2248', '2', 'Autres travaux', 'debit_normal', '224', TRUE, TRUE),
('225', '2', 'TERRAINS DE CARRIERES - TREFONDS', 'debit_normal', '22', FALSE, TRUE),
('2251', '2', 'Carrières', 'debit_normal', '225', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('226', '2', 'TERRAINS AMENAGES', 'debit_normal', '22', FALSE, TRUE),
('2261', '2', 'Parkings', 'debit_normal', '226', TRUE, TRUE),
('227', '2', 'TERRAINS MIS EN CONCESSION', 'debit_normal', '22', FALSE, TRUE),
('228', '2', 'AUTRES TERRAINS', 'debit_normal', '22', FALSE, TRUE),
('2281', '2', 'Terrains des immeubles de placement', 'debit_normal', '228', TRUE, TRUE),
('2285', '2', 'Terrains des logements affectés au personnel', 'debit_normal', '228', TRUE, TRUE),
('2288', '2', 'Autres', 'debit_normal', '228', TRUE, TRUE),
('229', '2', 'AMENAGEMENTS DE TERRAINS EN COURS', 'debit_normal', '22', FALSE, TRUE),
('2291', '2', 'Terrains agricoles et forestiers', 'debit_normal', '229', TRUE, TRUE),
('2292', '2', 'Terrains nus', 'debit_normal', '229', TRUE, TRUE),
('2295', '2', 'Terrains de carrières - tréfonds', 'debit_normal', '229', TRUE, TRUE),
('2298', '2', 'Autres terrains', 'debit_normal', '229', TRUE, TRUE),
('23', '2', 'BATIMENTS, INSTALLATIONS TECHNIQUES ET AGENCEMENTS', 'debit_normal', '2', FALSE, TRUE),
('231', '2', 'BATIMENTS INDUSTRIELS, AGRICOLES, ADMINISTRATIFS ET COMMERCIAUX SUR SOL PROPRE', 'debit_normal', '23', FALSE, TRUE),
('2311', '2', 'Bâtiments industriels', 'debit_normal', '231', TRUE, TRUE),
('2312', '2', 'Bâtiments agricoles', 'debit_normal', '231', TRUE, TRUE),
('2313', '2', 'Bâtiments administratifs et commerciaux', 'debit_normal', '231', TRUE, TRUE),
('2314', '2', 'Bâtiments affectés au logement du personnel', 'debit_normal', '231', TRUE, TRUE),
('2315', '2', 'Immeubles de placement', 'debit_normal', '231', TRUE, TRUE),
('232', '2', 'BATIMENTS INDUSTRIELS, AGRICOLES, ADMINISTRATIFS ET COMMERCIAUX SUR SOL D''AUTRUI', 'debit_normal', '23', FALSE, TRUE),
('2321', '2', 'Bâtiments industriels', 'debit_normal', '232', TRUE, TRUE),
('2322', '2', 'Bâtiments agricoles', 'debit_normal', '232', TRUE, TRUE),
('2323', '2', 'Bâtiments administratifs et commerciaux', 'debit_normal', '232', TRUE, TRUE),
('2324', '2', 'Bâtiments affectés au logement du personnel', 'debit_normal', '232', TRUE, TRUE),
('2325', '2', 'Immeubles de placement', 'debit_normal', '232', TRUE, TRUE),
('233', '2', 'OUVRAGES D''INFRASTRUCTURE', 'debit_normal', '23', FALSE, TRUE),
('2331', '2', 'Voies de terre', 'debit_normal', '233', TRUE, TRUE),
('2332', '2', 'Voies de fer', 'debit_normal', '233', TRUE, TRUE),
('2333', '2', 'Voies d''eau', 'debit_normal', '233', TRUE, TRUE),
('2334', '2', 'Barrages, Digues', 'debit_normal', '233', TRUE, TRUE),
('2335', '2', 'Pistes d''aérodrome', 'debit_normal', '233', TRUE, TRUE),
('2338', '2', 'Autres', 'debit_normal', '233', TRUE, TRUE),
('234', '2', 'AMENAGEMENTS, AGENCEMENTS ET INSTALLATIONS TECHNIQUES', 'debit_normal', '23', FALSE, TRUE),
('2341', '2', 'Installations complexes spécialisées sur sol propre', 'debit_normal', '234', TRUE, TRUE),
('2342', '2', 'Installations complexes spécialisées sur sol d''autrui', 'debit_normal', '234', TRUE, TRUE),
('2343', '2', 'Installations complexes à caractère spécifique sur sol propre', 'debit_normal', '234', TRUE, TRUE),
('2344', '2', 'Installations complexes à caractère spécifique sur sol d''autrui', 'debit_normal', '234', TRUE, TRUE),
('2345', '2', 'Aménagements et agencements des bâtiments', 'debit_normal', '234', TRUE, TRUE),
('235', '2', 'AMENAGEMENTS DE BUREAUX', 'debit_normal', '23', FALSE, TRUE),
('2351', '2', 'Installations générales', 'debit_normal', '235', TRUE, TRUE),
('2358', '2', 'Autres aménagements de bureaux', 'debit_normal', '235', TRUE, TRUE),
('237', '2', 'BATIMENTS INDUSTRIELS, AGRICOLES ET COMMERCIAUX MIS EN CONCESSION', 'debit_normal', '23', FALSE, TRUE),
('238', '2', 'AUTRES INSTALLATIONS ET AGENCEMENTS', 'debit_normal', '23', FALSE, TRUE),
('239', '2', 'BATIMENTS, AMENAGEMENTS, AGENCEMENTS ET INSTALLATIONS EN COURS', 'debit_normal', '23', FALSE, TRUE),
('2391', '2', 'Bâtiments en cours', 'debit_normal', '239', TRUE, TRUE),
('2392', '2', 'Installations en cours', 'debit_normal', '239', TRUE, TRUE),
('2393', '2', 'Aménagements et agencements en cours', 'debit_normal', '239', TRUE, TRUE),
('24', '2', 'MATERIEL, MOBILIER ET ACTIFS BIOLOGIQUES', 'debit_normal', '2', FALSE, TRUE),
('241', '2', 'MATERIEL ET OUTILLAGE INDUSTRIEL ET COMMERCIAL', 'debit_normal', '24', FALSE, TRUE),
('2411', '2', 'Matériel industriel', 'debit_normal', '241', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('2412', '2', 'Outillage industriel', 'debit_normal', '241', TRUE, TRUE),
('2413', '2', 'Commercial', 'debit_normal', '241', TRUE, TRUE),
('2414', '2', 'Outillage commercial', 'debit_normal', '241', TRUE, TRUE),
('242', '2', 'MATERIEL ET OUTILLAGE AGRICOLE', 'debit_normal', '24', FALSE, TRUE),
('2421', '2', 'Matériel agricole', 'debit_normal', '242', TRUE, TRUE),
('2422', '2', 'Outillage agricole', 'debit_normal', '242', TRUE, TRUE),
('243', '2', 'MATERIEL D''EMBALLAGE RECUPERABLE ET IDENTIFIABLE', 'debit_normal', '24', FALSE, TRUE),
('244', '2', 'MATERIEL ET MOBILIER', 'debit_normal', '24', FALSE, TRUE),
('2441', '2', 'Matériel de bureau', 'debit_normal', '244', TRUE, TRUE),
('2442', '2', 'Matériel informatique', 'debit_normal', '244', TRUE, TRUE),
('2443', '2', 'Matériel de bureautique', 'debit_normal', '244', TRUE, TRUE),
('2444', '2', 'Mobilier de bureau', 'debit_normal', '244', TRUE, TRUE),
('2446', '2', 'Matériel et mobilier des immeubles de placement', 'debit_normal', '244', TRUE, TRUE),
('2447', '2', 'Matériel et mobilier des logements du personnel', 'debit_normal', '244', TRUE, TRUE),
('245', '2', 'MATERIEL DE TRANSPORT', 'debit_normal', '24', FALSE, TRUE),
('2451', '2', 'Matériel automobile', 'debit_normal', '245', TRUE, TRUE),
('2452', '2', 'Matériel ferroviaire', 'debit_normal', '245', TRUE, TRUE),
('2453', '2', 'Matériel fluvial, lagunaire', 'debit_normal', '245', TRUE, TRUE),
('2454', '2', 'Matériel naval', 'debit_normal', '245', TRUE, TRUE),
('2455', '2', 'Matériel aérien', 'debit_normal', '245', TRUE, TRUE),
('2456', '2', 'Matériel hippomobile', 'debit_normal', '245', TRUE, TRUE),
('2458', '2', 'Autres (vélo, mobylette, moto)', 'debit_normal', '245', TRUE, TRUE),
('246', '2', 'ACTIFS BIOLOGIQUES', 'debit_normal', '24', FALSE, TRUE),
('2461', '2', 'Cheptel, animaux de trait', 'debit_normal', '246', TRUE, TRUE),
('2462', '2', 'Cheptel, animaux reproducteurs', 'debit_normal', '246', TRUE, TRUE),
('2463', '2', 'Animaux de garde', 'debit_normal', '246', TRUE, TRUE),
('2465', '2', 'Plantations agricoles', 'debit_normal', '246', TRUE, TRUE),
('2468', '2', 'Autres actifs biologiques', 'debit_normal', '246', TRUE, TRUE),
('247', '2', 'AGENCEMENTS, AMENAGEMENTS DU MATERIEL ET ACTIFS BIOLOGIQUES', 'debit_normal', '24', FALSE, TRUE),
('2471', '2', 'Agencements et aménagements du matériel', 'debit_normal', '247', TRUE, TRUE),
('2472', '2', 'Agencements et aménagements des actifs biologiques', 'debit_normal', '247', TRUE, TRUE),
('248', '2', 'AUTRES MATERIELS ET MOBILIERS', 'debit_normal', '24', FALSE, TRUE),
('2481', '2', 'Collections et œuvres d''art', 'debit_normal', '248', TRUE, TRUE),
('249', '2', 'MATERIELS ET ACTIFS BIOLOGIQUES EN COURS', 'debit_normal', '24', FALSE, TRUE),
('2491', '2', 'Matériel et outillage industriel et commercial', 'debit_normal', '249', TRUE, TRUE),
('2492', '2', 'Matériel et outillage agricole', 'debit_normal', '249', TRUE, TRUE),
('2493', '2', 'Matériel d''emballage récupérable et identifiable', 'debit_normal', '249', TRUE, TRUE),
('2494', '2', 'Matériel et mobilier de bureau', 'debit_normal', '249', TRUE, TRUE),
('2495', '2', 'Matériel de transport', 'debit_normal', '249', TRUE, TRUE),
('2496', '2', 'Actifs biologiques', 'debit_normal', '249', TRUE, TRUE),
('2497', '2', 'Agencements et aménagements du matériel et des actifs biologiques', 'debit_normal', '249', TRUE, TRUE),
('2498', '2', 'Autres matériels', 'debit_normal', '249', TRUE, TRUE),
('25', '2', 'AVANCES ET ACOMPTES VERSES SUR IMMOBILISATIONS', 'debit_normal', '2', FALSE, TRUE),
('251', '2', 'AVANCES ET ACOMPTES VERSES SUR IMMOBILISATIONS INCORPORELLES', 'debit_normal', '25', FALSE, TRUE),
('252', '2', 'AVANCES ET ACOMPTES VERSES SUR IMMOBILISATIONS CORPORELLES', 'debit_normal', '25', FALSE, TRUE),
('26', '2', 'TITRES DE PARTICIPATION', 'debit_normal', '2', FALSE, TRUE),
('261', '2', 'TITRES DE PARTICIPATION DANS DES SOCIETES SOUS CONTROLE EXCLUSIF', 'debit_normal', '26', FALSE, TRUE),
('262', '2', 'TITRES DE PARTICIPATION DANS DES SOCIETES SOUS CONTROLE CONJOINT', 'debit_normal', '26', FALSE, TRUE),
('263', '2', 'TITRES DE PARTICIPATION DANS DES SOCIETES CONFÉRANT UNE INFLUENCE NOTABLE', 'debit_normal', '26', FALSE, TRUE),
('265', '2', 'PARTICIPATIONS DANS DES ORGANISMES PROFESSIONNELS', 'debit_normal', '26', FALSE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('266', '2', 'PARTS DANS DES GROUPEMENTS D''INTERET ECONOMIQUE (G.I.E.)', 'debit_normal', '26', FALSE, TRUE),
('268', '2', 'AUTRES TITRES DE PARTICIPATION', 'debit_normal', '26', FALSE, TRUE),
('27', '2', 'AUTRES IMMOBILISATIONS FINANCIERES', 'debit_normal', '2', FALSE, TRUE),
('271', '2', 'PRETS ET CREANCES', 'debit_normal', '27', FALSE, TRUE),
('2711', '2', 'Prêts participatifs', 'debit_normal', '271', TRUE, TRUE),
('2712', '2', 'Prêts aux associés', 'debit_normal', '271', TRUE, TRUE),
('2713', '2', 'Billets de fonds', 'debit_normal', '271', TRUE, TRUE),
('2714', '2', 'Créances de location financement/ location-vente', 'debit_normal', '271', TRUE, TRUE),
('272', '2', 'PRETS AU PERSONNEL', 'debit_normal', '27', FALSE, TRUE),
('2721', '2', 'Prêts immobiliers', 'debit_normal', '272', TRUE, TRUE),
('2722', '2', 'Prêts mobiliers et d''installation', 'debit_normal', '272', TRUE, TRUE),
('2728', '2', 'Autres prêts (frais d''études…)', 'debit_normal', '272', TRUE, TRUE),
('273', '2', 'CREANCES SUR L''ETAT', 'debit_normal', '27', FALSE, TRUE),
('2731', '2', 'Retenues de garantie', 'debit_normal', '273', TRUE, TRUE),
('2733', '2', 'Fonds réglementé', 'debit_normal', '273', TRUE, TRUE),
('2734', '2', 'Créances sur le concédant', 'debit_normal', '273', TRUE, TRUE),
('2738', '2', 'Autres créances sur l''Etat', 'debit_normal', '273', TRUE, TRUE),
('274', '2', 'TITRES IMMOBILISES', 'debit_normal', '27', FALSE, TRUE),
('2741', '2', 'Titres immobilisés de l''activité de portefeuille (T.I.A.P)', 'debit_normal', '274', TRUE, TRUE),
('2742', '2', 'Titres participatifs', 'debit_normal', '274', TRUE, TRUE),
('2743', '2', 'Certificats d''investissement', 'debit_normal', '274', TRUE, TRUE),
('2744', '2', 'Parts de fonds commun de placement (F.C.P)', 'debit_normal', '274', TRUE, TRUE),
('2745', '2', 'Obligations', 'debit_normal', '274', TRUE, TRUE),
('2746', '2', 'Actions ou parts propres', 'debit_normal', '274', TRUE, TRUE),
('2748', '2', 'Autres titres immobilisés', 'debit_normal', '274', TRUE, TRUE),
('275', '2', 'DEPOTS ET CAUTIONNEMENTS VERSES', 'debit_normal', '27', FALSE, TRUE),
('2751', '2', 'Dépôts pour loyer d''avance', 'debit_normal', '275', TRUE, TRUE),
('2752', '2', 'Dépôts pour l''électricité', 'debit_normal', '275', TRUE, TRUE),
('2753', '2', 'Dépôts pour l''eau', 'debit_normal', '275', TRUE, TRUE),
('2754', '2', 'Dépôts pour le gaz', 'debit_normal', '275', TRUE, TRUE),
('2755', '2', 'Dépôts pour le téléphone, le telex, la télécopie', 'debit_normal', '275', TRUE, TRUE),
('2756', '2', 'Cautionnements sur marchés publics', 'debit_normal', '275', TRUE, TRUE),
('2757', '2', 'Cautionnements sur autres opérations', 'debit_normal', '275', TRUE, TRUE),
('2758', '2', 'Autres dépôts et cautionnements', 'debit_normal', '275', TRUE, TRUE),
('276', '2', 'INTERETS COURUS', 'debit_normal', '27', FALSE, TRUE),
('2761', '2', 'Prêts et créances non commerciales', 'debit_normal', '276', TRUE, TRUE),
('2762', '2', 'Prêts au personnel', 'debit_normal', '276', TRUE, TRUE),
('2763', '2', 'Créances sur l''Etat', 'debit_normal', '276', TRUE, TRUE),
('2764', '2', 'Titres immobilisés de l''activité de portefeuille (T.I.A.P)', 'debit_normal', '276', TRUE, TRUE),
('2765', '2', 'Dépôts et cautionnements versés', 'debit_normal', '276', TRUE, TRUE),
('2767', '2', 'Créances rattachées à des participations', 'debit_normal', '276', TRUE, TRUE),
('2768', '2', 'Immobilisations financières diverses', 'debit_normal', '276', TRUE, TRUE),
('277', '2', 'CREANCES RATTACHEES A DES PARTICIPATIONS ET AVANCES A DES G.I.E', 'debit_normal', '27', FALSE, TRUE),
('2771', '2', 'Créances rattachées à des participations (groupe)', 'debit_normal', '277', TRUE, TRUE),
('2772', '2', 'Créances rattachées à des participations (hors groupe)', 'debit_normal', '277', TRUE, TRUE),
('2773', '2', 'Créances rattachées à des sociétés en participation', 'debit_normal', '277', TRUE, TRUE),
('2774', '2', 'Avances à des groupements d''intérêts économique (G.I.E)', 'debit_normal', '277', TRUE, TRUE),
('278', '2', 'IMMOBILISATIONS FINANCIERES DIVERSES', 'debit_normal', '27', FALSE, TRUE),
('2781', '2', 'Créances diverses groupe', 'debit_normal', '278', TRUE, TRUE),
('2782', '2', 'Créances diverses hors groupe', 'debit_normal', '278', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('2784', '2', 'Banque dépôts à terme', 'debit_normal', '278', TRUE, TRUE),
('2785', '2', 'Or et métaux précieux', 'debit_normal', '278', TRUE, TRUE),
('28', '2', 'AMORTISSEMENTS', 'debit_normal', '2', FALSE, TRUE),
('281', '2', 'AMORTISSEMENTS DES IMMOBILISATIONS INCORPORELLES', 'debit_normal', '28', FALSE, TRUE),
('2811', '2', 'Amortissements des frais de développement', 'debit_normal', '281', TRUE, TRUE),
('2812', '2', 'Amortissements des brevets, licences, concessions et droits similaires', 'debit_normal', '281', TRUE, TRUE),
('2813', '2', 'Amortissements des logiciels et sites internet', 'debit_normal', '281', TRUE, TRUE),
('2814', '2', 'Amortissements des marques', 'debit_normal', '281', TRUE, TRUE),
('2815', '2', 'Amortissements du fonds commercial', 'debit_normal', '281', TRUE, TRUE),
('2816', '2', 'Amortissements du droit au bail', 'debit_normal', '281', TRUE, TRUE),
('2817', '2', 'Amortissements des investissements de création', 'debit_normal', '281', TRUE, TRUE),
('2818', '2', 'Amortissements des autres droits et valeurs incorporels', 'debit_normal', '281', TRUE, TRUE),
('282', '2', 'AMORTISSEMENTS DES TERRAINS', 'debit_normal', '28', FALSE, TRUE),
('2821', '2', 'Amortissements des terrains agricoles et forestiers', 'debit_normal', '282', TRUE, TRUE),
('2824', '2', 'Amortissements des travaux de mise en valeur des terrains', 'debit_normal', '282', TRUE, TRUE),
('2825', '2', 'Amortissements des terrains de gisement', 'debit_normal', '282', TRUE, TRUE),
('283', '2', 'AMORTISSEMENTS DES BATIMENTS, INSTALLATIONS TECHNIQUES ET AGENCEMENTS', 'debit_normal', '28', FALSE, TRUE),
('2831', '2', 'Amortissements des bâtiments industriels, agricoles, administratifs et commerciaux sur sol propre', 'debit_normal', '283', TRUE, TRUE),
('2832', '2', 'Amortissements des bâtiments industriels, agricoles, administratifs et commerciaux sur sol d''autrui', 'debit_normal', '283', TRUE, TRUE),
('2833', '2', 'Amortissements des ouvrages d''infrastructures', 'debit_normal', '283', TRUE, TRUE),
('2834', '2', 'Amortissements des aménagements, agencements et installations techniques', 'debit_normal', '283', TRUE, TRUE),
('2835', '2', 'Amortissements des aménagements de bureaux', 'debit_normal', '283', TRUE, TRUE),
('2837', '2', 'Amortissements des bâtiments industriels, agricoles, administratifs et commerciaux mis en concession', 'debit_normal', '283', TRUE, TRUE),
('2838', '2', 'Amortissements des autres installations et agencements', 'debit_normal', '283', TRUE, TRUE),
('284', '2', 'AMORTISSEMENTS DU MATERIEL', 'debit_normal', '28', FALSE, TRUE),
('2841', '2', 'Amortissements du matériel et outillage industriel et commercial', 'debit_normal', '284', TRUE, TRUE),
('2842', '2', 'Amortissements du matériel et outillage agricole', 'debit_normal', '284', TRUE, TRUE),
('2843', '2', 'Amortissements du matériel d''emballage récupérable et identifiable', 'debit_normal', '284', TRUE, TRUE),
('2844', '2', 'Amortissements du matériel et mobilier', 'debit_normal', '284', TRUE, TRUE),
('2845', '2', 'Amortissements du matériel de transport', 'debit_normal', '284', TRUE, TRUE),
('2846', '2', 'Amortissements des actifs biologiques', 'debit_normal', '284', TRUE, TRUE),
('2847', '2', 'Amortissements des agencements et aménagements du matériel et des actifs biologiques', 'debit_normal', '284', TRUE, TRUE),
('2848', '2', 'Amortissements des autres matériels', 'debit_normal', '284', TRUE, TRUE),
('29', '2', 'DEPRECIATIONS', 'debit_normal', '2', FALSE, TRUE),
('291', '2', 'DEPRECIATIONS DES IMMOBILISATIONS INCORPORELLES', 'debit_normal', '29', FALSE, TRUE),
('2911', '2', 'Dépréciation des frais de développement', 'debit_normal', '291', TRUE, TRUE),
('2912', '2', 'Dépréciations des brevets, licences, concessions et droits similaires', 'debit_normal', '291', TRUE, TRUE),
('2913', '2', 'Dépréciations des logiciels et sites internet', 'debit_normal', '291', TRUE, TRUE),
('2914', '2', 'Dépréciations des marques', 'debit_normal', '291', TRUE, TRUE),
('2915', '2', 'Dépréciations du fonds commercial', 'debit_normal', '291', TRUE, TRUE),
('2916', '2', 'Dépréciations du droit au bail', 'debit_normal', '291', TRUE, TRUE),
('2917', '2', 'Dépréciations des investissements de création', 'debit_normal', '291', TRUE, TRUE),
('2918', '2', 'Dépréciations des autres droits et valeurs incorporels', 'debit_normal', '291', TRUE, TRUE),
('2919', '2', 'Dépréciations des immobilisations incorporelles', 'debit_normal', '291', TRUE, TRUE),
('292', '2', 'DEPRECIATIONS DES TERRAINS', 'debit_normal', '29', FALSE, TRUE),
('2921', '2', 'Dépréciations des terrains agricoles et forestiers', 'debit_normal', '292', TRUE, TRUE),
('2922', '2', 'Dépréciations des terrains nus', 'debit_normal', '292', TRUE, TRUE),
('2923', '2', 'Dépréciations des terrains bâtis', 'debit_normal', '292', TRUE, TRUE),
('2924', '2', 'Dépréciations des travaux de mise en valeur des terrains', 'debit_normal', '292', TRUE, TRUE),
('2925', '2', 'Dépréciations des terrains de gisement', 'debit_normal', '292', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('2926', '2', 'Dépréciations des terrains aménagés', 'debit_normal', '292', TRUE, TRUE),
('2927', '2', 'Dépréciations des terrains mis en concession', 'debit_normal', '292', TRUE, TRUE),
('2928', '2', 'Dépréciations des autres terrains', 'debit_normal', '292', TRUE, TRUE),
('2929', '2', 'Dépréciations des aménagements de terrains en cours', 'debit_normal', '292', TRUE, TRUE),
('293', '2', 'DEPRECIATIONS DES BATIMENTS, INSTALLATIONS TECHNIQUES ET AGENCEMENTS', 'debit_normal', '29', FALSE, TRUE),
('2931', '2', 'Dépréciations des bâtiments industriels, agricoles, administratifs et commerciaux sur sol propre', 'debit_normal', '293', TRUE, TRUE),
('2932', '2', 'Dépréciations des bâtiments industriels, agricoles, administratifs et commerciaux sur sol d''autrui', 'debit_normal', '293', TRUE, TRUE),
('2933', '2', 'Dépréciations des ouvrages d''infrastructures', 'debit_normal', '293', TRUE, TRUE),
('2934', '2', 'Dépréciations des aménagements, agencements et installations techniques', 'debit_normal', '293', TRUE, TRUE),
('2935', '2', 'Dépréciations des aménagements de bureaux', 'debit_normal', '293', TRUE, TRUE),
('2937', '2', 'Dépréciations des bâtiments industriels, agricoles et commerciaux mis en concession', 'debit_normal', '293', TRUE, TRUE),
('2938', '2', 'Dépréciations des autres installations et agencements', 'debit_normal', '293', TRUE, TRUE),
('2939', '2', 'Dépréciations des bâtiments et installations en cours', 'debit_normal', '293', TRUE, TRUE),
('294', '2', 'DEPRECIATIONS DE MATERIEL, DU MOBILIER ET DE L''ACTIF BIOLOGIQUE', 'debit_normal', '29', FALSE, TRUE),
('2941', '2', 'Dépréciations du matériel et outillage industriel et commercial', 'debit_normal', '294', TRUE, TRUE),
('2942', '2', 'Dépréciations du matériel et outillage agricole', 'debit_normal', '294', TRUE, TRUE),
('2943', '2', 'Dépréciations du matériel d''emballage récupérable et identifiable', 'debit_normal', '294', TRUE, TRUE),
('2944', '2', 'Dépréciations du matériel et mobilier', 'debit_normal', '294', TRUE, TRUE),
('2945', '2', 'Dépréciations du matériel de transport', 'debit_normal', '294', TRUE, TRUE),
('2946', '2', 'Dépréciations des actifs biologiques', 'debit_normal', '294', TRUE, TRUE),
('2947', '2', 'Dépréciations des agencements et aménagements du matériel et des actifs biologiques', 'debit_normal', '294', TRUE, TRUE),
('2948', '2', 'Dépréciations des autres matériels', 'debit_normal', '294', TRUE, TRUE),
('2949', '2', 'Dépréciations de matériel en cours', 'debit_normal', '294', TRUE, TRUE),
('295', '2', 'DEPRECIATIONS DES AVANCES ET ACOMPTES VERSES SUR IMMOBILISATIONS', 'debit_normal', '29', FALSE, TRUE),
('2951', '2', 'Dépréciations des avances et acomptes versés sur immobilisations incorporelles', 'debit_normal', '295', TRUE, TRUE),
('2952', '2', 'Dépréciations des avances et acomptes versés sur immobilisations corporelles', 'debit_normal', '295', TRUE, TRUE),
('296', '2', 'DEPRECIATIONS DES TITRES DE PARTICIPATION', 'debit_normal', '29', FALSE, TRUE),
('2961', '2', 'Dépréciations des titres de participation dans des sociétés sous contrôle exclusif', 'debit_normal', '296', TRUE, TRUE),
('2962', '2', 'Dépréciations des titres de participation dans les sociétés sous contrôle conjoint', 'debit_normal', '296', TRUE, TRUE),
('2963', '2', 'Dépréciations des titres de participation dans les sociétés conférant une influence notable', 'debit_normal', '296', TRUE, TRUE),
('2965', '2', 'Dépréciations des participations dans des organismes professionnels', 'debit_normal', '296', TRUE, TRUE),
('2966', '2', 'Dépréciations des parts dans des GIE', 'debit_normal', '296', TRUE, TRUE),
('2968', '2', 'Dépréciations des autres titres de participation', 'debit_normal', '296', TRUE, TRUE),
('297', '2', 'DEPRECIATIONS DES AUTRES IMMOBILISATIONS FINANCIERES', 'debit_normal', '29', FALSE, TRUE),
('2971', '2', 'Dépréciations des prêts et créances', 'debit_normal', '297', TRUE, TRUE),
('2972', '2', 'Dépréciations des prêts au personnel', 'debit_normal', '297', TRUE, TRUE),
('2973', '2', 'Dépréciations des créances sur l''Etat', 'debit_normal', '297', TRUE, TRUE),
('2974', '2', 'Dépréciations des titres immobilisés', 'debit_normal', '297', TRUE, TRUE),
('2975', '2', 'Dépréciations des dépôts et cautionnements versés', 'debit_normal', '297', TRUE, TRUE),
('2977', '2', 'Dépréciations des créances rattachées à des participations et avances à des G.I.E', 'debit_normal', '297', TRUE, TRUE),
('2978', '2', 'Dépréciations des créances financières diverses', 'debit_normal', '297', TRUE, TRUE),
('3', '3', 'COMPTES DE STOCKS', 'debit_normal', NULL, FALSE, TRUE),
('31', '3', 'MARCHANDISES', 'debit_normal', '3', FALSE, TRUE),
('311', '3', 'MARCHANDISES A', 'debit_normal', '31', FALSE, TRUE),
('3111', '3', 'Marchandises A1', 'debit_normal', '311', TRUE, TRUE),
('3112', '3', 'Marchandises A2', 'debit_normal', '311', TRUE, TRUE),
('312', '3', 'MARCHANDISES B', 'debit_normal', '31', FALSE, TRUE),
('3121', '3', 'Marchandises B1', 'debit_normal', '312', TRUE, TRUE),
('3122', '3', 'Marchandises B2', 'debit_normal', '312', TRUE, TRUE),
('318', '3', 'MARCHANDISES HORS ACTIVITES ORDINAIRES (H.A.O.)', 'debit_normal', '31', FALSE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('32', '3', 'MATIERES PREMIERES ET FOURNITURES LIEES', 'debit_normal', '3', FALSE, TRUE),
('321', '3', 'MATIERES A', 'debit_normal', '32', FALSE, TRUE),
('322', '3', 'MATIERES B', 'debit_normal', '32', FALSE, TRUE),
('323', '3', 'FOURNITURES (A,B)', 'debit_normal', '32', FALSE, TRUE),
('33', '3', 'AUTRES APPROVISIONNEMENTS', 'debit_normal', '3', FALSE, TRUE),
('331', '3', 'MATIERES CONSOMMABLES', 'debit_normal', '33', FALSE, TRUE),
('332', '3', 'FOURNITURES D''ATELIER ET D''USINE', 'debit_normal', '33', FALSE, TRUE),
('333', '3', 'FOURNITURES DE MAGASIN', 'debit_normal', '33', FALSE, TRUE),
('334', '3', 'FOURNITURES DE BUREAU', 'debit_normal', '33', FALSE, TRUE),
('335', '3', 'EMBALLAGES', 'debit_normal', '33', FALSE, TRUE),
('3351', '3', 'Emballages perdus', 'debit_normal', '335', TRUE, TRUE),
('3352', '3', 'Emballages récupérables non identifiables', 'debit_normal', '335', TRUE, TRUE),
('3353', '3', 'Emballages à usage mixte', 'debit_normal', '335', TRUE, TRUE),
('3358', '3', 'Autres emballages', 'debit_normal', '335', TRUE, TRUE),
('338', '3', 'AUTRES MATIERES', 'debit_normal', '33', FALSE, TRUE),
('34', '3', 'PRODUITS EN COURS', 'debit_normal', '3', FALSE, TRUE),
('341', '3', 'PRODUITS EN COURS', 'debit_normal', '34', FALSE, TRUE),
('3411', '3', 'Produits en cours P1', 'debit_normal', '341', TRUE, TRUE),
('3412', '3', 'Produits en cours P2', 'debit_normal', '341', TRUE, TRUE),
('342', '3', 'TRAVAUX EN COURS', 'debit_normal', '34', FALSE, TRUE),
('3421', '3', 'Travaux en cours T1', 'debit_normal', '342', TRUE, TRUE),
('3422', '3', 'Travaux en cours T2', 'debit_normal', '342', TRUE, TRUE),
('343', '3', 'PRODUITS INTERMEDIAIRES EN COURS', 'debit_normal', '34', FALSE, TRUE),
('3431', '3', 'Produits intermédiaires A', 'debit_normal', '343', TRUE, TRUE),
('3432', '3', 'Produits intermédiaires B', 'debit_normal', '343', TRUE, TRUE),
('344', '3', 'PRODUITS RESIDUELS EN COURS', 'debit_normal', '34', FALSE, TRUE),
('3441', '3', 'Produits résiduels A', 'debit_normal', '344', TRUE, TRUE),
('3442', '3', 'Produits résiduels B', 'debit_normal', '344', TRUE, TRUE),
('35', '3', 'SERVICES EN COURS', 'debit_normal', '3', FALSE, TRUE),
('351', '3', 'ETUDES EN COURS', 'debit_normal', '35', FALSE, TRUE),
('3511', '3', 'Etudes en cours E1', 'debit_normal', '351', TRUE, TRUE),
('3512', '3', 'Etudes en cours E2', 'debit_normal', '351', TRUE, TRUE),
('352', '3', 'PRESTATIONS DE SERVICES EN COURS', 'debit_normal', '35', FALSE, TRUE),
('3521', '3', 'Prestations de services S1', 'debit_normal', '352', TRUE, TRUE),
('3522', '3', 'Prestations de services S2', 'debit_normal', '352', TRUE, TRUE),
('36', '3', 'PRODUITS FINIS', 'debit_normal', '3', FALSE, TRUE),
('361', '3', 'PRODUITS FINIS A', 'debit_normal', '36', FALSE, TRUE),
('362', '3', 'PRODUITS FINIS B', 'debit_normal', '36', FALSE, TRUE),
('37', '3', 'PRODUITS INTERMEDIAIRES ET RESIDUELS', 'debit_normal', '3', FALSE, TRUE),
('371', '3', 'PRODUITS INTERMEDIAIRES', 'debit_normal', '37', FALSE, TRUE),
('3711', '3', 'Produits intermédiaires A', 'debit_normal', '371', TRUE, TRUE),
('3712', '3', 'Produits intermédiaires B', 'debit_normal', '371', TRUE, TRUE),
('372', '3', 'PRODUITS RESIDUELS', 'debit_normal', '37', FALSE, TRUE),
('3721', '3', 'Déchets', 'debit_normal', '372', TRUE, TRUE),
('3722', '3', 'Rebuts', 'debit_normal', '372', TRUE, TRUE),
('3723', '3', 'Matières de Récupération', 'debit_normal', '372', TRUE, TRUE),
('38', '3', 'STOCKS EN COURS DE ROUTE, EN CONSIGNATION OU EN DEPOT', 'debit_normal', '3', FALSE, TRUE),
('381', '3', 'MARCHANDISES EN COURS DE ROUTE', 'debit_normal', '38', FALSE, TRUE),
('382', '3', 'MATIERES PREMIERES ET FOURNITURES LIEES EN COURS DE ROUTE', 'debit_normal', '38', FALSE, TRUE),
('383', '3', 'AUTRES APPROVISIONNEMENTS EN COURS DE ROUTE', 'debit_normal', '38', FALSE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('386', '3', 'PRODUITS FINIS EN COURS DE ROUTE', 'debit_normal', '38', FALSE, TRUE),
('387', '3', 'STOCK EN CONSIGNATION OU EN DEPOT', 'debit_normal', '38', FALSE, TRUE),
('3871', '3', 'Stock en consignation', 'debit_normal', '387', TRUE, TRUE),
('3872', '3', 'Stock en dépôt', 'debit_normal', '387', TRUE, TRUE),
('388', '3', 'STOCK PROVENANT D''IMMOBILISATIONS MISES HORS SERVICE OU AU REBUT', 'debit_normal', '38', FALSE, TRUE),
('39', '3', 'DEPRECIATIONS DES STOCKS ET EN COURS DE PRODUCTION', 'debit_normal', '3', FALSE, TRUE),
('391', '3', 'DEPRECIATIONS DES STOCKS DE MARCHANDISES', 'debit_normal', '39', FALSE, TRUE),
('392', '3', 'DEPRECIATIONS DES STOCKS DE MATIERES PREMIERES ET FOURNITURES LIEES', 'debit_normal', '39', FALSE, TRUE),
('393', '3', 'DEPRECIATIONS DES STOCKS D''AUTRES APPROVISIONNEMENTS', 'debit_normal', '39', FALSE, TRUE),
('394', '3', 'DEPRECIATIONS DES PRODUCTIONS EN COURS', 'debit_normal', '39', FALSE, TRUE),
('395', '3', 'DEPRECIATIONS DES SERVICES EN COURS', 'debit_normal', '39', FALSE, TRUE),
('396', '3', 'DEPRECIATIONS DES STOCKS DE PRODUITS FINIS', 'debit_normal', '39', FALSE, TRUE),
('397', '3', 'DEPRECIATIONS DES STOCKS DE PRODUITS INTERMEDIAIRES ET RESIDUELS', 'debit_normal', '39', FALSE, TRUE),
('398', '3', 'DEPRECIATIONS DES STOCKS EN COURS DE ROUTE, EN CONSIGNATION OU EN DEPOT', 'debit_normal', '39', FALSE, TRUE),
('4', '4', 'COMPTES DE TIERS', 'credit_normal', NULL, FALSE, TRUE),
('40', '4', 'FOURNISSEURS ET COMPTES RATTACHES', 'credit_normal', '4', FALSE, TRUE),
('401', '4', 'FOURNISSEURS, DETTES EN COMPTE', 'credit_normal', '40', FALSE, TRUE),
('4011', '4', 'Fournisseurs', 'credit_normal', '401', TRUE, TRUE),
('4012', '4', 'Fournisseurs Groupe', 'credit_normal', '401', TRUE, TRUE),
('4013', '4', 'Fournisseurs sous-traitants', 'credit_normal', '401', TRUE, TRUE),
('4017', '4', 'Fournisseur, retenues de garantie', 'credit_normal', '401', TRUE, TRUE),
('402', '4', 'FOURNISSEURS, EFFETS A PAYER', 'credit_normal', '40', FALSE, TRUE),
('4021', '4', 'Fournisseurs, Effets à payer', 'credit_normal', '402', TRUE, TRUE),
('4022', '4', 'Fournisseurs - Groupe, Effets à payer', 'credit_normal', '402', TRUE, TRUE),
('4023', '4', 'Fournisseurs sous-traitants, Effets à payer', 'credit_normal', '402', TRUE, TRUE),
('404', '4', 'FOURNISSEURS D''ACQUISITION COURANTE D''IMMOBILISATION', 'credit_normal', '40', FALSE, TRUE),
('408', '4', 'FOURNISSEURS, FACTURES NON PARVENUES', 'credit_normal', '40', FALSE, TRUE),
('4081', '4', 'Fournisseurs', 'credit_normal', '408', TRUE, TRUE),
('4082', '4', 'Fournisseurs - Groupe', 'credit_normal', '408', TRUE, TRUE),
('4083', '4', 'Fournisseurs sous-traitants', 'credit_normal', '408', TRUE, TRUE),
('4086', '4', 'Fournisseurs, intérêts courus', 'credit_normal', '408', TRUE, TRUE),
('409', '4', 'FOURNISSEURS DEBITEURS', 'credit_normal', '40', FALSE, TRUE),
('4091', '4', 'Fournisseurs avances et acomptes versés', 'credit_normal', '409', TRUE, TRUE),
('4092', '4', 'Fournisseurs - Groupe avances et acomptes versés', 'credit_normal', '409', TRUE, TRUE),
('4093', '4', 'Fournisseurs sous-traitants avances et acomptes versés', 'credit_normal', '409', TRUE, TRUE),
('4094', '4', 'Fournisseurs créances pour emballages et matériels à rendre', 'credit_normal', '409', TRUE, TRUE),
('4098', '4', 'Rabais, Remises, Ristournes et autres avoirs à obtenir', 'credit_normal', '409', TRUE, TRUE),
('41', '4', 'CLIENTS ET COMPTES RATTACHES', 'debit_normal', '4', FALSE, TRUE),
('411', '4', 'CLIENTS', 'debit_normal', '41', FALSE, TRUE),
('4111', '4', 'Clients', 'debit_normal', '411', TRUE, TRUE),
('4112', '4', 'Clients - Groupe', 'debit_normal', '411', TRUE, TRUE),
('4114', '4', 'Clients, État et Collectivités publiques', 'debit_normal', '411', TRUE, TRUE),
('4115', '4', 'Clients, organismes internationaux', 'debit_normal', '411', TRUE, TRUE),
('4116', '4', 'Clients ventes avec réserves de propriété', 'debit_normal', '411', TRUE, TRUE),
('4117', '4', 'Client, retenues de garantie', 'debit_normal', '411', TRUE, TRUE),
('4118', '4', 'Clients, dégrèvement de Taxes sur la Valeur Ajoutée (T.V.A.)', 'debit_normal', '411', TRUE, TRUE),
('412', '4', 'CLIENTS, EFFETS A RECEVOIR EN PORTEFEUILLE', 'debit_normal', '41', FALSE, TRUE),
('4121', '4', 'Clients, Effets à recevoir', 'debit_normal', '412', TRUE, TRUE),
('4122', '4', 'Clients - Groupe, Effets à recevoir', 'debit_normal', '412', TRUE, TRUE),
('4124', '4', 'État et Collectivités publiques, Effets à recevoir', 'debit_normal', '412', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('4125', '4', 'Organismes internationaux, Effets à recevoir', 'debit_normal', '412', TRUE, TRUE),
('4126', '4', 'Clients, vente avec réserve de propriété effets à recevoir', 'debit_normal', '412', TRUE, TRUE),
('413', '4', 'CLIENTS, CHEQUES, EFFETS ET AUTRES VALEURS IMPAYES', 'debit_normal', '41', FALSE, TRUE),
('4131', '4', 'Chèques impayés', 'debit_normal', '413', TRUE, TRUE),
('4132', '4', 'Effets impayés', 'debit_normal', '413', TRUE, TRUE),
('4133', '4', 'Cartes de crédit impayés', 'debit_normal', '413', TRUE, TRUE),
('414', '4', 'CREANCES SUR CESSIONS COURANTES D''IMMOBILISATIONS', 'debit_normal', '41', FALSE, TRUE),
('4141', '4', 'Créances en compte', 'debit_normal', '414', TRUE, TRUE),
('4142', '4', 'Effets à recevoir', 'debit_normal', '414', TRUE, TRUE),
('415', '4', 'CLIENTS, EFFETS ESCOMPTES NON ECHUS', 'debit_normal', '41', FALSE, TRUE),
('416', '4', 'CREANCES CLIENTS LITIGIEUSES OU DOUTEUSES', 'debit_normal', '41', FALSE, TRUE),
('4161', '4', 'Créances litigieuses', 'debit_normal', '416', TRUE, TRUE),
('4162', '4', 'Créances douteuses', 'debit_normal', '416', TRUE, TRUE),
('418', '4', 'CLIENTS, PRODUITS A RECEVOIR', 'debit_normal', '41', FALSE, TRUE),
('4181', '4', 'Clients, factures à établir', 'debit_normal', '418', TRUE, TRUE),
('4186', '4', 'Clients, intérêts courus', 'debit_normal', '418', TRUE, TRUE),
('419', '4', 'CLIENTS CREDITEURS', 'debit_normal', '41', FALSE, TRUE),
('4191', '4', 'Clients, avances et acomptes reçus', 'debit_normal', '419', TRUE, TRUE),
('4192', '4', 'Clients - Groupe, avances et acomptes reçus', 'debit_normal', '419', TRUE, TRUE),
('4194', '4', 'Clients, dettes pour emballages et matériels consignés', 'debit_normal', '419', TRUE, TRUE),
('4198', '4', 'Rabais, Remises, Ristournes et autres avoirs à accorder', 'debit_normal', '419', TRUE, TRUE),
('42', '4', 'PERSONNEL', 'credit_normal', '4', FALSE, TRUE),
('421', '4', 'PERSONNEL, AVANCES ET ACOMPTES', 'credit_normal', '42', FALSE, TRUE),
('4211', '4', 'Personnel, avances', 'credit_normal', '421', TRUE, TRUE),
('4212', '4', 'Personnel, acomptes', 'credit_normal', '421', TRUE, TRUE),
('4213', '4', 'Frais avancés et fournitures au personnel', 'credit_normal', '421', TRUE, TRUE),
('422', '4', 'PERSONNEL, REMUNERATIONS DUES', 'credit_normal', '42', FALSE, TRUE),
('423', '4', 'PERSONNEL, OPPOSITIONS, SAISIES-ARRETS', 'credit_normal', '42', FALSE, TRUE),
('4231', '4', 'Personnel, oppositions', 'credit_normal', '423', TRUE, TRUE),
('4232', '4', 'Personnel, saisies-arrêts', 'credit_normal', '423', TRUE, TRUE),
('4233', '4', 'Personnel, avis à tiers détenteur', 'credit_normal', '423', TRUE, TRUE),
('424', '4', 'PERSONNEL, OEUVRES SOCIALES INTERNES', 'credit_normal', '42', FALSE, TRUE),
('4241', '4', 'Assistance médicale', 'credit_normal', '424', TRUE, TRUE),
('4242', '4', 'Allocations familiales', 'credit_normal', '424', TRUE, TRUE),
('4245', '4', 'Organismes sociaux rattachés à l''entreprise', 'credit_normal', '424', TRUE, TRUE),
('4248', '4', 'Autres oeuvres sociales internes', 'credit_normal', '424', TRUE, TRUE),
('425', '4', 'REPRESENTANTS DU PERSONNEL', 'credit_normal', '42', FALSE, TRUE),
('4251', '4', 'Délégués du personnel', 'credit_normal', '425', TRUE, TRUE),
('4252', '4', 'Syndicats et Comités d''entreprises, d''Établissement', 'credit_normal', '425', TRUE, TRUE),
('4258', '4', 'Autres représentants du personnel', 'credit_normal', '425', TRUE, TRUE),
('426', '4', 'PERSONNEL, PARTICIPATION AU BENEFICES ET AU CAPITAL', 'credit_normal', '42', FALSE, TRUE),
('4261', '4', 'Participation au bénéfices', 'credit_normal', '426', TRUE, TRUE),
('4264', '4', 'Participation au capital', 'credit_normal', '426', TRUE, TRUE),
('427', '4', 'PERSONNEL – DEPOTS', 'credit_normal', '42', FALSE, TRUE),
('428', '4', 'PERSONNEL, CHARGES A PAYER ET PRODUITS A RECEVOIR', 'credit_normal', '42', FALSE, TRUE),
('4281', '4', 'Dettes provisionnées pour congés à payer', 'credit_normal', '428', TRUE, TRUE),
('4286', '4', 'Autres Charges à payer', 'credit_normal', '428', TRUE, TRUE),
('4287', '4', 'Produits à recevoir', 'credit_normal', '428', TRUE, TRUE),
('43', '4', 'ORGANISMES SOCIAUX', 'credit_normal', '4', FALSE, TRUE),
('431', '4', 'SECURITE SOCIALE', 'credit_normal', '43', FALSE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('4311', '4', 'Prestations familiales', 'credit_normal', '431', TRUE, TRUE),
('4312', '4', 'Accidents de travail', 'credit_normal', '431', TRUE, TRUE),
('4313', '4', 'Caisse de retraite obligatoire', 'credit_normal', '431', TRUE, TRUE),
('4314', '4', 'Caisse de retraite facultative', 'credit_normal', '431', TRUE, TRUE),
('4318', '4', 'Autres cotisations sociales', 'credit_normal', '431', TRUE, TRUE),
('432', '4', 'CAISSES DE RETRAITE COMPLEMENTAIRE', 'credit_normal', '43', FALSE, TRUE),
('433', '4', 'AUTRES ORGANISMES SOCIAUX', 'credit_normal', '43', FALSE, TRUE),
('4331', '4', 'Mutuelle', 'credit_normal', '433', TRUE, TRUE),
('4332', '4', 'Assurances Retraite', 'credit_normal', '433', TRUE, TRUE),
('4333', '4', 'Assurances et organisme de santé', 'credit_normal', '433', TRUE, TRUE),
('438', '4', 'ORGANISMES SOCIAUX, CHARGES A PAYER ET PRODUITS A RECEVOIR', 'credit_normal', '43', FALSE, TRUE),
('4381', '4', 'Charges sociales sur gratifications à payer', 'credit_normal', '438', TRUE, TRUE),
('4382', '4', 'Charges sociales sur congés à payer', 'credit_normal', '438', TRUE, TRUE),
('4386', '4', 'Autres charges à payer', 'credit_normal', '438', TRUE, TRUE),
('4387', '4', 'Produits à recevoir', 'credit_normal', '438', TRUE, TRUE),
('44', '4', 'ETAT ET COLLECTIVITES PUBLIQUES', 'credit_normal', '4', FALSE, TRUE),
('441', '4', 'ETAT, IMPOT SUR LES BENEFICES', 'credit_normal', '44', FALSE, TRUE),
('442', '4', 'ETAT, AUTRES IMPOTS ET TAXES', 'credit_normal', '44', FALSE, TRUE),
('4421', '4', 'Impôts et taxes d''Etat', 'credit_normal', '442', TRUE, TRUE),
('4422', '4', 'Impôts et taxes pour les collectivités publiques', 'credit_normal', '442', TRUE, TRUE),
('4423', '4', 'Impôts et taxes recouvrables sur des obligataires', 'credit_normal', '442', TRUE, TRUE),
('4424', '4', 'Impôts et taxes recouvrables sur des associés', 'credit_normal', '442', TRUE, TRUE),
('4426', '4', 'Droits de douane', 'credit_normal', '442', TRUE, TRUE),
('4428', '4', 'Autres impôts et taxes', 'credit_normal', '442', TRUE, TRUE),
('443', '4', 'ETAT, T.V.A. FACTUREE', 'credit_normal', '44', FALSE, TRUE),
('4431', '4', 'T.V.A. facturée sur ventes', 'credit_normal', '443', TRUE, TRUE),
('4432', '4', 'T.V.A. facturée sur prestations de services', 'credit_normal', '443', TRUE, TRUE),
('4433', '4', 'T.V.A. facturée sur travaux', 'credit_normal', '443', TRUE, TRUE),
('4434', '4', 'T.V.A. facturée sur production livrée à soi-même', 'credit_normal', '443', TRUE, TRUE),
('4435', '4', 'T.V.A. sur factures à établir', 'credit_normal', '443', TRUE, TRUE),
('444', '4', 'ETAT, T.V.A. DUE OU CREDIT DE T.V.A.', 'credit_normal', '44', FALSE, TRUE),
('4441', '4', 'État, T.V.A. due', 'credit_normal', '444', TRUE, TRUE),
('4449', '4', 'État, crédit de T.V.A. à reporter', 'credit_normal', '444', TRUE, TRUE),
('445', '4', 'ETAT, T.V.A. RECUPERABLE', 'credit_normal', '44', FALSE, TRUE),
('4451', '4', 'T.V.A. récupérable sur immobilisations', 'credit_normal', '445', TRUE, TRUE),
('4452', '4', 'T.V.A. récupérable sur achats', 'credit_normal', '445', TRUE, TRUE),
('4453', '4', 'T.V.A. récupérable sur transport', 'credit_normal', '445', TRUE, TRUE),
('4454', '4', 'T.V.A. récupérable sur services extérieurs et autres charges', 'credit_normal', '445', TRUE, TRUE),
('4455', '4', 'T.V.A. récupérable sur factures non parvenues', 'credit_normal', '445', TRUE, TRUE),
('4456', '4', 'T.V.A. transférée par d''autres entreprises', 'credit_normal', '445', TRUE, TRUE),
('446', '4', 'ETAT, AUTRES TAXES SUR LE CHIFFRE D''AFFAIRES', 'credit_normal', '44', FALSE, TRUE),
('447', '4', 'ETAT, IMPOTS RETENUS A LA SOURCE', 'credit_normal', '44', FALSE, TRUE),
('4471', '4', 'Impôt Général sur le revenu', 'credit_normal', '447', TRUE, TRUE),
('4472', '4', 'Impôts sur salaires', 'credit_normal', '447', TRUE, TRUE),
('4473', '4', 'Contribution nationale', 'credit_normal', '447', TRUE, TRUE),
('4474', '4', 'Contribution nationale de solidarité', 'credit_normal', '447', TRUE, TRUE),
('4478', '4', 'Autres impôts et contributions', 'credit_normal', '447', TRUE, TRUE),
('448', '4', 'ETAT, CHARGES A PAYER ET PRODUITS A RECEVOIR', 'credit_normal', '44', FALSE, TRUE),
('4486', '4', 'Charges à payer', 'credit_normal', '448', TRUE, TRUE),
('4487', '4', 'Produits à recevoir', 'credit_normal', '448', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('449', '4', 'ETAT, CREANCES ET DETTES DIVERSES', 'credit_normal', '44', FALSE, TRUE),
('4491', '4', 'État, obligations cautionnées', 'credit_normal', '449', TRUE, TRUE),
('4492', '4', 'État, avances et acomptes versés sur impôts', 'credit_normal', '449', TRUE, TRUE),
('4493', '4', 'État, fonds de dotation à recevoir', 'credit_normal', '449', TRUE, TRUE),
('4494', '4', 'État, subventions d''équipement à recevoir', 'credit_normal', '449', TRUE, TRUE),
('4495', '4', 'État, subventions d''exploitation à recevoir', 'credit_normal', '449', TRUE, TRUE),
('4496', '4', 'État, subventions d''équilibre à recevoir', 'credit_normal', '449', TRUE, TRUE),
('4497', '4', 'État avances sur subventions', 'credit_normal', '449', TRUE, TRUE),
('4499', '4', 'État, fonds réglementé provisionné', 'credit_normal', '449', TRUE, TRUE),
('45', '4', 'ORGANISMES INTERNATIONAUX', 'credit_normal', '4', FALSE, TRUE),
('451', '4', 'OPERATIONS AVEC LES ORGANISMES AFRICAINS', 'credit_normal', '45', FALSE, TRUE),
('452', '4', 'OPERATIONS AVEC LES AUTRES ORGANISMES INTERNATIONAUX', 'credit_normal', '45', FALSE, TRUE),
('458', '4', 'ORGANISMES INTERNATIONAUX, FONDS DE DOTATION ET SUBVENTIONS A RECEVOIR', 'credit_normal', '45', FALSE, TRUE),
('4581', '4', 'Organismes internationaux, fonds de dotation à recevoir', 'credit_normal', '458', TRUE, TRUE),
('4582', '4', 'Organismes internationaux, subventions à recevoir', 'credit_normal', '458', TRUE, TRUE),
('46', '4', 'APPORTEUR, ASSOCIES ET GROUPE', 'credit_normal', '4', FALSE, TRUE),
('461', '4', 'APPORTEUR, OPERATIONS SUR LE CAPITAL', 'credit_normal', '46', FALSE, TRUE),
('4611', '4', 'Apporteurs apports en nature', 'credit_normal', '461', TRUE, TRUE),
('4612', '4', 'Apporteurs apports en numéraire', 'credit_normal', '461', TRUE, TRUE),
('4613', '4', 'Apporteurs, capital souscrit appelé non versé', 'credit_normal', '461', TRUE, TRUE),
('4614', '4', 'Apporteurs, capital appelé non versé', 'credit_normal', '461', TRUE, TRUE),
('4615', '4', 'Apporteurs, versements reçus sur augmentation de capital', 'credit_normal', '461', TRUE, TRUE),
('4616', '4', 'Apporteurs, versements anticipés', 'credit_normal', '461', TRUE, TRUE),
('4617', '4', 'Apporteurs défaillants', 'credit_normal', '461', TRUE, TRUE),
('4618', '4', 'Apporteurs, autres apports', 'credit_normal', '461', TRUE, TRUE),
('4619', '4', 'Apporteurs, capital à rembourser', 'credit_normal', '461', TRUE, TRUE),
('462', '4', 'ASSOCIES, COMPTES COURANTS', 'credit_normal', '46', FALSE, TRUE),
('4621', '4', 'Principal', 'credit_normal', '462', TRUE, TRUE),
('4626', '4', 'Intérêts courus', 'credit_normal', '462', TRUE, TRUE),
('463', '4', 'ASSOCIES, OPERATIONS FAITES EN COMMUN', 'credit_normal', '46', FALSE, TRUE),
('4631', '4', 'Associés, opérations faites en commun et GIE', 'credit_normal', '463', TRUE, TRUE),
('465', '4', 'ASSOCIES, DIVIDENDES A PAYER', 'credit_normal', '46', FALSE, TRUE),
('466', '4', 'GROUPE, COMPTES COURANTS', 'credit_normal', '46', FALSE, TRUE),
('467', '4', 'ACTIONNAIRES, RESTANT DU SUR CAPITAL APPELE', 'credit_normal', '46', FALSE, TRUE),
('47', '4', 'DEBITEURS ET CREDITEURS DIVERS', 'credit_normal', '4', FALSE, TRUE),
('471', '4', 'DEBITEURS ET CREDITEURS DIVERS', 'credit_normal', '47', FALSE, TRUE),
('4711', '4', 'Débiteurs divers', 'credit_normal', '471', TRUE, TRUE),
('4712', '4', 'Créditeurs divers', 'credit_normal', '471', TRUE, TRUE),
('4713', '4', 'Obligataires', 'credit_normal', '471', TRUE, TRUE),
('4715', '4', 'Rémunération d''administrateurs', 'credit_normal', '471', TRUE, TRUE),
('4716', '4', 'Compte du factor', 'credit_normal', '471', TRUE, TRUE),
('4717', '4', 'Débiteurs divers - retenues de garantie', 'credit_normal', '471', TRUE, TRUE),
('4718', '4', 'Apport, compte de restructuration', 'credit_normal', '471', TRUE, TRUE),
('4719', '4', 'Bons de souscription d''actions et obligations', 'credit_normal', '471', TRUE, TRUE),
('472', '4', 'VERSEMENTS RESTANT A EFFECTUER SUR TITRES DE PLACEMENT NON LIBERES', 'credit_normal', '47', FALSE, TRUE),
('473', '4', 'INTERMEDIAIRE - OPERATIONS FAITES POUR LE COMPTE DE TIERS', 'credit_normal', '47', FALSE, TRUE),
('4731', '4', 'Mandants', 'credit_normal', '473', TRUE, TRUE),
('4732', '4', 'Mandataires', 'credit_normal', '473', TRUE, TRUE),
('4733', '4', 'Commentants', 'credit_normal', '473', TRUE, TRUE),
('4734', '4', 'Commissionnaires', 'credit_normal', '473', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('474', '4', 'REPARTITION PERIODIQUE DES CHARGES ET DES PRODUITS', 'credit_normal', '47', FALSE, TRUE),
('4746', '4', 'Charges', 'credit_normal', '474', TRUE, TRUE),
('4747', '4', 'Produits', 'credit_normal', '474', TRUE, TRUE),
('475', '4', 'COMPTE TRANSITOIRE, AJUSTEMENT SPECIAL LIE A LA REVISION DU SYSCOHADA', 'credit_normal', '47', FALSE, TRUE),
('4751', '4', 'Compte actif', 'credit_normal', '475', TRUE, TRUE),
('4752', '4', 'Compte passif', 'credit_normal', '475', TRUE, TRUE),
('476', '4', 'CHARGES CONSTATEES D''AVANCE', 'credit_normal', '47', FALSE, TRUE),
('477', '4', 'PRODUITS CONSTATES D''AVANCE', 'credit_normal', '47', FALSE, TRUE),
('478', '4', 'ECARTS DE CONVERSION - ACTIF', 'credit_normal', '47', FALSE, TRUE),
('4781', '4', 'Diminution des créances d''exploitation', 'credit_normal', '478', TRUE, TRUE),
('4782', '4', 'Diminution des créances financières', 'credit_normal', '478', TRUE, TRUE),
('4783', '4', 'Augmentation des dettes d''exploitation', 'credit_normal', '478', TRUE, TRUE),
('4784', '4', 'Augmentation des dettes financières', 'credit_normal', '478', TRUE, TRUE),
('4786', '4', 'Différences d''évaluation sur instruments de trésorerie- Actif', 'credit_normal', '478', TRUE, TRUE),
('4788', '4', 'Différences compensées par couverture de change', 'credit_normal', '478', TRUE, TRUE),
('479', '4', 'ECARTS DE CONVERSION - PASSIF', 'credit_normal', '47', FALSE, TRUE),
('4791', '4', 'Augmentation des créances d''exploitation', 'credit_normal', '479', TRUE, TRUE),
('4792', '4', 'Augmentation des créances financières', 'credit_normal', '479', TRUE, TRUE),
('4793', '4', 'Diminution des dettes d''exploitation', 'credit_normal', '479', TRUE, TRUE),
('4794', '4', 'Diminution des dettes financières', 'credit_normal', '479', TRUE, TRUE),
('4797', '4', 'Différences d''évaluation sur instruments de trésorerie- Passif', 'credit_normal', '479', TRUE, TRUE),
('4798', '4', 'Différences compensées par couverture de change', 'credit_normal', '479', TRUE, TRUE),
('48', '4', 'CREANCES ET DETTES HORS ACTIVITES ORDINAIRES (HAO)', 'credit_normal', '4', FALSE, TRUE),
('481', '4', 'FOURNISSEURS D''INVESTISSEMENTS', 'credit_normal', '48', FALSE, TRUE),
('4811', '4', 'Immobilisations incorporelles', 'credit_normal', '481', TRUE, TRUE),
('4812', '4', 'Immobilisations corporelles', 'credit_normal', '481', TRUE, TRUE),
('4813', '4', 'Versement restant à effectuer sur titres de participation et titres immobilisés non libérés', 'credit_normal', '481', TRUE, TRUE),
('4816', '4', 'Réserves de propriété', 'credit_normal', '481', TRUE, TRUE),
('4817', '4', 'Retenues de garantie', 'credit_normal', '481', TRUE, TRUE),
('4818', '4', 'Factures non parvenues', 'credit_normal', '481', TRUE, TRUE),
('482', '4', 'FOURNISSEURS D''INVESTISSEMENTS, EFFETS A PAYER', 'credit_normal', '48', FALSE, TRUE),
('484', '4', 'AUTRES DETTES HORS ACTIVITES ORDINAIRES (H.A.O.)', 'credit_normal', '48', FALSE, TRUE),
('485', '4', 'CREANCES SUR CESSIONS D''IMMOBILISATIONS', 'credit_normal', '48', FALSE, TRUE),
('4851', '4', 'En compte', 'credit_normal', '485', TRUE, TRUE),
('4852', '4', 'Effets à recevoir', 'credit_normal', '485', TRUE, TRUE),
('4855', '4', 'Effets escomptés non échus', 'credit_normal', '485', TRUE, TRUE),
('4856', '4', 'Financières', 'credit_normal', '485', TRUE, TRUE),
('4857', '4', 'Retenues de garantie', 'credit_normal', '485', TRUE, TRUE),
('4858', '4', 'Factures à établir', 'credit_normal', '485', TRUE, TRUE),
('488', '4', 'AUTRES CREANCES HORS ACTIVITES ORDINAIRES (H.A.O.)', 'credit_normal', '48', FALSE, TRUE),
('49', '4', 'DEPRECIATIONS ET RISQUES PROVISIONNES (TIERS)', 'credit_normal', '4', FALSE, TRUE),
('490', '4', 'DEPRECIATIONS DES COMPTES FOURNISSEURS', 'credit_normal', '49', FALSE, TRUE),
('491', '4', 'DEPRECIATIONS DES COMPTES CLIENTS', 'credit_normal', '49', FALSE, TRUE),
('4911', '4', 'Créances litigieuses', 'credit_normal', '491', TRUE, TRUE),
('4912', '4', 'Créances douteuses', 'credit_normal', '491', TRUE, TRUE),
('492', '4', 'DEPRECIATIONS DES COMPTES PERSONNEL', 'credit_normal', '49', FALSE, TRUE),
('493', '4', 'DEPRECIATIONS DES COMPTES ORGANISMES SOCIAUX', 'credit_normal', '49', FALSE, TRUE),
('494', '4', 'DEPRECIATIONS DES COMPTES ETAT ET COLLECTIVITES PUBLIQUES', 'credit_normal', '49', FALSE, TRUE),
('495', '4', 'DEPRECIATIONS DES COMPTES ORGANISMES INTERNATIONAUX', 'credit_normal', '49', FALSE, TRUE),
('496', '4', 'DEPRECIATIONS DES COMPTES ASSOCIES ET GROUPE', 'credit_normal', '49', FALSE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('4962', '4', 'Associés, comptes courants', 'credit_normal', '496', TRUE, TRUE),
('4963', '4', 'Associés, opérations faites en commun', 'credit_normal', '496', TRUE, TRUE),
('4966', '4', 'Groupe, comptes courants', 'credit_normal', '496', TRUE, TRUE),
('497', '4', 'DEPRECIATIONS DES COMPTES DEBITEURS DIVERS', 'credit_normal', '49', FALSE, TRUE),
('498', '4', 'DEPRECIATIONS DES COMPTES DE CREANCES H.A.O.', 'credit_normal', '49', FALSE, TRUE),
('4981', '4', 'Créances sur cessions d''immobilisations', 'credit_normal', '498', TRUE, TRUE),
('4982', '4', 'Créances sur cessions de titres de placement', 'credit_normal', '498', TRUE, TRUE),
('4983', '4', 'Autres créances H.A.O.', 'credit_normal', '498', TRUE, TRUE),
('499', '4', 'PROVISIONS POUR RISQUES A COURT TERME', 'credit_normal', '49', FALSE, TRUE),
('4991', '4', 'Sur opérations d''exploitation', 'credit_normal', '499', TRUE, TRUE),
('4998', '4', 'Sur opérations H.A.O.', 'credit_normal', '499', TRUE, TRUE),
('5', '5', 'COMPTES DE TRESORERIE', 'debit_normal', NULL, FALSE, TRUE),
('50', '5', 'TITRES DE PLACEMENT', 'debit_normal', '5', FALSE, TRUE),
('501', '5', 'TITRES DU TRESOR ET BONS DE CAISSE A COURT TERME', 'debit_normal', '50', FALSE, TRUE),
('5011', '5', 'Titres du Trésor à court terme', 'debit_normal', '501', TRUE, TRUE),
('5012', '5', 'Titres d''organismes financiers', 'debit_normal', '501', TRUE, TRUE),
('5013', '5', 'Bons de caisse à court terme', 'debit_normal', '501', TRUE, TRUE),
('5016', '5', 'frais d''acquisition des titres de trésor et bons de caisse', 'debit_normal', '501', TRUE, TRUE),
('502', '5', 'ACTIONS', 'debit_normal', '50', FALSE, TRUE),
('5021', '5', 'Actions ou parts propres', 'debit_normal', '502', TRUE, TRUE),
('5022', '5', 'Actions cotées', 'debit_normal', '502', TRUE, TRUE),
('5023', '5', 'Actions non cotées', 'debit_normal', '502', TRUE, TRUE),
('5024', '5', 'Actions démembrées (certificats d''investissements; droits de vote)', 'debit_normal', '502', TRUE, TRUE),
('5025', '5', 'Autres actions', 'debit_normal', '502', TRUE, TRUE),
('5026', '5', 'Frais d''acquisition des actions', 'debit_normal', '502', TRUE, TRUE),
('503', '5', 'OBLIGATIONS', 'debit_normal', '50', FALSE, TRUE),
('5031', '5', 'Obligations émises par la société et rachetées par elle', 'debit_normal', '503', TRUE, TRUE),
('5032', '5', 'Obligations cotées', 'debit_normal', '503', TRUE, TRUE),
('5033', '5', 'Obligations non cotées', 'debit_normal', '503', TRUE, TRUE),
('5035', '5', 'Autres obligations', 'debit_normal', '503', TRUE, TRUE),
('5036', '5', 'Frais d''acquisition des obligations', 'debit_normal', '503', TRUE, TRUE),
('504', '5', 'BONS DE SOUSCRIPTION', 'debit_normal', '50', FALSE, TRUE),
('5042', '5', 'Bons de souscription d''actions', 'debit_normal', '504', TRUE, TRUE),
('5043', '5', 'Bons de souscription d''obligations', 'debit_normal', '504', TRUE, TRUE),
('505', '5', 'TITRES NEGOCIABLES HORS REGION', 'debit_normal', '50', FALSE, TRUE),
('506', '5', 'INTERETS COURUS', 'debit_normal', '50', FALSE, TRUE),
('5061', '5', 'Titres du trésor et bons de caisse à court terme', 'debit_normal', '506', TRUE, TRUE),
('5062', '5', 'Actions', 'debit_normal', '506', TRUE, TRUE),
('5063', '5', 'Obligations', 'debit_normal', '506', TRUE, TRUE),
('508', '5', 'AUTRES VALEURS ASSIMILEES', 'debit_normal', '50', FALSE, TRUE),
('51', '5', 'VALEURS A ENCAISSER', 'debit_normal', '5', FALSE, TRUE),
('511', '5', 'EFFETS A ENCAISSER', 'debit_normal', '51', FALSE, TRUE),
('512', '5', 'EFFETS A L''ENCAISSEMENT', 'debit_normal', '51', FALSE, TRUE),
('513', '5', 'CHEQUES A ENCAISSER', 'debit_normal', '51', FALSE, TRUE),
('514', '5', 'CHEQUES A L''ENCAISSEMENT', 'debit_normal', '51', FALSE, TRUE),
('515', '5', 'CARTES DE CREDIT A ENCAISSER', 'debit_normal', '51', FALSE, TRUE),
('518', '5', 'AUTRES VALEURS A L''ENCAISSEMENT', 'debit_normal', '51', FALSE, TRUE),
('5181', '5', 'Warrants', 'debit_normal', '518', TRUE, TRUE),
('5182', '5', 'Billets de fonds', 'debit_normal', '518', TRUE, TRUE),
('5185', '5', 'Chèques de voyage', 'debit_normal', '518', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('5186', '5', 'Coupons échus', 'debit_normal', '518', TRUE, TRUE),
('5187', '5', 'Intérêts échus des obligations', 'debit_normal', '518', TRUE, TRUE),
('52', '5', 'BANQUES', 'debit_normal', '5', FALSE, TRUE),
('521', '5', 'BANQUES LOCALES', 'debit_normal', '52', FALSE, TRUE),
('5211', '5', 'Banques X', 'debit_normal', '521', TRUE, TRUE),
('5212', '5', 'Banques Y', 'debit_normal', '521', TRUE, TRUE),
('5215', '5', 'Banques en devises', 'debit_normal', '521', TRUE, TRUE),
('522', '5', 'BANQUES AUTRES ETATS REGION', 'debit_normal', '52', FALSE, TRUE),
('523', '5', 'BANQUES AUTRES ETATS ZONE MONETAIRE', 'debit_normal', '52', FALSE, TRUE),
('524', '5', 'BANQUES HORS ZONE MONETAIRE', 'debit_normal', '52', FALSE, TRUE),
('525', '5', 'BANQUES DEPOTS A TERME', 'debit_normal', '52', FALSE, TRUE),
('526', '5', 'BANQUES, INTERETS COURUS', 'debit_normal', '52', FALSE, TRUE),
('53', '5', 'ETABLISSEMENTS FINANCIERS ET ASSIMILES', 'debit_normal', '5', FALSE, TRUE),
('531', '5', 'CHEQUES POSTAUX', 'debit_normal', '53', FALSE, TRUE),
('532', '5', 'TRESOR', 'debit_normal', '53', FALSE, TRUE),
('533', '5', 'SOCIETES DE GESTION ET D''INTERMEDIATION (S.G.I.)', 'debit_normal', '53', FALSE, TRUE),
('536', '5', 'ETABLISSEMENTS FINANCIERS, INTERETS COURUS', 'debit_normal', '53', FALSE, TRUE),
('54', '5', 'INSTRUMENTS DE TRESORERIE', 'debit_normal', '5', FALSE, TRUE),
('541', '5', 'OPTIONS DE TAUX D''INTERET', 'debit_normal', '54', FALSE, TRUE),
('542', '5', 'OPTIONS DE TAUX DE CHANGE', 'debit_normal', '54', FALSE, TRUE),
('543', '5', 'OPTIONS DE TAUX BOURSIERS', 'debit_normal', '54', FALSE, TRUE),
('544', '5', 'INSTRUMENTS DE MARCHES A TERME', 'debit_normal', '54', FALSE, TRUE),
('545', '5', 'AVOIRS D''OR ET AUTRES METAUX PRECIEUX (1)', 'debit_normal', '54', FALSE, TRUE),
('55', '5', 'INSTRUMENTS DE MONNAIE ELECTRONIQUE', 'debit_normal', '5', FALSE, TRUE),
('551', '5', 'MONNAIE ELECTRONIQUE-CARTE CARBURANT', 'debit_normal', '55', FALSE, TRUE),
('552', '5', 'MONNAIE ELECTRONIQUE-TELEPHONE PORTABLE', 'debit_normal', '55', FALSE, TRUE),
('553', '5', 'MONNAIE ELECTRONIQUE-CARTE PEAGE', 'debit_normal', '55', FALSE, TRUE),
('554', '5', 'PORTE-MONNAIE ELECTRONIQUE', 'debit_normal', '55', FALSE, TRUE),
('558', '5', 'AUTRES INSTRUMENTS MONNAIES ELECTRONIQUES', 'debit_normal', '55', FALSE, TRUE),
('56', '5', 'BANQUES, CREDITS DE TRESORERIE ET D''ESCOMPTE', 'debit_normal', '5', FALSE, TRUE),
('561', '5', 'CREDITS DE TRESORERIE', 'debit_normal', '56', FALSE, TRUE),
('564', '5', 'ESCOMPTE DE CREDITS DE CAMPAGNE', 'debit_normal', '56', FALSE, TRUE),
('565', '5', 'ESCOMPTE DE CREDITS ORDINAIRES', 'debit_normal', '56', FALSE, TRUE),
('566', '5', 'BANQUES, CREDITS DE TRESORERIE, INTERETS COURUS', 'debit_normal', '56', FALSE, TRUE),
('57', '5', 'CAISSE', 'debit_normal', '5', FALSE, TRUE),
('571', '5', 'CAISSE SIEGE SOCIAL', 'debit_normal', '57', FALSE, TRUE),
('5711', '5', 'en unités monétaires légales', 'debit_normal', '571', TRUE, TRUE),
('5712', '5', 'en devises', 'debit_normal', '571', TRUE, TRUE),
('572', '5', 'CAISSE SUCCURSALE A', 'debit_normal', '57', FALSE, TRUE),
('5721', '5', 'en unités monétaires légales', 'debit_normal', '572', TRUE, TRUE),
('5722', '5', 'en devises', 'debit_normal', '572', TRUE, TRUE),
('573', '5', 'CAISSE SUCCURSALE B', 'debit_normal', '57', FALSE, TRUE),
('5731', '5', 'en unités monétaires légales', 'debit_normal', '573', TRUE, TRUE),
('5732', '5', 'en devises', 'debit_normal', '573', TRUE, TRUE),
('58', '5', 'REGIES D''AVANCE, ACCREDITIFS ET VIREMENTS INTERNES', 'debit_normal', '5', FALSE, TRUE),
('581', '5', 'REGIES D''AVANCE', 'debit_normal', '58', FALSE, TRUE),
('582', '5', 'ACCREDITIFS', 'debit_normal', '58', FALSE, TRUE),
('585', '5', 'VIREMENTS DE FONDS', 'debit_normal', '58', FALSE, TRUE),
('588', '5', 'AUTRES VIREMENTS INTERNES', 'debit_normal', '58', FALSE, TRUE),
('59', '5', 'DEPRECIATIONS ET PROVISIONS POUR RISQUE A COURT TERME', 'debit_normal', '5', FALSE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('590', '5', 'DEPRECIATIONS DES TITRES DE PLACEMENT', 'debit_normal', '59', FALSE, TRUE),
('591', '5', 'DEPRECIATIONS DES TITRES ET VALEURS A ENCAISSER', 'debit_normal', '59', FALSE, TRUE),
('592', '5', 'DEPRECIATIONS DES COMPTES BANQUES', 'debit_normal', '59', FALSE, TRUE),
('593', '5', 'DEPRECIATIONS DES COMPTES ETABLISSEMENTS FINANCIERS ET ASSIMILES', 'debit_normal', '59', FALSE, TRUE),
('594', '5', 'DEPRECIATIONS DES COMPTES D''INSTRUMENTS DE TRESORERIE', 'debit_normal', '59', FALSE, TRUE),
('599', '5', 'PROVISIONS POUR RISQUE A COURT TERME A CARACTERE FINANCIER', 'debit_normal', '59', FALSE, TRUE),
('6', '6', 'COMPTES DE CHARGES DES ACTIVITES ORDINAIRES', 'debit_normal', NULL, FALSE, TRUE),
('60', '6', 'ACHAT ET VARIATION DE STOCK', 'debit_normal', '6', FALSE, TRUE),
('601', '6', 'ACHATS DE MARCHANDISES', 'debit_normal', '60', FALSE, TRUE),
('6011', '6', 'dans la Région (1)', 'debit_normal', '601', TRUE, TRUE),
('6012', '6', 'hors Région (1)', 'debit_normal', '601', TRUE, TRUE),
('6013', '6', 'aux entités du groupe dans la Région', 'debit_normal', '601', TRUE, TRUE),
('6014', '6', 'aux entités du groupe hors Région', 'debit_normal', '601', TRUE, TRUE),
('6015', '6', 'frais sur achats', 'debit_normal', '601', TRUE, TRUE),
('6019', '6', 'Rabais, Remises et Ristournes obtenus (non ventilés)', 'debit_normal', '601', TRUE, TRUE),
('602', '6', 'ACHATS DE MATIERES PREMIERES ET FOURNITURES LIEES', 'debit_normal', '60', FALSE, TRUE),
('6021', '6', 'dans la Région (1)', 'debit_normal', '602', TRUE, TRUE),
('6022', '6', 'hors Région (1)', 'debit_normal', '602', TRUE, TRUE),
('6023', '6', 'aux entités du groupe dans la Région', 'debit_normal', '602', TRUE, TRUE),
('6024', '6', 'aux entités du groupe hors Région', 'debit_normal', '602', TRUE, TRUE),
('6025', '6', 'frais sur achats', 'debit_normal', '602', TRUE, TRUE),
('6029', '6', 'Rabais, Remises et Ristournes obtenus (non ventilés)', 'debit_normal', '602', TRUE, TRUE),
('603', '6', 'VARIATIONS DES STOCKS DE BIENS ACHETES', 'debit_normal', '60', FALSE, TRUE),
('6031', '6', 'Variations des stocks de marchandises', 'debit_normal', '603', TRUE, TRUE),
('6032', '6', 'Variations des stocks de matières premières et fournitures liées', 'debit_normal', '603', TRUE, TRUE),
('6033', '6', 'Variations des stocks d''autres approvisionnements', 'debit_normal', '603', TRUE, TRUE),
('604', '6', 'ACHATS STOCKES DE MATIERES ET FOURNITURES CONSOMMABLES', 'debit_normal', '60', FALSE, TRUE),
('6041', '6', 'Matières consommables', 'debit_normal', '604', TRUE, TRUE),
('6042', '6', 'Matières combustibles', 'debit_normal', '604', TRUE, TRUE),
('6043', '6', 'Produits d''entretien', 'debit_normal', '604', TRUE, TRUE),
('6044', '6', 'Fournitures d''atelier et d''usine', 'debit_normal', '604', TRUE, TRUE),
('6045', '6', 'Frais sur achats', 'debit_normal', '604', TRUE, TRUE),
('6046', '6', 'Fournitures de magasin', 'debit_normal', '604', TRUE, TRUE),
('6047', '6', 'Fournitures de bureau', 'debit_normal', '604', TRUE, TRUE),
('6049', '6', 'Rabais, Remises et Ristournes obtenus (non ventilés)', 'debit_normal', '604', TRUE, TRUE),
('605', '6', 'AUTRES ACHATS', 'debit_normal', '60', FALSE, TRUE),
('6051', '6', 'Fournitures non stockables -Eau', 'debit_normal', '605', TRUE, TRUE),
('6052', '6', 'Fournitures non stockables - Electricité', 'debit_normal', '605', TRUE, TRUE),
('6053', '6', 'Fournitures non stockables – Autres énergies', 'debit_normal', '605', TRUE, TRUE),
('6054', '6', 'Fournitures d''entretien non stockables', 'debit_normal', '605', TRUE, TRUE),
('6055', '6', 'Fournitures de bureau non stockables', 'debit_normal', '605', TRUE, TRUE),
('6056', '6', 'Achats de petit matériel et outillage', 'debit_normal', '605', TRUE, TRUE),
('6057', '6', 'Achats d''études et prestations de services', 'debit_normal', '605', TRUE, TRUE),
('6058', '6', 'Achats de travaux, matériels et équipements', 'debit_normal', '605', TRUE, TRUE),
('6059', '6', 'Rabais, Remises et Ristournes obtenus (non ventilés)', 'debit_normal', '605', TRUE, TRUE),
('608', '6', 'ACHATS D''EMBALLAGES', 'debit_normal', '60', FALSE, TRUE),
('6081', '6', 'Emballages perdus', 'debit_normal', '608', TRUE, TRUE),
('6082', '6', 'Emballages récupérables non identifiables', 'debit_normal', '608', TRUE, TRUE),
('6083', '6', 'Emballages à usage mixte', 'debit_normal', '608', TRUE, TRUE),
('6085', '6', 'Frais sur achats', 'debit_normal', '608', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('6089', '6', 'Rabais, Remises et Ristournes obtenus (non ventilés)', 'debit_normal', '608', TRUE, TRUE),
('61', '6', 'TRANSPORTS', 'debit_normal', '6', FALSE, TRUE),
('611', '6', 'TRANSPORTS SUR ACHATS', 'debit_normal', '61', FALSE, TRUE),
('612', '6', 'TRANSPORTS SUR VENTES', 'debit_normal', '61', FALSE, TRUE),
('613', '6', 'TRANSPORTS POUR LE COMPTE DE TIERS', 'debit_normal', '61', FALSE, TRUE),
('614', '6', 'TRANSPORTS DU PERSONNEL', 'debit_normal', '61', FALSE, TRUE),
('616', '6', 'TRANSPORTS DE PLIS', 'debit_normal', '61', FALSE, TRUE),
('618', '6', 'AUTRES FRAIS DE TRANSPORT', 'debit_normal', '61', FALSE, TRUE),
('6181', '6', 'Voyages et déplacements', 'debit_normal', '618', TRUE, TRUE),
('6182', '6', 'Transports entre établissements ou chantiers', 'debit_normal', '618', TRUE, TRUE),
('6183', '6', 'Transports administratifs', 'debit_normal', '618', TRUE, TRUE),
('62', '6', 'SERVICES EXTERIEURS', 'debit_normal', '6', FALSE, TRUE),
('621', '6', 'SOUS-TRAITANCE GENERALE', 'debit_normal', '62', FALSE, TRUE),
('622', '6', 'LOCATIONS ET CHARGES LOCATIVES', 'debit_normal', '62', FALSE, TRUE),
('6221', '6', 'Locations de terrains', 'debit_normal', '622', TRUE, TRUE),
('6222', '6', 'Locations de bâtiments', 'debit_normal', '622', TRUE, TRUE),
('6223', '6', 'Locations de matériels et outillages', 'debit_normal', '622', TRUE, TRUE),
('6224', '6', 'Malus sur emballages', 'debit_normal', '622', TRUE, TRUE),
('6225', '6', 'Locations d''emballages', 'debit_normal', '622', TRUE, TRUE),
('6226', '6', 'Fermages et loyers du foncier', 'debit_normal', '622', TRUE, TRUE),
('6228', '6', 'Locations et charges locatives diverses', 'debit_normal', '622', TRUE, TRUE),
('623', '6', 'REDEVANCES DE LOCATION ACQUISITION', 'debit_normal', '62', FALSE, TRUE),
('6232', '6', 'Crédit-bail immobilier', 'debit_normal', '623', TRUE, TRUE),
('6233', '6', 'Crédit-bail mobilier', 'debit_normal', '623', TRUE, TRUE),
('6234', '6', 'Location vente', 'debit_normal', '623', TRUE, TRUE),
('6235', '6', 'Autres contrats de location acquisition', 'debit_normal', '623', TRUE, TRUE),
('624', '6', 'ENTRETIEN, REPARATIONS ET MAINTENANCE', 'debit_normal', '62', FALSE, TRUE),
('6241', '6', 'Entretien et réparations des biens immobiliers', 'debit_normal', '624', TRUE, TRUE),
('6242', '6', 'Entretien et réparations des biens mobiliers', 'debit_normal', '624', TRUE, TRUE),
('6243', '6', 'Maintenance', 'debit_normal', '624', TRUE, TRUE),
('6244', '6', 'Charges de démantèlement et remise en état', 'debit_normal', '624', TRUE, TRUE),
('6248', '6', 'Autres entretiens et réparations', 'debit_normal', '624', TRUE, TRUE),
('625', '6', 'PRIMES D''ASSURANCE', 'debit_normal', '62', FALSE, TRUE),
('6251', '6', 'Assurances multirisques', 'debit_normal', '625', TRUE, TRUE),
('6252', '6', 'Assurances matériel de transport', 'debit_normal', '625', TRUE, TRUE),
('6253', '6', 'Assurances risques d''exploitation', 'debit_normal', '625', TRUE, TRUE),
('6254', '6', 'Assurances responsabilité du producteur', 'debit_normal', '625', TRUE, TRUE),
('6255', '6', 'Assurances insolvabilité clients', 'debit_normal', '625', TRUE, TRUE),
('6256', '6', 'Assurances transport sur achats', 'debit_normal', '625', TRUE, TRUE),
('6257', '6', 'Assurances transport sur ventes', 'debit_normal', '625', TRUE, TRUE),
('6258', '6', 'Autres primes d''assurances', 'debit_normal', '625', TRUE, TRUE),
('626', '6', 'ETUDES, RECHERCHES ET DOCUMENTATION', 'debit_normal', '62', FALSE, TRUE),
('6261', '6', 'Études et recherches', 'debit_normal', '626', TRUE, TRUE),
('6265', '6', 'Documentation générale', 'debit_normal', '626', TRUE, TRUE),
('6266', '6', 'Documentation technique', 'debit_normal', '626', TRUE, TRUE),
('627', '6', 'PUBLICITE, PUBLICATIONS, RELATIONS PUBLIQUES', 'debit_normal', '62', FALSE, TRUE),
('6271', '6', 'annonces, insertions', 'debit_normal', '627', TRUE, TRUE),
('6272', '6', 'Catalogues, imprimés publicitaires', 'debit_normal', '627', TRUE, TRUE),
('628', '6', 'FRAIS DE TELECOMMUNICATIONS', 'debit_normal', '62', FALSE, TRUE),
('6281', '6', 'Frais de téléphone', 'debit_normal', '628', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('6282', '6', 'Frais de télex', 'debit_normal', '628', TRUE, TRUE),
('6283', '6', 'Frais de télécopie', 'debit_normal', '628', TRUE, TRUE),
('6288', '6', 'Autres frais de télécommunications', 'debit_normal', '628', TRUE, TRUE),
('63', '6', 'AUTRES SERVICES EXTERIEURS', 'debit_normal', '6', FALSE, TRUE),
('631', '6', 'FRAIS BANCAIRES', 'debit_normal', '63', FALSE, TRUE),
('6311', '6', 'Frais sur titres (vente, garde)', 'debit_normal', '631', TRUE, TRUE),
('6312', '6', 'Frais sur effets', 'debit_normal', '631', TRUE, TRUE),
('6313', '6', 'Location de coffres', 'debit_normal', '631', TRUE, TRUE),
('6314', '6', 'Commissions financement - affacturage', 'debit_normal', '631', TRUE, TRUE),
('6315', '6', 'Commissions sur cartes de crédit', 'debit_normal', '631', TRUE, TRUE),
('6316', '6', 'Frais d''émission d''emprunts', 'debit_normal', '631', TRUE, TRUE),
('6317', '6', 'Frais sur instruments monnaie électronique', 'debit_normal', '631', TRUE, TRUE),
('6318', '6', 'Autres frais bancaires', 'debit_normal', '631', TRUE, TRUE),
('632', '6', 'REMUNERATIONS D''INTERMEDIAIRES ET DE CONSEILS', 'debit_normal', '63', FALSE, TRUE),
('6321', '6', 'Commissions et courtages sur achats', 'debit_normal', '632', TRUE, TRUE),
('6322', '6', 'Commissions et courtages sur ventes', 'debit_normal', '632', TRUE, TRUE),
('6323', '6', 'Rémunérations des transitaires', 'debit_normal', '632', TRUE, TRUE),
('6324', '6', 'Honoraires des professions règlementées', 'debit_normal', '632', TRUE, TRUE),
('6325', '6', 'Frais d''actes et de contentieux', 'debit_normal', '632', TRUE, TRUE),
('6326', '6', 'Rémunérations du factor', 'debit_normal', '632', TRUE, TRUE),
('6327', '6', 'Rémunérations des autres prestataires de services', 'debit_normal', '632', TRUE, TRUE),
('6328', '6', 'Divers frais', 'debit_normal', '632', TRUE, TRUE),
('633', '6', 'FRAIS DE FORMATION DU PERSONNEL', 'debit_normal', '63', FALSE, TRUE),
('634', '6', 'REDEVANCES POUR BREVETS, LICENCES, LOGICIELS, CONCESSIONS ET DROITS SIMILAIRES', 'debit_normal', '63', FALSE, TRUE),
('6342', '6', 'Redevances pour brevets, licences', 'debit_normal', '634', TRUE, TRUE),
('6343', '6', 'Redevances pour logiciels', 'debit_normal', '634', TRUE, TRUE),
('6344', '6', 'Redevances pour marques', 'debit_normal', '634', TRUE, TRUE),
('6345', '6', 'Redevance pour sites internet', 'debit_normal', '634', TRUE, TRUE),
('6346', '6', 'Redevance pour concessions, droits et valeurs similaires', 'debit_normal', '634', TRUE, TRUE),
('635', '6', 'COTISATIONS', 'debit_normal', '63', FALSE, TRUE),
('6351', '6', 'Cotisations', 'debit_normal', '635', TRUE, TRUE),
('6358', '6', 'Concours divers', 'debit_normal', '635', TRUE, TRUE),
('637', '6', 'REMUNERATIONS DE PERSONNEL EXTERIEUR A L''ENTITE', 'debit_normal', '63', FALSE, TRUE),
('6371', '6', 'Personnel intérimaire', 'debit_normal', '637', TRUE, TRUE),
('6372', '6', 'Personnel détaché ou prêté à l''entité', 'debit_normal', '637', TRUE, TRUE),
('638', '6', 'AUTRES CHARGES EXTERNES', 'debit_normal', '63', FALSE, TRUE),
('6381', '6', 'Frais de recrutement du personnel', 'debit_normal', '638', TRUE, TRUE),
('6382', '6', 'Frais de déménagement', 'debit_normal', '638', TRUE, TRUE),
('6383', '6', 'Réceptions', 'debit_normal', '638', TRUE, TRUE),
('6384', '6', 'Missions', 'debit_normal', '638', TRUE, TRUE),
('64', '6', 'IMPOTS ET TAXES', 'debit_normal', '6', FALSE, TRUE),
('641', '6', 'IMPOTS ET TAXES DIRECTS', 'debit_normal', '64', FALSE, TRUE),
('6411', '6', 'Impôts fonciers et taxes annexes', 'debit_normal', '641', TRUE, TRUE),
('6412', '6', 'Patentes, licences et taxes annexes', 'debit_normal', '641', TRUE, TRUE),
('6413', '6', 'Taxes sur appointements et salaires', 'debit_normal', '641', TRUE, TRUE),
('6414', '6', 'Taxes d''apprentissage', 'debit_normal', '641', TRUE, TRUE),
('6415', '6', 'Formation professionnelle continue', 'debit_normal', '641', TRUE, TRUE),
('6418', '6', 'Autres impôts et taxes directs', 'debit_normal', '641', TRUE, TRUE),
('645', '6', 'IMPOTS ET TAXES INDIRECTS', 'debit_normal', '64', FALSE, TRUE),
('646', '6', 'DROITS D''ENREGISTREMENT', 'debit_normal', '64', FALSE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('6461', '6', 'Droits de mutation', 'debit_normal', '646', TRUE, TRUE),
('6462', '6', 'Droit de timbre', 'debit_normal', '646', TRUE, TRUE),
('6463', '6', 'Taxes sur les véhicules de société', 'debit_normal', '646', TRUE, TRUE),
('6464', '6', 'Vignettes', 'debit_normal', '646', TRUE, TRUE),
('6468', '6', 'Autres droits', 'debit_normal', '646', TRUE, TRUE),
('647', '6', 'PENALITES ET AMENDES FISCALES', 'debit_normal', '64', FALSE, TRUE),
('6471', '6', 'Pénalités d''assiette, impôts directs', 'debit_normal', '647', TRUE, TRUE),
('6472', '6', 'Pénalités d''assiette, impôts indirects', 'debit_normal', '647', TRUE, TRUE),
('6473', '6', 'Pénalités de recouvrement, impôts directs', 'debit_normal', '647', TRUE, TRUE),
('6474', '6', 'Pénalités de recouvrement, impôts indirects', 'debit_normal', '647', TRUE, TRUE),
('6478', '6', 'Autres amendes pénales et fiscales', 'debit_normal', '647', TRUE, TRUE),
('648', '6', 'AUTRES IMPOTS ET TAXES', 'debit_normal', '64', FALSE, TRUE),
('65', '6', 'AUTRES CHARGES', 'debit_normal', '6', FALSE, TRUE),
('651', '6', 'PERTES SUR CREANCES CLIENTS ET AUTRES DEBITEURS', 'debit_normal', '65', FALSE, TRUE),
('6511', '6', 'Clients', 'debit_normal', '651', TRUE, TRUE),
('6515', '6', 'Autres débiteurs', 'debit_normal', '651', TRUE, TRUE),
('652', '6', 'QUOTE-PART DE RESULTAT SUR OPERATIONS FAITES EN COMMUN', 'debit_normal', '65', FALSE, TRUE),
('6521', '6', 'Quote-part transférée de bénéfices (comptabilité du gérant)', 'debit_normal', '652', TRUE, TRUE),
('6525', '6', 'Pertes imputées par transfert (comptabilité des associés non gérants)', 'debit_normal', '652', TRUE, TRUE),
('654', '6', 'VALEUR COMPTABLE DES CESSIONS COURANTES D''IMMOBILISATIONS', 'debit_normal', '65', FALSE, TRUE),
('656', '6', 'PERTES DE CHANGE SUR CREANCES ET DETTES COMMERCIALES', 'debit_normal', '65', FALSE, TRUE),
('658', '6', 'CHARGES DIVERSES', 'debit_normal', '65', FALSE, TRUE),
('6581', '6', 'Indemnité de fonction et autres rémunérations d''administrateurs', 'debit_normal', '658', TRUE, TRUE),
('6583', '6', 'Dons', 'debit_normal', '658', TRUE, TRUE),
('6584', '6', 'Mécénat', 'debit_normal', '658', TRUE, TRUE),
('6588', '6', 'Autres charges diverses', 'debit_normal', '658', TRUE, TRUE),
('659', '6', 'CHARGES POUR DEPRECIATIONS ET PROVISIONS POUR RISQUE A COURT TERME D''EXPLOITATION', 'debit_normal', '65', FALSE, TRUE),
('6591', '6', 'sur risques à court terme', 'debit_normal', '659', TRUE, TRUE),
('6593', '6', 'sur stocks', 'debit_normal', '659', TRUE, TRUE),
('6594', '6', 'sur créances', 'debit_normal', '659', TRUE, TRUE),
('6598', '6', 'Autres charges pour dépréciations et provisions pour risques à court terme', 'debit_normal', '659', TRUE, TRUE),
('66', '6', 'CHARGES DE PERSONNEL', 'debit_normal', '6', FALSE, TRUE),
('661', '6', 'REMUNERATIONS DIRECTES VERSEES AU PERSONNEL NATIONAL', 'debit_normal', '66', FALSE, TRUE),
('6611', '6', 'Appointements salaires et commissions', 'debit_normal', '661', TRUE, TRUE),
('6612', '6', 'Primes et gratifications', 'debit_normal', '661', TRUE, TRUE),
('6613', '6', 'Congés payés', 'debit_normal', '661', TRUE, TRUE),
('6614', '6', 'Indemnités de préavis, de licenciement et de recherche d''embauche', 'debit_normal', '661', TRUE, TRUE),
('6615', '6', 'Indemnités de maladie versées aux travailleurs', 'debit_normal', '661', TRUE, TRUE),
('6616', '6', 'Supplément familial', 'debit_normal', '661', TRUE, TRUE),
('6617', '6', 'Avantages en nature', 'debit_normal', '661', TRUE, TRUE),
('6618', '6', 'Autres rémunérations directes', 'debit_normal', '661', TRUE, TRUE),
('662', '6', 'REMUNERATIONS DIRECTES VERSEES AU PERSONNEL NON NATIONAL', 'debit_normal', '66', FALSE, TRUE),
('6621', '6', 'Appointements salaires et commissions', 'debit_normal', '662', TRUE, TRUE),
('6622', '6', 'Primes et gratifications', 'debit_normal', '662', TRUE, TRUE),
('6623', '6', 'Congés payés', 'debit_normal', '662', TRUE, TRUE),
('6624', '6', 'Indemnités de préavis, de licenciement et de recherche d''embauche', 'debit_normal', '662', TRUE, TRUE),
('6625', '6', 'Indemnités de maladie versées aux travailleurs', 'debit_normal', '662', TRUE, TRUE),
('6626', '6', 'Supplément familial', 'debit_normal', '662', TRUE, TRUE),
('6627', '6', 'Avantages en nature', 'debit_normal', '662', TRUE, TRUE),
('6628', '6', 'Autres rémunérations directes', 'debit_normal', '662', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('663', '6', 'INDEMNITES FORFAITAIRES VERSEES AU PERSONNEL', 'debit_normal', '66', FALSE, TRUE),
('6631', '6', 'Indemnités de logement', 'debit_normal', '663', TRUE, TRUE),
('6632', '6', 'Indemnités de représentation', 'debit_normal', '663', TRUE, TRUE),
('6633', '6', 'Indemnités d''exportation', 'debit_normal', '663', TRUE, TRUE),
('6638', '6', 'Autres indemnités et avantages divers', 'debit_normal', '663', TRUE, TRUE),
('664', '6', 'CHARGES SOCIALES', 'debit_normal', '66', FALSE, TRUE),
('6641', '6', 'Charges sociales sur rémunération du personnel national', 'debit_normal', '664', TRUE, TRUE),
('6642', '6', 'Charges sociales sur rémunération du personnel non national', 'debit_normal', '664', TRUE, TRUE),
('666', '6', 'REMUNERATIONS ET CHARGES SOCIALES DE L''EXPLOITANT INDIVIDUEL', 'debit_normal', '66', FALSE, TRUE),
('6661', '6', 'Rémunération du travail de l''exploitant', 'debit_normal', '666', TRUE, TRUE),
('6662', '6', 'Charges sociales', 'debit_normal', '666', TRUE, TRUE),
('667', '6', 'REMUNERATION TRANSFEREE DE PERSONNEL EXTERIEUR', 'debit_normal', '66', FALSE, TRUE),
('6671', '6', 'Personnel intérimaire', 'debit_normal', '667', TRUE, TRUE),
('6672', '6', 'Personnel détaché ou prêté à l''entité', 'debit_normal', '667', TRUE, TRUE),
('668', '6', 'AUTRES CHARGES SOCIALES', 'debit_normal', '66', FALSE, TRUE),
('6681', '6', 'Versements aux Syndicats et Comités d''entreprise, d''établissement', 'debit_normal', '668', TRUE, TRUE),
('6682', '6', 'Versements aux Comités d''hygiène et de sécurité', 'debit_normal', '668', TRUE, TRUE),
('6683', '6', 'Versements aux autres oeuvres sociales', 'debit_normal', '668', TRUE, TRUE),
('6684', '6', 'Médecine du travail et pharmacie', 'debit_normal', '668', TRUE, TRUE),
('6685', '6', 'Assurances et organismes de santé', 'debit_normal', '668', TRUE, TRUE),
('6686', '6', 'Assurances retraite et fond de pension', 'debit_normal', '668', TRUE, TRUE),
('67', '6', 'FRAIS FINANCIERS ET CHARGES ASSIMILEES', 'debit_normal', '6', FALSE, TRUE),
('671', '6', 'INTERETS DES EMPRUNTS', 'debit_normal', '67', FALSE, TRUE),
('6711', '6', 'Emprunts obligataires', 'debit_normal', '671', TRUE, TRUE),
('6712', '6', 'Emprunts auprès des établissements de crédit', 'debit_normal', '671', TRUE, TRUE),
('6713', '6', 'Dettes liées à des participations', 'debit_normal', '671', TRUE, TRUE),
('6714', '6', 'Primes de remboursement des obligations', 'debit_normal', '671', TRUE, TRUE),
('672', '6', 'INTERETS DANS LOYERS DE LOCATION ACQUISITION', 'debit_normal', '67', FALSE, TRUE),
('6721', '6', 'Intérêts dans loyers de location acquisition/crédit-bail immobilier', 'debit_normal', '672', TRUE, TRUE),
('6722', '6', 'Intérêts dans loyers de location acquisition/crédit-bail mobilier', 'debit_normal', '672', TRUE, TRUE),
('6723', '6', 'Intérêts dans loyers de location acquisition/location vente', 'debit_normal', '672', TRUE, TRUE),
('6724', '6', 'Intérêt dans loyers des autres locations acquisition', 'debit_normal', '672', TRUE, TRUE),
('673', '6', 'ESCOMPTES ACCORDES', 'debit_normal', '67', FALSE, TRUE),
('674', '6', 'AUTRES INTERETS', 'debit_normal', '67', FALSE, TRUE),
('6741', '6', 'Avances reçues et dépôts créditeurs', 'debit_normal', '674', TRUE, TRUE),
('6742', '6', 'Comptes courants bloqués', 'debit_normal', '674', TRUE, TRUE),
('6743', '6', 'Intérêts sur obligations cautionnées', 'debit_normal', '674', TRUE, TRUE),
('6744', '6', 'Intérêts sur dettes commerciales', 'debit_normal', '674', TRUE, TRUE),
('6745', '6', 'Intérêts bancaires et sur opérations de trésorerie et d''escompte', 'debit_normal', '674', TRUE, TRUE),
('6748', '6', 'Intérêts sur dettes diverses', 'debit_normal', '674', TRUE, TRUE),
('675', '6', 'ESCOMPTES DES EFFETS DE COMMERCE', 'debit_normal', '67', FALSE, TRUE),
('676', '6', 'PERTES DE CHANGE', 'debit_normal', '67', FALSE, TRUE),
('677', '6', 'PERTES SUR TITRES DE PLACEMENT', 'debit_normal', '67', FALSE, TRUE),
('6771', '6', 'Pertes sur cessions de titres de placement', 'debit_normal', '677', TRUE, TRUE),
('6772', '6', 'Pertes provenant d''attribution gratuite d''actions au personnel salarié et aux dirigeants', 'debit_normal', '677', TRUE, TRUE),
('678', '6', 'PERTES SUR RISQUES FINANCIERS', 'debit_normal', '67', FALSE, TRUE),
('6781', '6', 'sur rentes viagères', 'debit_normal', '678', TRUE, TRUE),
('6782', '6', 'sur opérations financières', 'debit_normal', '678', TRUE, TRUE),
('6784', '6', 'sur instruments de trésorerie', 'debit_normal', '678', TRUE, TRUE),
('679', '6', 'CHARGES POUR DEPRECIATIONS ET PROVISIONS POUR RISQUES A COURT TERME FINANCIERES', 'debit_normal', '67', FALSE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('6791', '6', 'sur risques financiers', 'debit_normal', '679', TRUE, TRUE),
('6795', '6', 'sur titres de placement', 'debit_normal', '679', TRUE, TRUE),
('6798', '6', 'Autres charges pour dépréciation et provisions pour risque à courts terme financières', 'debit_normal', '679', TRUE, TRUE),
('68', '6', 'DOTATIONS AUX AMORTISSEMENTS', 'debit_normal', '6', FALSE, TRUE),
('681', '6', 'DOTATIONS AUX AMORTISSEMENTS D''EXPLOITATION', 'debit_normal', '68', FALSE, TRUE),
('6811', '6', 'Dotations aux amortissements des charges immobilisées', 'debit_normal', '681', TRUE, TRUE),
('6812', '6', 'Dotations aux amortissements des immobilisations incorporelles', 'debit_normal', '681', TRUE, TRUE),
('6813', '6', 'Dotations aux amortissements des immobilisations corporelles', 'debit_normal', '681', TRUE, TRUE),
('687', '6', 'DOTATIONS AUX AMORTISSEMENTS A CARACTERE FINANCIER', 'debit_normal', '68', FALSE, TRUE),
('69', '6', 'DOTATIONS AUX PROVISIONS ET AUX DEPRECIATIONS', 'debit_normal', '6', FALSE, TRUE),
('691', '6', 'DOTATIONS AUX PROVISIONS ET AUX DEPRECIATIONS D''EXPLOITATION', 'debit_normal', '69', FALSE, TRUE),
('6911', '6', 'pour risques et charges', 'debit_normal', '691', TRUE, TRUE),
('6913', '6', 'des immobilisations incorporelles', 'debit_normal', '691', TRUE, TRUE),
('6914', '6', 'des immobilisations corporelles', 'debit_normal', '691', TRUE, TRUE),
('697', '6', 'DOTATIONS AUX PROVISIONS ET AUX DEPRECIATION FINANCIERES', 'debit_normal', '69', FALSE, TRUE),
('6971', '6', 'pour risques et charges', 'debit_normal', '697', TRUE, TRUE),
('6972', '6', 'des immobilisations financières', 'debit_normal', '697', TRUE, TRUE),
('7', '7', 'COMPTES DES PRODUITS DES ACTIVITES ORDINAIRES', 'credit_normal', NULL, FALSE, TRUE),
('70', '7', 'VENTES', 'credit_normal', '7', FALSE, TRUE),
('701', '7', 'VENTES DE MARCHANDISES', 'credit_normal', '70', FALSE, TRUE),
('7011', '7', 'dans la Région', 'credit_normal', '701', TRUE, TRUE),
('7012', '7', 'hors Région', 'credit_normal', '701', TRUE, TRUE),
('7013', '7', 'aux entités du groupe dans la Région', 'credit_normal', '701', TRUE, TRUE),
('7014', '7', 'aux entités du groupe hors Région', 'credit_normal', '701', TRUE, TRUE),
('7015', '7', 'Sur internet', 'credit_normal', '701', TRUE, TRUE),
('702', '7', 'VENTES DE PRODUITS FINIS', 'credit_normal', '70', FALSE, TRUE),
('7021', '7', 'dans la Région', 'credit_normal', '702', TRUE, TRUE),
('7022', '7', 'hors Région', 'credit_normal', '702', TRUE, TRUE),
('7023', '7', 'aux entités du groupe dans la Région', 'credit_normal', '702', TRUE, TRUE),
('7024', '7', 'aux entités du groupe hors Région', 'credit_normal', '702', TRUE, TRUE),
('7025', '7', 'Sur internet', 'credit_normal', '702', TRUE, TRUE),
('703', '7', 'VENTES DE PRODUITS INTERMEDIAIRES', 'credit_normal', '70', FALSE, TRUE),
('7031', '7', 'dans la Région', 'credit_normal', '703', TRUE, TRUE),
('7032', '7', 'hors Région', 'credit_normal', '703', TRUE, TRUE),
('7033', '7', 'aux entités du groupe dans la Région', 'credit_normal', '703', TRUE, TRUE),
('7034', '7', 'aux entités du groupe hors Région', 'credit_normal', '703', TRUE, TRUE),
('7035', '7', 'Sur internet', 'credit_normal', '703', TRUE, TRUE),
('704', '7', 'VENTES DE PRODUITS RESIDUELS', 'credit_normal', '70', FALSE, TRUE),
('7041', '7', 'dans la Région', 'credit_normal', '704', TRUE, TRUE),
('7042', '7', 'hors Région', 'credit_normal', '704', TRUE, TRUE),
('7043', '7', 'aux entités du groupe dans la Région', 'credit_normal', '704', TRUE, TRUE),
('7044', '7', 'aux entités du groupe hors Région', 'credit_normal', '704', TRUE, TRUE),
('7045', '7', 'Sur internet', 'credit_normal', '704', TRUE, TRUE),
('705', '7', 'TRAVAUX FACTURES', 'credit_normal', '70', FALSE, TRUE),
('7051', '7', 'dans la Région', 'credit_normal', '705', TRUE, TRUE),
('7052', '7', 'hors Région', 'credit_normal', '705', TRUE, TRUE),
('7053', '7', 'aux entités du groupe dans la Région', 'credit_normal', '705', TRUE, TRUE),
('7054', '7', 'aux entités du groupe hors Région', 'credit_normal', '705', TRUE, TRUE),
('7055', '7', 'Sur internet', 'credit_normal', '705', TRUE, TRUE),
('706', '7', 'SERVICES VENDUS', 'credit_normal', '70', FALSE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('7061', '7', 'dans la Région', 'credit_normal', '706', TRUE, TRUE),
('7062', '7', 'hors Région', 'credit_normal', '706', TRUE, TRUE),
('7063', '7', 'aux entités du groupe dans la Région', 'credit_normal', '706', TRUE, TRUE),
('7064', '7', 'aux entités du groupe hors Région', 'credit_normal', '706', TRUE, TRUE),
('7065', '7', 'Sur internet', 'credit_normal', '706', TRUE, TRUE),
('707', '7', 'PRODUITS ACCESSOIRES', 'credit_normal', '70', FALSE, TRUE),
('7071', '7', 'Ports, emballages perdus et autres frais facturés', 'credit_normal', '707', TRUE, TRUE),
('7072', '7', 'Commissions et courtages', 'credit_normal', '707', TRUE, TRUE),
('7073', '7', 'Locations', 'credit_normal', '707', TRUE, TRUE),
('7074', '7', 'Bonis sur reprises et cessions d''emballages', 'credit_normal', '707', TRUE, TRUE),
('7075', '7', 'Mise à disposition de personnel', 'credit_normal', '707', TRUE, TRUE),
('7076', '7', 'Redevances pour brevets, logiciels, marques et droits similaires', 'credit_normal', '707', TRUE, TRUE),
('7077', '7', 'Services exploités dans l''intérêt du personnel', 'credit_normal', '707', TRUE, TRUE),
('7078', '7', 'Autres produits accessoires', 'credit_normal', '707', TRUE, TRUE),
('71', '7', 'SUBVENTIONS D''EXPLOITATION', 'credit_normal', '7', FALSE, TRUE),
('711', '7', 'SUR PRODUITS A L''EXPORTATION', 'credit_normal', '71', FALSE, TRUE),
('712', '7', 'SUR PRODUITS A L''IMPORTATION', 'credit_normal', '71', FALSE, TRUE),
('713', '7', 'SUR PRODUITS DE PEREQUATION', 'credit_normal', '71', FALSE, TRUE),
('718', '7', 'AUTRES SUBVENTIONS D''EXPLOITATION', 'credit_normal', '71', FALSE, TRUE),
('7181', '7', 'Versées par l''État et les collectivités publiques', 'credit_normal', '718', TRUE, TRUE),
('7182', '7', 'Versées par les organismes internationaux', 'credit_normal', '718', TRUE, TRUE),
('7183', '7', 'Versées par des tiers', 'credit_normal', '718', TRUE, TRUE),
('72', '7', 'PRODUCTION IMMOBILISEE', 'credit_normal', '7', FALSE, TRUE),
('721', '7', 'IMMOBILISATIONS INCORPORELLES', 'credit_normal', '72', FALSE, TRUE),
('722', '7', 'IMMOBILISATIONS CORPORELLES', 'credit_normal', '72', FALSE, TRUE),
('7221', '7', 'immobilisations corporelles (hors actifs biologiques)', 'credit_normal', '722', TRUE, TRUE),
('7222', '7', 'immobilisations corporelles (actifs biologiques)', 'credit_normal', '722', TRUE, TRUE),
('724', '7', 'PRODUCTION AUTO-CONSOMMEE', 'credit_normal', '72', FALSE, TRUE),
('726', '7', 'IMMOBILISATIONS FINANCIERES', 'credit_normal', '72', FALSE, TRUE),
('73', '7', 'VARIATIONS DES STOCKS DE BIENS ET DE SERVICES PRODUITS', 'credit_normal', '7', FALSE, TRUE),
('734', '7', 'VARIATIONS DES STOCKS DE PRODUITS EN COURS', 'credit_normal', '73', FALSE, TRUE),
('7341', '7', 'Produits en cours', 'credit_normal', '734', TRUE, TRUE),
('7342', '7', 'Travaux en cours', 'credit_normal', '734', TRUE, TRUE),
('735', '7', 'VARIATIONS DES EN-COURS DE SERVICES', 'credit_normal', '73', FALSE, TRUE),
('7351', '7', 'Études en cours', 'credit_normal', '735', TRUE, TRUE),
('7352', '7', 'Prestations de services en cours', 'credit_normal', '735', TRUE, TRUE),
('736', '7', 'VARIATIONS DES STOCKS DE PRODUITS FINIS', 'credit_normal', '73', FALSE, TRUE),
('737', '7', 'VARIATIONS DES STOCKS DE PRODUITS INTERMEDIAIRES ET RESIDUELS', 'credit_normal', '73', FALSE, TRUE),
('7371', '7', 'Produits intermédiaires', 'credit_normal', '737', TRUE, TRUE),
('7372', '7', 'Produits résiduels', 'credit_normal', '737', TRUE, TRUE),
('75', '7', 'AUTRES PRODUITS', 'credit_normal', '7', FALSE, TRUE),
('752', '7', 'QUOTE-PART DE RESULTAT SUR OPERATIONS FAITES EN COMMUN', 'credit_normal', '75', FALSE, TRUE),
('7521', '7', 'Quote-part transférée de pertes (comptabilité du gérant)', 'credit_normal', '752', TRUE, TRUE),
('7525', '7', 'Bénéfices attribués par transfert (comptabilité des associés non gérants)', 'credit_normal', '752', TRUE, TRUE),
('754', '7', 'PRODUITS DES CESSIONS COURANTES D''IMMOBILISATIONS', 'credit_normal', '75', FALSE, TRUE),
('756', '7', 'GAINS DE CHANGE SUR CREANCES ET DETTES COMMERCIALES', 'credit_normal', '75', FALSE, TRUE),
('758', '7', 'PRODUITS DIVERS', 'credit_normal', '75', FALSE, TRUE),
('7581', '7', 'Indemnité de fonction et autres rémunérations d''administrateurs', 'credit_normal', '758', TRUE, TRUE),
('7582', '7', 'Indemnités d''assurances reçues', 'credit_normal', '758', TRUE, TRUE),
('7588', '7', 'Autres produits divers', 'credit_normal', '758', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('759', '7', 'REPRISES DE CHARGES POUR DEPRECIATIONS ET PROVISIONS POUR RISQUE A COURT TERME D''EXPLOITATION', 'credit_normal', '75', FALSE, TRUE),
('7591', '7', 'sur risques à court terme', 'credit_normal', '759', TRUE, TRUE),
('7593', '7', 'sur stocks', 'credit_normal', '759', TRUE, TRUE),
('7594', '7', 'sur créances', 'credit_normal', '759', TRUE, TRUE),
('7598', '7', 'sur autres charges pour dépréciations et provision pour risques à court terme d''exploitation', 'credit_normal', '759', TRUE, TRUE),
('77', '7', 'REVENUS FINANCIERS ET PRODUITS ASSIMILES', 'credit_normal', '7', FALSE, TRUE),
('771', '7', 'INTERETS DE PRETS DE CREANCES DIVERSES', 'credit_normal', '77', FALSE, TRUE),
('7712', '7', 'Intérêt de prêt', 'credit_normal', '771', TRUE, TRUE),
('7713', '7', 'Intérêt sur créances diverses', 'credit_normal', '771', TRUE, TRUE),
('772', '7', 'REVENUS DE PARTICIPATIONS ET AUTRES TITRES IMMOBILISES', 'credit_normal', '77', FALSE, TRUE),
('7721', '7', 'Revenus des titres de participations', 'credit_normal', '772', TRUE, TRUE),
('7722', '7', 'Revenus autres titres immobilisés', 'credit_normal', '772', TRUE, TRUE),
('773', '7', 'ESCOMPTES OBTENUS', 'credit_normal', '77', FALSE, TRUE),
('774', '7', 'REVENUS DE PLACEMENT', 'credit_normal', '77', FALSE, TRUE),
('7745', '7', 'Revenus des obligations', 'credit_normal', '774', TRUE, TRUE),
('7746', '7', 'Revenus des titres de placement', 'credit_normal', '774', TRUE, TRUE),
('775', '7', 'INTERET DANS LOYERS DE LOCATIONS ACQUISITION', 'credit_normal', '77', FALSE, TRUE),
('776', '7', 'GAINS DE CHANGE', 'credit_normal', '77', FALSE, TRUE),
('777', '7', 'GAINS SUR CESSIONS DE TITRES DE PLACEMENT', 'credit_normal', '77', FALSE, TRUE),
('778', '7', 'GAINS SUR RISQUES FINANCIERS', 'credit_normal', '77', FALSE, TRUE),
('7781', '7', 'sur rentes viagères', 'credit_normal', '778', TRUE, TRUE),
('7782', '7', 'sur opérations financières', 'credit_normal', '778', TRUE, TRUE),
('7784', '7', 'sur instruments de trésorerie', 'credit_normal', '778', TRUE, TRUE),
('779', '7', 'REPRISES DE CHARGES POUR DEPRECIATIONS ET PROVISIONS A COURT TERME FINANCIERES', 'credit_normal', '77', FALSE, TRUE),
('7791', '7', 'sur risques financiers', 'credit_normal', '779', TRUE, TRUE),
('7795', '7', 'sur titres de placement', 'credit_normal', '779', TRUE, TRUE),
('7798', '7', 'sur autres charges pour dépréciations et provisions pour risques à court terme financière', 'credit_normal', '779', TRUE, TRUE),
('78', '7', 'TRANSFERTS DE CHARGES', 'credit_normal', '7', FALSE, TRUE),
('781', '7', 'TRANSFERTS DE CHARGES D''EXPLOITATION', 'credit_normal', '78', FALSE, TRUE),
('787', '7', 'TRANSFERTS DE CHARGES FINANCIERES', 'credit_normal', '78', FALSE, TRUE),
('79', '7', 'REPRISES DE PROVISIONS, DE DEPRECIATIONS ET AUTRES', 'credit_normal', '7', FALSE, TRUE),
('791', '7', 'REPRISES DE PROVISIONS ET DEPRECIATION D''EXPLOITATION', 'credit_normal', '79', FALSE, TRUE),
('7911', '7', 'pour risques et charges', 'credit_normal', '791', TRUE, TRUE),
('7913', '7', 'des immobilisations incorporelles', 'credit_normal', '791', TRUE, TRUE),
('7914', '7', 'des immobilisations corporelles', 'credit_normal', '791', TRUE, TRUE),
('797', '7', 'REPRISES DE PROVISIONS ET DEPRECIATIONS FINANCIERES', 'credit_normal', '79', FALSE, TRUE),
('7971', '7', 'pour risques et charges', 'credit_normal', '797', TRUE, TRUE),
('7972', '7', 'des immobilisations financières', 'credit_normal', '797', TRUE, TRUE),
('798', '7', 'REPRISES D''AMORTISSEMENTS', 'credit_normal', '79', FALSE, TRUE),
('799', '7', 'REPRISE DE SUBVENTIONS D''INVESTISSEMENT', 'credit_normal', '79', FALSE, TRUE),
('8', '8', 'COMPTES DES AUTRES CHARGES ET AUTRES PRODUITS', 'credit_normal', NULL, FALSE, TRUE),
('81', '8', 'VALEURS COMPTABLES DES CESSIONS D''IMMOBILISATIONS', 'credit_normal', '8', FALSE, TRUE),
('811', '8', 'IMMOBILISATIONS INCORPORELLES', 'credit_normal', '81', FALSE, TRUE),
('812', '8', 'IMMOBILISATIONS CORPORELLES', 'credit_normal', '81', FALSE, TRUE),
('816', '8', 'IMMOBILISATIONS FINANCIERES', 'credit_normal', '81', FALSE, TRUE),
('82', '8', 'PRODUITS DES CESSIONS D''IMMOBILISATIONS', 'credit_normal', '8', FALSE, TRUE),
('821', '8', 'IMMOBILISATIONS INCORPORELLES', 'credit_normal', '82', FALSE, TRUE),
('822', '8', 'IMMOBILISATIONS CORPORELLES', 'credit_normal', '82', FALSE, TRUE),
('826', '8', 'IMMOBILISATIONS FINANCIERES', 'credit_normal', '82', FALSE, TRUE),
('83', '8', 'CHARGES HORS ACTIVITES ORDINAIRES', 'credit_normal', '8', FALSE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('831', '8', 'CHARGES H.A.O. CONSTATEES', 'credit_normal', '83', FALSE, TRUE),
('834', '8', 'PERTES SUR CREANCES H.A.O.', 'credit_normal', '83', FALSE, TRUE),
('835', '8', 'DONS ET LIBERALITES ACCORDES', 'credit_normal', '83', FALSE, TRUE),
('836', '8', 'ABANDONS DE CREANCES CONSENTIS', 'credit_normal', '83', FALSE, TRUE),
('837', '8', 'CHARGES LIEES AUX OPERATIONS DE LIQUIDATION', 'credit_normal', '83', FALSE, TRUE),
('839', '8', 'CHARGES POUR DEPRECIATION ET PROVISIONS POUR RISQUES A COURT TERME H.A.O.', 'credit_normal', '83', FALSE, TRUE),
('84', '8', 'PRODUITS HORS ACTIVITES ORDINAIRES', 'credit_normal', '8', FALSE, TRUE),
('841', '8', 'PRODUITS H.A.O CONSTATEES', 'credit_normal', '84', FALSE, TRUE),
('845', '8', 'DONS ET LIBERALITES OBTENUS', 'credit_normal', '84', FALSE, TRUE),
('846', '8', 'ABANDONS DE CREANCES OBTENUS', 'credit_normal', '84', FALSE, TRUE),
('847', '8', 'PRODUITS LIES AUX OPERATIONS DE LIQUIDATION', 'credit_normal', '84', FALSE, TRUE),
('848', '8', 'TRANSFERTS DE CHARGES H.A.O', 'credit_normal', '84', FALSE, TRUE),
('849', '8', 'REPRISES DE CHARGES POUR DEPRECIATION ET PROVISIONS POUR RISQUE A COURT TERME H.A.O.', 'credit_normal', '84', FALSE, TRUE),
('85', '8', 'DOTATIONS HORS ACTIVITES ORDINAIRES', 'credit_normal', '8', FALSE, TRUE),
('851', '8', 'DOTATIONS AUX PROVISIONS REGLEMENTEES', 'credit_normal', '85', FALSE, TRUE),
('852', '8', 'DOTATIONS AUX AMORTISSEMENTS H.A.O.', 'credit_normal', '85', FALSE, TRUE),
('853', '8', 'DOTATIONS AUX DEPRECIATIONS H.A.O.', 'credit_normal', '85', FALSE, TRUE),
('854', '8', 'DOTATIONS AUX PROVISIONS POUR RISQUES ET CHARGES H.A.O.', 'credit_normal', '85', FALSE, TRUE),
('858', '8', 'AUTRES DOTATIONS H.A.O.', 'credit_normal', '85', FALSE, TRUE),
('86', '8', 'REPRISES HORS ACTIVITES ORDINAIRES', 'credit_normal', '8', FALSE, TRUE),
('861', '8', 'REPRISES DE PROVISIONS REGLEMENTEES', 'credit_normal', '86', FALSE, TRUE),
('862', '8', 'REPRISES D''AMORTISSEMENTS', 'credit_normal', '86', FALSE, TRUE),
('863', '8', 'REPRISES DE DEPRECIATIONS H.A.O.', 'credit_normal', '86', FALSE, TRUE),
('864', '8', 'REPRISES DE PROVISIONS POUR RISQUES ET CHARGES H.A.O.', 'credit_normal', '86', FALSE, TRUE),
('868', '8', 'AUTRES REPRISES H.A.O.', 'credit_normal', '86', FALSE, TRUE),
('87', '8', 'PARTICIPATION DES TRAVAILLEURS', 'credit_normal', '8', FALSE, TRUE),
('871', '8', 'PARTICIPATION LEGALE AUX BENEFICES', 'credit_normal', '87', FALSE, TRUE),
('874', '8', 'PARTICIPATION CONTRACTUELLE AUX BENEFICES', 'credit_normal', '87', FALSE, TRUE),
('878', '8', 'AUTRES PARTICIPATIONS', 'credit_normal', '87', FALSE, TRUE),
('88', '8', 'SUBVENTIONS D''EQUILIBRE', 'credit_normal', '8', FALSE, TRUE),
('881', '8', 'ETAT', 'credit_normal', '88', FALSE, TRUE),
('884', '8', 'COLLECTIVITES PUBLIQUES', 'credit_normal', '88', FALSE, TRUE),
('886', '8', 'GROUPE', 'credit_normal', '88', FALSE, TRUE),
('888', '8', 'AUTRES', 'credit_normal', '88', FALSE, TRUE),
('89', '8', 'IMPOTS SUR LE RESULTAT', 'credit_normal', '8', FALSE, TRUE),
('891', '8', 'IMPOTS SUR LES BENEFICES DE L''EXERCICE', 'credit_normal', '89', FALSE, TRUE),
('8911', '8', 'Activités exercées dans l''État', 'credit_normal', '891', TRUE, TRUE),
('8912', '8', 'Activités exercées dans les autres États de la Région', 'credit_normal', '891', TRUE, TRUE),
('8913', '8', 'Activités exercées hors Région', 'credit_normal', '891', TRUE, TRUE),
('892', '8', 'RAPPEL D''IMPOTS SUR RESULTATS ANTERIEURS', 'credit_normal', '89', FALSE, TRUE),
('895', '8', 'IMPOT MINIMUM FORFAITAIRE (I.M.F.)', 'credit_normal', '89', FALSE, TRUE),
('899', '8', 'DEGREVEMENTS ET ANNULATIONS D''IMPOTS SUR RESULTATS ANTERIEURS', 'credit_normal', '89', FALSE, TRUE),
('8991', '8', 'Dégrévements', 'credit_normal', '899', TRUE, TRUE),
('8994', '8', 'Annulations pour pertes rétroactives', 'credit_normal', '899', TRUE, TRUE),
('9', '1', 'COMPTES DES ENGAGEMENTS HORS BILAN ET COMPTE DE LA COMPTABILITE ANALYTIQUE DE GESTION', 'debit_normal', NULL, FALSE, TRUE),
('90', '1', 'ENGAGEMENTS OBTENUS ET ENGAGEMENTS ACCORDES', 'debit_normal', '9', FALSE, TRUE),
('901', '1', 'ENGAGEMENTS DE FINANCEMENT OBTENUS', 'debit_normal', '90', FALSE, TRUE),
('9011', '1', 'Crédits confirmés obtenus', 'debit_normal', '901', TRUE, TRUE),
('9012', '1', 'Emprunts restant à encaisser', 'debit_normal', '901', TRUE, TRUE),
('9013', '1', 'Facilités de financement renouvelables', 'debit_normal', '901', TRUE, TRUE);

INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system) VALUES
('9014', '1', 'Facilités d''émission', 'debit_normal', '901', TRUE, TRUE),
('9018', '1', 'Autres engagements de financement obtenus', 'debit_normal', '901', TRUE, TRUE),
('902', '2', 'ENGAGEMENTS DE GARANTIE OBTENUS', 'debit_normal', '90', FALSE, TRUE),
('9021', '2', 'Avals obtenus', 'debit_normal', '902', TRUE, TRUE),
('9022', '2', 'Cautions, garanties obtenues', 'debit_normal', '902', TRUE, TRUE),
('9023', '2', 'Hypothèques obtenues', 'debit_normal', '902', TRUE, TRUE),
('9024', '2', 'Effets endossés par des tiers', 'debit_normal', '902', TRUE, TRUE),
('9028', '2', 'Autres garanties obtenues', 'debit_normal', '902', TRUE, TRUE),
('903', '3', 'ENGAGEMENTS RECIPROQUES', 'debit_normal', '90', FALSE, TRUE),
('9031', '3', 'Achats de marchandises à terme', 'debit_normal', '903', TRUE, TRUE),
('9032', '3', 'Achats à terme de devises', 'debit_normal', '903', TRUE, TRUE),
('9033', '3', 'Commandes fermes des clients', 'debit_normal', '903', TRUE, TRUE),
('9038', '3', 'Autres engagements réciproques', 'debit_normal', '903', TRUE, TRUE),
('904', '4', 'AUTRES ENGAGEMENTS OBTENUS', 'debit_normal', '90', FALSE, TRUE),
('9041', '4', 'Abandons de créances conditionnels', 'debit_normal', '904', TRUE, TRUE),
('9043', '4', 'Ventes avec clause de réserve de propriété', 'debit_normal', '904', TRUE, TRUE),
('9048', '4', 'Divers engagements obtenus', 'debit_normal', '904', TRUE, TRUE),
('905', '5', 'ENGAGEMENTS DE FINANCEMENT ACCORDES', 'debit_normal', '90', FALSE, TRUE),
('9051', '5', 'Crédits accordés non décaissés', 'debit_normal', '905', TRUE, TRUE),
('9058', '5', 'Autres engagements de financement accordés', 'debit_normal', '905', TRUE, TRUE),
('906', '6', 'ENGAGEMENT DE GARANTIE ACCORDES', 'debit_normal', '90', FALSE, TRUE),
('9061', '6', 'Avals accordés', 'debit_normal', '906', TRUE, TRUE),
('9062', '6', 'Cautions, garanties accordées', 'debit_normal', '906', TRUE, TRUE),
('9063', '6', 'Hypothèques accordées', 'debit_normal', '906', TRUE, TRUE),
('9064', '6', 'Effets endossés par l''entité', 'debit_normal', '906', TRUE, TRUE),
('9068', '6', 'Autres garanties accordées', 'debit_normal', '906', TRUE, TRUE),
('907', '7', 'ENGAGEMENTS RECIPROQUES', 'debit_normal', '90', FALSE, TRUE),
('9071', '7', 'Ventes de marchandises à terme', 'debit_normal', '907', TRUE, TRUE),
('9072', '7', 'Ventes à terme de devises', 'debit_normal', '907', TRUE, TRUE),
('9073', '7', 'Commandes fermes aux fournisseurs', 'debit_normal', '907', TRUE, TRUE),
('9078', '7', 'Autres engagements réciproques', 'debit_normal', '907', TRUE, TRUE),
('908', '8', 'AUTRES ENGAGEMENTS ACCORDES', 'debit_normal', '90', FALSE, TRUE),
('9081', '8', 'Annulations conditionnelles de dettes', 'debit_normal', '908', TRUE, TRUE),
('9082', '8', 'Engagements de retraite', 'debit_normal', '908', TRUE, TRUE),
('9083', '8', 'Achats avec clause de réserve de propriété', 'debit_normal', '908', TRUE, TRUE),
('9088', '8', 'Divers engagements accordés', 'debit_normal', '908', TRUE, TRUE),
('91', '1', 'CONTREPARTIES DES ENGAGEMENTS', 'debit_normal', '9', FALSE, TRUE),
('911', '1', 'CONTREPARTIES DES ENGAGEMENTS OBTENUS', 'debit_normal', '91', FALSE, TRUE),
('915', '1', 'CONTREPARTIES DES ENGAGEMENTS ACCORDES', 'debit_normal', '91', FALSE, TRUE),
('92', '2', 'COMPTES REFLECHIS', 'debit_normal', '9', FALSE, TRUE),
('93', '3', 'COMPTES DE RECLASSEMENTS', 'debit_normal', '9', FALSE, TRUE),
('94', '4', 'COMPTES DE COÛTS', 'debit_normal', '9', FALSE, TRUE),
('95', '5', 'COMPTES DE STOCKS', 'debit_normal', '9', FALSE, TRUE),
('96', '6', 'COMPTES D''ECARTS SUR COÛTS PREÉTABLIS', 'debit_normal', '9', FALSE, TRUE),
('97', '7', 'COMPTES DE DIFFERENCES DE TRAITEMENT COMPTABLE', 'debit_normal', '9', FALSE, TRUE),
('98', '8', 'COMPTES DE RESULTATS', 'debit_normal', '9', FALSE, TRUE),
('99', '1', 'COMPTES DE LIAISONS INTERNES', 'debit_normal', '9', FALSE, TRUE);

-- Marquer tous ces comptes comme système et activer la réconciliation pour classes 4 et 5
UPDATE chart_of_accounts SET is_system = TRUE;
UPDATE chart_of_accounts SET allows_reconciliation = TRUE
    WHERE account_class IN ('4','5');
UPDATE chart_of_accounts SET is_bank_account = TRUE
    WHERE account_class = '5';

-- ---------------------------------------------------------------
-- 6.4 Table fiscal_periods — Exercices et périodes fiscales
-- ---------------------------------------------------------------
CREATE TABLE fiscal_periods (
    id              UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100)         NOT NULL,
    fiscal_year     SMALLINT             NOT NULL,
    period_type     VARCHAR(20)          NOT NULL DEFAULT 'month',
    start_date      DATE                 NOT NULL,
    end_date        DATE                 NOT NULL,
    status          fiscal_period_status NOT NULL DEFAULT 'open',
    closed_at       TIMESTAMPTZ,
    closed_by       UUID                 REFERENCES users(id) ON DELETE SET NULL,
    locked_at       TIMESTAMPTZ,
    locked_by       UUID                 REFERENCES users(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_fiscal_period UNIQUE (fiscal_year, period_type, start_date),
    CONSTRAINT chk_fp_dates     CHECK  (end_date > start_date)
);
CREATE TRIGGER tg_fiscal_periods_updated_at
    BEFORE UPDATE ON fiscal_periods
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
COMMENT ON TABLE fiscal_periods IS 'Exercices et periodes comptables. Une periode cloturee ne peut plus recevoir d''ecritures.';

-- ---------------------------------------------------------------
-- 6.5 Table accounting_journals — Journaux comptables
-- ---------------------------------------------------------------
CREATE TABLE accounting_journals (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(20)  NOT NULL UNIQUE,
    name            VARCHAR(100) NOT NULL,
    type            journal_type NOT NULL,
    bank_account_id UUID         REFERENCES bank_accounts(id) ON DELETE SET NULL,
    is_default      BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    sequence_prefix VARCHAR(10),
    last_sequence   INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE TRIGGER tg_accounting_journals_updated_at
    BEFORE UPDATE ON accounting_journals
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
COMMENT ON TABLE accounting_journals IS 'Journaux comptables SYSCOHADA : Ventes, Achats, Banque, Caisse, OD, A-Nouveau, Cloture.';

-- Journaux SYSCOHADA de base
INSERT INTO accounting_journals (code, name, type, is_default, sequence_prefix) VALUES
    ('VTE', 'Journal des Ventes',               'sales',     TRUE,  'VTE'),
    ('ACH', 'Journal des Achats',               'purchases', FALSE, 'ACH'),
    ('BQ',  'Journal de Banque',                'bank',      FALSE, 'BQ'),
    ('CAI', 'Journal de Caisse',                'cash',      FALSE, 'CAI'),
    ('OD',  'Journal des Operations Diverses',  'misc',      FALSE, 'OD'),
    ('AN',  'Journal d''A Nouveau',             'opening',   FALSE, 'AN'),
    ('CL',  'Journal de Cloture',               'closing',   FALSE, 'CL');

-- ---------------------------------------------------------------
-- 6.6 Table journal_entries — Ecritures comptables (en-têtes)
-- ---------------------------------------------------------------
CREATE TABLE journal_entries (
    id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    journal_id       UUID          NOT NULL REFERENCES accounting_journals(id) ON DELETE RESTRICT,
    fiscal_period_id UUID          NOT NULL REFERENCES fiscal_periods(id) ON DELETE RESTRICT,

    -- Numérotation
    entry_number     VARCHAR(50)   NOT NULL UNIQUE,

    -- Dates
    entry_date       DATE          NOT NULL,
    accounting_date  DATE          NOT NULL,

    -- Description
    label            VARCHAR(500)  NOT NULL,
    description      TEXT,

    -- Source (polymorphique)
    source_type      VARCHAR(50),
    source_id        UUID,

    -- Validation
    status           entry_status  NOT NULL DEFAULT 'draft',
    validated_by     UUID          REFERENCES users(id) ON DELETE SET NULL,
    validated_at     TIMESTAMPTZ,
    locked_at        TIMESTAMPTZ,

    -- Contrôle équilibre
    total_debit      NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_credit     NUMERIC(15,2) NOT NULL DEFAULT 0,
    is_balanced      BOOLEAN GENERATED ALWAYS AS (total_debit = total_credit) STORED,

    metadata         JSONB         NOT NULL DEFAULT '{}',

    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by       UUID          REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_je_amounts CHECK (total_debit >= 0 AND total_credit >= 0)
);
CREATE TRIGGER tg_journal_entries_updated_at
    BEFORE UPDATE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_je_journal_id    ON journal_entries(journal_id);
CREATE INDEX idx_je_fiscal_period ON journal_entries(fiscal_period_id);
CREATE INDEX idx_je_entry_date    ON journal_entries(entry_date DESC);
CREATE INDEX idx_je_source        ON journal_entries(source_type, source_id);
CREATE INDEX idx_je_status        ON journal_entries(status);
COMMENT ON TABLE journal_entries IS 'En-tetes des ecritures comptables. Chaque piece (facture, paiement, achat, depense) genere automatiquement ses ecritures.';

-- ---------------------------------------------------------------
-- 6.7 Table journal_entry_lines — Lignes d'écritures
-- ---------------------------------------------------------------
CREATE TABLE journal_entry_lines (
    id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    journal_entry_id UUID          NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_number   VARCHAR(20)   NOT NULL REFERENCES chart_of_accounts(account_number) ON DELETE RESTRICT,

    sort_order       SMALLINT      NOT NULL DEFAULT 0,
    label            VARCHAR(500)  NOT NULL,
    description      TEXT,

    -- Montants (un seul > 0, l'autre = 0)
    debit            NUMERIC(15,2) NOT NULL DEFAULT 0,
    credit           NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Lettrage (rapprochement comptable)
    lettering_code   VARCHAR(20),
    lettered_at      TIMESTAMPTZ,
    lettered_by      UUID          REFERENCES users(id) ON DELETE SET NULL,

    -- Analytique
    analytic_axis_1  VARCHAR(100),
    analytic_axis_2  VARCHAR(100),

    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_jel_debit_credit CHECK (debit >= 0 AND credit >= 0),
    CONSTRAINT chk_jel_not_both     CHECK (NOT (debit > 0 AND credit > 0)),
    CONSTRAINT chk_jel_not_zero     CHECK (debit > 0 OR credit > 0)
);
CREATE INDEX idx_jel_entry_id    ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_jel_account     ON journal_entry_lines(account_number);
CREATE INDEX idx_jel_lettering   ON journal_entry_lines(lettering_code) WHERE lettering_code IS NOT NULL;
COMMENT ON TABLE journal_entry_lines IS 'Lignes du plan comptable. Principe : somme debits = somme credits par ecriture.';

-- ---------------------------------------------------------------
-- 6.8 Vue v_account_balance — Grand Livre / Balance des comptes
-- ---------------------------------------------------------------
CREATE VIEW v_account_balance AS
SELECT
    coa.account_number,
    coa.name                      AS account_name,
    coa.account_class,
    coa.account_nature,
    COALESCE(SUM(jel.debit),  0)  AS total_debit,
    COALESCE(SUM(jel.credit), 0)  AS total_credit,
    CASE coa.account_nature
        WHEN 'debit_normal'  THEN COALESCE(SUM(jel.debit), 0)  - COALESCE(SUM(jel.credit), 0)
        WHEN 'credit_normal' THEN COALESCE(SUM(jel.credit), 0) - COALESCE(SUM(jel.debit), 0)
    END                           AS balance,
    COUNT(jel.id)                 AS nb_entries
FROM chart_of_accounts coa
LEFT JOIN journal_entry_lines jel ON jel.account_number = coa.account_number
LEFT JOIN journal_entries     je  ON je.id = jel.journal_entry_id
    AND je.status IN ('validated', 'locked')
WHERE coa.is_active = TRUE
  AND coa.is_detail_account = TRUE
GROUP BY coa.account_number, coa.name, coa.account_class, coa.account_nature
ORDER BY coa.account_number;
COMMENT ON VIEW v_account_balance IS 'Balance des comptes SYSCOHADA. Mouvements debit/credit et solde par compte. Base du bilan et du compte de resultat.';

-- ---------------------------------------------------------------
-- 6.9 Table tax_declarations — Déclarations fiscales TVA / DSF
-- ---------------------------------------------------------------
CREATE TABLE tax_declarations (
    id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    declaration_type    VARCHAR(50)   NOT NULL,
    fiscal_period_id    UUID          REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
    period_start        DATE          NOT NULL,
    period_end          DATE          NOT NULL,

    -- TVA
    tva_collected       NUMERIC(15,2) NOT NULL DEFAULT 0,
    tva_deductible      NUMERIC(15,2) NOT NULL DEFAULT 0,
    tva_net             NUMERIC(15,2) GENERATED ALWAYS AS (tva_collected - tva_deductible) STORED,
    tva_credit          NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Statut
    status              VARCHAR(20)   NOT NULL DEFAULT 'draft',
    submitted_at        TIMESTAMPTZ,
    submitted_by        UUID          REFERENCES users(id) ON DELETE SET NULL,
    payment_date        DATE,
    payment_amount      NUMERIC(15,2),
    payment_reference   VARCHAR(255),

    -- Fichier export
    export_path         VARCHAR(500),
    notes               TEXT,

    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by          UUID          REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_td_period CHECK (period_end >= period_start)
);
CREATE TRIGGER tg_tax_declarations_updated_at
    BEFORE UPDATE ON tax_declarations
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
COMMENT ON TABLE tax_declarations IS 'Declarations fiscales TVA (mensuelle) et DSF (annuelle). Obligation legale camerounaise.';

-- ---------------------------------------------------------------
-- CHECKLIST ÉTAPE 6
-- [x] ENUMs: journal_type, account_class, account_nature, entry_status, fiscal_period_status
-- [x] chart_of_accounts cree + seed 1347 comptes OHADA complets
-- [x] fiscal_periods cree
-- [x] accounting_journals cree + seed 7 journaux
-- [x] journal_entries cree (is_balanced GENERATED ALWAYS AS)
-- [x] journal_entry_lines cree (contraintes debit/credit)
-- [x] Vue v_account_balance
-- [x] tax_declarations (tva_net GENERATED ALWAYS AS)
-- [x] Tous index presents
-- ---------------------------------------------------------------

-- PROCHAINE ÉTAPE : étape 7 — Module Paramètres Avancés


-- ================================================================
-- ÉTAPE 7 — MODULE PARAMÈTRES AVANCÉS
-- ================================================================

-- ---------------------------------------------------------------
-- 7.1 Table document_templates — Templates HTML des PDFs
-- ---------------------------------------------------------------
CREATE TABLE document_templates (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_type       document_type NOT NULL,
    name                VARCHAR(255)  NOT NULL,
    description         TEXT,
    html_content        TEXT          NOT NULL,
    css_content         TEXT,
    is_default          BOOLEAN       NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
    available_variables JSONB         NOT NULL DEFAULT '[]',
    page_format         VARCHAR(10)   NOT NULL DEFAULT 'A4',
    page_orientation    VARCHAR(15)   NOT NULL DEFAULT 'portrait',
    margin_top_mm       SMALLINT      NOT NULL DEFAULT 10,
    margin_bottom_mm    SMALLINT      NOT NULL DEFAULT 10,
    margin_left_mm      SMALLINT      NOT NULL DEFAULT 15,
    margin_right_mm     SMALLINT      NOT NULL DEFAULT 15,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID          REFERENCES users(id) ON DELETE SET NULL,
    updated_by          UUID          REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER tg_document_templates_updated_at
    BEFORE UPDATE ON document_templates
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE UNIQUE INDEX uq_doc_template_default
    ON document_templates (document_type) WHERE is_default = TRUE AND deleted_at IS NULL;
COMMENT ON TABLE document_templates IS 'Templates HTML personnalisables des PDFs (factures, proformas, BC). Variables {{client.name}} injectees au rendu.';

-- ---------------------------------------------------------------
-- 7.2 ENUMs champs personnalisés
-- ---------------------------------------------------------------
CREATE TYPE custom_field_type AS ENUM (
    'text','number','date','boolean','select','multi_select','textarea','email','phone','url'
);
CREATE TYPE custom_field_entity AS ENUM (
    'client','product','invoice','proforma','supplier','purchase_order','expense','user'
);

-- ---------------------------------------------------------------
-- 7.2 Table custom_fields — Champs personnalisés dynamiques
-- ---------------------------------------------------------------
CREATE TABLE custom_fields (
    id                  UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type         custom_field_entity NOT NULL,
    name                VARCHAR(100)        NOT NULL,
    label               VARCHAR(255)        NOT NULL,
    field_type          custom_field_type   NOT NULL DEFAULT 'text',
    placeholder         VARCHAR(255),
    help_text           TEXT,
    options             JSONB,
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
CREATE TRIGGER tg_custom_fields_updated_at
    BEFORE UPDATE ON custom_fields
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
COMMENT ON TABLE custom_fields IS 'Champs personnalises dynamiques par type d''entite. Pas de code necessaire pour ajouter un champ metier.';

CREATE TABLE custom_field_values (
    id              UUID                NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    custom_field_id UUID                NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
    entity_type     custom_field_entity NOT NULL,
    entity_id       UUID                NOT NULL,
    value_text      TEXT,
    value_number    NUMERIC(15,4),
    value_date      DATE,
    value_boolean   BOOLEAN,
    value_json      JSONB,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_cfv_field_entity UNIQUE (custom_field_id, entity_id)
);
CREATE TRIGGER tg_cfv_updated_at
    BEFORE UPDATE ON custom_field_values
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_cfv_field_id ON custom_field_values(custom_field_id);
CREATE INDEX idx_cfv_entity   ON custom_field_values(entity_type, entity_id);
COMMENT ON TABLE custom_field_values IS 'Valeurs des champs personnalises par entite. Design EAV (Entity-Attribute-Value).';

-- ---------------------------------------------------------------
-- 7.3 Table workflow_rules — Règles de workflow configurables
-- ---------------------------------------------------------------
CREATE TABLE workflow_rules (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    module          VARCHAR(50)  NOT NULL,
    trigger_event   VARCHAR(100) NOT NULL,
    conditions      JSONB        NOT NULL DEFAULT '{}',
    actions         JSONB        NOT NULL DEFAULT '[]',
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    priority        SMALLINT     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      UUID         REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER tg_workflow_rules_updated_at
    BEFORE UPDATE ON workflow_rules
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
COMMENT ON TABLE workflow_rules IS 'Regles de workflow configurables sans code. Ex : facture > 500000 XAF => approbation admin requise.';

-- ---------------------------------------------------------------
-- 7.4 Table webhooks + webhook_deliveries — Webhooks sortants
-- ---------------------------------------------------------------
CREATE TABLE webhooks (
    id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name              VARCHAR(255) NOT NULL,
    url               VARCHAR(500) NOT NULL,
    secret            VARCHAR(255),
    events            TEXT[]       NOT NULL DEFAULT '{}',
    is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
    headers           JSONB        NOT NULL DEFAULT '{}',
    last_triggered_at TIMESTAMPTZ,
    last_status_code  SMALLINT,
    failure_count     SMALLINT     NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by        UUID         REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER tg_webhooks_updated_at
    BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
COMMENT ON TABLE webhooks IS 'Webhooks sortants. Notifie des systemes tiers (Zapier, N8N, apps custom) lors d''evenements InvoiceHub.';

CREATE TABLE webhook_deliveries (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id    UUID         NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event         VARCHAR(100) NOT NULL,
    payload       JSONB        NOT NULL DEFAULT '{}',
    status_code   SMALLINT,
    response_body TEXT,
    duration_ms   INTEGER,
    success       BOOLEAN      NOT NULL DEFAULT FALSE,
    error_message TEXT,
    retry_count   SMALLINT     NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wd_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_wd_created_at ON webhook_deliveries(created_at DESC);
COMMENT ON TABLE webhook_deliveries IS 'Historique des appels webhooks avec reponse, latence et gestion des retry.';

-- ---------------------------------------------------------------
-- 7.5 Table api_keys — Clés API pour accès tiers
-- ---------------------------------------------------------------
CREATE TABLE api_keys (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         VARCHAR(255) NOT NULL,
    key_hash     VARCHAR(255) NOT NULL UNIQUE,
    key_prefix   VARCHAR(10)  NOT NULL,
    permissions  TEXT[]       NOT NULL DEFAULT '{}',
    allowed_ips  INET[],
    expires_at   TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    last_used_ip INET,
    usage_count  INTEGER      NOT NULL DEFAULT 0,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    revoked_at   TIMESTAMPTZ,
    revoked_by   UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_by   UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TRIGGER tg_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE revoked_at IS NULL;
COMMENT ON TABLE api_keys IS 'Cles API pour integrations tierces. Jamais stockees en clair, permissions granulaires RBAC.';

-- ---------------------------------------------------------------
-- 7.6 Table ip_whitelist — Liste blanche IPs admin
-- ---------------------------------------------------------------
CREATE TABLE ip_whitelist (
    id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_address CIDR         NOT NULL,
    label      VARCHAR(255) NOT NULL,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by UUID         REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT uq_ip_whitelist UNIQUE (ip_address)
);
COMMENT ON TABLE ip_whitelist IS 'IPs autorisees pour les actions admin sensibles. Supporte les plages CIDR.';

-- ---------------------------------------------------------------
-- 7.7 ENUMs + Table export_jobs — Jobs d'exports asynchrones
-- ---------------------------------------------------------------
CREATE TYPE export_format AS ENUM ('csv','excel','pdf','json','sage_csv','ciel_csv','dsf_xml');
CREATE TYPE export_status AS ENUM ('pending','running','completed','failed','expired');

CREATE TABLE export_jobs (
    id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    module          VARCHAR(50)   NOT NULL,
    format          export_format NOT NULL,
    filters         JSONB         NOT NULL DEFAULT '{}',
    file_path       VARCHAR(500),
    file_size_bytes BIGINT,
    status          export_status NOT NULL DEFAULT 'pending',
    progress        SMALLINT      NOT NULL DEFAULT 0,
    error_message   TEXT,
    expires_at      TIMESTAMPTZ   NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by      UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX idx_ej_created_by ON export_jobs(created_by);
CREATE INDEX idx_ej_status     ON export_jobs(status);
COMMENT ON TABLE export_jobs IS 'Jobs d''export asynchrones (comptabilite Sage/Ciel, DSF XML, rapports PDF/Excel). Expire apres 24h.';

-- ---------------------------------------------------------------
-- CHECKLIST ÉTAPE 7
-- [x] document_templates cree
-- [x] custom_fields + custom_field_values crees (design EAV)
-- [x] workflow_rules cree
-- [x] webhooks + webhook_deliveries crees
-- [x] api_keys cree
-- [x] ip_whitelist cree
-- [x] export_jobs cree
-- [x] ENUMs: custom_field_type, custom_field_entity, export_format, export_status
-- ---------------------------------------------------------------

-- PROCHAINE ÉTAPE : étape 8 — Vues étendues, indexes finaux & commentaires


-- ================================================================
-- ÉTAPE 8 — VUES ÉTENDUES, INDEXES FINAUX & COMMENTAIRES
-- ================================================================

-- ---------------------------------------------------------------
-- 8.2 Vue v_product_margin — Marges par produit en temps réel
-- ---------------------------------------------------------------
CREATE VIEW v_product_margin AS
SELECT
    p.id                                                             AS product_id,
    p.name                                                           AS product_name,
    pc.name                                                          AS category_name,
    p.unit_price_ht                                                  AS selling_price_ht,
    COALESCE(p.purchase_price_ht, 0)                                 AS purchase_price_ht,
    COALESCE(p.cost_price_ht, p.purchase_price_ht, 0)               AS cost_price_ht,
    CASE
        WHEN p.unit_price_ht > 0 AND COALESCE(p.cost_price_ht, p.purchase_price_ht) > 0
        THEN ROUND(
            (p.unit_price_ht - COALESCE(p.cost_price_ht, p.purchase_price_ht))
            / p.unit_price_ht * 100, 2)
        ELSE NULL
    END                                                              AS margin_pct,
    CASE
        WHEN p.unit_price_ht > 0 AND COALESCE(p.cost_price_ht, p.purchase_price_ht) > 0
        THEN p.unit_price_ht - COALESCE(p.cost_price_ht, p.purchase_price_ht)
        ELSE NULL
    END                                                              AS margin_amount_ht,
    p.track_stock                                                    AS tracks_stock,
    p.stock_quantity                                                 AS current_stock,
    p.stock_min_level                                                AS min_stock_level
FROM products p
LEFT JOIN product_categories pc ON pc.id = p.category_id
WHERE p.deleted_at IS NULL AND p.is_active = TRUE;
COMMENT ON VIEW v_product_margin IS 'Marges par produit (prix vente vs prix achat/revient). Badge marge du formulaire de vente.';

-- ---------------------------------------------------------------
-- 8.3 Vue v_expense_vs_budget — Budget vs Réalisé
-- ---------------------------------------------------------------
CREATE VIEW v_expense_vs_budget AS
SELECT
    ec.id                                                            AS category_id,
    ec.name                                                          AS category_name,
    ec.accounting_account,
    eb.year,
    eb.month,
    COALESCE(eb.budget_amount, 0)                                    AS budget_amount,
    COALESCE(SUM(e.amount_ttc)
        FILTER (WHERE e.status IN ('approved','paid')
            AND e.deleted_at IS NULL), 0)                            AS actual_amount,
    COALESCE(eb.budget_amount, 0) -
    COALESCE(SUM(e.amount_ttc)
        FILTER (WHERE e.status IN ('approved','paid')
            AND e.deleted_at IS NULL), 0)                            AS remaining_budget,
    CASE WHEN COALESCE(eb.budget_amount, 0) > 0
        THEN ROUND(COALESCE(SUM(e.amount_ttc)
            FILTER (WHERE e.status IN ('approved','paid')
                AND e.deleted_at IS NULL), 0)
            / eb.budget_amount * 100, 2)
        ELSE NULL
    END                                                              AS budget_used_pct
FROM expense_categories ec
LEFT JOIN expense_budgets eb ON eb.category_id = ec.id
LEFT JOIN expenses e ON e.category_id = ec.id
    AND (eb.year  IS NULL OR EXTRACT(YEAR  FROM e.expense_date) = eb.year)
    AND (eb.month IS NULL OR EXTRACT(MONTH FROM e.expense_date) = eb.month)
WHERE ec.deleted_at IS NULL
GROUP BY ec.id, ec.name, ec.accounting_account, eb.year, eb.month, eb.budget_amount;
COMMENT ON VIEW v_expense_vs_budget IS 'Comparatif Budget vs Realise par categorie de depenses.';

-- ---------------------------------------------------------------
-- 8.4 Vue v_supplier_financial_summary — déjà définie à l'étape 3.12 (complète)
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- 8.5 Indexes manquants — performance & soft-delete
-- ---------------------------------------------------------------

-- Full-text search sur suppliers.name (idx_suppliers_name déjà créé étape 3 — même expression)
-- CREATE INDEX idx_suppliers_name_fts ON suppliers USING gin(to_tsvector('french', name));

-- Partial WHERE deleted_at IS NULL sur tables soft-deletable
-- idx_suppliers_active déjà créé étape 3 sur suppliers(id) WHERE deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_suppliers_deleted ON suppliers(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_active        ON expenses(deleted_at)         WHERE deleted_at IS NULL;
CREATE INDEX idx_purchase_orders_active ON purchase_orders(deleted_at)  WHERE deleted_at IS NULL;
CREATE INDEX idx_supplier_invoices_act  ON supplier_invoices(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_bank_accounts_active   ON bank_accounts(deleted_at)    WHERE deleted_at IS NULL;
CREATE INDEX idx_doc_templates_active   ON document_templates(deleted_at) WHERE deleted_at IS NULL;

-- Composite sur journal_entry_lines pour les lookups courants
CREATE INDEX idx_jel_entry_account
    ON journal_entry_lines(journal_entry_id, account_number);

-- Expenses par date et catégorie (idx_exp_date_category existe déjà, renommé)
CREATE INDEX IF NOT EXISTS idx_expenses_date_cat
    ON expenses(expense_date DESC, category_id);

-- Bank transactions par compte et date (index déjà créé à l'étape 5)
-- CREATE INDEX idx_bt_account_date ON bank_transactions(bank_account_id, transaction_date DESC);

-- Stock movements par produit et date (index déjà créé à l'étape 3)
-- CREATE INDEX idx_sm_product_date ON stock_movements(product_id, created_at DESC);

-- Purchase orders par fournisseur et statut
CREATE INDEX idx_po_supplier_status
    ON purchase_orders(supplier_id, status);

-- Supplier invoices par fournisseur et échéance
CREATE INDEX idx_si_supplier_due
    ON supplier_invoices(supplier_id, due_date);

-- Export jobs non-expirés
CREATE INDEX idx_ej_expires
    ON export_jobs(expires_at) WHERE status NOT IN ('completed','failed','expired');

-- Webhooks actifs
CREATE INDEX idx_webhooks_active
    ON webhooks(is_active) WHERE is_active = TRUE;

-- ---------------------------------------------------------------
-- 8.6 COMMENT ON TABLE — Tables sans commentaire
-- ---------------------------------------------------------------
COMMENT ON TABLE roles                  IS 'Roles RBAC dynamiques. Remplace l''enum user_role. Chaque role porte un tableau de permissions granulaires TEXT[].';
COMMENT ON TABLE role_change_history    IS 'Historique immuable des changements de role utilisateur. Jamais modifiable.';
COMMENT ON TABLE suppliers              IS 'Fournisseurs de BTS. Supporte multi-contacts, conditions de paiement et compte comptable SYSCOHADA.';
COMMENT ON TABLE supplier_contacts      IS 'Contacts nommes par fournisseur (acheteur, directeur, comptable...).';
COMMENT ON TABLE purchase_orders        IS 'Bons de commande fournisseurs. Cycle : draft -> sent -> partially_received -> received -> cancelled.';
COMMENT ON TABLE purchase_order_lines   IS 'Lignes des bons de commande. Prix et taxes captures a la creation (snapshot).';
COMMENT ON TABLE purchase_order_status_history IS 'Historique des transitions de statut des bons de commande.';
COMMENT ON TABLE supplier_invoices      IS 'Factures recues des fournisseurs. Liees aux BC et aux paiements fournisseurs.';
COMMENT ON TABLE supplier_invoice_lines IS 'Lignes des factures fournisseurs.';
COMMENT ON TABLE supplier_payments      IS 'Paiements effectues aux fournisseurs. Met a jour le solde de la facture fournisseur.';
COMMENT ON TABLE stock_movements        IS 'Mouvements de stock immuables. Toute entree/sortie de stock genere une ligne ici.';
COMMENT ON TABLE expense_categories     IS 'Categories de depenses operationnelles avec compte comptable SYSCOHADA associe.';
COMMENT ON TABLE expenses               IS 'Depenses operationnelles (loyers, deplacement, salaires...). Workflow approbation admin.';
COMMENT ON TABLE expense_status_history IS 'Historique des statuts des depenses (soumis -> approuve -> paye).';
COMMENT ON TABLE expense_budgets        IS 'Budgets mensuels par categorie de depense. Base du widget Budget vs Realise.';
COMMENT ON TABLE bank_accounts          IS 'Comptes bancaires BTS. Supporte multi-banques, multi-devises, RIB IBAN.';
COMMENT ON TABLE bank_transactions      IS 'Transactions bancaires importees ou saisies manuellement. Base du rapprochement.';
COMMENT ON TABLE bank_statement_imports IS 'Imports de releves bancaires (CSV, OFX). Trace l''origine de chaque lot de transactions.';
COMMENT ON TABLE bank_reconciliations   IS 'Rapprochements bancaires. Chaque ligne lie une transaction bancaire a une ecriture interne.';
COMMENT ON TABLE custom_fields          IS 'Champs personnalises dynamiques par type d''entite. Design EAV sans migration schema.';
COMMENT ON TABLE custom_field_values    IS 'Valeurs des champs personnalises. Une ligne par (champ, entite).';
COMMENT ON TABLE workflow_rules         IS 'Regles de workflow configurables. Declenchees par evenements metier, evaluent des conditions JSONB.';
COMMENT ON TABLE webhooks               IS 'Webhooks sortants vers systemes tiers (Zapier, N8N, ERP client).';
COMMENT ON TABLE webhook_deliveries     IS 'Historique des livraisons webhook avec statut HTTP, latence et gestion retry.';
COMMENT ON TABLE api_keys               IS 'Cles API pour integrations tierces. Hashees SHA-256, permissions granulaires.';
COMMENT ON TABLE ip_whitelist           IS 'Adresses IP (CIDR) autorisees pour les operations admin sensibles.';
COMMENT ON TABLE export_jobs            IS 'Jobs d''export asynchrones. Fichiers CSV/Excel/PDF/XML generes en arriere-plan.';
COMMENT ON TABLE document_templates     IS 'Templates HTML/CSS des PDFs generables. Variables {{mustache}} injectees au rendu.';

-- ---------------------------------------------------------------
-- 8.6b Indexes soft-delete manquants (tables sans index partial deleted_at)
-- ---------------------------------------------------------------
CREATE INDEX idx_agency_offices_active       ON agency_offices(id)                    WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_active              ON clients(id)                            WHERE deleted_at IS NULL;
CREATE INDEX idx_expense_categories_active   ON expense_categories(id)                 WHERE deleted_at IS NULL;
CREATE INDEX idx_product_categories_active   ON product_categories(id)                 WHERE deleted_at IS NULL;
CREATE INDEX idx_products_active             ON products(id)                            WHERE deleted_at IS NULL;
CREATE INDEX idx_recurring_templates_active  ON recurring_invoice_templates(id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_tax_rates_active            ON tax_rates(id)                           WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- 8.6c Table supplier_invoice_status_history — historique statuts FF
--     Les factures fournisseurs passent par plusieurs statuts (draft →
--     received → validated → partially_paid → paid / disputed / cancelled)
--     Il faut un historique complet comme pour purchase_orders et expenses.
-- ---------------------------------------------------------------
CREATE TABLE supplier_invoice_status_history (
    id                  UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_invoice_id UUID                    NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
    changed_by          UUID                    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    previous_status     supplier_invoice_status,
    new_status          supplier_invoice_status NOT NULL,
    reason              TEXT,
    changed_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_si_status_hist      ON supplier_invoice_status_history(supplier_invoice_id);
CREATE INDEX idx_si_status_hist_date ON supplier_invoice_status_history(changed_at DESC);
COMMENT ON TABLE supplier_invoice_status_history IS 'Historique des changements de statut des factures fournisseurs. Miroir de invoice_status_history côté achats.';

-- ---------------------------------------------------------------
-- 8.6d Colonnes created_by manquantes sur tables sans traçabilité auteur
-- ---------------------------------------------------------------
ALTER TABLE agency_offices      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tax_rates            ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE email_templates      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE fiscal_periods       ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE accounting_journals  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE supplier_contacts    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- 8.7 COMMENT ON COLUMN — Colonnes critiques
-- ---------------------------------------------------------------
COMMENT ON COLUMN users.role_id              IS 'FK vers la table roles. Remplace l''ancien enum user_role.';
COMMENT ON COLUMN users.must_change_password IS 'Vrai = l''utilisateur doit changer son mot de passe a la prochaine connexion.';
COMMENT ON COLUMN invoices.type              IS 'standard | acompte | solde | avoir | recurring. Determine le comportement de la facturation.';
COMMENT ON COLUMN invoices.balance_due       IS 'Solde restant du. Mis a jour automatiquement apres chaque paiement.';
COMMENT ON COLUMN journal_entries.is_balanced IS 'Genere automatiquement. TRUE si total_debit = total_credit. Toute ecriture doit etre equilibree.';
COMMENT ON COLUMN journal_entry_lines.lettering_code IS 'Code de lettrage pour rapprochement clients/fournisseurs. Meme code sur debit et credit correspondants.';
COMMENT ON COLUMN tax_declarations.tva_net   IS 'Genere automatiquement. TVA collectee - TVA deductible = TVA nette a payer.';
COMMENT ON COLUMN bank_reconciliations.difference IS 'Genere automatiquement. Doit etre 0 pour un rapprochement parfait.';
COMMENT ON COLUMN export_jobs.expires_at     IS 'Le fichier genere expire apres 24h. Nettoyage automatique par job cron.';
COMMENT ON COLUMN api_keys.key_hash          IS 'SHA-256 de la cle brute. La cle brute n''est jamais stockee en base.';

-- ---------------------------------------------------------------
-- 8.8 Checklist étape 8
-- [x] v_dashboard_kpis mis a jour (achats, depenses, marge brute, dettes)
-- [x] v_product_margin creee
-- [x] v_expense_vs_budget creee
-- [x] v_supplier_financial_summary creee
-- [x] Indexes full-text, partiels, composites ajoutes
-- [x] COMMENT ON TABLE pour toutes les nouvelles tables
-- [x] COMMENT ON COLUMN pour les colonnes critiques
-- ---------------------------------------------------------------

-- ================================================================
-- ████████████████████████████████████████████████████████████████
-- FIN DU SCHÉMA v3 — InvoiceHub ERP BTS
-- ████████████████████████████████████████████████████████████████
--
-- Modules inclus (v3) :
--   [1] RBAC Dynamique          — roles, role_change_history
--   [2] Extensions existantes   — company_settings+, products+, payments+, clients+
--   [3] Module Achats           — suppliers, purchase_orders, supplier_invoices, stock_movements
--   [4] Module Dépenses         — expense_categories, expenses, expense_budgets
--   [5] Module Banques          — bank_accounts, bank_transactions, bank_reconciliations
--   [6] Module Comptabilité     — chart_of_accounts (1347 OHADA), fiscal_periods,
--                                  accounting_journals, journal_entries, tax_declarations
--   [7] Module Paramètres       — document_templates, custom_fields, workflow_rules,
--                                  webhooks, api_keys, ip_whitelist, export_jobs
--   [8] Vues étendues           — v_dashboard_kpis, v_product_margin, v_expense_vs_budget,
--                                  v_supplier_financial_summary, v_account_balance,
--                                  v_cash_position, v_client_financial_summary
--
-- Base : PostgreSQL 15+ | Extensions : uuid-ossp, pgcrypto, unaccent
-- Conformité : SYSCOHADA / OHADA — Plan comptable camerounais complet
-- Entreprise : Bridge Technologies Solutions (BTS) — Douala, Cameroun
-- Version : v3.0 | Date : 2026-04-17
-- ================================================================

-- FIN ÉTAPE 1 — RBAC DYNAMIQUE
-- ████████████████████████████████████████████████████████████████
--
-- CHECKLIST ÉTAPE 1 :
-- [x] Table `roles` créée avec index, trigger, commentaires
-- [x] users.role_id (FK → roles) remplace users.role (enum)
-- [x] audit_logs.user_role_name VARCHAR(100) remplace user_role enum
-- [x] 3 rôles système insérés : admin (*), commercial, employee
-- [x] Table role_change_history créée (immuable)
-- [x] ENUM user_role NON créé (remplacé par table roles)
-- [x] FK roles.created_by → users(id) ajoutée post-création
-- [x] Toutes les requêtes s'enchaînent sans erreur
--
-- PROCHAINE ÉTAPE : étape 2 — Extensions tables existantes
-- ================================================================

-- ████████████████████████████████████████████████████████████████
-- MODULE WORKFLOW D'APPROBATION — Enums + Tables + Index
-- Ajouté : 2026-04-25
-- ████████████████████████████████████████████████████████████████

-- ── Enums ────────────────────────────────────────────────────────

CREATE TYPE approval_document_type AS ENUM (
  'invoice', 'proforma', 'purchase_order', 'supplier_invoice', 'expense'
);

CREATE TYPE approval_request_status AS ENUM (
  'pending', 'approved', 'rejected', 'cancelled', 'expired'
);

CREATE TYPE approval_decision_type AS ENUM (
  'approved', 'rejected', 'delegated'
);

CREATE TYPE approval_trigger_operator AS ENUM (
  'gte', 'lte', 'eq', 'gt', 'lt'
);

-- Mise à jour enum notification_status (idempotente)
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'approval_requested';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'approval_approved';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'approval_rejected';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'approval_expired';
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'approval_delegated';

-- Mise à jour enum audit_action (idempotente)
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'APPROVAL_REQUESTED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'APPROVAL_DECISION';

-- ── Colonnes requiresApproval + approvalRequestId ────────────────

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS requires_approval     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approval_request_id   UUID;

ALTER TABLE proformas
  ADD COLUMN IF NOT EXISTS requires_approval     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approval_request_id   UUID;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS requires_approval_wf  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approval_request_id   UUID;

ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS requires_approval     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approval_request_id   UUID;

-- Document original reçu du fournisseur (pièce jointe : PDF/image). On ne génère
-- jamais de PDF "Facture" à en-tête BTS pour une FF — on stocke le document source.
ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS attachment_path       VARCHAR(500);

-- Portabilité hors zone OHADA : on retire le défaut '4011' codé en dur sur le
-- compte d'achat. L'engine comptable utilise defaultPurchaseAccount (company_settings)
-- quand la colonne est nulle.
ALTER TABLE supplier_invoices
  ALTER COLUMN accounting_account DROP DEFAULT;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS requires_approval_wf  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approval_request_id   UUID;

-- ── Tables ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_workflows (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(500),
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  priority    INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_workflow_triggers (
  id            UUID                      PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id   UUID                      NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
  document_type approval_document_type    NOT NULL,
  field         VARCHAR(50)               NOT NULL,
  operator      approval_trigger_operator NOT NULL,
  value         VARCHAR(200)              NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_workflow_steps (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id      UUID        NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
  "order"          INTEGER     NOT NULL,
  name             VARCHAR(100) NOT NULL,
  description      VARCHAR(300),
  approver_role    VARCHAR(50),
  approver_user_id UUID        REFERENCES users(id),
  deadline_hours   INTEGER,
  require_comment  BOOLEAN     NOT NULL DEFAULT FALSE,
  allow_delegate   BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id                UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id       UUID                    NOT NULL REFERENCES approval_workflows(id),
  document_type     approval_document_type  NOT NULL,
  document_id       UUID                    NOT NULL,
  document_number   VARCHAR(50),
  document_snapshot JSONB                   NOT NULL,
  status            approval_request_status NOT NULL DEFAULT 'pending',
  current_step      INTEGER                 NOT NULL DEFAULT 1,
  total_steps       INTEGER                 NOT NULL,
  requested_by_id   UUID                    NOT NULL REFERENCES users(id),
  requested_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  resolved_by_id    UUID                    REFERENCES users(id),
  resolved_at       TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS approval_decisions (
  id               UUID                   PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id       UUID                   NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_id          UUID                   NOT NULL REFERENCES approval_workflow_steps(id),
  step_order       INTEGER                NOT NULL,
  decided_by_id    UUID                   NOT NULL REFERENCES users(id),
  decided_at       TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
  decision         approval_decision_type NOT NULL,
  comment          VARCHAR(1000),
  delegated_to_id  UUID                   REFERENCES users(id)
);

-- ── Index ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_approval_requests_document_id   ON approval_requests(document_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status        ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_document_type ON approval_requests(document_type);
CREATE INDEX IF NOT EXISTS idx_approval_requests_requested_by  ON approval_requests(requested_by_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_workflow      ON approval_requests(workflow_id);
CREATE INDEX IF NOT EXISTS idx_approval_decisions_request_id   ON approval_decisions(request_id);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_wf      ON approval_workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_approval_triggers_wf            ON approval_workflow_triggers(workflow_id);

-- ── Commentaires ─────────────────────────────────────────────────

COMMENT ON TABLE approval_workflows         IS 'Définitions des workflows d''approbation configurables par l''admin';
COMMENT ON TABLE approval_workflow_triggers IS 'Règles de déclenchement d''un workflow (type de document + condition sur champ)';
COMMENT ON TABLE approval_workflow_steps    IS 'Étapes séquentielles d''un workflow avec approbateurs désignés';
COMMENT ON TABLE approval_requests          IS 'Instances de workflow en cours sur des documents métier';
COMMENT ON TABLE approval_decisions         IS 'Décisions prises sur chaque étape d''une demande d''approbation';

-- FIN MODULE WORKFLOW D'APPROBATION
-- ████████████████████████████████████████████████████████████████
