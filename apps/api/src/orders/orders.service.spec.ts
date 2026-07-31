import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OrderStatus } from '@rating-pro/shared';
import type { AuthenticatedUser } from '../common/types';
import type { AsaasService } from '../integrations/asaas/asaas.service';
import type { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';

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

function makeService(order: { resellerId: string; status: OrderStatus } | null) {
  const update = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'order-1',
      resellerId: order?.resellerId ?? 'reseller-1',
      internalNotes: 'anotação interna',
      ...data,
    }),
  );

  const prisma = {
    ratingOrder: {
      findUnique: jest.fn().mockResolvedValue(order ? { id: 'order-1', ...order } : null),
      update,
    },
  } as unknown as PrismaService;

  const cancelCharge = jest.fn().mockResolvedValue(undefined);
  const asaas = { tryCancelPendingCharge: cancelCharge } as unknown as AsaasService;

  return { service: new OrdersService(prisma, asaas), update, cancelCharge };
}

describe('OrdersService.changeStatus', () => {
  it('deixa o revendedor enviar o próprio rascunho', async () => {
    const { service, update } = makeService({ resellerId: 'reseller-1', status: 'draft' });

    await service.changeStatus(reseller, 'order-1', { status: 'submitted', reason: '', internalNotes: '' });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'submitted' }) }),
    );
  });

  it('recusa transição que a máquina de estados não permite', async () => {
    const { service } = makeService({ resellerId: 'reseller-1', status: 'draft' });

    await expect(
      service.changeStatus(reseller, 'order-1', { status: 'delivered', reason: '', internalNotes: '' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('impede o revendedor de assumir a análise', async () => {
    // submitted -> in_analysis é válido na máquina de estados, mas é passo da
    // operação; o revendedor não pode dispará-lo.
    const { service } = makeService({ resellerId: 'reseller-1', status: 'submitted' });

    await expect(
      service.changeStatus(reseller, 'order-1', { status: 'in_analysis', reason: '', internalNotes: '' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('impede o revendedor de aprovar o próprio pedido', async () => {
    const { service } = makeService({ resellerId: 'reseller-1', status: 'in_analysis' });

    await expect(
      service.changeStatus(reseller, 'order-1', { status: 'approved', reason: '', internalNotes: '' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('bloqueia o revendedor em pedido de outro', async () => {
    const { service } = makeService({ resellerId: 'reseller-2', status: 'draft' });

    await expect(
      service.changeStatus(reseller, 'order-1', { status: 'submitted', reason: '', internalNotes: '' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('marca o master como responsável ao colocar em análise', async () => {
    const { service, update } = makeService({ resellerId: 'reseller-1', status: 'submitted' });

    await service.changeStatus(master, 'order-1', { status: 'in_analysis', reason: '', internalNotes: '' });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'in_analysis', assignedTo: 'master-1' }),
      }),
    );
  });

  it('grava o motivo ao recusar', async () => {
    const { service, update } = makeService({ resellerId: 'reseller-1', status: 'in_analysis' });

    await service.changeStatus(master, 'order-1', {
      status: 'rejected',
      reason: 'Documentação insuficiente',
      internalNotes: '',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rejectionReason: 'Documentação insuficiente' }),
      }),
    );
  });

  it('404 quando o pedido não existe', async () => {
    const { service } = makeService(null);

    await expect(
      service.changeStatus(master, 'order-1', { status: 'submitted', reason: '', internalNotes: '' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('não devolve internalNotes para o revendedor', async () => {
    const { service } = makeService({ resellerId: 'reseller-1', status: 'draft' });

    const result = await service.changeStatus(reseller, 'order-1', {
      status: 'submitted',
      reason: '',
      internalNotes: '',
    });

    expect('internalNotes' in result).toBe(false);
  });

  it('devolve internalNotes para o master', async () => {
    const { service } = makeService({ resellerId: 'reseller-1', status: 'submitted' });

    const result = await service.changeStatus(master, 'order-1', {
      status: 'in_analysis',
      reason: '',
      internalNotes: '',
    });

    expect('internalNotes' in result).toBe(true);
  });

  it('cancela a cobrança no Asaas quando o pedido é cancelado', async () => {
    const { service, cancelCharge } = makeService({ resellerId: 'reseller-1', status: 'draft' });

    await service.changeStatus(reseller, 'order-1', {
      status: 'cancelled',
      reason: '',
      internalNotes: '',
    });

    expect(cancelCharge).toHaveBeenCalledWith('order-1');
  });

  it('não mexe na cobrança em transição que mantém o pedido vivo', async () => {
    const { service, cancelCharge } = makeService({ resellerId: 'reseller-1', status: 'draft' });

    await service.changeStatus(reseller, 'order-1', {
      status: 'submitted',
      reason: '',
      internalNotes: '',
    });

    expect(cancelCharge).not.toHaveBeenCalled();
  });
});

describe('OrdersService.update', () => {
  it('zera a comissão ao mudar o valor para o trigger recalcular', async () => {
    const { service, update } = makeService({ resellerId: 'reseller-1', status: 'draft' });

    await service.update(reseller, 'order-1', { saleAmount: 2000 });

    const call = update.mock.calls[0]?.[0] as { data: { commissionAmount: { toNumber(): number } } };
    expect(call.data.commissionAmount.toNumber()).toBe(0);
  });

  it('barra edição depois que o pedido saiu do rascunho', async () => {
    const { service } = makeService({ resellerId: 'reseller-1', status: 'in_analysis' });

    await expect(service.update(reseller, 'order-1', { saleAmount: 500 })).rejects.toThrow(
      BadRequestException,
    );
  });
});
