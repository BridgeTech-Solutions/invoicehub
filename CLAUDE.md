# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**InvoiceHub v2.0** — Enterprise invoicing and billing management platform for **Bridge Technologies Solutions (BTS)**, based in Douala, Cameroon. The system is SYSCOHADA-compliant (West African Accounting System).

The repository currently contains the **database schema** and the **requirements document (Cahier des Charges)**. Frontend and backend are pending development.

## Repository Contents

- `invoicehub_schema_v2.sql` — Complete PostgreSQL 15+ database schema (1,328 lines, commented in French)
- `CDC_Plateforme_Facturation_BTS.docx` — Business requirements document (French)

## Database

**Engine**: PostgreSQL 15+ with extensions `uuid-ossp`, `pgcrypto`, `unaccent`

To initialize the database:
```bash
psql -U postgres -d invoicehub -f invoicehub_schema_v2.sql
```

## Schema Architecture

The schema is organized into 5 logical domains:

### 1. System / Security (7 tables)
`company_settings`, `agency_offices`, `tax_rates`, `users`, `refresh_tokens`, `login_history`, `password_reset_tokens`

### 2. Business Entities (3 tables)
`clients`, `product_categories`, `products`, `document_sequences`

### 3. Proforma / Quote Management (3 tables)
`proformas`, `proforma_lines`, `proforma_status_history`

### 4. Invoice Management (4 tables)
`invoices`, `invoice_lines`, `invoice_status_history`, `payments`

Invoice types: `standard`, `acompte` (deposit), `solde` (settlement), `avoir` (credit note), `recurring`

### 5. Supporting Modules
- Recurring invoices: `recurring_invoice_templates`, `recurring_invoice_template_lines`
- Notifications: `notifications`, `notification_settings`, `email_templates`
- Audit & Compliance: `audit_logs` (immutable), `backups`
- 4 Business Intelligence views for dashboard KPIs

## Key Business Rules

**Document numbering (SYSCOHADA)**:
```
Format: BTS/{OFFICE_CODE}/{YEAR}/{MONTH}/{TYPE}{SEQUENCE}
Example: BTS/DC/2026/01/FAC001   (invoice)
         BTS/DC/2026/01/PFM001   (proforma)
```
Numbering is atomic and gap-free via the `generate_document_number()` function with `SELECT ... FOR UPDATE`.

**Invoice lifecycle**: `draft → issued → partially_paid → paid` (also `overdue`, `cancelled`)

**Pricing snapshots**: All line items (`proforma_lines`, `invoice_lines`) store prices at creation time — catalog price changes do not affect existing documents.

**Soft-delete**: Users and clients are archived, not deleted. Documents preserve full history.

**Audit logs**: Immutable — database-level rules prevent UPDATE/DELETE on `audit_logs`. Captures before/after JSONB state, IP, and user-agent.

**Acompte/Solde cycle**: An invoice can be split into a deposit invoice (`acompte`) linked to a settlement invoice (`solde`). Balances are auto-computed.

## RBAC Roles
`admin`, `commercial`, `employee`

## Tech Stack (Planned — not yet in repo)
- **Backend**: REST API (Node.js/Express, Python/FastAPI, or Go — TBD)
- **Frontend**: React with Recharts (dashboard KPIs)
- **Auth**: JWT + refresh tokens, 2FA/TOTP
- **Currency**: XAF (Franc CFA)
