# PROMPT — Module de Workflow d'Approbation (BRIDGE / InvoiceHub v2.0)

## Contexte du projet

**InvoiceHub v2.0** est une plateforme de gestion financière enterprise pour Bridge Technologies Solutions (BTS), Douala, Cameroun, conforme SYSCOHADA. Stack technique :

- **Backend** : Node.js + Express + TypeScript + Prisma ORM + PostgreSQL 15+
- **Files** : BullMQ + Redis (queues async pour emails, notifications, crons)
- **Frontend** : Next.js 15 (App Router) + TypeScript + TanStack Query v5 + Zustand
- **Auth** : JWT (15min access + 7j refresh) + 2FA TOTP + RBAC granulaire
- **Monorepo** : `bridge-backend/` + `bridge-frontend/`
- **Devise** : XAF (Franc CFA)

### Pourquoi ce module

Actuellement, l'équipe BTS envoie les documents (factures, proformas, bons de commande) par WhatsApp pour que le DAF ou le directeur concerné valide avant émission. Il n'y a aucune traçabilité, aucune piste d'audit, et n'importe qui peut émettre un document sans validation. Ce module remplace entièrement ce process informel par des workflows d'approbation configurables, multi-étapes, tracés et immuables.

---

## Ce que tu dois construire

Un **moteur de workflow d'approbation multi-étapes et configurable** intégré à tous les modules documents existants (factures, proformas, bons de commande, factures fournisseurs, dépenses). Les workflows sont créés par l'admin dans les paramètres, avec des règles de déclenchement (type de document, montant seuil), et des étapes séquentielles avec des approbateurs définis par rôle ou par utilisateur spécifique.

---

## 1. SCHÉMA PRISMA — Nouveaux modèles

### Fichier : `bridge-backend/prisma/schema.prisma`

Ajoute les enums suivants AVANT les modèles :

```prisma
enum ApprovalDocumentType {
  invoice
  proforma
  purchase_order
  supplier_invoice
  expense

  @@map("approval_document_type")
}

enum ApprovalRequestStatus {
  pending      // En attente d'approbation (étape courante)
  approved     // Toutes les étapes approuvées
  rejected     // Rejeté à une étape
  cancelled    // Annulé (document annulé avant fin du workflow)
  expired      // Délai maximal dépassé sans décision

  @@map("approval_request_status")
}

enum ApprovalDecisionType {
  approved
  rejected
  delegated    // Délégué à un autre approbateur

  @@map("approval_decision_type")
}

enum ApprovalTriggerOperator {
  gte   // >=
  lte   // <=
  eq    // ==
  gt    // >
  lt    // <

  @@map("approval_trigger_operator")
}
```

Ajoute `APPROVAL_REQUESTED` et `APPROVAL_DECISION` dans l'enum `AuditAction` existant.

Ajoute `approval_requested`, `approval_approved`, `approval_rejected`, `approval_expired`, `approval_delegated` dans l'enum `NotificationStatus` existant.

Ajoute ces nouveaux modèles :

```prisma
// ─── Définition d'un workflow ──────────────────────────────────
model ApprovalWorkflow {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @db.VarChar(100)
  description String?  @db.VarChar(500)
  isActive    Boolean  @default(true) @map("is_active")
  priority    Int      @default(0)  // Plus élevé = évalué en premier si plusieurs workflows matchent

  steps    ApprovalWorkflowStep[]
  triggers ApprovalWorkflowTrigger[]
  requests ApprovalRequest[]

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt      @map("updated_at")

  @@map("approval_workflows")
}

// ─── Règles de déclenchement d'un workflow ─────────────────────
// Exemple : documentType = invoice ET amount >= 1_000_000
model ApprovalWorkflowTrigger {
  id           String                  @id @default(uuid()) @db.Uuid
  workflowId   String                  @map("workflow_id") @db.Uuid
  workflow     ApprovalWorkflow        @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  documentType ApprovalDocumentType    @map("document_type")
  field        String                  @db.VarChar(50)   // "totalTtc", "totalHt", "type" (pour InvoiceType)
  operator     ApprovalTriggerOperator
  value        String                  @db.VarChar(200)  // Valeur cible (converti en runtime)

  @@map("approval_workflow_triggers")
}

// ─── Étape d'un workflow ───────────────────────────────────────
// Séquence ordonnée : step 1 → step 2 → step 3
model ApprovalWorkflowStep {
  id           String           @id @default(uuid()) @db.Uuid
  workflowId   String           @map("workflow_id") @db.Uuid
  workflow     ApprovalWorkflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  order        Int              // 1, 2, 3... ordre d'exécution séquentiel
  name         String           @db.VarChar(100)    // "Validation DAF"
  description  String?          @db.VarChar(300)

  // Approbateur : soit par rôle (tous les users du rôle sont notifiés, 1er qui décide)
  // soit par utilisateur spécifique
  approverRole   String?        @map("approver_role") @db.VarChar(50)    // "admin", "commercial", "employee"
  approverUserId String?        @map("approver_user_id") @db.Uuid
  approverUser   User?          @relation("StepApprover", fields: [approverUserId], references: [id])

  deadlineHours  Int?           @map("deadline_hours")   // Délai avant expiration (null = illimité)
  requireComment Boolean        @default(false) @map("require_comment")   // Commentaire obligatoire
  allowDelegate  Boolean        @default(true)  @map("allow_delegate")    // Peut déléguer à quelqu'un d'autre

  decisions ApprovalDecision[]

  @@map("approval_workflow_steps")
}

// ─── Demande d'approbation (instance d'un workflow sur un doc) ─
model ApprovalRequest {
  id           String               @id @default(uuid()) @db.Uuid
  workflowId   String               @map("workflow_id") @db.Uuid
  workflow     ApprovalWorkflow     @relation(fields: [workflowId], references: [id])

  documentType ApprovalDocumentType @map("document_type")
  documentId   String               @map("document_id") @db.Uuid
  documentNumber String?            @map("document_number") @db.VarChar(50)  // Numéro human-readable
  documentSnapshot Json             @map("document_snapshot")  // Snapshot du doc au moment de la demande

  status       ApprovalRequestStatus @default(pending)

  currentStep  Int                  @default(1)  @map("current_step")    // Étape en cours
  totalSteps   Int                  @map("total_steps")                   // Nombre total d'étapes

  requestedById String             @map("requested_by_id") @db.Uuid
  requestedBy   User               @relation("ApprovalRequester", fields: [requestedById], references: [id])
  requestedAt   DateTime           @default(now()) @map("requested_at")

  resolvedById  String?            @map("resolved_by_id") @db.Uuid
  resolvedBy    User?              @relation("ApprovalResolver", fields: [resolvedById], references: [id])
  resolvedAt    DateTime?          @map("resolved_at")

  expiresAt     DateTime?          @map("expires_at")  // Calculé depuis deadlineHours de l'étape courante

  decisions     ApprovalDecision[]

  @@map("approval_requests")
}

// ─── Décision sur une étape d'une demande ─────────────────────
model ApprovalDecision {
  id         String               @id @default(uuid()) @db.Uuid
  requestId  String               @map("request_id") @db.Uuid
  request    ApprovalRequest      @relation(fields: [requestId], references: [id], onDelete: Cascade)

  stepId     String               @map("step_id") @db.Uuid
  step       ApprovalWorkflowStep @relation(fields: [stepId], references: [id])
  stepOrder  Int                  @map("step_order")

  decidedById String             @map("decided_by_id") @db.Uuid
  decidedBy   User               @relation("ApprovalDecider", fields: [decidedById], references: [id])
  decidedAt   DateTime           @default(now()) @map("decided_at")

  decision    ApprovalDecisionType
  comment     String?             @db.VarChar(1000)

  // En cas de délégation, à qui a été délégué
  delegatedToId String?           @map("delegated_to_id") @db.Uuid
  delegatedTo   User?             @relation("ApprovalDelegate", fields: [delegatedToId], references: [id])

  @@map("approval_decisions")
}
```

**Important** : Après avoir ajouté ces modèles dans `prisma/schema.prisma`, tu DOIS aussi répercuter les changements dans `invoicehub_schema_v3.sql` (les CREATE TABLE, CREATE TYPE correspondants avec les contraintes FK et index).

---

## 2. BACKEND — Module `approvals`

### Fichier : `bridge-backend/src/modules/approvals/approvals.schema.ts`

```typescript
import { z } from 'zod'

export const createWorkflowSchema = z.object({
  name:        z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  isActive:    z.boolean().default(true),
  priority:    z.number().int().min(0).default(0),
  triggers: z.array(z.object({
    documentType: z.enum(['invoice', 'proforma', 'purchase_order', 'supplier_invoice', 'expense']),
    field:        z.string().max(50),       // 'totalTtc', 'totalHt', 'type'
    operator:     z.enum(['gte', 'lte', 'eq', 'gt', 'lt']),
    value:        z.string().max(200),
  })).min(1),
  steps: z.array(z.object({
    order:          z.number().int().min(1),
    name:           z.string().min(2).max(100),
    description:    z.string().max(300).optional(),
    approverRole:   z.string().max(50).optional(),
    approverUserId: z.string().uuid().optional(),
    deadlineHours:  z.number().int().min(1).max(720).optional(),
    requireComment: z.boolean().default(false),
    allowDelegate:  z.boolean().default(true),
  })).min(1),
}).refine(data =>
  data.steps.every(s => s.approverRole || s.approverUserId),
  { message: 'Chaque étape doit avoir un approbateur (rôle ou utilisateur)' }
)

export const updateWorkflowSchema = createWorkflowSchema.partial()

export const listWorkflowsSchema = z.object({
  isActive: z.enum(['true', 'false']).optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
})

export const listRequestsSchema = z.object({
  status:       z.enum(['pending', 'approved', 'rejected', 'cancelled', 'expired']).optional(),
  documentType: z.enum(['invoice', 'proforma', 'purchase_order', 'supplier_invoice', 'expense']).optional(),
  requestedById: z.string().uuid().optional(),
  pendingForMe: z.enum(['true', 'false']).optional(),  // Filtre : demandes en attente de MA décision
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const approveSchema = z.object({
  comment: z.string().max(1000).optional(),
})

export const rejectSchema = z.object({
  comment: z.string().min(1).max(1000),  // Obligatoire en cas de rejet
})

export const delegateSchema = z.object({
  delegatedToId: z.string().uuid(),
  comment:       z.string().max(1000).optional(),
})

export type CreateWorkflowInput  = z.infer<typeof createWorkflowSchema>
export type UpdateWorkflowInput  = z.infer<typeof updateWorkflowSchema>
export type ListWorkflowsInput   = z.infer<typeof listWorkflowsSchema>
export type ListRequestsInput    = z.infer<typeof listRequestsSchema>
export type ApproveInput         = z.infer<typeof approveSchema>
export type RejectInput          = z.infer<typeof rejectSchema>
export type DelegateInput        = z.infer<typeof delegateSchema>
```

---

### Fichier : `bridge-backend/src/modules/approvals/approvals.service.ts`

Implémente la classe `ApprovalsService` avec les méthodes suivantes. La logique complète est décrite ci-dessous :

#### `listWorkflows(input: ListWorkflowsInput)`
Liste les workflows avec leurs triggers et steps inclus. Pagination standard.

#### `findWorkflowById(id: string)`
Trouve un workflow par ID avec triggers + steps (ordonnés par `order` ASC). Lance `AppError.notFound` si absent.

#### `createWorkflow(input: CreateWorkflowInput, userId: string)`
Crée le workflow + ses triggers + ses steps en une transaction Prisma. Valide que les steps ont des ordres uniques. Valide que les `approverUserId` référencés existent.

#### `updateWorkflow(id: string, input: UpdateWorkflowInput, userId: string)`
Mise à jour du workflow + suppression/recréation des triggers et steps (delete-then-insert en transaction). Impossible si le workflow a des demandes `pending` en cours (lancer `AppError.badRequest`).

#### `deleteWorkflow(id: string)`
Soft-delete (marquer `isActive = false`). Impossible si demandes `pending` en cours.

#### `evaluateWorkflowForDocument(documentType, document)`
**Cœur du moteur de déclenchement.** Évalue quels workflows correspondent à un document donné.

```typescript
async evaluateWorkflowForDocument(
  documentType: ApprovalDocumentType,
  document: Record<string, any>
): Promise<ApprovalWorkflow | null>
```

Algorithme :
1. Charge tous les workflows actifs avec leurs triggers, triés par `priority DESC`
2. Pour chaque workflow, vérifie que TOUS ses triggers correspondent au document :
   - Filtre d'abord sur `trigger.documentType === documentType`
   - Pour chaque trigger : compare `document[trigger.field]` avec `trigger.value` selon `trigger.operator` (gte/lte/eq/gt/lt)
   - La comparaison est numérique si `parseFloat(trigger.value)` est valid, sinon string
3. Retourne le premier workflow dont TOUS les triggers matchent (ou `null` si aucun)

#### `requestApproval(documentType, documentId, documentNumber, document, requestedById)`
**Appelé par les services documents** quand un document est soumis pour validation.

```typescript
async requestApproval(params: {
  documentType:   ApprovalDocumentType
  documentId:     string
  documentNumber: string
  document:       Record<string, any>  // Le document complet pour snapshot + évaluation
  requestedById:  string
}): Promise<ApprovalRequest | null>   // null = pas de workflow applicable
```

Algorithme :
1. Appeler `evaluateWorkflowForDocument` → si null, retourner null (pas de workflow)
2. Vérifier qu'il n'y a pas déjà une demande `pending` pour ce document (evite doublons)
3. Calculer `expiresAt` depuis `deadlineHours` de l'étape 1 (si défini)
4. Créer l'`ApprovalRequest` avec `status: 'pending'`, `currentStep: 1`, snapshot JSON du document
5. Notifier les approbateurs de l'étape 1 :
   - Si `step.approverUserId` → notifier cet utilisateur spécifiquement
   - Si `step.approverRole` → notifier tous les utilisateurs actifs ayant ce rôle
   - Via `notificationQueue.add('notify', { userId, type: 'approval_requested', title: ..., message: ..., data: { requestId, documentType, documentId } })`
6. Email via `emailQueue.add` avec le template `APPROVAL_REQUEST`
7. Créer entrée `audit_log` : action `APPROVAL_REQUESTED`, entityType `approval_request`, entityId requestId
8. Retourner la demande créée

#### `approve(requestId: string, userId: string, input: ApproveInput)`
**Appelé quand un approbateur valide.**

Algorithme :
1. Charger la demande avec `workflow.steps` et `decisions`
2. Vérifier que `status === 'pending'`
3. Vérifier que l'utilisateur est bien l'approbateur de l'étape courante :
   - Si `step.approverUserId` → doit correspondre à `userId`
   - Si `step.approverRole` → l'utilisateur doit avoir ce rôle
4. Si `step.requireComment` et pas de commentaire → `AppError.badRequest`
5. Créer la `ApprovalDecision` : `decision: 'approved'`, `comment`, `decidedById`, `decidedAt`
6. **Si c'est la dernière étape** (`currentStep === totalSteps`) :
   - Mettre `ApprovalRequest.status = 'approved'`, `resolvedAt`, `resolvedById`
   - Appeler `onApprovalCompleted(request)` → déclenche l'action post-approbation sur le document
   - Notifier le demandeur : type `approval_approved`
7. **Sinon** (étapes suivantes) :
   - Incrémenter `currentStep`
   - Calculer nouveau `expiresAt` depuis `deadlineHours` de la prochaine étape
   - Notifier les approbateurs de la prochaine étape : type `approval_requested`
8. Audit log : action `APPROVAL_DECISION`, data `{ decision: 'approved', step: currentStep }`

#### `reject(requestId: string, userId: string, input: RejectInput)`
Même logique que `approve` mais :
- Crée `ApprovalDecision` avec `decision: 'rejected'`
- Met `ApprovalRequest.status = 'rejected'`, `resolvedAt`, `resolvedById`
- Appelle `onApprovalRejected(request)` → remet le document en `draft` + notifie le demandeur avec le commentaire
- Audit log : `APPROVAL_DECISION`, `decision: 'rejected'`

#### `delegate(requestId: string, userId: string, input: DelegateInput)`
Délègue l'approbation courante à un autre utilisateur.
- Vérifie `step.allowDelegate = true`
- Crée `ApprovalDecision` avec `decision: 'delegated'`, `delegatedToId`
- Met à jour l'étape courante : le nouvel approbateur est `delegatedToId`
- Notifie le délégué
- Notifie l'équipe que la décision a été déléguée

#### `cancel(requestId: string, userId: string)`
Annule une demande (si le document source est annulé).
- Met `status = 'cancelled'`
- Pas de notification (le document est déjà annulé)

#### `listRequests(input: ListRequestsInput, currentUserId: string)`
Liste les demandes avec les includes nécessaires. 
- Si `pendingForMe = true` : filtre les demandes `pending` où l'utilisateur est approbateur de l'étape courante
- Inclure : `workflow`, `decisions.decidedBy`, `requestedBy`
- Calculer et exposer `isMyTurn: boolean` sur chaque demande

#### `findRequestById(id: string)`
Charge une demande complète avec toutes ses décisions, le workflow, et les utilisateurs liés.

#### `getDocumentPendingRequest(documentType, documentId)`
Retourne la demande `pending` d'un document (s'il en a une). Utilisé par les modules documents pour afficher le statut d'approbation.

#### `onApprovalCompleted(request: ApprovalRequest)` (private)
Appelé après approbation finale. Selon `documentType` :
- `invoice` : Ne change pas le statut automatiquement (le commercial devra cliquer "Émettre") — mais lève le blocage
- `proforma` : Idem — lève le blocage
- `purchase_order` : Lève le blocage pour l'envoi
- `supplier_invoice` : Lève le blocage
- `expense` : Change le statut en `approved` automatiquement (flux différent)
Émet via `eventBus.emit('approval.completed', { documentType, documentId })`

#### `onApprovalRejected(request: ApprovalRequest)` (private)
Remet le document en `draft` selon son type via Prisma. Ajoute une note dans l'historique de statut du document. Émet `eventBus.emit('approval.rejected', { ... })`

#### `checkExpiredRequests()` — Méthode appelée par le cron
Trouve toutes les demandes `pending` dont `expiresAt < now()`, les passe en `expired`, notifie les parties prenantes. Méthode publique appelée par le processor BullMQ.

---

### Fichier : `bridge-backend/src/modules/approvals/approvals.controller.ts`

Implémente `ApprovalsController` avec :

```typescript
// Workflows (admin seulement)
listWorkflows(req, res, next)     // GET /approvals/workflows
createWorkflow(req, res, next)    // POST /approvals/workflows
findWorkflow(req, res, next)      // GET /approvals/workflows/:id
updateWorkflow(req, res, next)    // PUT /approvals/workflows/:id
deleteWorkflow(req, res, next)    // DELETE /approvals/workflows/:id

// Demandes d'approbation
listRequests(req, res, next)      // GET /approvals/requests
findRequest(req, res, next)       // GET /approvals/requests/:id
approve(req, res, next)           // POST /approvals/requests/:id/approve
reject(req, res, next)            // POST /approvals/requests/:id/reject
delegate(req, res, next)          // POST /approvals/requests/:id/delegate
cancel(req, res, next)            // POST /approvals/requests/:id/cancel

// Counts (pour badge sidebar)
pendingCount(req, res, next)      // GET /approvals/pending-count
```

---

### Fichier : `bridge-backend/src/modules/approvals/approvals.routes.ts`

```typescript
import { Router } from 'express'
import { approvalsController as ctrl } from './approvals.controller'
import { authenticate } from '../../core/middleware/auth'
import { authorizePermission } from '../../core/middleware/rbac'
import { auditMiddleware } from '../../core/middleware/audit'

const router = Router()
router.use(authenticate)

// ── Workflows (configuration — admin) ─────────────────────────
router.get('/workflows',      authorizePermission('approvals:admin'), ctrl.listWorkflows.bind(ctrl))
router.post('/workflows',     authorizePermission('approvals:admin'), auditMiddleware('approval_workflow', 'CREATE'), ctrl.createWorkflow.bind(ctrl))
router.get('/workflows/:id',  authorizePermission('approvals:admin'), ctrl.findWorkflow.bind(ctrl))
router.put('/workflows/:id',  authorizePermission('approvals:admin'), auditMiddleware('approval_workflow', 'UPDATE'), ctrl.updateWorkflow.bind(ctrl))
router.delete('/workflows/:id', authorizePermission('approvals:admin'), auditMiddleware('approval_workflow', 'SOFT_DELETE'), ctrl.deleteWorkflow.bind(ctrl))

// ── Demandes (tous les utilisateurs authentifiés) ──────────────
router.get('/requests',           ctrl.listRequests.bind(ctrl))
router.get('/pending-count',      ctrl.pendingCount.bind(ctrl))
router.get('/requests/:id',       ctrl.findRequest.bind(ctrl))
router.post('/requests/:id/approve',  authorizePermission('approvals:approve'), auditMiddleware('approval_request', 'APPROVAL_DECISION'), ctrl.approve.bind(ctrl))
router.post('/requests/:id/reject',   authorizePermission('approvals:approve'), auditMiddleware('approval_request', 'APPROVAL_DECISION'), ctrl.reject.bind(ctrl))
router.post('/requests/:id/delegate', authorizePermission('approvals:approve'), ctrl.delegate.bind(ctrl))
router.post('/requests/:id/cancel',   ctrl.cancel.bind(ctrl))

export { router as approvalsRouter }
```

Monter dans `app.ts` :
```typescript
import { approvalsRouter } from './modules/approvals/approvals.routes'
app.use(`${API_PREFIX}/approvals`, approvalsRouter)
```

---

### Fichier : `bridge-backend/src/jobs/processors/approval.processor.ts`

```typescript
// ─── Queue approval ────────────────────────────────────────────
// Deux types de jobs :
// 1. 'check-expired' — Vérifie les demandes expirées (cron toutes les heures)
// 2. 'notify-approvers' — Notifie les approbateurs d'une demande (async, délayé)

export interface ApprovalJobData {
  type: 'check-expired' | 'notify-approvers'
  requestId?: string
}
```

Ajouter dans `src/jobs/queues.ts` :
```typescript
export const approvalQueue = new Queue<ApprovalJobData>('approval', {
  connection: redisConnection,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } }
})
```

Ajouter le cron dans `src/jobs/scheduler.ts` (ou équivalent) :
```typescript
approvalQueue.add('check-expired', { type: 'check-expired' }, {
  repeat: { pattern: '0 * * * *' }  // Toutes les heures
})
```

---

## 3. INTÉGRATION DANS LES MODULES DOCUMENTS EXISTANTS

### 3.1 Principe d'intégration

Chaque module document qui doit passer par approbation doit :

1. **Ajouter un champ `approvalRequestId`** sur le modèle Prisma (relation vers `ApprovalRequest`)
2. **Modifier la méthode de soumission** pour appeler `approvalsService.requestApproval()`
3. **Bloquer les transitions de statut** si une demande est `pending`
4. **Exposer le statut d'approbation** dans les réponses API

### 3.2 Modifications Prisma par module

Ajouter sur les modèles existants :
```prisma
// Dans Invoice
approvalRequestId String? @map("approval_request_id") @db.Uuid
requiresApproval  Boolean @default(false) @map("requires_approval")

// Dans Proforma — idem

// Dans PurchaseOrder — idem (approvalRequired existe déjà, à connecter)

// Dans SupplierInvoice — idem

// Dans Expense — approvedById/approvedAt existent déjà, connecter à ApprovalRequest
```

### 3.3 Modification `invoices.service.ts`

Dans la méthode `issue(id, userId)` :
```typescript
async issue(id: string, userId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { ... } })
  
  if (!invoice) throw AppError.notFound('Facture introuvable')
  if (invoice.status !== 'draft') throw AppError.badRequest('Seul un brouillon peut être émis')
  
  // ── Vérification approbation ──────────────────────────────────
  if (invoice.requiresApproval) {
    const pendingRequest = await approvalsService.getDocumentPendingRequest('invoice', id)
    if (pendingRequest) {
      throw AppError.forbidden(`Cette facture est en attente d'approbation (étape ${pendingRequest.currentStep}/${pendingRequest.totalSteps})`)
    }
    // Vérifier qu'une approbation terminée existe (approved)
    const approvedRequest = await prisma.approvalRequest.findFirst({
      where: { documentId: id, documentType: 'invoice', status: 'approved' }
    })
    if (!approvedRequest) {
      // Soumettre pour approbation et bloquer
      const request = await approvalsService.requestApproval({
        documentType: 'invoice',
        documentId: id,
        documentNumber: invoice.number ?? `FAC-${id.slice(0, 8)}`,
        document: invoice,
        requestedById: userId,
      })
      if (request) {
        // Marquer la facture comme "en attente d'approbation"
        await prisma.invoice.update({ where: { id }, data: { requiresApproval: true } })
        throw AppError.badRequest('Cette facture a été soumise pour approbation. Elle sera émise après validation.')
      }
    }
  }
  
  // Suite normale : issued → numéro, notifications...
}
```

**Même pattern à appliquer dans** :
- `proformas.service.ts` méthode `send()`
- `purchase-orders.service.ts` méthode `send()`
- `supplier-invoices.service.ts` méthode `validate()`
- `expenses.service.ts` méthode `submit()`

### 3.4 Détection automatique du besoin d'approbation

Dans chaque service, **avant** toute transition, appeler `approvalsService.evaluateWorkflowForDocument()` pour savoir si un workflow s'applique. Si oui, activer `requiresApproval = true` sur le document.

---

## 4. PERMISSIONS RBAC

### Nouvelles permissions à ajouter dans `src/modules/roles/roles.service.ts` (seedRoles)

```typescript
// Admin : accès total
'approvals:admin'    // Créer/modifier/supprimer des workflows
'approvals:approve'  // Approuver/rejeter des demandes
'approvals:view'     // Voir toutes les demandes

// Commercial : peut voir ses propres demandes
'approvals:view_own' // Voir uniquement ses propres demandes soumises

// Employee : peut voir ses propres demandes
// Idem
```

### Matrice par défaut
| Permission         | admin | commercial | employee |
|--------------------|-------|------------|----------|
| `approvals:admin`  | ✓     | ✗          | ✗        |
| `approvals:approve`| ✓     | configurable| configurable|
| `approvals:view`   | ✓     | ✗          | ✗        |
| `approvals:view_own`| ✓   | ✓          | ✓        |

---

## 5. FRONTEND — Feature `/features/approvals/`

### 5.1 Types (`bridge-frontend/src/features/approvals/types.ts`)

```typescript
export type ApprovalDocumentType = 'invoice' | 'proforma' | 'purchase_order' | 'supplier_invoice' | 'expense'
export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired'
export type ApprovalDecisionType = 'approved' | 'rejected' | 'delegated'
export type ApprovalTriggerOperator = 'gte' | 'lte' | 'eq' | 'gt' | 'lt'

export interface ApprovalWorkflowTrigger {
  id:           string
  documentType: ApprovalDocumentType
  field:        string
  operator:     ApprovalTriggerOperator
  value:        string
}

export interface ApprovalWorkflowStep {
  id:             string
  order:          number
  name:           string
  description?:   string | null
  approverRole?:  string | null
  approverUserId?: string | null
  approverUser?:  { id: string; firstName: string; lastName: string; email: string } | null
  deadlineHours?: number | null
  requireComment: boolean
  allowDelegate:  boolean
}

export interface ApprovalWorkflow {
  id:          string
  name:        string
  description?: string | null
  isActive:    boolean
  priority:    number
  triggers:    ApprovalWorkflowTrigger[]
  steps:       ApprovalWorkflowStep[]
  createdAt:   string
}

export interface ApprovalDecision {
  id:          string
  stepId:      string
  stepOrder:   number
  step:        ApprovalWorkflowStep
  decidedBy:   { id: string; firstName: string; lastName: string; avatarUrl: string | null }
  decidedAt:   string
  decision:    ApprovalDecisionType
  comment?:    string | null
  delegatedTo?: { id: string; firstName: string; lastName: string } | null
}

export interface ApprovalRequest {
  id:             string
  workflowId:     string
  workflow:       ApprovalWorkflow
  documentType:   ApprovalDocumentType
  documentId:     string
  documentNumber: string | null
  status:         ApprovalRequestStatus
  currentStep:    number
  totalSteps:     number
  requestedBy:    { id: string; firstName: string; lastName: string; avatarUrl: string | null }
  requestedAt:    string
  resolvedBy?:    { id: string; firstName: string; lastName: string } | null
  resolvedAt?:    string | null
  expiresAt?:     string | null
  decisions:      ApprovalDecision[]
  isMyTurn:       boolean  // Calculé côté backend
}

export interface CreateWorkflowPayload {
  name:        string
  description?: string
  isActive:    boolean
  priority:    number
  triggers:    Omit<ApprovalWorkflowTrigger, 'id'>[]
  steps:       Omit<ApprovalWorkflowStep, 'id' | 'approverUser'>[]
}

export interface ApprovePayload { comment?: string }
export interface RejectPayload  { comment:  string }
export interface DelegatePayload { delegatedToId: string; comment?: string }

export interface ListRequestsParams {
  status?:        ApprovalRequestStatus
  documentType?:  ApprovalDocumentType
  pendingForMe?:  boolean
  page?:          number
  limit?:         number
}

export interface PaginatedApprovalRequests {
  data:       ApprovalRequest[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}
```

---

### 5.2 API (`bridge-frontend/src/features/approvals/api.ts`)

```typescript
import apiClient from '@/lib/api-client'
import type {
  ApprovalWorkflow, ApprovalRequest, PaginatedApprovalRequests,
  CreateWorkflowPayload, ApprovePayload, RejectPayload, DelegatePayload,
  ListRequestsParams,
} from './types'

const BASE = '/approvals'

export const approvalsApi = {
  // ── Workflows ────────────────────────────────────────────────
  listWorkflows: () =>
    apiClient.get<ApprovalWorkflow[]>(`${BASE}/workflows`).then(r => r.data),

  getWorkflow: (id: string) =>
    apiClient.get<ApprovalWorkflow>(`${BASE}/workflows/${id}`).then(r => r.data),

  createWorkflow: (payload: CreateWorkflowPayload) =>
    apiClient.post<ApprovalWorkflow>(`${BASE}/workflows`, payload).then(r => r.data),

  updateWorkflow: (id: string, payload: Partial<CreateWorkflowPayload>) =>
    apiClient.put<ApprovalWorkflow>(`${BASE}/workflows/${id}`, payload).then(r => r.data),

  deleteWorkflow: (id: string) =>
    apiClient.delete(`${BASE}/workflows/${id}`),

  // ── Demandes ─────────────────────────────────────────────────
  listRequests: (params?: ListRequestsParams) =>
    apiClient.get<PaginatedApprovalRequests>(`${BASE}/requests`, { params }).then(r => r.data),

  getRequest: (id: string) =>
    apiClient.get<ApprovalRequest>(`${BASE}/requests/${id}`).then(r => r.data),

  pendingCount: () =>
    apiClient.get<{ count: number }>(`${BASE}/pending-count`).then(r => r.data),

  approve: (id: string, payload?: ApprovePayload) =>
    apiClient.post<ApprovalRequest>(`${BASE}/requests/${id}/approve`, payload).then(r => r.data),

  reject: (id: string, payload: RejectPayload) =>
    apiClient.post<ApprovalRequest>(`${BASE}/requests/${id}/reject`, payload).then(r => r.data),

  delegate: (id: string, payload: DelegatePayload) =>
    apiClient.post<ApprovalRequest>(`${BASE}/requests/${id}/delegate`, payload).then(r => r.data),

  cancel: (id: string) =>
    apiClient.post(`${BASE}/requests/${id}/cancel`),
}
```

---

### 5.3 Hooks (`bridge-frontend/src/features/approvals/hooks.ts`)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { approvalsApi } from './api'
import type { CreateWorkflowPayload, ListRequestsParams, ApprovePayload, RejectPayload, DelegatePayload } from './types'

const KEYS = {
  all:         ['approvals'] as const,
  workflows:   ['approvals', 'workflows'] as const,
  workflow:    (id: string) => ['approvals', 'workflows', id] as const,
  requests:    (p?: ListRequestsParams) => ['approvals', 'requests', p] as const,
  request:     (id: string) => ['approvals', 'requests', id] as const,
  pendingCount: ['approvals', 'pending-count'] as const,
}

export function useApprovalWorkflows() {
  return useQuery({ queryKey: KEYS.workflows, queryFn: approvalsApi.listWorkflows, staleTime: 60_000 })
}

export function useApprovalWorkflow(id: string) {
  return useQuery({ queryKey: KEYS.workflow(id), queryFn: () => approvalsApi.getWorkflow(id), enabled: !!id })
}

export function useCreateApprovalWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: CreateWorkflowPayload) => approvalsApi.createWorkflow(p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.workflows }); toast.success('Workflow créé') },
    onError: () => toast.error('Erreur lors de la création'),
  })
}

export function useUpdateApprovalWorkflow(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Partial<CreateWorkflowPayload>) => approvalsApi.updateWorkflow(id, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.workflows }); qc.invalidateQueries({ queryKey: KEYS.workflow(id) }); toast.success('Workflow mis à jour') },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })
}

export function useDeleteApprovalWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => approvalsApi.deleteWorkflow(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.workflows }); toast.success('Workflow désactivé') },
    onError: () => toast.error('Impossible de supprimer ce workflow (demandes actives ?)'),
  })
}

export function useApprovalRequests(params?: ListRequestsParams) {
  return useQuery({ queryKey: KEYS.requests(params), queryFn: () => approvalsApi.listRequests(params), staleTime: 15_000 })
}

export function useApprovalRequest(id: string) {
  return useQuery({ queryKey: KEYS.request(id), queryFn: () => approvalsApi.getRequest(id), enabled: !!id })
}

export function useApprovalPendingCount() {
  return useQuery({
    queryKey: KEYS.pendingCount,
    queryFn: approvalsApi.pendingCount,
    staleTime: 30_000,
    refetchInterval: 60_000,  // Polling toutes les 60s pour le badge sidebar
  })
}

export function useApprove() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: ApprovePayload }) => approvalsApi.approve(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.all }); toast.success('Document approuvé') },
    onError: () => toast.error('Erreur lors de l\'approbation'),
  })
}

export function useReject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RejectPayload }) => approvalsApi.reject(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.all }); toast.success('Document rejeté') },
    onError: () => toast.error('Erreur lors du rejet'),
  })
}

export function useDelegate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DelegatePayload }) => approvalsApi.delegate(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.all }); toast.success('Décision déléguée') },
    onError: () => toast.error('Erreur lors de la délégation'),
  })
}
```

---

### 5.4 Pages Frontend

#### Page : `bridge-frontend/src/app/(dashboard)/approvals/page.tsx`

**Inbox des approbations** — Page principale pour les approbateurs.

Layout :
- Header : "Approbations" + description + filtre par statut (tabs : En attente / Approuvées / Rejetées / Toutes)
- Filtre secondaire : type de document + période
- Liste de cartes `ApprovalRequestCard` triées par date (plus urgent en premier, basé sur `expiresAt`)
- État vide si aucune demande

Chaque `ApprovalRequestCard` affiche :
- Badge type de document (Facture / Proforma / Bon de commande / Facture fournisseur / Dépense) avec couleur différente par type
- Numéro du document (`documentNumber`)
- Demandé par : avatar + nom + date relative ("Il y a 2h")
- Montant depuis `documentSnapshot.totalTtc`
- Progress bar des étapes : "Étape 2/3" avec points de progression
- Délai restant (si `expiresAt` : "Expire dans 4h" en orange/rouge si < 24h)
- Badge statut : `pending` (jaune) / `approved` (vert) / `rejected` (rouge) / `expired` (violet)
- Si `isMyTurn` : boutons inline **Approuver** / **Rejeter** + lien "Voir le document"
- Si pas mon tour : texte "En attente de [Nom Étape]"

#### Page : `bridge-frontend/src/app/(dashboard)/settings/workflows/page.tsx`

**Configuration des workflows** — Réservée admin.

Layout :
- Header "Workflows d'approbation" + bouton "Nouveau workflow"
- Liste des workflows existants avec :
  - Nom + description + badge actif/inactif + priorité
  - Résumé triggers : "Facture ≥ 1 000 000 XAF"
  - Résumé étapes : "3 étapes : Commercial → DAF → DG"
  - Actions : Modifier / Activer-Désactiver / Supprimer
- Bouton "Nouveau workflow" → ouvre `WorkflowDrawer`

#### Composant : `WorkflowDrawer.tsx`

Drawer slide-in depuis la droite (même pattern que `PaymentDrawer`, `ProductDrawer`).

**Formulaire multi-sections** :

**Section 1 — Informations générales**
- Nom du workflow (input texte)
- Description (textarea)
- Priorité (number input, tooltip : "En cas de plusieurs workflows applicables, celui avec la priorité la plus haute est sélectionné")
- Toggle Actif / Inactif

**Section 2 — Déclencheurs** (minimum 1 requis)
- Header "Quand déclencher ?" + bouton "Ajouter un déclencheur"
- Pour chaque déclencheur :
  - Select type de document : `Facture | Proforma | Bon de commande | Facture fournisseur | Dépense`
  - Select champ : `Montant TTC | Montant HT | Type de facture` (dynamique selon le type de doc)
  - Select opérateur : `≥ | ≤ | = | > | <`
  - Input valeur (formaté selon le champ : montant pour TTC/HT, select pour type)
  - Bouton supprimer le déclencheur

**Section 3 — Étapes d'approbation** (minimum 1 requise)
- Header "Étapes séquentielles" + bouton "Ajouter une étape"
- Étapes réordonnables (drag and drop ou boutons ↑↓)
- Pour chaque étape :
  - Numéro d'étape (auto-généré)
  - Nom de l'étape (ex: "Validation DAF")
  - Approbateur : toggle "Par rôle" / "Utilisateur spécifique"
    - Par rôle → select (Admin / Commercial / Employé)
    - Par utilisateur → select avec recherche autocomplete des utilisateurs actifs
  - Délai maximum (input heures, optionnel, tooltip : "Laissez vide pour illimité")
  - Checkbox "Commentaire obligatoire"
  - Checkbox "Délégation autorisée"
  - Bouton supprimer l'étape

**Footer drawer** : Annuler | Enregistrer le workflow

#### Composant : `ApprovalDecisionDrawer.tsx`

Drawer slide-in pour prendre une décision sur une demande. S'ouvre depuis `ApprovalRequestCard` ou depuis la page détail d'un document.

**Contenu** :

**Header** :
- Icône CheckCircle2 (approuver) ou XCircle (rejeter) — selon l'action
- Titre "Approuver" ou "Rejeter"
- Sous-titre : document number + client/fournisseur

**Corps** :

**Bloc récapitulatif du document** (depuis `documentSnapshot`) :
- Type badge + Numéro + Date
- Client / Fournisseur
- Montant TTC (grande police mono)
- Lien "Voir le document complet" (ouvre dans nouvel onglet)

**Timeline des approbations précédentes** :
- Pour chaque décision déjà prise : avatar + nom + date + icône ✓/✗/→ + commentaire
- Étape courante en surbrillance

**Section décision** (si `isMyTurn`) :
- Deux gros boutons en haut : **Approuver** (vert) / **Rejeter** (rouge) — togglables
- Textarea commentaire (placeholder : "Ajouter un commentaire..." — obligatoire si reject ou si `requireComment`)
- Si `allowDelegate` : lien secondaire "Déléguer à..." → ouvre un select utilisateur

**Footer** :
- Annuler | [Confirmer la décision]

---

### 5.5 Composant `ApprovalStatusBadge.tsx`

Badge réutilisable affiché sur les pages documents (invoices, proformas, etc.) quand `requiresApproval = true`.

```tsx
interface ApprovalStatusBadgeProps {
  request: { status: ApprovalRequestStatus; currentStep: number; totalSteps: number } | null
  onViewRequest?: () => void
}
```

Affiche :
- Si `pending` : badge orange "En attente d'approbation (2/3)" + icône Clock
- Si `approved` : badge vert "Approuvé" + icône CheckCircle2
- Si `rejected` : badge rouge "Rejeté" + icône XCircle
- Si `expired` : badge violet "Expiré" + icône AlertCircle
- Si `null` : rien

Cliquable si `onViewRequest` → ouvre `ApprovalDecisionDrawer`

---

### 5.6 Intégration sidebar

Dans `src/components/layout/Sidebar.tsx`, ajouter dans la section "Gestion & Reporting" :

```typescript
{
  label: 'Approbations',
  href: ROUTES.APPROVALS,
  icon: CheckSquare,
  badge: pendingCount > 0 ? String(pendingCount) : undefined,  // Badge rouge
}
```

Le `pendingCount` est chargé via `useApprovalPendingCount()` dans le layout ou le provider.

Dans `src/lib/constants.ts` (frontend), ajouter :
```typescript
APPROVALS: '/approvals',
SETTINGS_WORKFLOWS: '/settings/workflows',
```

---

### 5.7 Intégration dans les pages documents existantes

Dans chaque page de détail de document (`/invoices/[id]/page.tsx`, etc.), ajouter :

```tsx
// Si le document a requiresApproval = true
{invoice.requiresApproval && (
  <ApprovalStatusBadge
    request={invoice.approvalRequest ?? null}
    onViewRequest={() => setApprovalDrawerOpen(true)}
  />
)}

// Et dans la barre d'actions, griser le bouton "Émettre" si pending
<button
  disabled={invoice.approvalRequest?.status === 'pending'}
  onClick={handleIssue}
>
  {invoice.approvalRequest?.status === 'pending'
    ? 'En attente d\'approbation...'
    : 'Émettre la facture'
  }
</button>
```

---

## 6. DESIGN & UX

### 6.1 Charte graphique — à respecter strictement

**Variables CSS** (issues de `src/app/globals.css`) :
```css
--primary: #2D7DD2           /* Bleu BTS — actions principales */
--sidebar-bg: #0c2340        /* Navy foncé — sidebar */
--bg: #f0f4f9                /* Fond général */
--surface: #ffffff           /* Cartes, drawers */
--border: #e2e8f0            /* Séparateurs */
--text-1: #0f1923            /* Texte principal */
--text-2: #3d5166            /* Texte secondaire */
--text-3: #5a7a96            /* Texte tertiaire */
--font-display: 'Sora'       /* Titres, labels */
--font-body: 'DM Sans'       /* Corps */
--font-mono: 'JetBrains Mono'/* Montants, références */
--radius-sm: 6px / --radius-md: 10px / --radius-lg: 14px
--shadow-sm / --shadow-md / --shadow-lg
```

**Couleurs sémantiques pour les statuts d'approbation** :
```css
/* En attente */
--approval-pending-color: #d97706;   /* Ambre */
--approval-pending-bg:    #fffbeb;

/* Approuvé */
--approval-approved-color: #16a34a;  /* Vert */
--approval-approved-bg:    #f0fdf4;

/* Rejeté */
--approval-rejected-color: #dc2626;  /* Rouge */
--approval-rejected-bg:    #fef2f2;

/* Expiré */
--approval-expired-color: #9333ea;   /* Violet */
--approval-expired-bg:    #faf5ff;
```

### 6.2 Contraintes UX

- Tous les boutons d'action ont `minHeight: 44px` (accessibilité touch)
- Les drawers ont un backdrop avec `backdropFilter: blur(2px)`
- Animation slide-in drawer : `transform: translateX(100%) → translateX(0)`, durée 300ms, `cubic-bezier(0.4, 0, 0.2, 1)`
- Gradient stripe en haut du drawer : `linear-gradient(90deg, #0f2d4a 0%, #2D7DD2 100%)`, hauteur 3px
- Body scroll lock quand un drawer est ouvert
- ESC ferme tous les drawers et modals
- `aria-modal="true"`, `role="dialog"`, `aria-labelledby` sur tous les overlays
- Montants en `font-family: var(--font-mono)` avec séparateur milliers (`Intl.NumberFormat('fr-FR')`)
- Pas d'emojis dans le code sauf demande explicite
- Pas de commentaires redondants dans le code (seulement si le WHY est non-évident)

---

## 7. EMAILS — Templates d'approbation

Créer des entrées dans la table `email_templates` (seed ou migration) pour :

### Template `APPROVAL_REQUEST`
- **Sujet** : `[ACTION REQUISE] Approbation demandée — {{documentType}} {{documentNumber}}`
- **Corps** : 
  - Bonjour {{approverName}},
  - {{requesterName}} vous demande d'approuver : **{{documentType}} n° {{documentNumber}}** d'un montant de **{{amount}} XAF**
  - Étape : {{stepName}} ({{currentStep}}/{{totalSteps}})
  - {{#if deadline}}À valider avant le {{deadline}}{{/if}}
  - Bouton CTA : "Voir et approuver dans BRIDGE" → lien vers `/approvals?highlight={{requestId}}`

### Template `APPROVAL_APPROVED`
- **Sujet** : `✓ {{documentType}} {{documentNumber}} — Approuvée ({{currentStep}}/{{totalSteps}} étape{{#if hasMore}}s restantes{{else}} — Validation finale{{/if}})`
- **Corps** : confirmation de la décision, prochaine étape si applicable

### Template `APPROVAL_REJECTED`
- **Sujet** : `✗ {{documentType}} {{documentNumber}} — Rejetée par {{deciderName}}`
- **Corps** : commentaire du rejet, lien vers le document pour corriger

### Template `APPROVAL_EXPIRED`
- **Sujet** : `⚠ Demande expirée — {{documentType}} {{documentNumber}}`
- **Corps** : information sur l'expiration, action requise

---

## 8. CONTRAINTES TECHNIQUES IMPORTANTES

### 8.1 Cohérence avec schema v3

Toute modification du schéma Prisma DOIT être répercutée dans `invoicehub_schema_v3.sql` :
- Les `CREATE TYPE` pour les nouveaux enums
- Les `CREATE TABLE` pour les nouveaux modèles avec contraintes FK (`REFERENCES`, `ON DELETE CASCADE`)
- Les `ALTER TABLE` pour les colonnes ajoutées aux modèles existants
- Les index (`CREATE INDEX`) sur les colonnes de filtrage fréquent : `approval_requests(document_id)`, `approval_requests(status)`, `approval_requests(document_type)`, `approval_decisions(request_id)`

### 8.2 Transactions Prisma

Toutes les opérations qui modifient plusieurs tables doivent utiliser `prisma.$transaction([...])` ou `prisma.$transaction(async (tx) => { ... })` pour garantir la cohérence.

### 8.3 Pas de breaking changes

- Ne jamais supprimer une colonne ou modifier un enum existant sans migration backward-compatible
- Les nouveaux champs sur les modèles existants (`approvalRequestId`, `requiresApproval`) sont optionnels (`?`) avec valeur par défaut `false` pour ne pas casser les documents existants
- Le comportement actuel (sans workflow) doit être préservé : si `evaluateWorkflowForDocument` retourne `null`, tout fonctionne comme avant

### 8.4 Performance

- `useApprovalPendingCount()` doit être léger (COUNT SQL simple, pas de jointures)
- La liste des demandes doit être paginée (max 20 par page)
- Le snapshot de document stocké en JSON ne doit pas dépasser ~10KB (éviter d'inclure les lignes complètes si le document est très long — stocker seulement les champs affichés dans le drawer)
- Les index Prisma sont obligatoires sur les colonnes filtrées

### 8.5 Sécurité

- Vérifier systématiquement que l'utilisateur qui approuve/rejette est bien l'approbateur attendu à l'étape courante
- Ne jamais exposer les données des autres utilisateurs dans un snapshot (masquer les champs sensibles)
- L'accès à la configuration des workflows (`approvals:admin`) est strictement réservé aux admins
- Les commentaires de rejet sont stockés et non modifiables après soumission

---

## 9. ORDRE D'IMPLÉMENTATION RECOMMANDÉ

### Phase 1 — Backend (3–4 jours)
1. Modifier `prisma/schema.prisma` + répercuter dans `invoicehub_schema_v3.sql`
2. Créer `src/modules/approvals/approvals.schema.ts`
3. Créer `src/modules/approvals/approvals.service.ts` (méthodes core)
4. Créer `src/modules/approvals/approvals.controller.ts`
5. Créer `src/modules/approvals/approvals.routes.ts` + monter dans `app.ts`
6. Créer `src/jobs/processors/approval.processor.ts` + ajouter queue + cron
7. Intégrer dans `invoices.service.ts` (méthode `issue`) en premier
8. Intégrer dans les autres services documents
9. Mettre à jour les permissions dans `roles.service.ts`
10. Test : `pnpm tsc --noEmit` → EXIT 0

### Phase 2 — Frontend (3–4 jours)
1. Créer `features/approvals/types.ts` + `api.ts` + `hooks.ts`
2. Créer composant `ApprovalStatusBadge.tsx`
3. Créer page `/approvals/page.tsx` (inbox)
4. Créer `ApprovalDecisionDrawer.tsx`
5. Créer `WorkflowDrawer.tsx`
6. Créer page `/settings/workflows/page.tsx`
7. Intégrer `ApprovalStatusBadge` dans les pages détail documents
8. Ajouter "Approbations" dans la sidebar avec badge count
9. Ajouter ROUTES.APPROVALS dans constants
10. Test : `pnpm build` → EXIT 0

---

## 10. TESTS ATTENDUS

Créer `bridge-backend/src/__tests__/modules/approvals/approvals.service.test.ts` couvrant :

1. `evaluateWorkflowForDocument` :
   - Aucun workflow actif → retourne null
   - Workflow qui matche (invoice, totalTtc >= 1_000_000) → retourne le workflow
   - Workflow qui ne matche pas (amount insuffisant) → retourne null
   - Plusieurs workflows → retourne celui avec la priorité la plus haute
   
2. `requestApproval` :
   - Crée une demande avec currentStep = 1
   - Notifie les approbateurs de l'étape 1
   - Double appel sur même document → retourne la demande existante (pas de doublon)
   
3. `approve` :
   - Non-approbateur tente d'approuver → AppError.forbidden
   - Étape intermédiaire → passe à l'étape suivante, notifie
   - Dernière étape → status = 'approved', appelle onApprovalCompleted
   
4. `reject` :
   - Commentaire manquant → AppError.badRequest (si requireComment)
   - Status → 'rejected', document revient en draft

---

Ce prompt est complet et auto-suffisant. Toutes les conventions de l'application existante sont respectées.

---

## 11. NOTE D'ÉVOLUTION — Intégration frontend documents futurs

Lorsque les modules suivants auront leur frontend développé, il faudra y intégrer le badge d'approbation de la même manière que pour les factures et proformas :

- **Bons de commande** (`/purchase-orders/[id]`) → ajouter `ApprovalStatusBadge` dans `PurchaseOrderActionsMenu`, griser le bouton "Envoyer" si `approvalRequest.status === 'pending'`, ajouter `requiresApproval` et `approvalRequest` dans le type `PurchaseOrder` frontend.
- **Factures fournisseurs** (`/supplier-invoices/[id]`) → même pattern sur le bouton "Valider".
- **Dépenses** (`/expenses/[id]`) → même pattern sur le bouton "Soumettre".

Le composant `ApprovalStatusBadge` est déjà disponible dans `src/features/approvals/components/ApprovalStatusBadge.tsx` et réutilisable sans modification.
