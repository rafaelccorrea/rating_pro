import { ForbiddenException } from '@nestjs/common';
import { assertMaster, assertOwnership, scopeByOrderOwner, scopeByReseller } from './scope';
import type { AuthenticatedUser } from './types';

const master: AuthenticatedUser = {
  id: 'master-1',
  email: 'master@test',
  fullName: 'Master',
  role: 'master',
  status: 'active',
  commissionRate: 0,
};

const reseller: AuthenticatedUser = {
  id: 'reseller-1',
  email: 'rev@test',
  fullName: 'Revendedor',
  role: 'reseller',
  status: 'active',
  commissionRate: 0.3,
};

describe('escopo por revendedor', () => {
  // O Prisma ignora RLS, então um escopo vazio para revendedor vazaria a base
  // inteira. Estes testes travam exatamente esse cenário.
  it('não filtra nada para master', () => {
    expect(scopeByReseller(master)).toEqual({});
    expect(scopeByOrderOwner(master)).toEqual({});
  });

  it('filtra pelo próprio id para revendedor', () => {
    expect(scopeByReseller(reseller)).toEqual({ resellerId: 'reseller-1' });
    expect(scopeByOrderOwner(reseller)).toEqual({ order: { resellerId: 'reseller-1' } });
  });

  it('nunca devolve escopo vazio para revendedor', () => {
    expect(Object.keys(scopeByReseller(reseller))).toHaveLength(1);
    expect(Object.keys(scopeByOrderOwner(reseller))).toHaveLength(1);
  });
});

describe('assertOwnership', () => {
  it('deixa o revendedor acessar o que é dele', () => {
    expect(() => assertOwnership(reseller, 'reseller-1')).not.toThrow();
  });

  it('bloqueia o revendedor em recurso de outro', () => {
    expect(() => assertOwnership(reseller, 'reseller-2')).toThrow(ForbiddenException);
  });

  it('deixa o master acessar qualquer recurso', () => {
    expect(() => assertOwnership(master, 'reseller-2')).not.toThrow();
  });
});

describe('assertMaster', () => {
  it('passa para master', () => {
    expect(() => assertMaster(master)).not.toThrow();
  });

  it('bloqueia revendedor', () => {
    expect(() => assertMaster(reseller)).toThrow(ForbiddenException);
  });
});
