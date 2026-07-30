import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  FileCheck2,
  Gauge,
  KeyRound,
  LogIn,
  Moon,
  Sun,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { signInSchema, signUpSchema } from '@rating-pro/shared';
import { Logo } from '@/components/Logo';
import { Button, Input, PasswordInput } from '@/components/ui';
import { env, whatsappLink } from '@/config/env';
import { useTheme } from '@/hooks/useTheme';
import { ApiRequestError } from '@/lib/api';
import { maskDocument, maskPhone } from '@/lib/masks';
import { useAuth } from './AuthProvider';

const SELLING_POINTS = [
  {
    icon: Wallet,
    title: 'Comissão de 30% na entrada',
    text: 'Calculada sobre o valor que você cobra, visível no painel junto ao pedido.',
  },
  {
    icon: Gauge,
    title: 'Escala de 0 a 1000',
    text: 'Nota de AAA a D com os fatores abertos, peso a peso.',
  },
  {
    icon: FileCheck2,
    title: 'Laudo em PDF automático',
    text: 'Gerado no fim da análise e liberado para download.',
  },
];

/**
 * Layout dividido: painel de marca à esquerda (só em `lg`, onde há espaço para
 * ele agregar) e o formulário à direita, com largura de leitura confortável.
 * Em mobile o painel some por completo — ninguém quer rolar por marketing antes
 * de conseguir digitar a senha.
 */
function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-dvh bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] dark:bg-ink-950">
      {/* --------------------------------------------------- painel de marca */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-ink-950 p-12 lg:flex lg:flex-col xl:p-16">
        <div
          className="pointer-events-none absolute -top-32 -left-24 size-[34rem] rounded-full bg-accent-500/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-32 -bottom-40 size-[30rem] rounded-full bg-brand-400/20 blur-3xl"
          aria-hidden
        />

        <Link to="/" className="relative flex items-center text-white">
          <Logo onDark markClassName="h-10" />
        </Link>

        <div className="relative mt-auto">
          <h2 className="max-w-md text-3xl leading-tight font-semibold tracking-tight text-white xl:text-4xl">
            Você vende. Nossa equipe analisa e entrega o laudo.
          </h2>

          <ul className="mt-10 space-y-6">
            {SELLING_POINTS.map(({ icon: Icon, title: pointTitle, text }) => (
              <li key={pointTitle} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-white ring-1 ring-white/15 backdrop-blur">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-medium text-white">{pointTitle}</p>
                  <p className="mt-0.5 max-w-sm text-sm leading-relaxed text-brand-100/80">
                    {text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-auto pt-12 text-xs text-brand-200/70">
          Sem taxa de adesão e sem mensalidade.
        </p>
      </aside>

      {/* ------------------------------------------------------- formulário */}
      <main className="flex flex-col px-5 py-8 sm:px-8 lg:px-12 xl:px-20">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg text-sm text-ink-500 transition-colors hover:text-brand-700 dark:hover:text-brand-300"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Voltar ao site
          </Link>

          <button
            type="button"
            onClick={toggle}
            className="grid size-10 place-items-center rounded-xl text-ink-500 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800"
            aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
          >
            {theme === 'dark' ? (
              <Sun className="size-5" aria-hidden />
            ) : (
              <Moon className="size-5" aria-hidden />
            )}
          </button>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          {/* Logo aparece aqui só quando o painel lateral está oculto. */}
          <Logo className="mb-8 text-ink-950 lg:hidden dark:text-white" markClassName="size-10" />

          <h1 className="text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl dark:text-white">
            {title}
          </h1>
          <p className="mt-2 text-sm text-ink-500">{subtitle}</p>

          <div className="mt-8">{children}</div>

          <div className="mt-8 text-sm text-ink-500">{footer}</div>
        </div>
      </main>
    </div>
  );
}

// -------------------------------------------------------------------- login

type SignInValues = z.infer<typeof signInSchema>;

export function LoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/painel';

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  if (session) return <Navigate to={from} replace />;

  const onSubmit = async (values: SignInValues) => {
    setSubmitting(true);

    try {
      await signIn(values.email, values.password);
      toast.success('Bem-vindo de volta.');
      navigate(from, { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível entrar';
      setError('password', { message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Entrar no painel"
      subtitle="Acesse seus pedidos de rating e acompanhe as comissões."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link
            to="/criar-conta"
            className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 dark:text-brand-300"
          >
            Criar conta
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          placeholder="voce@empresa.com.br"
          autoFocus
          error={errors.email?.message}
          {...register('email')}
        />

        <div>
          <PasswordInput
            label="Senha"
            autoComplete="current-password"
            placeholder="••••••••"
            error={errors.password?.message}
            {...register('password')}
          />

          <div className="mt-2 flex justify-end">
            <Link
              to="/recuperar-senha"
              className="text-sm text-ink-500 transition-colors hover:text-brand-700 dark:hover:text-brand-300"
            >
              Esqueci minha senha
            </Link>
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={submitting}
          icon={<LogIn className="size-4" aria-hidden />}
        >
          Entrar
        </Button>
      </form>
    </AuthLayout>
  );
}

// ------------------------------------------------------------------ cadastro

type SignUpValues = z.infer<typeof signUpSchema>;

const SIGNUP_FIELDS = {
  fullName: 1,
  email: 1,
  password: 1,
  phone: 1,
  document: 1,
  companyName: 1,
} as const;

export function SignUpPage() {
  const { session, signUp } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      phone: '',
      document: '',
      companyName: '',
    },
  });

  if (session) return <Navigate to="/painel" replace />;

  const onSubmit = async (values: SignUpValues) => {
    setSubmitting(true);

    try {
      // O signup já devolve a sessão pronta: nada de logar em duas etapas.
      await signUp(values);
      toast.success('Conta criada. Vamos começar.');
      navigate('/painel', { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        for (const [field, messages] of Object.entries(error.errors ?? {})) {
          if (field in SIGNUP_FIELDS) {
            setError(field as keyof SignUpValues, { message: messages[0] });
          }
        }

        toast.error(error.message);
      } else {
        toast.error(error instanceof Error ? error.message : 'Não foi possível criar a conta');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Criar conta de revendedor"
      subtitle="Leva menos de dois minutos e não custa nada."
      footer={
        <>
          Já tem conta?{' '}
          <Link
            to="/entrar"
            className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 dark:text-brand-300"
          >
            Entrar
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input
          label="Nome completo"
          autoComplete="name"
          autoFocus
          error={errors.fullName?.message}
          {...register('fullName')}
        />

        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          placeholder="voce@empresa.com.br"
          error={errors.email?.message}
          {...register('email')}
        />

        <div className="grid gap-5 sm:grid-cols-2">
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

          <Input
            label="CPF ou CNPJ"
            hint="Opcional"
            inputMode="numeric"
            error={errors.document?.message}
            {...register('document', {
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                event.target.value = maskDocument(event.target.value);
              },
            })}
          />
        </div>

        <Input
          label="Empresa"
          hint="Opcional"
          autoComplete="organization"
          error={errors.companyName?.message}
          {...register('companyName')}
        />

        <PasswordInput
          label="Senha"
          autoComplete="new-password"
          placeholder="Mínimo de 8 caracteres"
          hint="Use ao menos 8 caracteres."
          error={errors.password?.message}
          {...register('password')}
        />

        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={submitting}
          icon={<UserPlus className="size-4" aria-hidden />}
        >
          Criar conta
        </Button>

        <p className="text-xs leading-relaxed text-ink-500">
          Ao criar a conta você concorda em usar a plataforma apenas para as finalidades
          contratadas.
        </p>
      </form>
    </AuthLayout>
  );
}

// ------------------------------------------------------------ recuperar senha

/**
 * Não há provedor de e-mail no ambiente, então não existe autoatendimento por
 * link. A redefinição é feita por um master no painel — o caminho honesto é
 * dizer isso e dar o contato, em vez de simular um envio que nunca acontece.
 */
export function ResetPasswordPage() {
  const whatsapp = whatsappLink('Olá! Preciso redefinir a senha do meu acesso ao painel.');

  return (
    <AuthLayout
      title="Recuperar acesso"
      subtitle="A redefinição de senha é feita pela nossa equipe."
      footer={
        <Link
          to="/entrar"
          className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 dark:text-brand-300"
        >
          Voltar para o login
        </Link>
      }
    >
      <div className="rounded-xl border border-ink-200 bg-ink-50 p-5 dark:border-ink-800 dark:bg-ink-900/60">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white">
          <KeyRound className="size-5" aria-hidden />
        </span>

        <p className="mt-4 font-medium text-ink-900 dark:text-ink-100">
          Fale com a equipe para receber uma senha nova
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
          Por segurança, quem redefine a senha de um revendedor é um usuário master. Entre em
          contato informando o e-mail da sua conta e você recebe um acesso provisório para trocar
          depois no painel.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              Falar no WhatsApp
            </a>
          )}

          {env.contactEmail && (
            <a
              href={`mailto:${env.contactEmail}?subject=${encodeURIComponent('Redefinição de senha')}`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-ink-300 px-5 text-sm font-medium text-ink-700 transition-colors hover:border-brand-400 dark:border-ink-700 dark:text-ink-200"
            >
              Enviar e-mail
            </a>
          )}
        </div>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-ink-500">
        Já está logado e quer só trocar a senha? Dá para fazer direto em{' '}
        <strong className="font-semibold">Meu perfil</strong>, dentro do painel.
      </p>
    </AuthLayout>
  );
}
