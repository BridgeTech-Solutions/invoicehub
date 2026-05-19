import { SetMetadata } from '@nestjs/common';
export const PERMISSIONS_KEY = 'permissions_multi';
export const Permissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);
