/**
 * Sessão guardada no localStorage. O token é um JWT emitido pela nossa API.
 *
 * localStorage (e não cookie httpOnly) porque a API é um serviço separado e o
 * front é uma SPA estática: o token vai no header Authorization, o que também
 * elimina CSRF. Em troca, um XSS conseguiria ler o token — daí a validade curta
 * (12h por padrão) e a ausência de refresh token.
 */

const STORAGE_KEY = 'rating-pro:session';

export interface StoredSession {
  token: string;
  /** ISO 8601. */
  expiresAt: string;
}

function isExpired(expiresAt: string): boolean {
  const at = new Date(expiresAt).getTime();
  // Sem data válida, trata como expirada.
  if (Number.isNaN(at)) return true;
  // Margem de 30s para não usar um token que expira no meio do voo.
  return at - 30_000 <= Date.now();
}

export function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredSession>;

    if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'string') {
      return null;
    }

    if (isExpired(parsed.expiresAt)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return { token: parsed.token, expiresAt: parsed.expiresAt };
  } catch {
    // JSON corrompido ou localStorage bloqueado.
    return null;
  }
}

export function writeSession(session: StoredSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Navegação privada pode bloquear: a sessão vale só para esta aba.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nada a fazer */
  }
}
