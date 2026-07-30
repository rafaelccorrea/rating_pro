import { z } from 'zod';
import { LEAD_STATUSES } from '@rating-pro/shared';

export const listLeadsQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
