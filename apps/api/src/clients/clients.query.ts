import { z } from 'zod';

export const listClientsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
