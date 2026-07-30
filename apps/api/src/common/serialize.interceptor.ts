import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

/**
 * Tipos do Prisma que não sobrevivem ao `JSON.stringify`:
 *   - `Decimal` viraria `{ s, e, d }`
 *   - `BigInt` lança TypeError
 * Convertemos para `number` e `string` respectivamente, batendo com os tipos
 * declarados em `@rating-pro/shared`.
 */
function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'bigint') return value.toString();

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) return value.map(normalize);

  if (typeof value === 'object') {
    // Decimal do Prisma (decimal.js) — identificado pelo par de métodos.
    const candidate = value as { toNumber?: unknown; toFixed?: unknown };
    if (typeof candidate.toNumber === 'function' && typeof candidate.toFixed === 'function') {
      return (candidate.toNumber as () => number)();
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) {
      // Buffer, Stream e afins passam intactos.
      return value;
    }

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = normalize(item);
    }
    return out;
  }

  return value;
}

@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(normalize));
  }
}

export { normalize as normalizeForJson };
