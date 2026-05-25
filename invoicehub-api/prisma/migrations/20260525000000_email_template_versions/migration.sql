-- Migration: email_template_versions
-- Historique des modifications des templates d'email

CREATE TABLE "email_template_versions" (
    "id"            UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "template_id"   UUID        NOT NULL,
    "subject"       VARCHAR(500) NOT NULL,
    "body_html"     TEXT        NOT NULL,
    "edited_by_id"  UUID,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "email_template_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_template_versions_template_id_created_at_idx"
    ON "email_template_versions" ("template_id", "created_at" DESC);

ALTER TABLE "email_template_versions"
    ADD CONSTRAINT "email_template_versions_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE CASCADE;

ALTER TABLE "email_template_versions"
    ADD CONSTRAINT "email_template_versions_edited_by_id_fkey"
    FOREIGN KEY ("edited_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
