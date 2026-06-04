# GEMINI.md — Project "BRIDGE" (InvoiceHub v2.0)

## Project Overview
**InvoiceHub v2.0** is a SYSCOHADA-compliant enterprise invoicing and billing platform for **Bridge Technologies Solutions (BTS)**, Douala, Cameroon. It manages the complete financial lifecycle: proformas, invoices (deposit, settlement, credit notes), recurring billing, payments, and automated reporting.

## Tech Stack
### Backend (`bridge-backend/`)
- **Runtime:** Node.js 20+
- **Language:** TypeScript 5
- **Framework:** Express 4
- **ORM:** Prisma 5 (PostgreSQL 15)
- **Validation:** Zod
- **Async Tasks:** Redis 7 + BullMQ (Email, Notifications, Backups, Recurring)
- **Security:** JWT (Access/Refresh), 2FA (TOTP via `otplib`), RBAC
- **PDF Generation:** Puppeteer (Headless Chromium)
- **AI:** Ollama + Mistral (Dockerized local assistant)

### Frontend (`bridge-frontend/`)
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **State Management:** TanStack Query v5 (Server State), Zustand (Client State)
- **Real-time:** Socket.io Client

## Core Engineering Mandates

### 1. SYSCOHADA Compliance (CRITICAL)
- **Atomic Numbering:** Never calculate document numbers in JavaScript. Always use the PostgreSQL function `fn_next_document_number(office_id, type)` via Prisma `$queryRaw`.
- **Numbering Format:** `BTS/{OFFICE}/{YEAR}/{MONTH}/{TYPE}{SEQ}` (e.g., `BTS/DC/2026/01/FAC001`).
- **No Gaps:** Document numbering must be sequential without gaps.
- **Price Snapshots:** All line items must store the price/description at creation time. Never re-calculate based on current catalog prices.

### 2. Architectural Patterns
- **Module Structure:** Follow the 4-file pattern per module:
  - `*.routes.ts`: Route definitions and middleware application.
  - `*.controller.ts`: Input parsing (req/res) and service delegation.
  - `*.service.ts`: Core business logic and database interactions.
  - `*.schema.ts`: Zod validation schemas.
- **Error Handling:** Use `AppError` class for all business logic errors. Never throw raw `Error` objects.
- **Soft Deletes:** Use `deleted_at` (Prisma: `deletedAt`) for all deletions. Physical `DELETE` is prohibited for business entities.
- **Immutable Audit:** The `audit_logs` table is protected at the DB level. Use `auditMiddleware` for tracking mutations.

### 3. Coding Standards
- **TypeScript:** Strict mode. Use Zod for runtime validation and type inference.
- **API Consistency:** All responses should be uniform. Success: `{ success: true, data: ... }`. Error: `{ success: false, code: '...', message: '...' }`.
- **Database:** All operations involving multiple tables (e.g., cancelling an invoice + creating a credit note) MUST be wrapped in a Prisma `$transaction`.

## Key Directories
- `bridge-backend/src/modules/`: Business domains.
- `bridge-backend/prisma/schema.prisma`: Source of truth for the data model.
- `bridge-frontend/src/features/`: Feature-based logic (API hooks, specific components).
- `bridge-frontend/src/components/document/`: Shared invoicing UI (LineItemsEditor, etc.).

## Development Workflow
- **Package Manager:** Use `pnpm`.
- **Database Migrations:** Use `pnpm prisma:migrate` for schema changes.
- **Validation:** Always verify changes with existing tests (`pnpm test` in backend).
- **Environment:** Validate all new environment variables in `bridge-backend/src/config/env.ts`.

## Gemini CLI Specific Instructions
- **Research First:** When asked to modify logic, always check the corresponding `*.service.ts` and `prisma/schema.prisma`.
- **Respect Rules:** Never suggest modifications that break SYSCOHADA numbering or audit trail integrity.
- **Simulate Errors:** When fixing bugs, create a reproduction test case in `__tests__` before applying the fix.
