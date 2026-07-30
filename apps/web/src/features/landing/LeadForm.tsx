import { forwardRef, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { createLeadSchema } from '@rating-pro/shared';
import { Button, Card, Input, Textarea } from '@/components/ui';
import { api, ApiRequestError } from '@/lib/api';
import { maskPhone } from '@/lib/masks';

/**
 * `source` e `utm` não são campos do formulário — são acrescentados no envio.
 * Removê-los aqui faz o tipo de entrada e de saída do zod coincidirem, o que
 * evita atrito entre o resolver e o react-hook-form.
 */
const leadFormSchema = createLeadSchema.omit({ source: true, utm: true });
type LeadFormValues = z.infer<typeof leadFormSchema>;

/** Captura os parâmetros de campanha da URL uma única vez. */
function readUtm(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};

  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    const value = params.get(key);
    if (value) utm[key] = value.slice(0, 120);
  }

  const referrer = document.referrer;
  if (referrer && !referrer.includes(window.location.host)) {
    utm['referrer'] = referrer.slice(0, 200);
  }

  return utm;
}

interface LeadFormProps {
  source: string;
  prefilledMessage?: string;
}

export const LeadForm = forwardRef<HTMLDivElement, LeadFormProps>(function LeadForm(
  { source, prefilledMessage },
  ref,
) {
  const utm = useMemo(readUtm, []);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: { name: '', email: '', phone: '', company: '', message: '' },
  });

  // A calculadora empurra o resumo da simulação para cá.
  useEffect(() => {
    if (prefilledMessage) {
      setValue('message', prefilledMessage, { shouldValidate: false });
    }
  }, [prefilledMessage, setValue]);

  const mutation = useMutation({
    mutationFn: (values: LeadFormValues) =>
      api.publicPost<{ id: string; message: string }>('/leads', { ...values, source, utm }),
    onSuccess: (data) => {
      toast.success(data.message ?? 'Recebemos seu contato.');
      reset();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiRequestError) {
        // Devolve erros de campo do backend para o formulário.
        for (const [field, messages] of Object.entries(error.errors ?? {})) {
          if (field in ({ name: 1, email: 1, phone: 1, company: 1, message: 1 } as const)) {
            setError(field as keyof LeadFormValues, { message: messages[0] });
          }
        }

        toast.error(error.message);
        return;
      }

      toast.error('Não foi possível enviar. Tente novamente em instantes.');
    },
  });

  if (mutation.isSuccess) {
    return (
      <div ref={ref}>
        <Card className="shadow-soft text-center">
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="size-12 text-emerald-500" aria-hidden />
            <h3 className="text-xl font-bold text-ink-900 dark:text-ink-50">Contato recebido</h3>
            <p className="max-w-sm text-sm text-ink-600 dark:text-ink-300">
              Um consultor vai falar com você para liberar o acesso de revendedor e explicar a
              tabela de comissões.
            </p>
            <Button variant="outline" size="sm" onClick={() => mutation.reset()}>
              Enviar outro contato
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <Card className="shadow-soft" ref={ref}>
      <h3 className="text-xl font-bold text-ink-900 dark:text-ink-50">
        Fale com um consultor
      </h3>
      <p className="mt-1.5 text-sm text-ink-600 dark:text-ink-300">
        Sem mensalidade e sem taxa de adesão. Você recebe o acesso ao painel e a tabela de comissões.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        noValidate
      >
        <Input
          label="Nome completo"
          autoComplete="name"
          placeholder="Como podemos te chamar"
          error={errors.name?.message}
          {...register('name')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="E-mail"
            type="email"
            autoComplete="email"
            placeholder="voce@empresa.com.br"
            error={errors.email?.message}
            {...register('email')}
          />

          <Input
            label="WhatsApp"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="(11) 98765-4321"
            error={errors.phone?.message}
            {...register('phone', {
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                event.target.value = maskPhone(event.target.value);
              },
            })}
          />
        </div>

        <Input
          label="Empresa"
          hint="Opcional"
          autoComplete="organization"
          placeholder="Nome da sua empresa"
          error={errors.company?.message}
          {...register('company')}
        />

        <Textarea
          label="Mensagem"
          hint="Opcional"
          placeholder="Conte em que você atua e qual o seu volume hoje"
          error={errors.message?.message}
          {...register('message')}
        />

        <Button
          type="submit"
          variant="accent"
          size="lg"
          className="w-full"
          loading={mutation.isPending}
          icon={<Send className="size-4" aria-hidden />}
        >
          Quero ser revendedor
        </Button>

        <p className="text-center text-xs text-ink-500">
          Seus dados são usados apenas para este contato comercial.
        </p>
      </form>
    </Card>
  );
});
