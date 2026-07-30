import type { ApiError } from '@rating-pro/shared';
import { env } from '@/config/env';
import { clearSession, readSession } from './session';

export class ApiRequestError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** Primeira mensagem de erro de um campo específico, se houver. */
  fieldError(field: string): string | undefined {
    return this.errors?.[field]?.[0];
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Rotas públicas (leads, signup, login) não devem exigir sessão. */
  auth?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${env.apiUrl}${path.startsWith('/') ? path : `/${path}`}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function authHeader(): Record<string, string> {
  const session = readSession();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}

async function request(path: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, query, auth = true } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  // FormData define o próprio Content-Type, com o boundary; defini-lo aqui
  // quebraria o parse do multipart no servidor.
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (auth) Object.assign(headers, authHeader());

  try {
    return await fetch(buildUrl(path, query), {
      method,
      headers,
      ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
    });
  } catch {
    // Falha de rede não tem statusCode; 0 sinaliza "não chegou no servidor".
    throw new ApiRequestError(0, 'Não foi possível falar com o servidor. Verifique sua conexão.');
  }
}

async function toError(response: Response): Promise<ApiRequestError> {
  const payload: unknown = await response.json().catch(() => null);
  const error = (payload ?? {}) as Partial<ApiError>;

  return new ApiRequestError(
    error.statusCode ?? response.status,
    error.message ?? 'Erro inesperado ao processar a requisição',
    error.errors,
  );
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await request(path, options);

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    // Token expirado ou revogado: derruba a sessão local para o app voltar ao login.
    if (response.status === 401 && options.auth !== false) {
      clearSession();
    }

    throw await toError(response);
  }

  return (await response.json()) as T;
}

/** Para respostas binárias, como o laudo em PDF. */
export async function apiFetchBlob(path: string): Promise<{ blob: Blob; fileName: string }> {
  const response = await request(path, {});

  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw await toError(response);
  }

  const disposition = response.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'laudo.pdf';

  return { blob: await response.blob(), fileName };
}

export const api = {
  get: <T>(path: string, query?: Query) => apiFetch<T>(path, { query }),
  /** Rota pública de leitura (acompanhamento): não anexa Authorization. */
  publicGet: <T>(path: string, query?: Query) => apiFetch<T>(path, { query, auth: false }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  /** Para rotas públicas: não anexa Authorization. */
  publicPost: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body, auth: false }),
  /** Upload multipart (anexos do pedido). */
  upload: <T>(path: string, form: FormData) => apiFetch<T>(path, { method: 'POST', body: form }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
