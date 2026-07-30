import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PROFILE_STATUS_LABEL } from '@rating-pro/shared';
import { IS_PUBLIC_KEY } from '../common/decorators';
import type { AuthenticatedUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { ProfileCacheService } from './profile-cache.service';

/**
 * Valida o token emitido pela própria API e resolve o perfil de negócio.
 *
 * O perfil não sai do JWT: role e status precisam refletir uma suspensão sem
 * esperar o token expirar. Para não pagar uma ida ao banco em toda requisição,
 * passa por `ProfileCacheService` — que é invalidado explicitamente quando um
 * master altera o perfil, mantendo a suspensão imediata.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly profileCache: ProfileCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token de acesso ausente');
    }

    const payload = await this.auth.verifyToken(token);

    if (!payload) {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }

    const user = this.profileCache.get(payload.sub) ?? (await this.loadProfile(payload.sub));

    // Só entra no cache quem está ativo, então uma conta suspensa nunca fica
    // "grudada" como válida.
    if (user.status !== 'active') {
      throw new ForbiddenException(
        `Conta ${PROFILE_STATUS_LABEL[user.status].toLowerCase()}. Fale com o suporte.`,
      );
    }

    request.user = user;
    return true;
  }

  private async loadProfile(userId: string): Promise<AuthenticatedUser> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        commissionRate: true,
      },
    });

    if (!profile) {
      throw new UnauthorizedException('Perfil não encontrado para este usuário');
    }

    const user: AuthenticatedUser = {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      role: profile.role,
      status: profile.status,
      commissionRate: profile.commissionRate.toNumber(),
    };

    if (user.status === 'active') {
      this.profileCache.set(user);
    }

    return user;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;

    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) return null;

    return value.trim() || null;
  }
}
