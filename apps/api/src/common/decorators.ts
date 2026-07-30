import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '@rating-pro/shared';
import type { AuthenticatedUser } from './types';

export const IS_PUBLIC_KEY = 'rating-pro:isPublic';
export const ROLES_KEY = 'rating-pro:roles';

/** Libera a rota do JwtAuthGuard (landing, health, signup). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();

    if (!request.user) {
      // Sinaliza rota autenticada sem guard aplicado — erro de configuracao.
      throw new UnauthorizedException('Requisição sem usuário autenticado');
    }

    return request.user;
  },
);
