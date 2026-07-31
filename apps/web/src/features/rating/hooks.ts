import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  DocumentSlot,
  PaymentMethod,
  PaymentStatus,
  RatingRequestInput,
} from '@rating-pro/shared';
import { api } from '@/lib/api';
import { queryKeys } from '@/features/panel/hooks';

export interface PaymentView {
  id: string;
  orderId: string;
  method: PaymentMethod;
  methodLabel: string;
  status: PaymentStatus;
  amount: number;
  reference: string | null;
  paidAt: string | null;
  createdAt: string;
  instructions: {
    type: string;
    /** Chave PIX estática do fluxo manual; nula quando a cobrança é do Asaas. */
    pixKey: string | null;
    /** Fatura hospedada no Asaas (QR do PIX, boleto e cartão numa página só). */
    invoiceUrl: string | null;
    /** PIX copia e cola devolvido pelo Asaas. */
    pixPayload: string | null;
    bankSlipUrl: string | null;
    /** yyyy-mm-dd */
    dueDate: string | null;
  };
}

interface CreateResponse {
  orderId: string;
  code: string;
  checklist: DocumentSlot[];
  payment: PaymentView;
}

interface SubmitResponse {
  order: { id: string; code: string; status: string; trackingToken: string };
  payment: PaymentView | null;
}

export interface ContractResult {
  orderId: string;
  code: string;
  payment: PaymentView | null;
}

/**
 * Fecha a contratação inteira: cria o pedido, sobe os anexos e envia para
 * análise.
 *
 * A ordem importa. O pedido nasce só no fim, quando a pessoa confirma o
 * pagamento — antes disso não existe rascunho no banco para virar lixo se ela
 * desistir na etapa 3. Em compensação, os arquivos ficam em memória até aqui.
 *
 * Se um upload falhar no meio, o pedido continua como rascunho com o que já
 * subiu: `orderId` volta no erro para a tela oferecer retomar em vez de
 * recomeçar.
 */
export function useContractRating() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const mutation = useMutation<
    ContractResult,
    Error,
    { input: RatingRequestInput; files: Record<string, File | undefined> }
  >({
    mutationFn: async ({ input, files }) => {
      const created = await api.post<CreateResponse>('/rating-requests', input);

      const entries = Object.entries(files).filter(
        (entry): entry is [string, File] => entry[1] instanceof File,
      );

      setProgress({ done: 0, total: entries.length });

      // Sequencial de propósito: são arquivos grandes e o servidor guarda cada
      // um em memória enquanto grava. Em paralelo, um pedido com 9 anexos de
      // 15 MB viraria 135 MB de pico.
      let done = 0;
      for (const [slot, file] of entries) {
        const form = new FormData();
        form.append('slot', slot);
        form.append('file', file);

        await api.upload(`/rating-requests/${created.orderId}/documents`, form);
        done += 1;
        setProgress({ done, total: entries.length });
      }

      const submitted = await api.post<SubmitResponse>(
        `/rating-requests/${created.orderId}/submit`,
      );

      await queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });

      return {
        orderId: created.orderId,
        code: submitted.order.code,
        payment: submitted.payment ?? created.payment,
      };
    },
    onSettled: () => setProgress(null),
  });

  return { ...mutation, progress };
}
