import { BadRequestException } from '@nestjs/common';
import { createLeadSchema } from '@rating-pro/shared';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(createLeadSchema);

  it('devolve o valor já transformado pelo schema', () => {
    const result = pipe.transform({
      name: '  Maria Silva  ',
      email: 'MARIA@test.com',
      phone: '(11) 98765-4321',
    });

    expect(result.name).toBe('Maria Silva');
    // O schema tira a máscara do telefone.
    expect(result.phone).toBe('11987654321');
    expect(result.source).toBe('landing');
    expect(result.utm).toEqual({});
  });

  it('agrupa os erros por campo no formato ApiError', () => {
    let caught: BadRequestException | null = null;

    try {
      pipe.transform({ name: 'Jo', email: 'nao-e-email', phone: '123' });
    } catch (error) {
      caught = error as BadRequestException;
    }

    expect(caught).toBeInstanceOf(BadRequestException);

    const body = caught?.getResponse() as {
      statusCode: number;
      message: string;
      errors: Record<string, string[]>;
    };

    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('Dados inválidos');
    expect(Object.keys(body.errors).sort()).toEqual(['email', 'name', 'phone']);
    expect(body.errors.email?.[0]).toBe('E-mail inválido');
  });
});
