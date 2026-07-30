import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/types';

/**
 * Cache curto do perfil usado pelo JwtAuthGuard.
 *
 * Motivo: o guard recarrega o perfil em toda requisição para que uma suspensão
 * valha na hora. Com o banco a ~800 ms de ida e volta, isso cobrava uma volta
 * extra de TODA chamada — o endpoint mais simples pagava o dobro do necessário.
 *
 * O cache tem TTL curto E invalidação explícita: `ProfilesService` derruba a
 * entrada quando alguém muda papel, status ou dados do perfil. Ou seja, a
 * suspensão continua instantânea; o TTL é só a rede de segurança para mudanças
 * feitas fora da API (Studio, psql).
 *
 * Em memória de propósito: é um processo único. Com múltiplas instâncias, ou se
 * torna Redis, ou o TTL passa a ser o limite real de propagação.
 */
@Injectable()
export class ProfileCacheService {
  private static readonly TTL_MS = 15_000;

  private readonly entries = new Map<string, { user: AuthenticatedUser; expiresAt: number }>();

  get(userId: string): AuthenticatedUser | null {
    const entry = this.entries.get(userId);

    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(userId);
      return null;
    }

    return entry.user;
  }

  set(user: AuthenticatedUser): void {
    this.entries.set(user.id, {
      user,
      expiresAt: Date.now() + ProfileCacheService.TTL_MS,
    });
  }

  invalidate(userId: string): void {
    this.entries.delete(userId);
  }

  invalidateMany(userIds: readonly string[]): void {
    for (const id of userIds) this.entries.delete(id);
  }
}
