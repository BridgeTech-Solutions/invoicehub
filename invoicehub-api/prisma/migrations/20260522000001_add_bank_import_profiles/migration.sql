-- Migration: add_bank_import_profiles
-- Ajout de la table bank_import_profiles pour la gestion des profils d'import CSV/OFX/MT940

CREATE TABLE bank_import_profiles (
    id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                  VARCHAR(255) NOT NULL,
    bank_name             VARCHAR(255),
    country               VARCHAR(10),
    source                VARCHAR(20)  NOT NULL DEFAULT 'user',
    file_format           VARCHAR(20)  NOT NULL DEFAULT 'csv',
    encoding              VARCHAR(30)  NOT NULL DEFAULT 'utf-8',
    delimiter             VARCHAR(5)   NOT NULL DEFAULT ';',
    date_format           VARCHAR(30)  NOT NULL DEFAULT 'DD/MM/YYYY',
    number_format         JSONB        NOT NULL DEFAULT '{"decimal":","," thousands":"."}',
    column_mapping        JSONB        NOT NULL DEFAULT '{}',
    direction_values      JSONB,
    amount_sign           VARCHAR(50),
    skip_rows_containing  JSONB,
    skip_first_rows       INTEGER      NOT NULL DEFAULT 0,
    is_public             BOOLEAN      NOT NULL DEFAULT false,
    usage_count           INTEGER      NOT NULL DEFAULT 0,
    last_used_at          TIMESTAMPTZ,
    notes                 TEXT,
    created_by            UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_bank_import_profiles_source    ON bank_import_profiles(source);
CREATE INDEX idx_bank_import_profiles_is_public ON bank_import_profiles(is_public);
CREATE INDEX idx_bank_import_profiles_created_by ON bank_import_profiles(created_by);
