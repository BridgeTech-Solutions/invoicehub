import { Request, Response, NextFunction } from 'express'
import { approvalsService } from './approvals.service'
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  listWorkflowsSchema,
  listRequestsSchema,
  approveSchema,
  rejectSchema,
  delegateSchema,
} from './approvals.schema'

class ApprovalsController {

  // ── Workflows ─────────────────────────────────────────────────

  async listWorkflows(req: Request, res: Response, next: NextFunction) {
    try {
      const input = listWorkflowsSchema.parse(req.query)
      const result = await approvalsService.listWorkflows(input)
      res.json(result)
    } catch (e) { next(e) }
  }

  async createWorkflow(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createWorkflowSchema.parse(req.body)
      const wf = await approvalsService.createWorkflow(input, req.user!.id)
      res.status(201).json(wf)
    } catch (e) { next(e) }
  }

  async findWorkflow(req: Request, res: Response, next: NextFunction) {
    try {
      const wf = await approvalsService.findWorkflowById(String(req.params.id))
      res.json(wf)
    } catch (e) { next(e) }
  }

  async updateWorkflow(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateWorkflowSchema.parse(req.body)
      const wf = await approvalsService.updateWorkflow(String(req.params.id), input, req.user!.id)
      res.json(wf)
    } catch (e) { next(e) }
  }

  async deleteWorkflow(req: Request, res: Response, next: NextFunction) {
    try {
      await approvalsService.deleteWorkflow(String(req.params.id))
      res.status(204).end()
    } catch (e) { next(e) }
  }

  // ── Requests ──────────────────────────────────────────────────

  async listRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const input = listRequestsSchema.parse(req.query)
      const result = await approvalsService.listRequests(input, req.user!.id)
      res.json(result)
    } catch (e) { next(e) }
  }

  async findRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const request = await approvalsService.findRequestById(String(req.params.id))
      res.json(request)
    } catch (e) { next(e) }
  }

  async approve(req: Request, res: Response, next: NextFunction) {
    try {
      const input = approveSchema.parse(req.body)
      await approvalsService.approve(String(req.params.id), req.user!.id, input)
      res.json({ message: 'Approuvé' })
    } catch (e) { next(e) }
  }

  async reject(req: Request, res: Response, next: NextFunction) {
    try {
      const input = rejectSchema.parse(req.body)
      await approvalsService.reject(String(req.params.id), req.user!.id, input)
      res.json({ message: 'Rejeté' })
    } catch (e) { next(e) }
  }

  async delegate(req: Request, res: Response, next: NextFunction) {
    try {
      const input = delegateSchema.parse(req.body)
      await approvalsService.delegate(String(req.params.id), req.user!.id, input)
      res.json({ message: 'Délégué' })
    } catch (e) { next(e) }
  }

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      await approvalsService.cancel(String(req.params.id), req.user!.id)
      res.status(204).end()
    } catch (e) { next(e) }
  }

  async pendingCount(req: Request, res: Response, next: NextFunction) {
    try {
      const count = await approvalsService.pendingCount(req.user!.id)
      res.json({ count })
    } catch (e) { next(e) }
  }
}

export const approvalsController = new ApprovalsController()
