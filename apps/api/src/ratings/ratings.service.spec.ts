import { addMonths } from './ratings.service';

describe('addMonths (validade do laudo)', () => {
  it('soma meses no caso simples', () => {
    const result = addMonths(new Date('2026-07-29T00:00:00.000Z'), 12);
    expect(result.toISOString().slice(0, 10)).toBe('2027-07-29');
  });

  it('não escorrega para março quando o mês de destino é mais curto', () => {
    // 31/01 + 1 mês tem que virar 28/02, não 03/03.
    const result = addMonths(new Date('2026-01-31T00:00:00.000Z'), 1);
    expect(result.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('respeita ano bissexto', () => {
    const result = addMonths(new Date('2028-01-31T00:00:00.000Z'), 1);
    expect(result.toISOString().slice(0, 10)).toBe('2028-02-29');
  });

  it('atravessa a virada do ano', () => {
    const result = addMonths(new Date('2026-11-15T00:00:00.000Z'), 6);
    expect(result.toISOString().slice(0, 10)).toBe('2027-05-15');
  });

  it('não altera a data original', () => {
    const original = new Date('2026-07-29T00:00:00.000Z');
    addMonths(original, 24);
    expect(original.toISOString().slice(0, 10)).toBe('2026-07-29');
  });
});
