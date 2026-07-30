/**
 * Ponto unico de leitura das variaveis de ambiente.
 *
 * Nao ha credencial de Supabase aqui: a autenticacao e feita pela nossa API
 * (ver apps/api/src/auth), entao o frontend so precisa saber onde ela esta.
 * Tudo tem default para a landing renderizar mesmo sem `.env` configurado.
 */

function readEnv(value: string | undefined, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : fallback;
}

const defaultApiUrl = import.meta.env.PROD
  ? 'https://mistyrose-lion-706980.hostingersite.com/api'
  : 'http://localhost:3333/api';

export const env = {
  apiUrl: readEnv(import.meta.env.VITE_API_URL, defaultApiUrl).replace(/\/+$/, ''),
  brandName: readEnv(import.meta.env.VITE_BRAND_NAME, 'Rating Pro'),
  brandShort: readEnv(import.meta.env.VITE_BRAND_SHORT, 'RatingPro'),
  whatsappNumber: readEnv(import.meta.env.VITE_WHATSAPP_NUMBER, ''),
  contactEmail: readEnv(import.meta.env.VITE_CONTACT_EMAIL, ''),
} as const;

/** Link do WhatsApp com mensagem pre-preenchida; null quando o numero nao existe. */
export function whatsappLink(message: string): string | null {
  if (!env.whatsappNumber) return null;
  return `https://wa.me/${env.whatsappNumber}?text=${encodeURIComponent(message)}`;
}
