import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from './types';
import { isMaster } from './types';

/**
 * O Prisma conecta como `postgres`, que tem BYPASSRLS — as policies do banco
 * NAO filtram nada nas queries da API. Este modulo e a unica linha de defesa
 * contra um revendedor ler a carteira de outro, entao todo service que consulta
 * dados de revendedor DEVE compor o `where` a partir daqui, e nunca montar o
 * filtro de dono na mao.
 */

/** Filtro para tabelas que tem `resellerId` direto (clients, rating_orders). */
export function scopeByReseller(user: AuthenticatedUser): { resellerId?: string } {
  return isMaster(user) ? {} : { resellerId: user.id };
}

/** Filtro para tabelas que chegam ao dono por `order` (ratings, documents, events). */
export function scopeByOrderOwner(user: AuthenticatedUser): {
  order?: { resellerId: string };
} {
  return isMaster(user) ? {} : { order: { resellerId: user.id } };
}

/**
 * Confere se o recurso carregado pertence ao usuario. Use como rede de
 * seguranca depois de um `findUnique` — que, por definicao, ignora o escopo.
 */
export function assertOwnership(user: AuthenticatedUser, resellerId: string): void {
  if (!isMaster(user) && resellerId !== user.id) {
    throw new ForbiddenException('Este recurso pertence a outro revendedor');
  }
}

export function assertMaster(user: AuthenticatedUser): void {
  if (!isMaster(user)) {
    throw new ForbiddenException('Ação disponível apenas para usuários master');
  }
}
