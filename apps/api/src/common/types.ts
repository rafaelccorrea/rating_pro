import type { ProfileStatus, UserRole } from '@rating-pro/shared';

/** Usuario resolvido pelo JwtAuthGuard e injetado via `@CurrentUser()`. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: ProfileStatus;
  commissionRate: number;
}

export function isMaster(user: AuthenticatedUser): boolean {
  return user.role === 'master';
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
