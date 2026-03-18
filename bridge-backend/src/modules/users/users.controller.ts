import { Request, Response, NextFunction } from 'express';
import { usersService } from './users.service';
import {
  createUserSchema,
  updateUserSchema,
  updateMeSchema,
  changePasswordSchema,
  listUsersSchema,
} from './users.schema';

export class UsersController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = listUsersSchema.parse(req.query);
      const result = await usersService.list(query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await usersService.findById(req.user!.id);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await usersService.findById(req.params['id']!);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createUserSchema.parse(req.body);
      const user = await usersService.create(input, req.user!.id);
      res.status(201).json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateUserSchema.parse(req.body);
      const user = await usersService.update(req.params['id']!, input);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }

  async updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateMeSchema.parse(req.body);
      const user = await usersService.updateMe(req.user!.id, input);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = changePasswordSchema.parse(req.body);
      await usersService.changePassword(req.user!.id, input);
      res.json({ success: true, message: 'Mot de passe modifié avec succès' });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await usersService.softDelete(req.params['id']!);
      res.json({ success: true, message: 'Utilisateur archivé' });
    } catch (err) {
      next(err);
    }
  }
}

export const usersController = new UsersController();
