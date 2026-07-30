import { z } from 'zod';
import { PROFILE_STATUSES, USER_ROLES } from '@rating-pro/shared';

/**
 * Filtros da listagem administrativa de perfis. Fica local porque só o painel
 * master consome — não é contrato compartilhado com o formulário do frontend.
 */
export const listProfilesQuerySchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(PROFILE_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListProfilesQuery = z.infer<typeof listProfilesQuerySchema>;
