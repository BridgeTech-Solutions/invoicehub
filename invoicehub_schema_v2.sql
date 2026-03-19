-- ================================================================
--  InvoiceHub PostgreSQL Schema v2.0
--  Bridge Technologies Solutions (BTS) — Douala, Cameroun
--  Conçu pour : conformité SYSCOHADA, niveau entreprise
--  Auteur   : Claude (Anthropic) — Mars 2026
--  DB       : PostgreSQL 15+
-- ================================================================

-- ================================================================
-- EXTENSIONS
-- ================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- cryptographic functions
CREATE EXTENSION IF NOT EXISTS "unaccent";    -- accent-insensitive search

-- ================================================================
-- ENUMS
-- Utilisation des enums PostgreSQL pour l'intégrité des données
-- ================================================================

CREATE TYPE user_role     AS ENUM ('admin', 'commercial', 'employee');
CREATE TYPE user_status   AS ENUM ('active', 'suspended', 'pending_activation');

CREATE TYPE client_type   AS ENUM ('company', 'individual');
CREATE TYPE client_status AS ENUM ('active', 'archived');

CREATE TYPE product_type  AS ENUM ('product', 'service');
CREATE TYPE product_unit  AS ENUM ('heure', 'jour', 'forfait', 'piece', 'licence', 'mois', 'annee');

CREATE TYPE document_type AS ENUM ('proforma', 'invoice');
CREATE TYPE discount_type AS ENUM ('none', 'percentage', 'fixed');

CREATE TYPE proforma_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired');

-- Tous les types de factures définis dans le CDC
CREATE TYPE invoice_type   AS ENUM ('standard', 'acompte', 'solde', 'avoir', 'recurring');
CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'cancelled', 'overdue');

CREATE TYPE payment_method AS ENUM ('virement', 'especes', 'cheque', 'mobile_money', 'autre');

CREATE TYPE recurring_interval AS ENUM ('monthly', 'quarterly', 'biannual', 'annual');

CREATE TYPE backup_status AS ENUM ('pending', 'running', 'success', 'failed');

-- Toutes les actions auditables (SYSCOHADA + sécurité)
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
-- 1. COMPANY_SETTINGS — Paramètres globaux de BTS
-- ================================================================
CREATE TABLE company_settings (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identité légale
    company_name            VARCHAR(255) NOT NULL,
    legal_form              VARCHAR(100),                        -- SARL, SA, SAS, etc.
    tax_number              VARCHAR(100),                        -- NIU Cameroun
    rccm                    VARCHAR(100),                        -- RCCM

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
    header_image_path       VARCHAR(500),   -- Image pleine largeur en-tête des factures/proformas
    footer_image_path       VARCHAR(500),   -- Image pleine largeur pied de page des factures/proformas
    footer_safe_zone_px     SMALLINT NOT NULL DEFAULT 0, -- Hauteur px de la zone infos entreprise à protéger en bas du footer

    -- Paramètres financiers
    default_currency        CHAR(3)      NOT NULL DEFAULT 'XAF',
    default_tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 19.25,

    -- Numérotation SYSCOHADA (préfixe = code entreprise)
    company_code            VARCHAR(10)  NOT NULL DEFAULT 'BTS',

    -- Délais par défaut (en jours)
    default_proforma_validity_days  SMALLINT NOT NULL DEFAULT 30,
    default_invoice_due_days        SMALLINT NOT NULL DEFAULT 30,

    -- Sécurité
    session_timeout_minutes SMALLINT    NOT NULL DEFAULT 30,
    max_login_attempts      SMALLINT    NOT NULL DEFAULT 5,

    -- Relances automatiques (jours après échéance)
    auto_reminder_days      SMALLINT[]           DEFAULT ARRAY[7, 14, 30],
    -- Escalade des relances internes (JSON configurable par niveau)
    reminder_escalation     JSONB                NOT NULL DEFAULT '{}',

    -- Champs flexibles pour extensions futures
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

-- ================================================================
-- 2. AGENCY_OFFICES — Bureaux/Agences (code utilisé dans la numérotation)
-- Exemple : BTS/DC/2026/01/fac001  →  DC = Douala Commercial
-- ================================================================
CREATE TABLE agency_offices (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        VARCHAR(10)  NOT NULL UNIQUE,    -- 'DC', 'YDE', 'BFM', etc.
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

-- Une seule agence par défaut
CREATE UNIQUE INDEX uq_agency_offices_default
    ON agency_offices (is_default) WHERE is_default = TRUE;

-- Données initiales
INSERT INTO agency_offices (code, name, city, is_default)
VALUES ('DC', 'Direction Commerciale — Douala', 'Douala', TRUE);

-- ================================================================
-- 3. TAX_RATES — Taux de taxes (SYSCOHADA multi-taxes)
-- ================================================================
CREATE TABLE tax_rates (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL,              -- 'TVA Standard Cameroun'
    code        VARCHAR(20)  NOT NULL UNIQUE,        -- 'TVA_19_25', 'TVA_0', 'IS'
    rate        NUMERIC(5,2) NOT NULL,               -- 19.25
    description TEXT,
    is_default  BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,

    CONSTRAINT chk_tax_rate_range CHECK (rate BETWEEN 0 AND 100)
);
CREATE TRIGGER tg_tax_rates_updated_at
    BEFORE UPDATE ON tax_rates
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE UNIQUE INDEX uq_tax_rates_default
    ON tax_rates (is_default) WHERE is_default = TRUE;

-- TVA camerounaise par défaut
INSERT INTO tax_rates (name, code, rate, description, is_default)
VALUES ('TVA Cameroun', 'TVA_19_25', 19.25,
        'Taxe sur la Valeur Ajoutée — Taux standard Cameroun (SYSCOHADA)', TRUE);

INSERT INTO tax_rates (name, code, rate, description)
VALUES ('Exonéré', 'EXONERE', 0.00, 'Produit ou service exonéré de TVA');

-- ================================================================
-- 4. USERS — Employés BTS avec RBAC
-- Soft-delete = suspension du compte (documents conservés)
-- ================================================================
CREATE TABLE users (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identité
    first_name              VARCHAR(100) NOT NULL,
    last_name               VARCHAR(100) NOT NULL,
    email                   VARCHAR(255) NOT NULL UNIQUE,
    phone                   VARCHAR(50),
    avatar_path             VARCHAR(500),
    signature_path          VARCHAR(500),           -- signature manuscrite pour PDFs

    -- Authentification
    password_hash           VARCHAR(255) NOT NULL,  -- bcrypt coût 12
    role                    user_role    NOT NULL DEFAULT 'employee',
    status                  user_status  NOT NULL DEFAULT 'pending_activation',
    must_change_password    BOOLEAN      NOT NULL DEFAULT TRUE,

    -- Sécurité anti-brute-force
    failed_login_attempts   SMALLINT     NOT NULL DEFAULT 0,
    last_failed_login_at    TIMESTAMPTZ,
    locked_at               TIMESTAMPTZ,
    lock_reason             VARCHAR(255),

    -- 2FA (TOTP)
    two_factor_enabled      BOOLEAN      NOT NULL DEFAULT FALSE,
    two_factor_secret       TEXT,                   -- secret TOTP chiffré (AES via pgcrypto)
    two_factor_enabled_at   TIMESTAMPTZ,
    two_factor_backup_codes TEXT[]       NOT NULL DEFAULT '{}', -- hash SHA-256 des codes de secours (usage unique)

    -- Préférences UI
    language                CHAR(2)      NOT NULL DEFAULT 'fr',
    timezone                VARCHAR(50)  NOT NULL DEFAULT 'Africa/Douala',
    theme                   VARCHAR(20)  NOT NULL DEFAULT 'system',
    email_notifications     BOOLEAN      NOT NULL DEFAULT TRUE,
    invoice_notifications   BOOLEAN      NOT NULL DEFAULT TRUE,

    -- Tracking
    last_login_at           TIMESTAMPTZ,
    last_activity_at        TIMESTAMPTZ,
    last_summary_sent_at    TIMESTAMPTZ,

    -- Champs flexibles
    metadata                JSONB        NOT NULL DEFAULT '{}',

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Soft-delete = suspension (jamais supprimé si a créé des documents)
    deleted_at              TIMESTAMPTZ,
    created_by              UUID        REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_email_format CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$')
);
CREATE TRIGGER tg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_users_role       ON users(role);
CREATE INDEX idx_users_status     ON users(status);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- ================================================================
-- 5. REFRESH_TOKENS — Gestion des tokens JWT (révocables)
-- ================================================================
CREATE TABLE refresh_tokens (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,   -- SHA-256 du token
    device_name     VARCHAR(255),                   -- "Chrome / Windows 11"
    device_info     JSONB        NOT NULL DEFAULT '{}', -- user-agent complet, OS, etc.
    ip_address      INET,
    expires_at      TIMESTAMPTZ  NOT NULL,
    revoked_at      TIMESTAMPTZ,
    revoke_reason   VARCHAR(100),                   -- 'logout', 'rotation', 'manual_revoke', 'password_change', 'session_timeout', 'revoke_all'
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- mise à jour à chaque rotation — utilisé pour le timeout d'inactivité
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user_id    ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
-- Nettoyage automatique des tokens expirés
CREATE INDEX idx_refresh_tokens_cleanup
    ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;

-- ================================================================
-- 6. LOGIN_HISTORY — Historique connexions (audit RGPD)
-- ================================================================
CREATE TABLE login_history (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
    email           VARCHAR(255) NOT NULL,          -- capturé même si l'email n'existe pas
    ip_address      INET,
    user_agent      TEXT,
    success         BOOLEAN      NOT NULL DEFAULT FALSE,
    failure_reason  VARCHAR(100),                   -- 'bad_password', 'account_locked', etc.
    session_id      UUID,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_login_history_user_id    ON login_history(user_id);
CREATE INDEX idx_login_history_created_at ON login_history(created_at);

-- ================================================================
-- 7. PASSWORD_RESET_TOKENS — Réinitialisation mot de passe (CDC §4.7)
-- Token à usage unique, durée de vie 1h, jamais stocké en clair
-- ================================================================
CREATE TABLE password_reset_tokens (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,   -- SHA-256 du token brut envoyé par email
    expires_at  TIMESTAMPTZ  NOT NULL,           -- validité : 1 heure après création
    used_at     TIMESTAMPTZ,                     -- NULL = pas encore utilisé
    ip_address  INET,                            -- IP de la demande (audit sécurité)
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_prt_expires CHECK (expires_at > created_at)
);
CREATE INDEX idx_prt_user_id    ON password_reset_tokens(user_id);
CREATE INDEX idx_prt_expires_at ON password_reset_tokens(expires_at);
-- Index partiel : recherche uniquement les tokens actifs (non utilisés)
CREATE INDEX idx_prt_active     ON password_reset_tokens(token_hash)
    WHERE used_at IS NULL;

COMMENT ON TABLE password_reset_tokens IS
    'Tokens de réinitialisation de mot de passe. Usage unique, durée 1h, jamais stockés en clair.';


-- ================================================================
-- 8. PRODUCT_CATEGORIES — Catalogue catégories (gérable par admin)
-- ================================================================
CREATE TABLE product_categories (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon        VARCHAR(50),                        -- nom d'icône (ex: 'server', 'shield')
    color       CHAR(7),                            -- couleur HEX pour UI (ex: '#4F46E5')
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

-- Catégories BTS préconfigurées (CDC §4.2)
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

    -- Identité
    name            VARCHAR(255) NOT NULL,
    reference       VARCHAR(100),                   -- SKU / référence fabricant
    type            product_type NOT NULL DEFAULT 'product',
    description     TEXT,                           -- texte enrichi (HTML / Markdown)

    -- Facturation
    unit            product_unit NOT NULL DEFAULT 'piece',
    unit_price_ht   NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Taxes (lien vers table + valeur cachée pour performances)
    tax_rate_id     UUID        REFERENCES tax_rates(id) ON DELETE RESTRICT,
    tax_rate_value  NUMERIC(5,2) NOT NULL DEFAULT 19.25,

    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,

    -- Champs flexibles : specs techniques, marque, garantie, etc.
    metadata        JSONB        NOT NULL DEFAULT '{}',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,                    -- désactivation logique
    created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,

    -- Unicité : pas deux produits de même nom dans la même catégorie
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

-- ================================================================
-- 10. CLIENTS — Annuaire clients (entreprises et particuliers)
-- ================================================================
CREATE TABLE clients (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    type            client_type  NOT NULL DEFAULT 'company',

    -- Identité
    name            VARCHAR(255) NOT NULL,          -- raison sociale ou nom complet
    email           VARCHAR(255),
    phone           VARCHAR(50),
    phone_2         VARCHAR(50),

    -- Adresse
    address         TEXT,
    city            VARCHAR(100),
    country         VARCHAR(100) NOT NULL DEFAULT 'Cameroun',
    postal_box      VARCHAR(50),

    -- Identifiants légaux (entreprises uniquement — CDC §4.1)
    tax_number      VARCHAR(100),                   -- NIU
    rccm            VARCHAR(100),                   -- RCCM

    -- Coordonnées bancaires
    bank_name       VARCHAR(255),
    bank_account    VARCHAR(100),

    -- Préférences commerciales
    currency        CHAR(3)      NOT NULL DEFAULT 'XAF',
    default_payment_terms TEXT,                     -- conditions paiement par défaut

    -- Gestion
    status          client_status NOT NULL DEFAULT 'active',
    internal_notes  TEXT,                           -- CONFIDENTIEL : jamais affiché sur PDFs

    -- Champs flexibles
    metadata        JSONB        NOT NULL DEFAULT '{}',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,                    -- archivage logique
    created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,

    -- Règle : deux clients ne peuvent avoir le même nom ET email (CDC §4.1)
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

-- ================================================================
-- 11. DOCUMENT_SEQUENCES — Numérotation SYSCOHADA (sans trou, atomique)
-- Format : BTS/DC/2026/01/pfm001  |  BTS/DC/2026/01/fac001
-- Compteurs séparés par : type × bureau × année × mois
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

-- ----------------------------------------------------------------
-- FONCTION : générateur de numéro de document (atomique, thread-safe)
-- Utilise INSERT ... ON CONFLICT ... DO UPDATE pour garantir l'atomicité
-- sans trou même en cas d'annulation (conforme SYSCOHADA)
-- ----------------------------------------------------------------
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
    -- Récupère le code bureau
    SELECT code INTO STRICT v_office_code
      FROM agency_offices WHERE id = p_office_id;

    -- Incrémente de façon atomique
    INSERT INTO document_sequences (office_id, document_type, year, month, last_sequence)
    VALUES (p_office_id, p_doc_type, v_year, v_month, 1)
    ON CONFLICT (office_id, document_type, year, month)
    DO UPDATE SET last_sequence = document_sequences.last_sequence + 1
    RETURNING last_sequence INTO v_seq;

    v_doc_prefix := CASE p_doc_type WHEN 'proforma' THEN 'pfm' ELSE 'fac' END;

    -- Format : BTS/DC/2026/01/pfm001
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
    'Génère un numéro de document SYSCOHADA-conforme, sans trou, thread-safe. '
    'Format : BTS/{BUREAU}/{AAAA}/{MM}/{pfm|fac}{XXX}';

-- ================================================================
-- 12. PROFORMAS — Devis commerciaux
-- ================================================================
CREATE TABLE proformas (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Numérotation SYSCOHADA
    number                  VARCHAR(50)  NOT NULL UNIQUE,   -- BTS/DC/2026/01/pfm001
    office_id               UUID         NOT NULL REFERENCES agency_offices(id) ON DELETE RESTRICT,

    -- Parties
    client_id               UUID         NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    created_by              UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_to             UUID         REFERENCES users(id) ON DELETE SET NULL,

    -- Dates
    issue_date              DATE         NOT NULL DEFAULT CURRENT_DATE,
    valid_until             DATE         NOT NULL,

    -- En-tête du document
    subject                 VARCHAR(500),                   -- objet de la proforma
    notes                   TEXT,
    payment_conditions      TEXT,                           -- ex: '100% à la livraison'
    delivery_delay          TEXT,                           -- ex: '20 JOURS'
    warranty                TEXT,                           -- ex: '1 AN'

    -- Devise
    currency                CHAR(3)      NOT NULL DEFAULT 'XAF',

    -- Calculs financiers (CDC §4.3 formule)
    subtotal_ht             NUMERIC(15,2) NOT NULL DEFAULT 0,  -- Σ(montant net HT lignes)
    global_discount_type    discount_type NOT NULL DEFAULT 'none',
    global_discount_value   NUMERIC(15,2) NOT NULL DEFAULT 0,  -- % ou montant fixe saisi
    global_discount_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,  -- montant calculé
    total_ht                NUMERIC(15,2) NOT NULL DEFAULT 0,  -- subtotal_ht - remise globale
    total_tax               NUMERIC(15,2) NOT NULL DEFAULT 0,  -- TVA sur total_ht
    total_ttc               NUMERIC(15,2) NOT NULL DEFAULT 0,  -- total_ht + total_tax

    -- Statut et workflow
    status                  proforma_status NOT NULL DEFAULT 'draft',

    -- Notifications
    last_sent_at                TIMESTAMPTZ,
    last_reminder_at            TIMESTAMPTZ,
    reminder_count              SMALLINT     NOT NULL DEFAULT 0,
    reminder_escalation_level   SMALLINT     NOT NULL DEFAULT 0, -- 0=aucune, 1=douce, 2=ferme, 3=urgente, 4=critique

    -- Fichiers générés
    qr_code_path            VARCHAR(500),
    pdf_path                VARCHAR(500),
    pdf_generated_at        TIMESTAMPTZ,

    -- Métadonnées flexibles (thème PDF personnalisé, etc.)
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

CREATE INDEX idx_proformas_client_id  ON proformas(client_id);
CREATE INDEX idx_proformas_created_by ON proformas(created_by);
CREATE INDEX idx_proformas_status     ON proformas(status);
CREATE INDEX idx_proformas_issue_date ON proformas(issue_date);
CREATE INDEX idx_proformas_valid_until ON proformas(valid_until);
CREATE INDEX idx_proformas_active     ON proformas(id) WHERE deleted_at IS NULL;

-- ================================================================
-- 13. PROFORMA_LINES — Lignes de devis
-- Snapshot des prix au moment de la création (indépendant du catalogue)
-- ================================================================
CREATE TABLE proforma_lines (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    proforma_id     UUID        NOT NULL REFERENCES proformas(id) ON DELETE CASCADE,
    product_id      UUID        REFERENCES products(id) ON DELETE SET NULL, -- null si produit supprimé

    -- Ordre d'affichage (drag & drop — CDC §4.3)
    sort_order      SMALLINT    NOT NULL DEFAULT 0,

    -- Désignation (snapshot du catalogue au moment de la création)
    designation     VARCHAR(500) NOT NULL,
    description     TEXT,                           -- texte enrichi (HTML)
    unit            product_unit NOT NULL DEFAULT 'piece',

    -- Quantités et prix (snapshot indépendant du catalogue)
    quantity        NUMERIC(10,3) NOT NULL DEFAULT 1,
    unit_price_ht   NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Remise par ligne (CDC §4.3)
    discount_type   discount_type NOT NULL DEFAULT 'none',
    discount_value  NUMERIC(15,2) NOT NULL DEFAULT 0,  -- % ou montant fixe saisi
    discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,  -- montant calculé

    -- Taxe (snapshot du taux au moment de la création)
    tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 19.25,

    -- Totaux calculés et stockés (intégrité historique + performances)
    subtotal_ht     NUMERIC(15,2) NOT NULL DEFAULT 0,  -- qty × unit_price_ht
    net_ht          NUMERIC(15,2) NOT NULL DEFAULT 0,  -- subtotal_ht - discount_amount
    tax_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,  -- net_ht × tax_rate/100
    total_ttc       NUMERIC(15,2) NOT NULL DEFAULT 0,  -- net_ht + tax_amount

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_pfl_quantity      CHECK (quantity > 0),
    CONSTRAINT chk_pfl_price         CHECK (unit_price_ht >= 0),
    CONSTRAINT chk_pfl_disc_value    CHECK (discount_value >= 0),
    CONSTRAINT chk_pfl_tax_rate      CHECK (tax_rate BETWEEN 0 AND 100)
);
CREATE TRIGGER tg_proforma_lines_updated_at
    BEFORE UPDATE ON proforma_lines
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_proforma_lines_proforma_id ON proforma_lines(proforma_id);

-- ================================================================
-- 14. PROFORMA_STATUS_HISTORY — Historique des changements de statut
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

-- ================================================================
-- 15. INVOICES — Toutes les factures (standard, acompte, solde, avoir, récurrente)
-- ================================================================
CREATE TABLE invoices (
    id                      UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Numérotation SYSCOHADA
    number                  VARCHAR(50)  NOT NULL UNIQUE,   -- BTS/DC/2026/01/fac001
    office_id               UUID         NOT NULL REFERENCES agency_offices(id) ON DELETE RESTRICT,
    type                    invoice_type NOT NULL DEFAULT 'standard',

    -- Parties
    client_id               UUID         NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    created_by              UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_to             UUID         REFERENCES users(id) ON DELETE SET NULL,

    -- Sources
    proforma_id             UUID         REFERENCES proformas(id) ON DELETE SET NULL,

    -- Liens inter-factures (cycle acompte/solde — CDC §4.4)
    -- Pour facture 'solde' : pointe vers la première facture d'acompte du contrat
    parent_invoice_id       UUID         REFERENCES invoices(id) ON DELETE SET NULL,
    -- Pour 'avoir' : pointe vers la facture annulée (obligatoire pour les avoirs)
    credited_invoice_id     UUID         REFERENCES invoices(id) ON DELETE RESTRICT,

    -- Source récurrence
    recurring_template_id   UUID,        -- FK ajoutée après création de recurring_invoice_templates

    -- Dates
    issue_date              DATE         NOT NULL DEFAULT CURRENT_DATE,
    due_date                DATE         NOT NULL,

    -- En-tête
    subject                 VARCHAR(500),
    client_reference        VARCHAR(100),                   -- bon de commande client
    notes                   TEXT,
    payment_conditions      TEXT,

    -- Devise
    currency                CHAR(3)      NOT NULL DEFAULT 'XAF',

    -- Calculs financiers (identiques aux proformas — CDC §4.4)
    subtotal_ht             NUMERIC(15,2) NOT NULL DEFAULT 0,
    global_discount_type    discount_type NOT NULL DEFAULT 'none',
    global_discount_value   NUMERIC(15,2) NOT NULL DEFAULT 0,
    global_discount_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ht                NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_tax               NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ttc               NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Acomptes (spécifique type 'acompte' — CDC §4.4)
    acompte_percentage      NUMERIC(5,2),                   -- ex: 30.00 pour 30%

    -- Solde (spécifique type 'solde' — CDC §4.4)
    total_acomptes_deducted NUMERIC(15,2) NOT NULL DEFAULT 0, -- Σ acomptes versés
    amount_due              NUMERIC(15,2) NOT NULL DEFAULT 0, -- total_ttc - total_acomptes_deducted

    -- Paiements
    amount_paid             NUMERIC(15,2) NOT NULL DEFAULT 0, -- Σ paiements enregistrés
    balance_due             NUMERIC(15,2) NOT NULL DEFAULT 0, -- amount_due - amount_paid

    -- Statut
    status                  invoice_status NOT NULL DEFAULT 'draft',

    -- Notifications / relances
    last_sent_at            TIMESTAMPTZ,
    last_reminder_at        TIMESTAMPTZ,
    reminder_count          SMALLINT      NOT NULL DEFAULT 0,
    reminder_escalation_level SMALLINT    NOT NULL DEFAULT 0, -- 0=aucune, 1=douce, 2=ferme, 3=urgente, 4=critique

    -- Annulation (génère un avoir automatiquement — CDC §4.4)
    cancelled_at            TIMESTAMPTZ,
    cancel_reason           TEXT,
    cancelled_by            UUID          REFERENCES users(id) ON DELETE SET NULL,

    -- Fichiers
    qr_code_path            VARCHAR(500),
    pdf_path                VARCHAR(500),
    pdf_generated_at        TIMESTAMPTZ,

    -- Champs flexibles
    metadata                JSONB         NOT NULL DEFAULT '{}',

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,

    -- Contraintes métier
    CONSTRAINT chk_inv_due_date       CHECK (due_date >= issue_date),
    CONSTRAINT chk_inv_subtotal       CHECK (subtotal_ht >= 0),
    CONSTRAINT chk_inv_total_ttc      CHECK (total_ttc   >= 0),
    CONSTRAINT chk_inv_amount_paid    CHECK (amount_paid >= 0),
    CONSTRAINT chk_inv_balance_due    CHECK (balance_due >= 0),
    CONSTRAINT chk_inv_disc_pct       CHECK (
        global_discount_type != 'percentage' OR
        global_discount_value BETWEEN 0 AND 100
    ),
    -- Un avoir doit obligatoirement référencer une facture (CDC §4.4)
    CONSTRAINT chk_avoir_must_ref     CHECK (
        (type = 'avoir'  AND credited_invoice_id IS NOT NULL) OR
        (type != 'avoir')
    ),
    -- Une facture solde doit référencer un parent (CDC §4.4)
    CONSTRAINT chk_solde_must_ref     CHECK (
        (type = 'solde'  AND parent_invoice_id IS NOT NULL) OR
        (type != 'solde')
    ),
    -- Le pourcentage d'acompte est entre 0 et 100
    CONSTRAINT chk_acompte_pct        CHECK (
        acompte_percentage IS NULL OR
        acompte_percentage BETWEEN 0.01 AND 100
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
-- Index composite pour le tableau de bord (requêtes fréquentes)
CREATE INDEX idx_invoices_status_date    ON invoices(status, issue_date DESC);
CREATE INDEX idx_invoices_overdue        ON invoices(due_date, status)
    WHERE status IN ('issued', 'partially_paid') AND deleted_at IS NULL;

-- ================================================================
-- 16. INVOICE_LINES — Lignes de facture
-- Snapshot identique aux proforma_lines pour l'intégrité historique
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

-- ================================================================
-- 17. INVOICE_STATUS_HISTORY — Historique des changements de statut
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

-- ================================================================
-- 18. PAYMENTS — Enregistrement des paiements
-- ================================================================
CREATE TABLE payments (
    id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id      UUID           NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    payment_date    DATE           NOT NULL DEFAULT CURRENT_DATE,
    amount          NUMERIC(15,2)  NOT NULL,
    method          payment_method NOT NULL DEFAULT 'virement',
    reference       VARCHAR(255),                   -- numéro de transaction
    notes           TEXT,
    attachment_path VARCHAR(500),                   -- justificatif de paiement
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    -- Soft-delete pour corrections comptables (pas de suppression physique)
    deleted_at      TIMESTAMPTZ,
    created_by      UUID           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT chk_payment_amount CHECK (amount > 0)
);
CREATE TRIGGER tg_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_payments_invoice_id   ON payments(invoice_id);
CREATE INDEX idx_payments_date         ON payments(payment_date);
CREATE INDEX idx_payments_created_by   ON payments(created_by);
CREATE INDEX idx_payments_active       ON payments(invoice_id) WHERE deleted_at IS NULL;

-- ================================================================
-- 19. RECURRING_INVOICE_TEMPLATES — Gabarits de facturation récurrente (CDC §4.4)
-- ================================================================
CREATE TABLE recurring_invoice_templates (
    id                  UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id           UUID               NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    office_id           UUID               NOT NULL REFERENCES agency_offices(id) ON DELETE RESTRICT,
    interval            recurring_interval NOT NULL DEFAULT 'monthly',
    next_invoice_date   DATE               NOT NULL,
    end_date            DATE,                               -- null = récurrence indéfinie
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

-- Lignes du gabarit récurrent
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

-- Rattachement FK après création de la table
ALTER TABLE invoices
    ADD CONSTRAINT fk_invoices_recurring_template
    FOREIGN KEY (recurring_template_id)
    REFERENCES recurring_invoice_templates(id) ON DELETE SET NULL;

-- ================================================================
-- 20. NOTIFICATIONS — Fil de notifications in-app (CDC §4.6)
-- ================================================================
CREATE TABLE notifications (
    id              UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID                NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            notification_status NOT NULL,
    title           VARCHAR(255)        NOT NULL,
    message         TEXT                NOT NULL,
    -- Entité concernée (polymorphique)
    entity_type     VARCHAR(50),                    -- 'invoice', 'proforma', 'payment'...
    entity_id       UUID,
    entity_label    VARCHAR(255),                   -- ex: 'FAC BTS/DC/2026/01/fac001'
    -- Statut lecture
    is_read         BOOLEAN             NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    -- Email associé
    email_sent      BOOLEAN             NOT NULL DEFAULT FALSE,
    email_sent_at   TIMESTAMPTZ,
    -- Données contextuelles supplémentaires
    metadata        JSONB               NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifs_user_id    ON notifications(user_id);
CREATE INDEX idx_notifs_unread     ON notifications(user_id, created_at DESC)
    WHERE is_read = FALSE;
CREATE INDEX idx_notifs_entity     ON notifications(entity_type, entity_id);

-- ================================================================
-- 21. NOTIFICATION_SETTINGS — Préférences de notification par utilisateur
-- ================================================================
CREATE TABLE notification_settings (
    id                  UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID                NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type   notification_status NOT NULL,
    -- Canal préféré : utilise l'ENUM notification_channel (in_app | email | both)
    channel             notification_channel NOT NULL DEFAULT 'both',
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_notif_settings UNIQUE (user_id, notification_type)
);
CREATE TRIGGER tg_notif_settings_updated_at
    BEFORE UPDATE ON notification_settings
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ================================================================
-- 22. EMAIL_TEMPLATES — Gabarits d'emails personnalisables (CDC §4.6)
-- ================================================================
CREATE TABLE email_templates (
    id          UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    type        notification_status NOT NULL UNIQUE,
    name        VARCHAR(255)        NOT NULL,
    subject     VARCHAR(500)        NOT NULL,
    body_html   TEXT                NOT NULL,
    body_text   TEXT,
    -- Liste des variables disponibles : [{name, description, example}]
    variables   JSONB               NOT NULL DEFAULT '[]',
    is_active   BOOLEAN             NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_by  UUID                REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER tg_email_templates_updated_at
    BEFORE UPDATE ON email_templates
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ================================================================
-- 23. AUDIT_LOGS — Journal d'audit immuable (CDC §4.8)
-- Toutes les actions sensibles sont tracées avec before/after state
-- ================================================================
CREATE TABLE audit_logs (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Auteur de l'action
    user_id         UUID         REFERENCES users(id) ON DELETE SET NULL,
    user_email      VARCHAR(255),                   -- snapshot : conservé même si user supprimé
    user_role       user_role,                      -- snapshot du rôle au moment de l'action

    -- Action
    action          audit_action NOT NULL,

    -- Entité concernée
    entity_type     VARCHAR(100),                   -- 'invoice', 'client', 'user', 'payment'...
    entity_id       UUID,
    entity_label    VARCHAR(255),                   -- ex: numéro de facture, nom du client

    -- État avant/après (pour UPDATE/DELETE)
    previous_state  JSONB,
    new_state       JSONB,

    -- Description lisible
    description     TEXT,

    -- Contexte réseau (sécurité)
    ip_address      INET,
    user_agent      TEXT,
    session_id      UUID,

    -- Immuable : pas de updated_at, jamais modifiable
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les requêtes d'audit fréquentes
CREATE INDEX idx_audit_user_id    ON audit_logs(user_id);
CREATE INDEX idx_audit_entity     ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_action     ON audit_logs(action);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);
-- BRIN index pour les grandes tables time-series
CREATE INDEX idx_audit_created_brin ON audit_logs USING BRIN (created_at);

-- Sécurité : empêche la modification des logs d'audit
CREATE RULE no_update_audit AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- ================================================================
-- 24. BACKUPS — Suivi des sauvegardes automatiques et manuelles
-- ================================================================
CREATE TABLE backups (
    id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename        VARCHAR(255)  NOT NULL,
    storage_disk    VARCHAR(50)   NOT NULL DEFAULT 'local',  -- 'local', 's3', 'google', 'azure'
    storage_path    VARCHAR(500),
    size_bytes      BIGINT        NOT NULL DEFAULT 0,
    status          backup_status NOT NULL DEFAULT 'pending',
    type            VARCHAR(20)   NOT NULL DEFAULT 'manual', -- 'manual', 'scheduled'
    checksum        VARCHAR(128),                             -- SHA-256
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error_message   TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by      UUID          REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_backups_status     ON backups(status);
CREATE INDEX idx_backups_created_at ON backups(created_at DESC);

-- ================================================================
-- VUES MÉTIER — Pour les requêtes fréquentes du tableau de bord
-- ================================================================

-- Résumé financier par client (CDC §4.1 "Indicateurs financiers")
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

COMMENT ON VIEW v_client_financial_summary IS
    'Résumé financier temps réel par client. Affiché en en-tête de la fiche client (CDC §4.1).';

-- Vue factures enrichie (tableau de bord)
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
    CASE
        WHEN i.status IN ('cancelled','paid') THEN 0
        ELSE GREATEST(0, CURRENT_DATE - i.due_date)
    END                                   AS days_overdue,
    (SELECT COUNT(*) FROM payments
      WHERE invoice_id = i.id AND deleted_at IS NULL) AS payment_count
FROM  invoices  i
JOIN  clients   c ON c.id = i.client_id
JOIN  users     u ON u.id = i.created_by
WHERE i.deleted_at IS NULL;

COMMENT ON VIEW v_invoice_overview IS
    'Vue enrichie des factures pour les listes et le tableau de bord.';

-- Vue des produits avec statistiques d'utilisation
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

COMMENT ON VIEW v_product_usage_stats IS
    'Statistiques d''utilisation par produit. Affiché dans la fiche produit (CDC §4.2).';


-- Vue KPIs tableau de bord (CDC §4.5)
CREATE VIEW v_dashboard_kpis AS
WITH
-- Période courante
periods AS (
    SELECT
        DATE_TRUNC('month',  NOW())::DATE AS month_start,
        DATE_TRUNC('quarter',NOW())::DATE AS quarter_start,
        DATE_TRUNC('year',   NOW())::DATE AS year_start
),
-- Factures actives (non supprimées, non annulées)
active_invoices AS (
    SELECT i.*
    FROM invoices i, periods p
    WHERE i.deleted_at IS NULL
      AND i.status != 'cancelled'
      AND i.type    != 'avoir'
),
-- CA par période
ca AS (
    SELECT
        COALESCE(SUM(total_ttc) FILTER (WHERE issue_date >= p.month_start),   0) AS ca_month,
        COALESCE(SUM(total_ttc) FILTER (WHERE issue_date >= p.quarter_start),  0) AS ca_quarter,
        COALESCE(SUM(total_ttc) FILTER (WHERE issue_date >= p.year_start),     0) AS ca_year,
        COALESCE(SUM(total_ttc),                                               0) AS ca_total
    FROM active_invoices, periods p
),
-- Compteurs par statut
counts AS (
    SELECT
        COUNT(*) FILTER (WHERE status = 'issued')          AS nb_issued,
        COUNT(*) FILTER (WHERE status = 'partially_paid')  AS nb_partial,
        COUNT(*) FILTER (WHERE status = 'paid')            AS nb_paid,
        COUNT(*) FILTER (WHERE status = 'overdue')         AS nb_overdue,
        COUNT(*)                                           AS nb_total
    FROM active_invoices
),
-- Créances en attente
creances AS (
    SELECT COALESCE(SUM(balance_due), 0) AS total_outstanding
    FROM active_invoices
    WHERE status IN ('issued', 'partially_paid', 'overdue')
),
-- Top 5 clients par CA (année en cours)
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
-- Top 5 produits/services par CA facturé (année en cours)
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
-- Évolution CA mensuelle sur 12 mois glissants
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
    -- CA par période
    ca.ca_month,
    ca.ca_quarter,
    ca.ca_year,
    ca.ca_total,
    -- Compteurs statuts
    counts.nb_issued,
    counts.nb_partial,
    counts.nb_paid,
    counts.nb_overdue,
    counts.nb_total,
    -- Créances
    creances.total_outstanding,
    -- Agrégats JSON pour les widgets graphiques
    (SELECT jsonb_agg(jsonb_build_object(
        'client_id',   client_id,
        'client_name', client_name,
        'ca',          ca,
        'nb_invoices', nb_invoices
    ) ORDER BY ca DESC) FROM top_clients)   AS top_clients,

    (SELECT jsonb_agg(jsonb_build_object(
        'product_id',    product_id,
        'product_name',  product_name,
        'category_name', category_name,
        'ca',            ca,
        'total_qty',     total_qty
    ) ORDER BY ca DESC) FROM top_products)  AS top_products,

    (SELECT jsonb_agg(jsonb_build_object(
        'month',       month,
        'ca',          ca,
        'nb_invoices', nb_invoices
    ) ORDER BY month) FROM monthly_evolution) AS monthly_evolution
FROM ca, counts, creances;

COMMENT ON VIEW v_dashboard_kpis IS
    'KPIs consolidés du tableau de bord (CDC §4.5). '
    'CA mensuel/trimestriel/annuel, compteurs par statut, créances, '
    'top 5 clients et produits, évolution mensuelle sur 12 mois. '
    'Résultats JSON-ready pour les widgets Recharts du frontend.';

-- ================================================================
-- COMMENTAIRES DE DOCUMENTATION
-- ================================================================
COMMENT ON TABLE company_settings              IS 'Configuration globale de BTS : identité légale, branding, paramètres financiers et sécurité.';
COMMENT ON TABLE agency_offices               IS 'Bureaux/agences BTS. Le code (DC, YDE...) est intégré dans la numérotation SYSCOHADA des documents.';
COMMENT ON TABLE tax_rates                    IS 'Taux de taxes configurables. Supporte la multi-taxation SYSCOHADA (TVA 19,25%, exonéré, etc.).';
COMMENT ON TABLE users                        IS 'Employés BTS avec RBAC (admin/commercial/employee). Soft-delete = suspension. Documents conservés.';
COMMENT ON TABLE refresh_tokens               IS 'Tokens JWT refresh stockés et révocables. Sécurité accrue contre le vol de session.';
COMMENT ON TABLE login_history                IS 'Historique complet des connexions, incluant les tentatives échouées. Audit de sécurité.';
COMMENT ON TABLE password_reset_tokens        IS 'Tokens de réinitialisation de mot de passe. Usage unique, durée 1h, jamais stockés en clair.';
COMMENT ON TABLE product_categories           IS 'Catégories du catalogue produits/services, gérables par l''admin.';
COMMENT ON TABLE products                     IS 'Catalogue de produits et services. Prix de référence modifiable à la volée sur chaque document.';
COMMENT ON TABLE clients                      IS 'Annuaire clients. Les archivés sont préservés pour l''historique mais exclus des nouveaux documents.';
COMMENT ON TABLE document_sequences           IS 'Compteurs de séquences SYSCOHADA. Atomiques, sans trou, par type/bureau/année/mois.';
COMMENT ON TABLE proformas                    IS 'Devis/proformas. Une proforma acceptée est verrouillée et peut être convertie en facture.';
COMMENT ON TABLE proforma_lines               IS 'Lignes de devis avec snapshot des prix à la création. Indépendant du catalogue.';
COMMENT ON TABLE proforma_status_history      IS 'Historique complet des changements de statut des proformas.';
COMMENT ON TABLE invoices                     IS 'Toutes les factures : standard, acompte, solde, avoir, récurrente. Lien inter-factures pour le cycle acompte/solde.';
COMMENT ON TABLE invoice_lines                IS 'Lignes de facture avec snapshot complet pour intégrité historique totale.';
COMMENT ON TABLE invoice_status_history       IS 'Historique complet des changements de statut des factures.';
COMMENT ON TABLE payments                     IS 'Enregistrement des paiements. Soft-delete pour corrections. Met à jour automatiquement le statut de la facture.';
COMMENT ON TABLE recurring_invoice_templates  IS 'Gabarits de facturation récurrente (mensuelle, trimestrielle, annuelle).';
COMMENT ON TABLE notifications                IS 'Fil de notifications in-app par utilisateur.';
COMMENT ON TABLE notification_settings        IS 'Préférences de notification par utilisateur et par type d''alerte.';
COMMENT ON TABLE email_templates              IS 'Gabarits d''emails transactionnels personnalisables par l''admin.';
COMMENT ON TABLE audit_logs                   IS 'Journal d''audit immuable. Toutes les actions sensibles avec état avant/après. Conforme SYSCOHADA.';

COMMENT ON TABLE backups                      IS 'Suivi des sauvegardes de base de données (manuelles et planifiées).';

COMMENT ON COLUMN invoices.type                    IS 'standard=facture classique | acompte=facture partielle | solde=facture finale déduisant les acomptes | avoir=note de crédit | recurring=générée automatiquement';
COMMENT ON COLUMN invoices.parent_invoice_id       IS 'Pour solde : lien vers la première facture d''acompte du contrat.';
COMMENT ON COLUMN invoices.credited_invoice_id     IS 'Pour avoir : référence obligatoire de la facture annulée/créditée.';
COMMENT ON COLUMN invoices.total_acomptes_deducted IS 'Pour facture solde : somme des acomptes déjà versés, déduite du total TTC.';
COMMENT ON COLUMN invoices.amount_due              IS 'Montant réellement dû = total_ttc - total_acomptes_deducted.';
COMMENT ON COLUMN clients.internal_notes           IS 'CONFIDENTIEL : notes internes, jamais affichées sur les PDFs envoyés au client.';
COMMENT ON COLUMN proforma_lines.sort_order        IS 'Ordre d''affichage (drag & drop). Correspond à l''ordre exact sur le PDF généré.';
COMMENT ON COLUMN invoice_lines.sort_order         IS 'Ordre d''affichage (drag & drop). Verrouillé après émission de la facture.';

-- ================================================================
-- FIN DU SCHÉMA
-- ================================================================
