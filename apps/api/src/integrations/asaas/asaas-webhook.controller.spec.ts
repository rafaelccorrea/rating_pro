import { UnauthorizedException } from '@nestjs/common';
import type { AsaasConfigService } from './asaas-config.service';
import { AsaasWebhookController } from './asaas-webhook.controller';
import type { AsaasService } from './asaas.service';

function makeController(webhookToken: string) {
  const handleWebhookEvent = jest.fn().mockResolvedValue({ received: true });
  const controller = new AsaasWebhookController(
    { webhookToken } as unknown as AsaasConfigService,
    { handleWebhookEvent } as unknown as AsaasService,
  );

  return { controller, handleWebhookEvent };
}

describe('AsaasWebhookController', () => {
  const body = { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } };

  it('recusa sem token', () => {
    const { controller, handleWebhookEvent } = makeController('segredo');

    expect(() => controller.handle(undefined, body)).toThrow(UnauthorizedException);
    expect(handleWebhookEvent).not.toHaveBeenCalled();
  });

  it('recusa token errado', () => {
    const { controller } = makeController('segredo');

    expect(() => controller.handle('outra-coisa', body)).toThrow(UnauthorizedException);
  });

  it('recusa tudo quando o token não está configurado — sem se tornar aberto', () => {
    const { controller } = makeController('');

    expect(() => controller.handle('', body)).toThrow(UnauthorizedException);
    expect(() => controller.handle('qualquer', body)).toThrow(UnauthorizedException);
  });

  it('com o token certo, repassa o evento', async () => {
    const { controller, handleWebhookEvent } = makeController('segredo');

    await expect(controller.handle('segredo', body)).resolves.toEqual({ received: true });
    expect(handleWebhookEvent).toHaveBeenCalledWith(body);
  });
});
