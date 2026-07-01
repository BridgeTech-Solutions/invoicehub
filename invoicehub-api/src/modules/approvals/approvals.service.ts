import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Queue } from 'bullmq'
import { APPROVAL_COMPLETED, type ApprovalCompletedEvent, type AutoExecResult } from '../../common/events/approval.events'
import {
  ApprovalDocumentType,
  ApprovalRequestStatus,
  ApprovalWorkflow,
  ApprovalRequest,
  Prisma,
} from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AppError } from '../../common/errors/app-error'
import type { NotificationJobData, EmailJobData } from '../../jobs/job-types'
import type {
  CreateWorkflowInput,
  UpdateWorkflowInput,
  ListWorkflowsInput,
  ListRequestsInput,
  ApproveInput,
  RejectInput,
  DelegateInput,
} from './approvals.schema'

const workflowInclude = {
  triggers: true,
  steps: {
    include: { approverUser: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { order: 'asc' as const },
  },
} satisfies Prisma.ApprovalWorkflowInclude

const requestInclude = {
  workflow: { include: { steps: { orderBy: { order: 'asc' as const } } } },
  requestedBy: { select: { id: true, firstName: true, lastName: true, avatarPath: true } },
  resolvedBy:  { select: { id: true, firstName: true, lastName: true } },
  decisions: {
    include: {
      decidedBy:   { select: { id: true, firstName: true, lastName: true, avatarPath: true } },
      delegatedTo: { select: { id: true, firstName: true, lastName: true } },
      step:        true,
    },
    orderBy: { decidedAt: 'asc' as const },
  },
} satisfies Prisma.ApprovalRequestInclude

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notification') private readonly notifQueue: Queue<NotificationJobData>,
    @InjectQueue('email') private readonly emailQueue: Queue<EmailJobData>,
    private readonly emitter: EventEmitter2,
  ) {}

  // ── Workflows ─────────────────────────────────────────────────

  async listWorkflows(input: ListWorkflowsInput) {
    const { isActive, page, limit } = input
    const skip = (page - 1) * limit
    const where: Prisma.ApprovalWorkflowWhereInput = isActive !== undefined ? { isActive } : {}

    const [data, total] = await this.prisma.$transaction([
      this.prisma.approvalWorkflow.findMany({ where, include: workflowInclude, orderBy: { priority: 'desc' }, skip, take: limit }),
      this.prisma.approvalWorkflow.count({ where }),
    ])
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async findWorkflowById(id: string) {
    const wf = await this.prisma.approvalWorkflow.findUnique({ where: { id }, include: workflowInclude })
    if (!wf) throw AppError.notFound('Workflow introuvable')
    return wf
  }

  async createWorkflow(input: CreateWorkflowInput, userId: string) {
    const { name, description, isActive, priority, triggers, steps } = input

    const orders = steps.map((s) => s.order)
    if (new Set(orders).size !== orders.length) throw AppError.badRequest('Les ordres des étapes doivent être uniques')

    const userIds = steps.map((s) => s.approverUserId).filter(Boolean) as string[]
    if (userIds.length > 0) {
      const found = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } })
      if (found.length !== userIds.length) throw AppError.badRequest('Un ou plusieurs approbateurs spécifiés sont introuvables')
    }

    return this.prisma.approvalWorkflow.create({
      data: {
        name, description, isActive, priority,
        triggers: { create: triggers },
        steps:    { create: steps },
      },
      include: workflowInclude,
    })
  }

  async updateWorkflow(id: string, input: UpdateWorkflowInput, _userId: string) {
    await this.findWorkflowById(id)

    const hasPending = await this.prisma.approvalRequest.findFirst({ where: { workflowId: id, status: 'pending' } })
    if (hasPending) throw AppError.badRequest('Impossible de modifier un workflow avec des demandes en attente')

    const { triggers, steps, ...rest } = input

    return this.prisma.$transaction(async (tx) => {
      if (triggers) await tx.approvalWorkflowTrigger.deleteMany({ where: { workflowId: id } })
      if (steps)    await tx.approvalWorkflowStep.deleteMany({ where: { workflowId: id } })

      return tx.approvalWorkflow.update({
        where: { id },
        data: {
          ...rest,
          ...(triggers ? { triggers: { create: triggers } } : {}),
          ...(steps    ? { steps:    { create: steps } }    : {}),
        },
        include: workflowInclude,
      })
    })
  }

  async deleteWorkflow(id: string) {
    await this.findWorkflowById(id)
    const hasPending = await this.prisma.approvalRequest.findFirst({ where: { workflowId: id, status: 'pending' } })
    if (hasPending) throw AppError.badRequest('Impossible de désactiver un workflow avec des demandes en attente')
    return this.prisma.approvalWorkflow.update({ where: { id }, data: { isActive: false } })
  }

  // ── Matching engine ───────────────────────────────────────────

  async evaluateWorkflowForDocument(
    documentType: ApprovalDocumentType,
    document: Record<string, unknown>,
  ): Promise<ApprovalWorkflow | null> {
    const workflows = await this.prisma.approvalWorkflow.findMany({
      where: { isActive: true },
      include: { triggers: true },
      orderBy: { priority: 'desc' },
    })

    for (const wf of workflows) {
      const relevantTriggers = wf.triggers.filter((t: { documentType: ApprovalDocumentType }) => t.documentType === documentType)
      if (relevantTriggers.length === 0) continue

      const allMatch = relevantTriggers.every((trigger: { field: string; operator: string; value: string }) => {
        const docValue = document[trigger.field]
        if (docValue === undefined || docValue === null) return false

        const tv = trigger.value
        const numericTv = parseFloat(tv)
        const isNumeric = !isNaN(numericTv)

        if (isNumeric) {
          const numDoc = parseFloat(String(docValue))
          if (isNaN(numDoc)) return false
          switch (trigger.operator) {
            case 'gte': return numDoc >= numericTv
            case 'lte': return numDoc <= numericTv
            case 'eq':  return numDoc === numericTv
            case 'gt':  return numDoc > numericTv
            case 'lt':  return numDoc < numericTv
          }
        } else {
          const strDoc = String(docValue)
          switch (trigger.operator) {
            case 'eq':  return strDoc === tv
            case 'gte': return strDoc >= tv
            case 'lte': return strDoc <= tv
            case 'gt':  return strDoc > tv
            case 'lt':  return strDoc < tv
          }
        }
        return false
      })

      if (allMatch) return wf
    }
    return null
  }

  // ── Request approval ──────────────────────────────────────────

  async requestApproval(params: {
    documentType:   ApprovalDocumentType
    documentId:     string
    documentNumber: string
    document:       Record<string, unknown>
    requestedById:  string
  }): Promise<ApprovalRequest | null> {
    const { documentType, documentId, documentNumber, document, requestedById } = params

    const wf = await this.evaluateWorkflowForDocument(documentType, document)
    if (!wf) return null

    const existing = await this.prisma.approvalRequest.findFirst({
      where: { documentId, documentType, status: 'pending' },
    })
    if (existing) return existing

    const steps = await this.prisma.approvalWorkflowStep.findMany({
      where: { workflowId: wf.id },
      orderBy: { order: 'asc' },
    })
    if (steps.length === 0) return null

    const firstStep = steps[0]
    const expiresAt = firstStep.deadlineHours
      ? new Date(Date.now() + firstStep.deadlineHours * 3_600_000)
      : null

    const snapshot: Record<string, unknown> = {
      id:           document.id,
      number:       document.number,
      totalTtc:     document.totalTtc,
      totalHt:      document.totalHt,
      status:       document.status,
      type:         document.type,
      clientId:     document.clientId,
      supplierId:   document.supplierId,
    }

    const request = await this.prisma.approvalRequest.create({
      data: {
        workflowId:       wf.id,
        documentType,
        documentId,
        documentNumber,
        documentSnapshot: snapshot as Prisma.InputJsonValue,
        status:           'pending',
        currentStep:      1,
        totalSteps:       steps.length,
        requestedById,
        ...(expiresAt ? { expiresAt } : {}),
      },
    })

    await this._notifyApprovers(firstStep, request, 'approval_requested', `Approbation requise — ${documentType} ${documentNumber}`)

    await this.prisma.auditLog.create({
      data: {
        userId:     requestedById,
        action:     'APPROVAL_REQUESTED',
        entityType: 'approval_request',
        entityId:   request.id,
        newState:  { documentType, documentId, workflowId: wf.id },
      },
    })

    return request
  }

  // ── Approve ───────────────────────────────────────────────────

  async approve(requestId: string, userId: string, input: ApproveInput) {
    const request = await this._loadRequestOrThrow(requestId)
    this._assertPending(request)

    const step = await this._findCurrentStep(request)
    await this._assertIsApprover(step, userId)

    if (step.requireComment && !input.comment?.trim()) {
      throw AppError.badRequest('Un commentaire est obligatoire pour cette étape')
    }

    await this.prisma.approvalDecision.create({
      data: {
        requestId,
        stepId:     step.id,
        stepOrder:  step.order,
        decidedById: userId,
        decision:   'approved',
        comment:    input.comment,
      },
    })

    const isFinalStep = request.currentStep >= request.totalSteps

    if (isFinalStep) {
      await this.prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: 'approved', resolvedById: userId, resolvedAt: new Date() },
      })
      await this._notifyUser(request.requestedById, 'approval_approved', 'Demande approuvée', `Votre demande d'approbation pour ${request.documentType} ${request.documentNumber ?? ''} a été approuvée.`, requestId, this._docNotifData(request))
      await this._onApprovalCompleted(request)
    } else {
      const nextStep = await this.prisma.approvalWorkflowStep.findFirst({
        where: { workflowId: request.workflowId, order: request.currentStep + 1 },
      })
      const nextExpiresAt = nextStep?.deadlineHours
        ? new Date(Date.now() + nextStep.deadlineHours * 3_600_000)
        : null

      await this.prisma.approvalRequest.update({
        where: { id: requestId },
        data: { currentStep: request.currentStep + 1, ...(nextExpiresAt ? { expiresAt: nextExpiresAt } : { expiresAt: null }) },
      })

      if (nextStep) {
        await this._notifyApprovers(nextStep, request, 'approval_requested', `Approbation requise (étape ${nextStep.order}) — ${request.documentType} ${request.documentNumber ?? ''}`)
      }
    }

    await this.prisma.auditLog.create({
      data: {
        userId,
        action:     'APPROVAL_DECISION',
        entityType: 'approval_request',
        entityId:   requestId,
        newState:  { decision: 'approved', step: request.currentStep },
      },
    })
  }

  // ── Reject ────────────────────────────────────────────────────

  async reject(requestId: string, userId: string, input: RejectInput) {
    const request = await this._loadRequestOrThrow(requestId)
    this._assertPending(request)

    const step = await this._findCurrentStep(request)
    await this._assertIsApprover(step, userId)

    await this.prisma.approvalDecision.create({
      data: {
        requestId,
        stepId:      step.id,
        stepOrder:   step.order,
        decidedById: userId,
        decision:    'rejected',
        comment:     input.comment,
      },
    })

    await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'rejected', resolvedById: userId, resolvedAt: new Date() },
    })

    await this._notifyUser(
      request.requestedById,
      'approval_rejected',
      'Demande rejetée',
      `Votre demande pour ${request.documentType} ${request.documentNumber ?? ''} a été rejetée. Motif : ${input.comment}`,
      requestId,
      this._docNotifData(request),
    )

    await this._onApprovalRejected(request)

    await this.prisma.auditLog.create({
      data: {
        userId,
        action:     'APPROVAL_DECISION',
        entityType: 'approval_request',
        entityId:   requestId,
        newState:  { decision: 'rejected', step: request.currentStep, comment: input.comment },
      },
    })
  }

  // ── Delegate ──────────────────────────────────────────────────

  async delegate(requestId: string, userId: string, input: DelegateInput) {
    const request = await this._loadRequestOrThrow(requestId)
    this._assertPending(request)

    const step = await this._findCurrentStep(request)
    if (!step.allowDelegate) throw AppError.badRequest('La délégation n\'est pas autorisée pour cette étape')
    await this._assertIsApprover(step, userId)

    const delegatee = await this.prisma.user.findUnique({ where: { id: input.delegatedToId }, select: { id: true, firstName: true } })
    if (!delegatee) throw AppError.notFound('Utilisateur délégué introuvable')

    await this.prisma.approvalDecision.create({
      data: {
        requestId,
        stepId:        step.id,
        stepOrder:     step.order,
        decidedById:   userId,
        decision:      'delegated',
        comment:       input.comment,
        delegatedToId: input.delegatedToId,
      },
    })

    await this.prisma.approvalWorkflowStep.update({
      where: { id: step.id },
      data: { approverUserId: input.delegatedToId, approverRole: null },
    })

    await this._notifyUser(input.delegatedToId, 'approval_delegated', 'Décision déléguée', `Une demande d'approbation vous a été déléguée pour ${request.documentType} ${request.documentNumber ?? ''}.`, requestId)
  }

  // ── Cancel ────────────────────────────────────────────────────

  async cancel(requestId: string, _userId: string) {
    const request = await this._loadRequestOrThrow(requestId)
    if (request.status !== 'pending') throw AppError.badRequest('Seules les demandes en attente peuvent être annulées')
    await this.prisma.approvalRequest.update({ where: { id: requestId }, data: { status: 'cancelled' } })
  }

  // ── List requests ─────────────────────────────────────────────

  async listRequests(input: ListRequestsInput, currentUserId: string) {
    const { status, documentType, requestedById, pendingForMe, page, limit } = input
    const skip = (page - 1) * limit

    const where: Prisma.ApprovalRequestWhereInput = {
      ...(status       ? { status }       : {}),
      ...(documentType ? { documentType } : {}),
      ...(requestedById ? { requestedById } : {}),
    }

    const requests = await this.prisma.approvalRequest.findMany({
      where,
      include: requestInclude,
      orderBy: { requestedAt: 'desc' },
      skip,
      take: limit,
    })

    const total = await this.prisma.approvalRequest.count({ where })

    const currentUser = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      include: { role: true },
    })
    const currentRoleName = currentUser?.role?.name

    const data = await Promise.all(
      requests.map(async (req: typeof requests[number]) => {
        let isMyTurn = false
        if (req.status === 'pending') {
          const step = req.workflow.steps.find((s: { order: number }) => s.order === req.currentStep)
          if (step) {
            isMyTurn = step.approverUserId === currentUserId ||
              (!!step.approverRole && step.approverRole === currentRoleName)
          }
        }
        return { ...req, isMyTurn }
      }),
    )

    const filtered = pendingForMe === 'true' ? data.filter((r: { isMyTurn: boolean }) => r.isMyTurn) : data

    return { data: filtered, total: pendingForMe === 'true' ? filtered.length : total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async findRequestById(id: string) {
    const request = await this.prisma.approvalRequest.findUnique({ where: { id }, include: requestInclude })
    if (!request) throw AppError.notFound('Demande d\'approbation introuvable')
    return request
  }

  async getDocumentPendingRequest(documentType: ApprovalDocumentType, documentId: string) {
    return this.prisma.approvalRequest.findFirst({
      where: { documentId, documentType, status: 'pending' },
      include: requestInclude,
    })
  }

  /**
   * Dernière demande d'approbation d'un document (tous statuts), au format léger
   * pour afficher le statut « en attente / approuvé / rejeté » sur les pages
   * détail et liste. Renvoie null si le document n'a jamais été soumis.
   */
  async getLatestForDocument(documentType: ApprovalDocumentType, documentId: string) {
    return this.prisma.approvalRequest.findFirst({
      where:   { documentId, documentType },
      orderBy: { requestedAt: 'desc' },
      select:  { id: true, status: true, currentStep: true, totalSteps: true },
    })
  }

  async pendingCount(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { role: true } })
    const roleName = user?.role?.name

    const pending = await this.prisma.approvalRequest.findMany({
      where: { status: 'pending' },
      include: { workflow: { include: { steps: true } } },
    })

    let count = 0
    for (const req of pending) {
      const step = req.workflow.steps.find((s: { order: number }) => s.order === req.currentStep)
      if (!step) continue
      if (step.approverUserId === userId || (step.approverRole && step.approverRole === roleName)) {
        count++
      }
    }
    return count
  }

  // ── Cron: expire old requests ─────────────────────────────────

  async checkExpiredRequests() {
    const expired = await this.prisma.approvalRequest.findMany({
      where: { status: 'pending', expiresAt: { lt: new Date() } },
      include: requestInclude,
    })

    for (const req of expired) {
      await this.prisma.approvalRequest.update({ where: { id: req.id }, data: { status: 'expired' } })
      await this._notifyUser(req.requestedById, 'approval_expired', 'Demande expirée', `Votre demande d'approbation pour ${req.documentType} ${req.documentNumber ?? ''} a expiré.`, req.id)
    }

    return expired.length
  }

  // ── Private helpers ───────────────────────────────────────────

  private async _loadRequestOrThrow(requestId: string) {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: { workflow: { include: { steps: { orderBy: { order: 'asc' } } } } },
    })
    if (!request) throw AppError.notFound('Demande d\'approbation introuvable')
    return request
  }

  private _assertPending(request: { status: ApprovalRequestStatus }) {
    if (request.status !== 'pending') throw AppError.badRequest('Cette demande n\'est plus en attente')
  }

  private async _findCurrentStep(request: { workflowId: string; currentStep: number }) {
    const step = await this.prisma.approvalWorkflowStep.findFirst({
      where: { workflowId: request.workflowId, order: request.currentStep },
    })
    if (!step) throw AppError.notFound('Étape d\'approbation introuvable')
    return step
  }

  private async _assertIsApprover(step: { approverUserId: string | null; approverRole: string | null }, userId: string) {
    if (step.approverUserId && step.approverUserId !== userId) {
      throw AppError.forbidden('Vous n\'êtes pas l\'approbateur désigné pour cette étape')
    }
    if (step.approverRole && !step.approverUserId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { role: true } })
      if (user?.role?.name !== step.approverRole) {
        throw AppError.forbidden(`Cette étape requiert le rôle "${step.approverRole}"`)
      }
    }
  }

  private async _notifyApprovers(
    step: { approverUserId: string | null; approverRole: string | null },
    request: { id: string; documentType: string; documentId: string },
    type: string,
    title: string,
  ) {
    const link = this._docNotifData(request as { documentType: ApprovalDocumentType; documentId: string })
    if (step.approverUserId) {
      await this._notifyUser(step.approverUserId, type, title, title, request.id, link)
    } else if (step.approverRole) {
      const users = await this.prisma.user.findMany({
        where: {
          role: { name: step.approverRole },
          deletedAt: null,
          status: 'active',
        },
        select: { id: true },
      })
      for (const u of users) {
        await this._notifyUser(u.id, type, title, title, request.id, link)
      }
    }
  }

  private async _notifyUser(
    userId: string, type: string, title: string, message: string, requestId: string,
    extra?: Record<string, unknown>,
  ) {
    await this.notifQueue.add('notification', {
      userId, type, title, message,
      data: { requestId, ...extra },
    })
  }

  /** Lien profond vers le document concerné, pour rendre la notif cliquable. */
  private _documentLink(documentType: ApprovalDocumentType, documentId: string): string {
    const base: Record<ApprovalDocumentType, string> = {
      invoice:         'invoices',
      proforma:        'proformas',
      expense:         'expenses',
      purchase_order:  'purchase-orders',
      supplier_invoice:'supplier-invoices',
    }
    return `/${base[documentType] ?? 'dashboard'}/${documentId}`
  }

  /** Data jointe aux notifs d'approbation → le frontend peut router vers le doc. */
  private _docNotifData(request: { documentType: ApprovalDocumentType; documentId: string }) {
    return {
      documentType: request.documentType,
      documentId:   request.documentId,
      documentLink: this._documentLink(request.documentType, request.documentId),
    }
  }

  private async _onApprovalCompleted(request: ApprovalRequest) {
    // L'expense n'a pas d'« émission » : l'approbation EST son aboutissement.
    if (request.documentType === 'expense') {
      await this.prisma.expense.update({
        where: { id: request.documentId },
        data: { status: 'approved', approvedAt: new Date() },
      }).catch(() => { /* expense may not exist in mock/test */ })
      return
    }

    // Facture / BC / FF : on ré-exécute l'action initialement demandée AU NOM DU
    // DEMANDEUR (maker), via un événement → aucun couplage circulaire avec ces
    // modules. L'approbateur reste tracé séparément (decisions + audit log).
    const payload: ApprovalCompletedEvent = {
      documentType:   request.documentType,
      documentId:     request.documentId,
      requestedById:  request.requestedById,
      approverId:     request.resolvedById ?? null,
      documentNumber: request.documentNumber ?? null,
    }

    let results: unknown[] = []
    try {
      results = await this.emitter.emitAsync(APPROVAL_COMPLETED, payload)
    } catch (e) {
      results = [{ ok: false, message: e instanceof Error ? e.message : 'Erreur inconnue' }]
    }

    const outcome = results.find(
      (r): r is AutoExecResult => !!r && typeof r === 'object' && 'ok' in (r as object),
    )

    if (!outcome) {
      // Aucun listener n'a pris en charge ce documentType — cas non prévu ou
      // futur type non encore branché. On avertit le demandeur ET on log pour
      // que l'équipe détecte le manque de listener sans fouiller les crashs.
      console.warn(
        `[approvals] _onApprovalCompleted: aucun listener pour documentType="${request.documentType}" (requestId=${request.id}). Le document reste inchangé.`,
      )
      await this._notifyUser(
        request.requestedById,
        'system',
        'Approbation accordée — action manuelle requise',
        `« ${request.documentNumber ?? ''} » a été approuvée. Aucune action automatique n'est configurée pour ce type de document — veuillez le finaliser manuellement.`,
        request.id,
        this._docNotifData(request),
      )
      return
    }

    // Échec d'auto-exécution : on prévient le demandeur (le doc reste en brouillon,
    // l'approbation existe → il pourra relancer manuellement après correction).
    if (!outcome.ok) {
      await this._notifyUser(
        request.requestedById,
        'system',
        'Action automatique impossible',
        `« ${request.documentNumber ?? ''} » a été approuvée, mais son exécution automatique a échoué : ${outcome.message ?? 'erreur inconnue'}. Vous pouvez la relancer manuellement.`,
        request.id,
        this._docNotifData(request),
      )
    }
  }

  private async _onApprovalRejected(request: ApprovalRequest) {
    switch (request.documentType) {
      case 'invoice':
        await this.prisma.invoice.update({ where: { id: request.documentId }, data: { status: 'draft' } }).catch(() => {})
        break
      case 'proforma':
        await this.prisma.proforma.update({ where: { id: request.documentId }, data: { status: 'draft' } }).catch(() => {})
        break
      case 'expense':
        await this.prisma.expense.update({ where: { id: request.documentId }, data: { status: 'draft' } }).catch(() => {})
        break
      case 'purchase_order':
        await this.prisma.purchaseOrder.update({ where: { id: request.documentId }, data: { status: 'draft' } }).catch(() => {})
        break
      case 'supplier_invoice':
        await this.prisma.supplierInvoice.update({ where: { id: request.documentId }, data: { status: 'draft' } }).catch(() => {})
        break
    }
  }
}
