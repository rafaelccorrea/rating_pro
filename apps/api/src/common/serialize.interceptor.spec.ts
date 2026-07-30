import { Prisma } from '@prisma/client';
import { normalizeForJson } from './serialize.interceptor';

describe('normalizeForJson', () => {
  it('converte Decimal do Prisma em number', () => {
    const result = normalizeForJson({ saleAmount: new Prisma.Decimal('1234.56') });
    expect(result).toEqual({ saleAmount: 1234.56 });
  });

  it('converte BigInt em string para não estourar o JSON.stringify', () => {
    const result = normalizeForJson({ sizeBytes: 9007199254740993n });
    expect(result).toEqual({ sizeBytes: '9007199254740993' });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('converte Date em ISO', () => {
    const result = normalizeForJson({ createdAt: new Date('2026-07-29T12:00:00.000Z') });
    expect(result).toEqual({ createdAt: '2026-07-29T12:00:00.000Z' });
  });

  it('percorre arrays e objetos aninhados', () => {
    const result = normalizeForJson({
      items: [{ amount: new Prisma.Decimal('10.5'), tags: ['a'] }],
      nested: { deep: { value: new Prisma.Decimal('0.25') } },
    });

    expect(result).toEqual({
      items: [{ amount: 10.5, tags: ['a'] }],
      nested: { deep: { value: 0.25 } },
    });
  });

  it('preserva null e undefined', () => {
    expect(normalizeForJson({ a: null, b: undefined })).toEqual({ a: null, b: undefined });
  });
});
