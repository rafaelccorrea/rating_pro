import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifra simetrica para credenciais de terceiros (hoje, a senha do Serasa).
 *
 * Nao e hash: o analista precisa do valor original para acessar o Serasa, entao
 * tem de ser reversivel. GCM e nao CBC porque autentica o texto cifrado — um
 * registro adulterado no banco falha ao decifrar em vez de devolver lixo.
 *
 * Formato: "iv.tag.ciphertext", tudo em base64url, para caber em uma coluna
 * text e ser reconhecivel em inspecao manual.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // recomendado para GCM

export function encryptSecret(plain: string, keyBase64: string): string {
  const key = readKey(keyBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(payload: string, keyBase64: string): string {
  const key = readKey(keyBase64);
  const parts = payload.split('.');

  if (parts.length !== 3) {
    throw new Error('Credencial cifrada em formato inesperado');
  }

  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64url')) as [
    Buffer,
    Buffer,
    Buffer,
  ];
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function readKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');

  if (key.length !== 32) {
    throw new Error('CREDENTIALS_KEY inválida: esperado 32 bytes em base64');
  }

  return key;
}
