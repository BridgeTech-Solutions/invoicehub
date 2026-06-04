import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  Controller, Get, Post, Put, Delete, Param, Body,
  Query, UploadedFile, UseInterceptors, HttpCode,
  BadRequestException, OnModuleInit,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { assertFileMime } from '../../lib/file-magic';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import {
  createUserSchema,
  updateUserSchema,
  updateMeSchema,
  changePasswordSchema,
  listUsersSchema,
  adminResetPasswordSchema,
} from './users.schema';
import type {
  CreateUserInput,
  UpdateUserInput,
  UpdateMeInput,
  ChangePasswordInput,
  ListUsersInput,
  AdminResetPasswordInput,
} from './users.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

const AVATAR_DIR = path.resolve(process.cwd(), 'uploads', 'avatars');

@ApiTags('Utilisateurs')
@ApiBearerAuth()
@Controller('users')
export class UsersController implements OnModuleInit {
  constructor(private readonly svc: UsersService) {}

  onModuleInit() {
    if (!fs.existsSync(AVATAR_DIR)) {
      fs.mkdirSync(AVATAR_DIR, { recursive: true });
    }
  }

  // ── Profil personnel (/me) ────────────────────────────────────────────────

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.svc.findById(user.sub);
  }

  @Put('me')
  updateMe(
    @Body(new ZodValidationPipe(updateMeSchema)) body: UpdateMeInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.updateMe(user.sub, body);
  }

  @Put('me/password')
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.svc.changePassword(user.sub, body);
    return { success: true, message: 'Mot de passe modifié avec succès' };
  }

  @Put('me/avatar')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
      filename:    (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)
        ? cb(null, true)
        : cb(new Error('Format non accepté. Utilisez PNG, JPEG ou WebP.') as any, false);
    },
  }))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('Aucun fichier reçu');
    try {
      assertFileMime(file.path, ['image/png', 'image/jpeg', 'image/webp']);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
    await this.svc.uploadAvatar(user.sub, file.path);
    return { success: true };
  }

  @Delete('me/avatar')
  async deleteAvatar(@CurrentUser() user: JwtPayload) {
    await this.svc.deleteAvatar(user.sub);
    return { success: true, message: 'Avatar supprimé' };
  }

  // ── Administration utilisateurs ───────────────────────────────────────────

  @Get()
  @Permission('users:manage')
  @SkipResponseWrapper()
  async list(@Query(new ZodValidationPipe(listUsersSchema)) query: ListUsersInput) {
    const result = await this.svc.list(query);
    return { success: true, ...result };
  }

  @Post()
  @Permission('users:manage')
  @Audit('user', 'CREATE')
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.create(body, user.sub);
  }

  @Get(':id')
  @Permission('users:manage')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Put(':id')
  @Permission('users:manage')
  @Audit('user', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @Permission('users:manage')
  @Audit('user', 'SOFT_DELETE')
  async remove(@Param('id') id: string) {
    await this.svc.softDelete(id);
    return { success: true, message: 'Utilisateur archivé' };
  }

  @Post(':id/reactivate')
  @Permission('users:manage')
  @Audit('user', 'STATUS_CHANGE')
  async reactivate(@Param('id') id: string) {
    await this.svc.reactivate(id);
    return { success: true, message: 'Utilisateur réactivé' };
  }

  @Post(':id/resend-invitation')
  @Permission('users:manage')
  @Audit('user', 'UPDATE')
  async resendInvitation(@Param('id') id: string) {
    await this.svc.resendInvitation(id);
    return { success: true, message: 'Email d\'invitation renvoyé avec succès' };
  }

  @Post(':id/reset-password')
  @Permission('users:manage')
  @Audit('user', 'PASSWORD_RESET')
  async resetPassword(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminResetPasswordSchema)) body: AdminResetPasswordInput,
  ) {
    await this.svc.resetPassword(id, body.newPassword);
    return { success: true, message: "Mot de passe réinitialisé — l'utilisateur devra le changer à sa prochaine connexion" };
  }

  @Get(':id/activity')
  @Permission('users:manage')
  getActivity(@Param('id') id: string) {
    return this.svc.getActivity(id);
  }
}
