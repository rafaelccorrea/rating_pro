import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Valida o payload com um schema zod de `@rating-pro/shared` — o mesmo que o
 * formulario do React usa — e devolve o valor já transformado (documentos sem
 * máscara, defaults aplicados).
 */
@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodSchema<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);

    if (result.success) {
      return result.data;
    }

    const errors: Record<string, string[]> = {};

    for (const issue of result.error.issues) {
      const field = issue.path.join('.') || '_root';
      (errors[field] ??= []).push(issue.message);
    }

    throw new BadRequestException({
      statusCode: 400,
      message: 'Dados inválidos',
      errors,
    });
  }
}

/** Açúcar para não repetir `new ZodValidationPipe(schema)` nos controllers. */
export const zodPipe = <T>(schema: ZodSchema<T>) => new ZodValidationPipe(schema);
