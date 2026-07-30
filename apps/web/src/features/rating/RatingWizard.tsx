import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Barcode,
  Check,
  CheckCircle2,
  CreditCard,
  FileText,
  QrCode,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ACCEPTED_DOCUMENT_MIME,
  documentSlots,
  EDUCATION_LABEL,
  EDUCATION_LEVELS,
  formatBRL,
  isValidCNPJ,
  isValidCPF,
  MARITAL_STATUS_LABEL,
  MARITAL_STATUSES,
  MAX_DOCUMENT_BYTES,
  PAYMENT_METHODS,
  ratingRequestSchema,
  type DocumentSlot,
  type PaymentMethod,
  type PersonType,
} from '@rating-pro/shared';
import { Button, ButtonLink, Card, Input, Select } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { maskDate, maskDocument, maskPhone } from '@/lib/masks';
import { useContractRating, type PaymentView } from './hooks';
import { FIELD_ALIAS, FIELD_STEP, stepLabels } from './steps';

/**
 * Contratação de rating em quatro etapas: cadastro, perfil, documentos e
 * pagamento.
 *
 * É um wizard, e não um formulário único, porque a etapa 3 depende de arquivos
 * que a pessoa quase sempre precisa buscar com o contador — quebrar em etapas
 * mantém o que já foi preenchido na tela enquanto isso.
 *
 * A validação por etapa aqui é só para dar resposta imediata; a fonte da
 * verdade é o `ratingRequestSchema`, o mesmo que a API roda na borda. Antes de
 * enviar, o formulário inteiro passa por ele, e o que ele reclamar volta para a
 * etapa de origem (ver `FIELD_STEP`).
 */

type Values = Record<string, string>;
type Errors = Record<string, string>;
type Files = Record<string, File | undefined>;

const PAYMENT_UI: Record<PaymentMethod, { label: string; hint: string; icon: typeof QrCode }> = {
  pix: { label: 'PIX', hint: 'Aprovação na hora', icon: QrCode },
  card: { label: 'Cartão de crédito', hint: 'Em até 12x', icon: CreditCard },
  boleto: { label: 'Boleto', hint: 'Compensa em até 3 dias úteis', icon: Barcode },
};

// ------------------------------------------------------------------- stepper

function Stepper({ labels, current }: { labels: readonly string[]; current: number }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
      {labels.map((label, index) => {
        const done = index < current;
        const active = index === current;

        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors',
                done && 'bg-brand-600 text-white',
                active && 'bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
                !done && !active && 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400',
              )}
              aria-hidden
            >
              {done ? <Check className="size-4" /> : index + 1}
            </span>

            <span
              className={cn(
                'text-sm',
                active ? 'font-semibold text-ink-900 dark:text-ink-100' : 'text-ink-500',
              )}
              aria-current={active ? 'step' : undefined}
            >
              {label}
            </span>

            {index < labels.length - 1 && (
              <span className="hidden h-px w-6 bg-ink-200 sm:block dark:bg-ink-800" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// -------------------------------------------------------------------- upload

function DocumentRow({
  slot,
  file,
  error,
  onPick,
  onClear,
}: {
  slot: DocumentSlot;
  file: File | undefined;
  error?: string;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors',
        error
          ? 'border-red-300 dark:border-red-900'
          : file
            ? 'border-brand-300 bg-brand-50/40 dark:border-brand-800 dark:bg-brand-950/20'
            : 'border-ink-200 dark:border-ink-800',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileText
            className={cn('size-4 shrink-0', file ? 'text-brand-600' : 'text-ink-400')}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-800 dark:text-ink-100">
              {slot.label}
              {slot.required && (
                <span className="ml-2 rounded-full bg-accent-300/35 px-2 py-0.5 text-[11px] font-semibold text-accent-600 dark:bg-accent-500/15 dark:text-accent-300">
                  Obrigatório
                </span>
              )}
            </p>
            <p className="truncate text-xs text-ink-500">
              {file ? file.name : (slot.hint ?? 'PDF, JPG ou PNG até 15 MB')}
            </p>
          </div>
        </div>

        {file ? (
          <Button variant="ghost" size="sm" onClick={onClear} icon={<X className="size-4" />}>
            Remover
          </Button>
        ) : (
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-ink-300 px-3 text-sm font-medium text-ink-800 transition-colors hover:border-brand-400 hover:text-brand-700 dark:border-ink-700 dark:text-ink-100 dark:hover:border-brand-400 dark:hover:text-brand-300">
            <Upload className="size-4" aria-hidden />
            Enviar
            <input
              type="file"
              className="sr-only"
              accept={ACCEPTED_DOCUMENT_MIME.join(',')}
              onChange={(event) => {
                const picked = event.target.files?.[0];
                if (picked) onPick(picked);
                // Zera para permitir reescolher o mesmo arquivo depois de remover.
                event.target.value = '';
              }}
            />
          </label>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// --------------------------------------------------------------- confirmação

function SuccessCard({
  code,
  orderId,
  payment,
}: {
  code: string;
  orderId: string;
  payment: PaymentView | null;
}) {
  const pixKey = payment?.instructions.pixKey;

  return (
    <Card>
      <div className="flex items-start gap-3">
        <CheckCircle2 className="size-6 shrink-0 text-risk-minimo" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink-950 dark:text-white">
            Pedido {code} enviado para análise
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Os documentos foram recebidos. Você acompanha o andamento pelo painel.
          </p>
        </div>
      </div>

      {payment && (
        <div className="mt-5 rounded-xl bg-ink-50 p-3.5 text-sm dark:bg-ink-950/50">
          <div className="flex justify-between gap-4">
            <span className="text-ink-500">Cobrança</span>
            <span className="font-medium text-ink-900 dark:text-ink-100">
              {payment.methodLabel} — {formatBRL(payment.amount)}
            </span>
          </div>

          {pixKey && (
            <p className="mt-2 text-xs text-ink-600 dark:text-ink-300">
              Chave PIX para pagamento: <span className="font-mono">{pixKey}</span>. A análise
              começa assim que o pagamento for confirmado.
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <ButtonLink to={`/painel/pedidos/${orderId}`}>Ver o pedido</ButtonLink>
      </div>
    </Card>
  );
}

// -------------------------------------------------------------------- wizard

export function RatingWizard({ personType }: { personType: PersonType }) {
  const navigate = useNavigate();
  const isPJ = personType === 'pj';
  const labels = stepLabels(personType);
  const documents = useMemo(() => documentSlots(personType), [personType]);

  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({});
  const [files, setFiles] = useState<Files>({});
  const [errors, setErrors] = useState<Errors>({});
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [done, setDone] = useState<{ code: string; orderId: string; payment: PaymentView | null }>();

  const contract = useContractRating();

  const set = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: '' } : current));
  };

  const field = (key: string, label: string) => ({
    label,
    value: values[key] ?? '',
    error: errors[key],
    onChange: (event: { target: { value: string } }) => set(key, event.target.value),
  });

  /** Monta o payload no formato que a API espera. */
  const toPayload = () => ({
    personType,
    name: values.legalName ?? '',
    document: values.document ?? '',
    birthDate: values.birthDate ?? '',
    email: values.email ?? '',
    phone: values.phone ?? '',
    applicant: {
      maritalStatus: values.maritalStatus ?? '',
      education: values.education ?? '',
      occupation: values.occupation ?? '',
      serasaPassword: values.serasaPassword ?? '',
    },
    paymentMethod: method,
  });

  /** Valida só a etapa visível: erro de documento não trava a etapa 1. */
  const validateStep = (index: number): Errors => {
    const found: Errors = {};
    const required = (key: string, message: string) => {
      if (!values[key]?.trim()) found[key] = message;
    };

    if (index === 0) {
      required('legalName', isPJ ? 'Informe a razão social' : 'Informe o nome completo');
      required('document', isPJ ? 'Informe o CNPJ' : 'Informe o CPF');

      const valid = isPJ ? isValidCNPJ : isValidCPF;
      if (values.document && !valid(values.document)) {
        found.document = isPJ ? 'CNPJ inválido' : 'CPF inválido';
      }

      required('birthDate', 'Informe a data');
      required('email', 'Informe o email');
      if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) {
        found.email = 'Email inválido';
      }

      required('phone', 'Informe o WhatsApp');
      if (values.phone && values.phone.replace(/\D/g, '').length < 10) {
        found.phone = 'WhatsApp incompleto';
      }
    }

    if (index === 1) {
      required('maritalStatus', 'Selecione o estado civil');
      required('education', 'Selecione a escolaridade');
      required('occupation', 'Informe a profissão');
      required('serasaPassword', 'Informe a senha Serasa');
    }

    if (index === 2) {
      for (const slot of documents) {
        if (slot.required && !files[slot.key]) found[slot.key] = 'Documento obrigatório';
      }
    }

    if (index === 3 && !method) {
      found.method = 'Escolha a forma de pagamento';
    }

    return found;
  };

  /** Erros do zod/API voltam por caminho; leva cada um para a etapa de origem. */
  const applyRemoteErrors = (byField: Record<string, string[]>) => {
    const mapped: Errors = {};
    let earliest = labels.length - 1;

    for (const [path, messages] of Object.entries(byField)) {
      const key = FIELD_ALIAS[path] ?? path;
      mapped[key] = messages[0] ?? 'Valor inválido';
      earliest = Math.min(earliest, FIELD_STEP[path] ?? labels.length - 1);
    }

    setErrors(mapped);
    setStep(earliest);
  };

  const finish = () => {
    const local = validateStep(3);
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    // Última barreira antes da rede: o mesmo schema da API, com as mensagens
    // caindo no campo certo em vez de virar um toast genérico.
    const parsed = ratingRequestSchema.safeParse(toPayload());

    if (!parsed.success) {
      const byField: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        (byField[path] ??= []).push(issue.message);
      }
      applyRemoteErrors(byField);
      toast.error('Revise os campos destacados.');
      return;
    }

    contract.mutate(
      { input: parsed.data, files },
      {
        onSuccess: (result) => {
          setDone({ code: result.code, orderId: result.orderId, payment: result.payment });
          toast.success(`Pedido ${result.code} enviado para análise.`);
        },
        onError: (error) => {
          if (error instanceof ApiRequestError && error.errors) {
            applyRemoteErrors(error.errors);
          }
          toast.error(error.message);
        },
      },
    );
  };

  const goNext = () => {
    const found = validateStep(step);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    if (step < labels.length - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goBack = () => {
    setErrors({});
    setStep(Math.max(0, step - 1));
  };

  const pickFile = (key: string, file: File) => {
    if (file.size > MAX_DOCUMENT_BYTES) {
      setErrors((current) => ({ ...current, [key]: 'Arquivo acima de 15 MB' }));
      return;
    }

    if (!(ACCEPTED_DOCUMENT_MIME as readonly string[]).includes(file.type)) {
      setErrors((current) => ({ ...current, [key]: 'Envie PDF, JPG, PNG ou WEBP' }));
      return;
    }

    setFiles((current) => ({ ...current, [key]: file }));
    setErrors((current) => (current[key] ? { ...current, [key]: '' } : current));
  };

  const header = (
    <>
      <Link
        to="/painel"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-700 dark:hover:text-brand-300"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar à visão geral
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950 dark:text-white">
          Rating de Crédito — {isPJ ? 'Pessoa Jurídica' : 'Pessoa Física'}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {isPJ ? 'Preencha os dados da empresa para análise' : 'Preencha os dados para análise'}
        </p>
      </div>
    </>
  );

  if (done) {
    return (
      <>
        {header}
        <SuccessCard code={done.code} orderId={done.orderId} payment={done.payment} />
      </>
    );
  }

  const uploading = contract.progress;

  return (
    <>
      {header}

      <Stepper labels={labels} current={step} />

      <Card>
        <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-100">{labels[step]}</h2>

        {/* ------------------------------------------------ 1. cadastro */}
        {step === 0 && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input {...field('legalName', isPJ ? 'Razão Social *' : 'Nome completo *')} />
            </div>

            <Input
              {...field('document', isPJ ? 'CNPJ *' : 'CPF *')}
              inputMode="numeric"
              onChange={(event) => set('document', maskDocument(event.target.value))}
            />

            <Input
              {...field('birthDate', 'Data de Nascimento *')}
              inputMode="numeric"
              placeholder="dd/mm/aaaa"
              hint={errors.birthDate ? undefined : isPJ ? 'Data de abertura da empresa' : undefined}
              onChange={(event) => set('birthDate', maskDate(event.target.value))}
            />

            <Input {...field('email', 'Email *')} type="email" autoComplete="email" />

            <Input
              {...field('phone', 'WhatsApp *')}
              inputMode="tel"
              placeholder="(11) 90000-0000"
              onChange={(event) => set('phone', maskPhone(event.target.value))}
            />
          </div>
        )}

        {/* ------------------------------------------- 2. dados pessoais */}
        {step === 1 && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Select {...field('maritalStatus', 'Estado Civil *')}>
              <option value="">Selecione</option>
              {MARITAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {MARITAL_STATUS_LABEL[status]}
                </option>
              ))}
            </Select>

            <Select {...field('education', 'Escolaridade *')}>
              <option value="">Selecione</option>
              {EDUCATION_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {EDUCATION_LABEL[level]}
                </option>
              ))}
            </Select>

            <Input {...field('occupation', 'Profissão *')} placeholder="Sua profissão" />

            <Input
              {...field('serasaPassword', 'Senha Serasa *')}
              type="password"
              placeholder="Senha de acesso ao Serasa"
              hint={
                errors.serasaPassword
                  ? undefined
                  : 'Guardada cifrada e usada só para puxar o relatório'
              }
              autoComplete="off"
            />
          </div>
        )}

        {/* ---------------------------------------------- 3. documentos */}
        {step === 2 && (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-ink-500">Envie os documentos necessários para a análise</p>

            {isPJ && (
              <div className="flex gap-3 rounded-xl border border-accent-300 bg-accent-300/15 p-3.5 dark:border-accent-600/60 dark:bg-accent-500/10">
                <AlertTriangle
                  className="size-5 shrink-0 text-accent-600 dark:text-accent-400"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-semibold text-ink-900 dark:text-ink-100">
                    Atenção: documentos contábeis obrigatórios
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                    O DRE 2025 e o Balanço Patrimonial 2025 são obrigatórios para emissão do Rating
                    PJ. Envie os arquivos assinados pelo contador. Sem esses dois documentos a
                    entrega de 35 dias não inicia e o pedido fica pendente.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              {documents.map((slot) => (
                <DocumentRow
                  key={slot.key}
                  slot={slot}
                  file={files[slot.key]}
                  error={errors[slot.key]}
                  onPick={(file) => pickFile(slot.key, file)}
                  onClear={() => setFiles((current) => ({ ...current, [slot.key]: undefined }))}
                />
              ))}
            </div>
          </div>
        )}

        {/* ----------------------------------------------- 4. pagamento */}
        {step === 3 && (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-ink-500">Escolha como quer pagar para concluir o pedido</p>

            <div className="grid gap-2.5 sm:grid-cols-3">
              {PAYMENT_METHODS.map((key) => {
                const { label, hint, icon: Icon } = PAYMENT_UI[key];

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setMethod(key);
                      setErrors((current) => ({ ...current, method: '' }));
                    }}
                    aria-pressed={method === key}
                    className={cn(
                      'rounded-xl border p-3.5 text-left transition-colors',
                      method === key
                        ? 'border-brand-500 bg-brand-50/50 dark:border-brand-400 dark:bg-brand-950/30'
                        : 'border-ink-200 hover:border-brand-300 dark:border-ink-800',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-5',
                        method === key ? 'text-brand-600 dark:text-brand-300' : 'text-ink-400',
                      )}
                      aria-hidden
                    />
                    <p className="mt-2 text-sm font-medium text-ink-900 dark:text-ink-100">
                      {label}
                    </p>
                    <p className="text-xs text-ink-500">{hint}</p>
                  </button>
                );
              })}
            </div>

            {errors.method && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {errors.method}
              </p>
            )}

            <dl className="rounded-xl bg-ink-50 p-3.5 text-sm dark:bg-ink-950/50">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Produto</dt>
                <dd className="font-medium text-ink-900 dark:text-ink-100">
                  Rating de crédito — {isPJ ? 'PJ' : 'PF'}
                </dd>
              </div>
              <div className="mt-2 flex justify-between gap-4">
                <dt className="text-ink-500">{isPJ ? 'Empresa' : 'Titular'}</dt>
                <dd className="truncate font-medium text-ink-900 dark:text-ink-100">
                  {values.legalName || '—'}
                </dd>
              </div>
              <div className="mt-2 flex justify-between gap-4">
                <dt className="text-ink-500">Documentos anexados</dt>
                <dd className="font-medium text-ink-900 dark:text-ink-100">
                  {Object.values(files).filter(Boolean).length} de {documents.length}
                </dd>
              </div>
            </dl>

            {uploading && (
              <p className="text-xs text-ink-500" role="status">
                Enviando documentos… {uploading.done} de {uploading.total}
              </p>
            )}
          </div>
        )}

        {/* --------------------------------------------------- navegação */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-ink-100 pt-5 dark:border-ink-800">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={step === 0 || contract.isPending}
          >
            Anterior
          </Button>

          {step < labels.length - 1 ? (
            <Button onClick={goNext}>{step === 2 ? 'Enviar e Pagar' : 'Próximo'}</Button>
          ) : (
            <Button variant="accent" onClick={finish} loading={contract.isPending}>
              Confirmar pagamento
            </Button>
          )}
        </div>
      </Card>

      {contract.isError && !contract.isPending && (
        <p className="mt-3 text-sm text-ink-500">
          O pedido pode ter sido criado como rascunho.{' '}
          <button
            type="button"
            className="font-medium text-brand-700 underline dark:text-brand-300"
            onClick={() => navigate('/painel/pedidos')}
          >
            Ver meus pedidos
          </button>
        </p>
      )}
    </>
  );
}

export function RatingPJPage() {
  return <RatingWizard personType="pj" />;
}

export function RatingPFPage() {
  return <RatingWizard personType="pf" />;
}
