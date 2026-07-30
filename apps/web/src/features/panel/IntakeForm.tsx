import { useState, type ReactNode } from 'react';
import { AlertTriangle, Building2, Save, User } from 'lucide-react';
import {
  BR_STATES,
  COMPANY_SIZE_LABEL,
  COMPANY_SIZES,
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYMENT_TYPES,
  formatBRL,
  MARITAL_STATUS_LABEL,
  MARITAL_STATUSES,
  pfIntakeSchema,
  pjIntakeSchema,
  TAX_REGIME_LABEL,
  TAX_REGIMES,
  type IntakeInput,
  type PersonType,
} from '@rating-pro/shared';
import { Button, Card, Input, Select, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { maskCurrency, maskDocument, parseCurrency } from '@/lib/masks';

/**
 * Formulário de coleta para a análise de rating.
 *
 * PF e PJ compartilham só endereço, situação de crédito e finalidade — o resto
 * é específico, porque avaliar risco de pessoa e de empresa não usa a mesma
 * informação. Daí um componente com dois corpos, e não um formulário genérico
 * cheio de campos condicionais.
 *
 * Os valores ficam como texto no estado (máscara de moeda, dígitos) e são
 * convertidos e validados de uma vez no envio, pelo mesmo schema zod que a API
 * usa. Erros voltam mapeados por caminho (`address.zip`, `financials.netProfit`).
 */

type Values = Record<string, string>;
type Errors = Record<string, string>;

const EMPTY_PF: Values = {
  birthDate: '',
  motherName: '',
  maritalStatus: '',
  dependents: '0',
  occupation: '',
  employmentType: '',
  employmentMonths: '0',
  monthlyIncome: '',
  otherIncome: '',
  'address.zip': '',
  'address.street': '',
  'address.number': '',
  'address.complement': '',
  'address.district': '',
  'address.city': '',
  'address.state': '',
  'assets.realEstate': '',
  'assets.vehicles': '',
  'assets.investments': '',
  'credit.hasRestriction': 'nao',
  'credit.restrictionDetails': '',
  'credit.openDebtAmount': '',
  'credit.bankRelationships': '0',
  purpose: '',
};

const EMPTY_PJ: Values = {
  legalName: '',
  tradeName: '',
  foundedAt: '',
  taxRegime: '',
  companySize: '',
  sector: '',
  employees: '0',
  'address.zip': '',
  'address.street': '',
  'address.number': '',
  'address.complement': '',
  'address.district': '',
  'address.city': '',
  'address.state': '',
  'representative.name': '',
  'representative.document': '',
  'representative.sharePercent': '',
  'financials.monthlyRevenue': '',
  'financials.annualRevenue': '',
  'financials.netProfit': '',
  'financials.shareCapital': '',
  'financials.currentDebt': '',
  'financials.totalAssets': '',
  hasAuditedStatements: 'nao',
  'credit.hasRestriction': 'nao',
  'credit.restrictionDetails': '',
  'credit.openDebtAmount': '',
  'credit.bankRelationships': '0',
  purpose: '',
};

/** Achata o intake salvo de volta para o estado de texto do formulário. */
function toValues(intake: IntakeInput | null, personType: PersonType): Values {
  const base = personType === 'pf' ? { ...EMPTY_PF } : { ...EMPTY_PJ };
  if (!intake || intake.personType !== personType) return base;

  const walk = (obj: Record<string, unknown>, prefix = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (path === 'personType') continue;

      if (typeof value === 'object' && value !== null) {
        walk(value as Record<string, unknown>, path);
      } else if (typeof value === 'boolean') {
        base[path] = value ? 'sim' : 'nao';
      } else if (typeof value === 'number') {
        // Campos monetários voltam com máscara; contadores, como número puro.
        base[path] = MONEY_FIELDS.has(path)
          ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
          : String(value);
      } else if (value !== null && value !== undefined) {
        base[path] = String(value);
      }
    }
  };

  walk(intake as unknown as Record<string, unknown>);
  return base;
}

const MONEY_FIELDS = new Set([
  'monthlyIncome',
  'otherIncome',
  'assets.realEstate',
  'assets.vehicles',
  'assets.investments',
  'credit.openDebtAmount',
  'financials.monthlyRevenue',
  'financials.annualRevenue',
  'financials.netProfit',
  'financials.shareCapital',
  'financials.currentDebt',
  'financials.totalAssets',
]);

function Fieldset({
  icon,
  title,
  description,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="border-t border-ink-100 py-5 first:border-t-0 first:pt-0 dark:border-ink-800">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100">{title}</h3>
      </div>
      {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </fieldset>
  );
}

interface IntakeFormProps {
  personType: PersonType;
  initial?: IntakeInput | null;
  saving?: boolean;
  submitLabel?: string;
  onSubmit: (intake: IntakeInput) => void;
}

export function IntakeForm({
  personType,
  initial = null,
  saving = false,
  submitLabel = 'Salvar formulário',
  onSubmit,
}: IntakeFormProps) {
  const [values, setValues] = useState<Values>(() => toValues(initial, personType));
  const [errors, setErrors] = useState<Errors>({});

  const set = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: '' } : current));
  };

  const money = (key: string, label: string, hint?: string) => (
    <Input
      label={label}
      inputMode="numeric"
      placeholder="0,00"
      hint={errors[key] ? undefined : hint}
      error={errors[key]}
      value={values[key] ?? ''}
      onChange={(event) => set(key, maskCurrency(event.target.value))}
    />
  );

  const counter = (key: string, label: string, hint?: string) => (
    <Input
      label={label}
      type="number"
      min={0}
      hint={errors[key] ? undefined : hint}
      error={errors[key]}
      value={values[key] ?? ''}
      onChange={(event) => set(key, event.target.value)}
    />
  );

  const text = (key: string, label: string, extra?: { hint?: string; placeholder?: string }) => (
    <Input
      label={label}
      hint={errors[key] ? undefined : extra?.hint}
      placeholder={extra?.placeholder}
      error={errors[key]}
      value={values[key] ?? ''}
      onChange={(event) => set(key, event.target.value)}
    />
  );

  const yesNo = (key: string, label: string) => (
    <Select
      label={label}
      error={errors[key]}
      value={values[key] ?? 'nao'}
      onChange={(event) => set(key, event.target.value)}
    >
      <option value="nao">Não</option>
      <option value="sim">Sim</option>
    </Select>
  );

  const addressBlock = (
    <Fieldset title="Endereço">
      <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
        <Input
          label="CEP"
          inputMode="numeric"
          placeholder="00000-000"
          error={errors['address.zip']}
          value={values['address.zip'] ?? ''}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, 8);
            set(
              'address.zip',
              digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits,
            );
          }}
        />
        {text('address.street', 'Logradouro')}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {text('address.number', 'Número')}
        {text('address.complement', 'Complemento', { hint: 'Opcional' })}
        {text('address.district', 'Bairro')}
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
        {text('address.city', 'Cidade')}
        <Select
          label="UF"
          error={errors['address.state']}
          value={values['address.state'] ?? ''}
          onChange={(event) => set('address.state', event.target.value)}
        >
          <option value="">—</option>
          {BR_STATES.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </Select>
      </div>
    </Fieldset>
  );

  const hasRestriction = values['credit.hasRestriction'] === 'sim';

  const creditBlock = (
    <Fieldset
      title="Situação de crédito declarada"
      description="Declarar restrição não impede a análise; omitir distorce o resultado."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {yesNo('credit.hasRestriction', 'Possui restrição / negativação?')}
        {counter('credit.bankRelationships', 'Bancos com relacionamento')}
      </div>

      {hasRestriction && (
        <Textarea
          label="Detalhe a restrição"
          error={errors['credit.restrictionDetails']}
          hint={errors['credit.restrictionDetails'] ? undefined : 'Qual órgão, valor e data.'}
          value={values['credit.restrictionDetails'] ?? ''}
          onChange={(event) => set('credit.restrictionDetails', event.target.value)}
        />
      )}

      {money('credit.openDebtAmount', 'Total de dívidas em aberto')}
    </Fieldset>
  );

  const purposeBlock = (
    <Fieldset title="Finalidade">
      <Textarea
        label="Para que o rating será usado"
        error={errors.purpose}
        hint={errors.purpose ? undefined : 'Ex.: pleito de crédito, participação em licitação.'}
        value={values.purpose ?? ''}
        onChange={(event) => set('purpose', event.target.value)}
      />
    </Fieldset>
  );

  /** Monta o objeto tipado a partir do texto e valida com o schema do tipo. */
  const submit = () => {
    const n = (key: string) => parseCurrency(values[key] ?? '');
    const i = (key: string) => Number(values[key] ?? 0);
    const b = (key: string) => values[key] === 'sim';
    const s = (key: string) => (values[key] ?? '').trim();

    const address = {
      zip: s('address.zip'),
      street: s('address.street'),
      number: s('address.number'),
      complement: s('address.complement'),
      district: s('address.district'),
      city: s('address.city'),
      state: s('address.state'),
    };

    const credit = {
      hasRestriction: b('credit.hasRestriction'),
      restrictionDetails: s('credit.restrictionDetails'),
      openDebtAmount: n('credit.openDebtAmount'),
      bankRelationships: i('credit.bankRelationships'),
    };

    const candidate =
      personType === 'pf'
        ? {
            personType: 'pf' as const,
            birthDate: s('birthDate'),
            motherName: s('motherName'),
            maritalStatus: s('maritalStatus'),
            dependents: i('dependents'),
            occupation: s('occupation'),
            employmentType: s('employmentType'),
            employmentMonths: i('employmentMonths'),
            monthlyIncome: n('monthlyIncome'),
            otherIncome: n('otherIncome'),
            address,
            assets: {
              realEstate: n('assets.realEstate'),
              vehicles: n('assets.vehicles'),
              investments: n('assets.investments'),
            },
            credit,
            purpose: s('purpose'),
          }
        : {
            personType: 'pj' as const,
            legalName: s('legalName'),
            tradeName: s('tradeName'),
            foundedAt: s('foundedAt'),
            taxRegime: s('taxRegime'),
            companySize: s('companySize'),
            sector: s('sector'),
            employees: i('employees'),
            address,
            representative: {
              name: s('representative.name'),
              document: s('representative.document'),
              sharePercent: Number(values['representative.sharePercent'] ?? 0),
            },
            financials: {
              monthlyRevenue: n('financials.monthlyRevenue'),
              annualRevenue: n('financials.annualRevenue'),
              netProfit: n('financials.netProfit'),
              shareCapital: n('financials.shareCapital'),
              currentDebt: n('financials.currentDebt'),
              totalAssets: n('financials.totalAssets'),
            },
            hasAuditedStatements: b('hasAuditedStatements'),
            credit,
            purpose: s('purpose'),
          };

    const schema = personType === 'pf' ? pfIntakeSchema : pjIntakeSchema;
    const parsed = schema.safeParse(candidate);

    if (!parsed.success) {
      const mapped: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.');
        mapped[key] ??= issue.message;
      }
      setErrors(mapped);

      // Leva o foco ao primeiro campo com erro: num form longo, um aviso no
      // rodapé passa batido.
      const first = Object.keys(mapped)[0];
      if (first) {
        document
          .querySelector<HTMLElement>(`[data-field="${first}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setErrors({});
    onSubmit(parsed.data as IntakeInput);
  };

  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <Card>
      <div className="flex items-center gap-2.5 pb-4">
        <span
          className={cn(
            'grid size-10 place-items-center rounded-xl text-white',
            personType === 'pf'
              ? 'bg-gradient-to-br from-brand-500 to-brand-700'
              : 'bg-gradient-to-br from-accent-500 to-accent-600',
          )}
        >
          {personType === 'pf' ? (
            <User className="size-5" aria-hidden />
          ) : (
            <Building2 className="size-5" aria-hidden />
          )}
        </span>
        <div>
          <h2 className="font-semibold text-ink-950 dark:text-white">
            {personType === 'pf' ? 'Formulário de rating — Pessoa física' : 'Formulário de rating — Pessoa jurídica'}
          </h2>
          <p className="text-xs text-ink-500">
            {personType === 'pf'
              ? 'Renda, vínculo e patrimônio pessoal.'
              : 'Faturamento, endividamento e regime tributário.'}
          </p>
        </div>
      </div>

      {personType === 'pf' ? (
        <>
          <Fieldset title="Dados pessoais">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Data de nascimento"
                type="date"
                error={errors.birthDate}
                value={values.birthDate ?? ''}
                onChange={(event) => set('birthDate', event.target.value)}
              />
              <Select
                label="Estado civil"
                error={errors.maritalStatus}
                value={values.maritalStatus ?? ''}
                onChange={(event) => set('maritalStatus', event.target.value)}
              >
                <option value="">Selecione…</option>
                {MARITAL_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {MARITAL_STATUS_LABEL[item]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
              {text('motherName', 'Nome da mãe', { hint: 'Opcional' })}
              {counter('dependents', 'Dependentes')}
            </div>
          </Fieldset>

          <Fieldset title="Ocupação e renda">
            <div className="grid gap-4 sm:grid-cols-2">
              {text('occupation', 'Profissão / ocupação')}
              <Select
                label="Vínculo"
                error={errors.employmentType}
                value={values.employmentType ?? ''}
                onChange={(event) => set('employmentType', event.target.value)}
              >
                <option value="">Selecione…</option>
                {EMPLOYMENT_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {EMPLOYMENT_TYPE_LABEL[item]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {counter('employmentMonths', 'Tempo de vínculo (meses)')}
              {money('monthlyIncome', 'Renda mensal')}
              {money('otherIncome', 'Outras rendas', 'Aluguel, pró-labore, etc.')}
            </div>
          </Fieldset>

          {addressBlock}

          <Fieldset title="Patrimônio" description="Valores aproximados de mercado.">
            <div className="grid gap-4 sm:grid-cols-3">
              {money('assets.realEstate', 'Imóveis')}
              {money('assets.vehicles', 'Veículos')}
              {money('assets.investments', 'Investimentos')}
            </div>
          </Fieldset>

          {creditBlock}
          {purposeBlock}
        </>
      ) : (
        <>
          <Fieldset title="Dados da empresa">
            <div className="grid gap-4 sm:grid-cols-2">
              {text('legalName', 'Razão social')}
              {text('tradeName', 'Nome fantasia', { hint: 'Opcional' })}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Data de fundação"
                type="date"
                error={errors.foundedAt}
                value={values.foundedAt ?? ''}
                onChange={(event) => set('foundedAt', event.target.value)}
              />
              <Select
                label="Regime tributário"
                error={errors.taxRegime}
                value={values.taxRegime ?? ''}
                onChange={(event) => set('taxRegime', event.target.value)}
              >
                <option value="">Selecione…</option>
                {TAX_REGIMES.map((item) => (
                  <option key={item} value={item}>
                    {TAX_REGIME_LABEL[item]}
                  </option>
                ))}
              </Select>
              <Select
                label="Porte"
                error={errors.companySize}
                value={values.companySize ?? ''}
                onChange={(event) => set('companySize', event.target.value)}
              >
                <option value="">Selecione…</option>
                {COMPANY_SIZES.map((item) => (
                  <option key={item} value={item}>
                    {COMPANY_SIZE_LABEL[item]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              {text('sector', 'Setor de atuação', { placeholder: 'Ex.: metalurgia, transporte' })}
              {counter('employees', 'Funcionários')}
            </div>
          </Fieldset>

          {addressBlock}

          <Fieldset title="Responsável legal">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_140px]">
              {text('representative.name', 'Nome')}
              <Input
                label="CPF"
                inputMode="numeric"
                error={errors['representative.document']}
                value={values['representative.document'] ?? ''}
                onChange={(event) => set('representative.document', maskDocument(event.target.value))}
              />
              <Input
                label="Participação (%)"
                type="number"
                min={0}
                max={100}
                error={errors['representative.sharePercent']}
                value={values['representative.sharePercent'] ?? ''}
                onChange={(event) => set('representative.sharePercent', event.target.value)}
              />
            </div>
          </Fieldset>

          <Fieldset title="Dados financeiros" description="Últimos 12 meses.">
            <div className="grid gap-4 sm:grid-cols-3">
              {money('financials.monthlyRevenue', 'Faturamento mensal')}
              {money('financials.annualRevenue', 'Faturamento anual')}
              {money('financials.netProfit', 'Resultado líquido', 'Use 0 se houve prejuízo.')}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {money('financials.shareCapital', 'Capital social')}
              {money('financials.currentDebt', 'Endividamento atual')}
              {money('financials.totalAssets', 'Patrimônio total')}
            </div>

            {yesNo('hasAuditedStatements', 'Possui balanço auditado?')}
          </Fieldset>

          {creditBlock}
          {purposeBlock}
        </>
      )}

      <div className="border-t border-ink-100 pt-5 dark:border-ink-800">
        {errorCount > 0 && (
          <p className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {errorCount === 1
              ? 'Um campo precisa de atenção.'
              : `${errorCount} campos precisam de atenção.`}
          </p>
        )}

        <Button loading={saving} onClick={submit} icon={<Save className="size-4" aria-hidden />}>
          {submitLabel}
        </Button>
      </div>
    </Card>
  );
}

/** Leitura do intake salvo, para o master conferir na análise. */
export function IntakeSummary({ intake }: { intake: IntakeInput }) {
  const rows: Array<[string, string]> =
    intake.personType === 'pf'
      ? [
          ['Estado civil', MARITAL_STATUS_LABEL[intake.maritalStatus]],
          ['Dependentes', String(intake.dependents)],
          ['Ocupação', intake.occupation],
          ['Vínculo', EMPLOYMENT_TYPE_LABEL[intake.employmentType]],
          ['Tempo de vínculo', `${intake.employmentMonths} meses`],
          ['Renda mensal', formatBRL(intake.monthlyIncome)],
          ['Outras rendas', formatBRL(intake.otherIncome)],
          ['Imóveis', formatBRL(intake.assets.realEstate)],
          ['Veículos', formatBRL(intake.assets.vehicles)],
          ['Investimentos', formatBRL(intake.assets.investments)],
        ]
      : [
          ['Razão social', intake.legalName],
          ['Setor', intake.sector],
          ['Regime tributário', TAX_REGIME_LABEL[intake.taxRegime]],
          ['Porte', COMPANY_SIZE_LABEL[intake.companySize]],
          ['Funcionários', String(intake.employees)],
          ['Faturamento mensal', formatBRL(intake.financials.monthlyRevenue)],
          ['Faturamento anual', formatBRL(intake.financials.annualRevenue)],
          ['Resultado líquido', formatBRL(intake.financials.netProfit)],
          ['Capital social', formatBRL(intake.financials.shareCapital)],
          ['Endividamento', formatBRL(intake.financials.currentDebt)],
          ['Patrimônio', formatBRL(intake.financials.totalAssets)],
          ['Balanço auditado', intake.hasAuditedStatements ? 'Sim' : 'Não'],
        ];

  return (
    <div>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-ink-100 py-1.5 dark:border-ink-800">
            <dt className="text-sm text-ink-500">{label}</dt>
            <dd className="text-right text-sm font-medium text-ink-900 dark:text-ink-100">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div
        className={cn(
          'mt-4 rounded-xl p-3 text-sm',
          intake.credit.hasRestriction
            ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
            : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
        )}
      >
        <p className="font-medium">
          {intake.credit.hasRestriction ? 'Restrição declarada' : 'Sem restrição declarada'}
        </p>
        {intake.credit.restrictionDetails && (
          <p className="mt-1 text-xs">{intake.credit.restrictionDetails}</p>
        )}
        <p className="mt-1 text-xs">
          Dívidas em aberto: {formatBRL(intake.credit.openDebtAmount)} ·{' '}
          {intake.credit.bankRelationships} banco(s)
        </p>
      </div>

      <div className="mt-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/50">
        <p className="text-xs font-semibold text-ink-500 uppercase">Finalidade</p>
        <p className="mt-1 text-sm text-ink-700 dark:text-ink-300">{intake.purpose}</p>
      </div>
    </div>
  );
}
