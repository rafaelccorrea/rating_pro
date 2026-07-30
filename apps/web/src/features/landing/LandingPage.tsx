import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  ClipboardList,
  FileCheck2,
  Gauge,
  Headphones,
  Layers,
  LogIn,
  Menu,
  Moon,
  Send,
  ShieldCheck,
  Sun,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { SCORE_MAX } from '@rating-pro/shared';
import { Counter } from '@/components/Counter';
import { Logo } from '@/components/Logo';
import { Button, Card } from '@/components/ui';
import { env, whatsappLink } from '@/config/env';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/cn';
import { EarningsCalculator } from './EarningsCalculator';
import { LeadForm } from './LeadForm';
import { ScoreSimulator } from './ScoreSimulator';
import { FAQ_ITEMS } from './content';
import { ComparisonTable, Faq, Section, SectionHeading } from './sections';

const NAV_LINKS = [
  { href: '#produto', label: 'O produto' },
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#ganhos', label: 'Ganhos' },
  { href: '#comparativo', label: 'Comparativo' },
  { href: '#faq', label: 'Dúvidas' },
];

/**
 * Grade bento: o primeiro card é alto e ancora a seção; os demais preenchem o
 * restante. Os spans tilam exatamente 4 colunas por linha em `lg`.
 */
const BENEFITS: ReadonlyArray<{
  icon: LucideIcon;
  title: string;
  text: string;
  /** Classes de span da grade bento; tilam 4 colunas por linha em `lg`. */
  span: string;
  featured?: boolean;
}> = [
  {
    icon: Wallet,
    title: 'Comissão definida antes da venda',
    text: 'Você sabe exatamente quanto fica com você em cada laudo. A comissão aparece no painel junto ao pedido, calculada sobre o valor que você cobrou.',
    span: 'lg:col-span-2 lg:row-span-2',
    featured: true,
  },
  {
    icon: Gauge,
    title: 'Escala transparente',
    text: `Score de 0 a ${SCORE_MAX}, nota de AAA a D e faixa de risco. A mesma tabela para todos os laudos.`,
    span: 'lg:col-span-1',
  },
  {
    icon: FileCheck2,
    title: 'Laudo automático',
    text: 'O PDF é gerado quando a análise termina e liberado no painel.',
    span: 'lg:col-span-1',
  },
  {
    icon: Layers,
    title: 'Carteira organizada',
    text: 'Clientes PF e PJ com validação de CPF e CNPJ no cadastro, para não perder pedido por dado errado.',
    span: 'lg:col-span-2',
  },
  {
    icon: ShieldCheck,
    title: 'Isolamento real dos dados',
    text: 'Cada revendedor vê apenas a própria carteira. A separação é aplicada no banco de dados, não só na tela.',
    span: 'lg:col-span-2',
  },
  {
    icon: Headphones,
    title: 'Sem mensalidade',
    text: 'Nenhuma taxa de adesão e nenhuma cobrança fixa. Você abre pedidos conforme fecha vendas.',
    span: 'lg:col-span-2',
  },
];

const STEPS = [
  { title: 'Crie sua conta', text: 'Cadastro em poucos minutos. Você já entra no painel.' },
  { title: 'Abra o pedido', text: 'Dados do cliente PF ou PJ, o valor cobrado, e envie.' },
  { title: 'Nossa equipe analisa', text: 'Os analistas avaliam os fatores e definem o score.' },
  { title: 'Baixe e receba', text: 'O PDF fica no painel. Você entrega e apura a comissão.' },
];

const INCLUDED = [
  'Análise dos fatores de risco por equipe dedicada',
  'Score de 0 a 1000 com nota de AAA a D',
  'Laudo em PDF com fatores, pesos e parecer',
  'Painel com status de cada pedido em tempo real',
  'Trilha de auditoria completa do pedido',
  'Prazo de referência de até 30 dias',
  'Validade impressa no documento',
  'Suporte por WhatsApp para revendedores',
];

/** Depoimentos ilustrativos — rotulados como tal, sem nomes reais. */
const TESTIMONIALS = [
  {
    quote:
      'O que mudou para mim foi parar de dar satisfação por telefone. O cliente acompanha o status e eu só entrego o PDF no final.',
    role: 'Correspondente bancário',
    region: 'Interior de SP',
  },
  {
    quote:
      'A calculadora foi o que me convenceu. Consegui projetar a margem antes de assumir a operação com a minha carteira.',
    role: 'Assessora de crédito',
    region: 'Região metropolitana',
  },
  {
    quote:
      'Ter os fatores abertos no laudo ajuda na conversa com o cliente. Não é uma nota que cai do céu, dá para explicar.',
    role: 'Contador',
    region: 'Sul do país',
  },
];

/** Faixa rolante de públicos atendidos — prova de encaixe, sem logo falso. */
const AUDIENCES = [
  'Correspondentes bancários',
  'Assessores de crédito',
  'Contadores',
  'Consultorias financeiras',
  'Escritórios de crédito',
  'Factorings',
  'Cooperativas',
  'Corretoras de seguros',
];

export function LandingPage() {
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [leadMessage, setLeadMessage] = useState<string>();
  const leadRef = useRef<HTMLDivElement>(null);

  const goToLead = useCallback((message?: string) => {
    if (message) setLeadMessage(message);
    leadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const whatsapp = whatsappLink(
    `Olá! Vi o site do ${env.brandName} e quero saber como revender rating de crédito.`,
  );

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };

  return (
    <div className="min-h-dvh overflow-x-clip bg-white dark:bg-ink-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white"
      >
        Ir para o conteúdo
      </a>

      {/* ------------------------------------------------------------- header */}
      <header className="sticky top-0 z-40 border-b border-ink-200/60 bg-white/80 backdrop-blur-xl dark:border-ink-800/60 dark:bg-ink-950/80">
        <div className="container-page flex h-16 items-center justify-between gap-4 lg:h-18">
          <a href="#top" className="shrink-0 text-ink-950 dark:text-white">
            <Logo markClassName="shadow-soft" />
          </a>

          <nav aria-label="Navegação principal" className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggle}
              className="grid size-10 place-items-center rounded-xl text-ink-600 transition-colors hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
              aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            >
              {theme === 'dark' ? (
                <Sun className="size-5" aria-hidden />
              ) : (
                <Moon className="size-5" aria-hidden />
              )}
            </button>

            <Link
              to="/entrar"
              className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 sm:inline-flex dark:text-ink-200 dark:hover:bg-ink-800"
            >
              <LogIn className="size-4" aria-hidden />
              Entrar
            </Link>

            <Button size="sm" className="hidden sm:inline-flex" onClick={() => goToLead()}>
              Quero revender
            </Button>

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="grid size-10 place-items-center rounded-xl text-ink-700 lg:hidden dark:text-ink-200"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              aria-controls="menu-mobile"
            >
              {menuOpen ? (
                <X className="size-5" aria-hidden />
              ) : (
                <Menu className="size-5" aria-hidden />
              )}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div
            id="menu-mobile"
            className="animate-fade-up border-t border-ink-200 bg-white lg:hidden dark:border-ink-800 dark:bg-ink-950"
          >
            <div className="container-page py-4">
              <nav aria-label="Navegação mobile" className="flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-xl px-3 py-3 text-sm font-medium text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
                  >
                    {link.label}
                  </a>
                ))}
                <Link
                  to="/entrar"
                  className="rounded-xl px-3 py-3 text-sm font-medium text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
                >
                  Entrar no painel
                </Link>
              </nav>

              <Button
                className="mt-3 w-full"
                onClick={() => {
                  setMenuOpen(false);
                  goToLead();
                }}
              >
                Quero revender
              </Button>
            </div>
          </div>
        )}
      </header>

      <main id="conteudo">
        {/* --------------------------------------------------------- hero */}
        <div id="top" className="bg-mesh relative isolate">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-brand-400/50 to-transparent"
            aria-hidden
          />

          <div className="container-page grid grid-cols-1 items-center gap-12 py-16 sm:py-20 lg:grid-cols-12 lg:gap-10 lg:py-28 xl:gap-16">
            {/* Coluna de texto: 7 de 12 em desktop, para a headline respirar. */}
            <div className="lg:col-span-7">
              <p className="inline-flex items-center gap-2 rounded-full border border-brand-200/80 bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-brand-700 backdrop-blur dark:border-brand-800/70 dark:bg-brand-950/50 dark:text-brand-300">
                <BadgeCheck className="size-3.5" aria-hidden />
                Programa de revenda · sem mensalidade
              </p>

              <h1 className="mt-6 text-display font-semibold text-ink-950 dark:text-white">
                Venda rating de crédito.
                <span className="mt-1.5 block bg-gradient-to-br from-brand-600 via-brand-500 to-accent-500 bg-clip-text text-transparent">
                  A análise é nossa.
                </span>
              </h1>

              <p className="mt-7 max-w-xl text-lead text-ink-600 dark:text-ink-300">
                Você traz o cliente e define o preço. Nossa equipe analisa, emite o score de 0 a{' '}
                {SCORE_MAX} e entrega o laudo em PDF pelo painel. Sem taxa de adesão e sem
                mensalidade.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  onClick={() => goToLead()}
                  icon={<ArrowRight className="size-4" aria-hidden />}
                >
                  Quero ser revendedor
                </Button>

                <Button variant="outline" size="lg" onClick={() => scrollTo('ganhos')}>
                  Simular meus ganhos
                </Button>
              </div>

              <dl className="mt-12 grid grid-cols-3 gap-4 border-t border-ink-200/80 pt-8 sm:gap-8 dark:border-ink-800/80">
                <div>
                  <dt className="sr-only">Escala do score</dt>
                  <dd>
                    <span className="text-2xl font-semibold text-ink-950 sm:text-3xl dark:text-white">
                      <Counter to={SCORE_MAX} />
                    </span>
                    <span className="mt-1 block text-xs text-ink-500 sm:text-sm">
                      pontos na escala
                    </span>
                  </dd>
                </div>

                <div>
                  <dt className="sr-only">Faixas de classificação</dt>
                  <dd>
                    <span className="text-2xl font-semibold text-ink-950 sm:text-3xl dark:text-white">
                      <Counter to={10} />
                    </span>
                    <span className="mt-1 block text-xs text-ink-500 sm:text-sm">
                      faixas, de AAA a D
                    </span>
                  </dd>
                </div>

                <div>
                  <dt className="sr-only">Prazo de referência</dt>
                  <dd>
                    <span className="text-2xl font-semibold text-ink-950 sm:text-3xl dark:text-white">
                      <Counter to={30} />
                    </span>
                    <span className="mt-1 block text-xs text-ink-500 sm:text-sm">
                      dias de prazo
                    </span>
                  </dd>
                </div>
              </dl>
            </div>

            {/* Simulador em card de vidro sobre o gradiente. */}
            <div className="lg:col-span-5">
              <div className="border-gradient rounded-card shadow-lift">
                <ScoreSimulator />
              </div>
            </div>
          </div>

          {/* Faixa rolante de públicos. */}
          <div className="relative overflow-hidden border-y border-ink-200/70 bg-white/50 py-4 dark:border-ink-800/70 dark:bg-ink-900/40">
            <div
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white to-transparent dark:from-ink-950"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent dark:from-ink-950"
              aria-hidden
            />

            <div className="flex w-max animate-marquee gap-10 motion-reduce:animate-none">
              {[...AUDIENCES, ...AUDIENCES].map((item, index) => (
                <span
                  key={`${item}-${index}`}
                  className="flex items-center gap-3 text-sm font-medium whitespace-nowrap text-ink-500"
                  aria-hidden={index >= AUDIENCES.length}
                >
                  <span className="size-1.5 rounded-full bg-brand-400" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------- como funciona */}
        <Section id="como-funciona" className="scroll-mt-20" label="Como funciona o processo">
          <SectionHeading
            eyebrow="Como funciona"
            title="Quatro passos, do cadastro à comissão"
            description="Você cuida da relação com o cliente. A análise, a emissão e o documento ficam com a gente."
          />

          <ol className="relative mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {/* Linha que conecta os passos em desktop. */}
            <div
              className="pointer-events-none absolute top-5 right-8 left-8 hidden h-px bg-gradient-to-r from-brand-300 via-brand-400 to-accent-400 lg:block dark:from-brand-800 dark:via-brand-600 dark:to-accent-600"
              aria-hidden
            />

            {STEPS.map((step, index) => (
              <li key={step.title} className="relative">
                <span className="relative z-10 grid size-10 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white ring-4 ring-white dark:ring-ink-950">
                  {index + 1}
                </span>
                <h3 className="mt-5 font-semibold text-ink-950 dark:text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
        </Section>

        {/* ------------------------------------------------------ produto */}
        <Section id="produto" className="scroll-mt-20" label="Vantagens da plataforma">
          <SectionHeading
            eyebrow="O produto"
            title="Feito para quem vive de crédito"
            description="A plataforma existe para você não perder tempo com processo, planilha e telefone."
          />

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map(({ icon: Icon, title, text, span, featured }) => (
              <Card
                key={title}
                className={cn(
                  'flex flex-col transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift motion-reduce:hover:translate-y-0',
                  span,
                  featured &&
                    'border-gradient bg-gradient-to-br from-brand-50 to-white dark:from-brand-950/50 dark:to-ink-900/60',
                )}
              >
                <div
                  className={cn(
                    'w-fit rounded-xl p-2.5',
                    featured
                      ? 'bg-brand-600 text-white'
                      : 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400',
                  )}
                >
                  <Icon className={featured ? 'size-6' : 'size-5'} aria-hidden />
                </div>

                <h3
                  className={cn(
                    'mt-4 font-semibold text-ink-950 dark:text-white',
                    featured && 'text-xl',
                  )}
                >
                  {title}
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  {text}
                </p>

                {featured && (
                  <div className="mt-auto pt-6">
                    <div className="rounded-2xl border border-brand-200/70 bg-white/70 p-4 backdrop-blur dark:border-brand-900/60 dark:bg-ink-950/50">
                      <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
                        Exemplo
                      </p>
                      <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
                        Laudo vendido a <strong className="text-ink-900 dark:text-white">R$ 1.400</strong>{' '}
                        com comissão de 30%
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-brand-700 dark:text-brand-300">
                        R$ 420 <span className="text-sm font-normal text-ink-500">para você</span>
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </Section>

        {/* --------------------------------------------------- calculadora */}
        <Section id="ganhos" className="scroll-mt-20" label="Calculadora de ganhos">
          <SectionHeading
            eyebrow="Ganhos"
            title="Quanto isso rende para você?"
            description="Mexa nos controles e veja a comissão estimada. Você define o preço final ao cliente, então a margem é sua decisão."
          />

          <div className="mt-14">
            <EarningsCalculator onUseSimulation={goToLead} />
          </div>
        </Section>

        {/* --------------------------------------------------- comparativo */}
        <Section
          id="comparativo"
          className="scroll-mt-20 bg-ink-50/70 dark:bg-ink-900/25"
          bleed
          label="Comparativo"
        >
          <div className="container-page">
            <SectionHeading
              eyebrow="Comparativo"
              title="Contra o processo manual de hoje"
              description="A diferença está em ter processo, rastreio e documento padronizado — em vez de e-mail, planilha e telefone."
            />

            <ComparisonTable brandName={env.brandName} />
          </div>
        </Section>

        {/* ------------------------------------------------------ incluso */}
        <Section id="incluso" label="O que está incluso">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-start lg:gap-10 xl:gap-16">
            <div className="lg:col-span-7">
              <SectionHeading
                eyebrow="Incluso"
                center={false}
                title="Tudo isso em cada pedido"
                description="Sem módulo extra e sem cobrança adicional por relatório."
              />

              <ul className="mt-10 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {INCLUDED.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-sm text-ink-700 dark:text-ink-200"
                  >
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                      <ClipboardList className="size-3" aria-hidden />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-5">
              <Card className="bg-gradient-to-br from-ink-900 to-ink-950 dark:from-ink-900 dark:to-black">
                <p className="text-xs font-semibold tracking-[0.14em] text-brand-300 uppercase">
                  Perfis de uso
                </p>

                <div className="mt-5 space-y-5">
                  {TESTIMONIALS.map((item) => (
                    <blockquote key={item.role} className="border-l-2 border-brand-500 pl-4">
                      <p className="text-sm leading-relaxed text-ink-100">“{item.quote}”</p>
                      <footer className="mt-2 text-xs text-ink-400">
                        {item.role} — {item.region}
                      </footer>
                    </blockquote>
                  ))}
                </div>

                <p className="mt-6 border-t border-ink-800 pt-4 text-xs leading-relaxed text-ink-500">
                  Relatos ilustrativos de perfis de uso, sem identificação de pessoas ou empresas.
                </p>
              </Card>
            </div>
          </div>
        </Section>

        {/* --------------------------------------------------- lead + FAQ */}
        <Section id="faq" className="scroll-mt-20" label="Cadastro e dúvidas">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-start lg:gap-10 xl:gap-16">
            <div className="lg:col-span-5 lg:sticky lg:top-28">
              <LeadForm ref={leadRef} source="landing-formulario" prefilledMessage={leadMessage} />

              {whatsapp && (
                <p className="mt-4 text-center text-sm text-ink-500">
                  Prefere conversar agora?{' '}
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 dark:text-brand-300"
                  >
                    Fale no WhatsApp
                  </a>
                </p>
              )}
            </div>

            <div className="lg:col-span-7">
              <SectionHeading center={false} eyebrow="Dúvidas" title="Perguntas frequentes" />
              <Faq />
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------- CTA final */}
        <Section label="Chamada final" className="pt-0">
          <div className="relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-700 via-brand-800 to-ink-950 px-6 py-16 text-center sm:px-12 sm:py-20">
            <div
              className="pointer-events-none absolute -top-24 left-1/2 -z-10 size-[32rem] -translate-x-1/2 rounded-full bg-accent-500/20 blur-3xl"
              aria-hidden
            />

            <h2 className="text-headline font-semibold text-white">
              Comece a revender esta semana
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lead text-brand-100">
              Sem taxa de adesão, sem mensalidade e sem meta mínima. Você abre o primeiro pedido
              assim que a conta for liberada.
            </p>

            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                variant="accent"
                size="lg"
                onClick={() => goToLead()}
                icon={<Send className="size-4" aria-hidden />}
              >
                Falar com um consultor
              </Button>

              <Link
                to="/criar-conta"
                className="inline-flex h-13 items-center justify-center rounded-xl border border-white/30 px-7 text-base font-medium text-white transition-colors hover:bg-white/10"
              >
                Criar conta agora
              </Link>
            </div>
          </div>
        </Section>
      </main>

      {/* ------------------------------------------------------------ footer */}
      <footer className="border-t border-ink-200 bg-ink-50 dark:border-ink-800 dark:bg-ink-950">
        <div className="container-page py-14">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Logo className="text-ink-950 dark:text-white" />
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-500">
                Plataforma de rating de crédito com programa de revenda para profissionais do
                mercado financeiro.
              </p>
            </div>

            <div className="lg:col-span-3 lg:col-start-8">
              <p className="text-sm font-semibold text-ink-950 dark:text-white">Plataforma</p>
              <ul className="mt-4 space-y-2.5 text-sm text-ink-500">
                <li>
                  <a href="#como-funciona" className="hover:text-brand-700 dark:hover:text-brand-300">
                    Como funciona
                  </a>
                </li>
                <li>
                  <a href="#ganhos" className="hover:text-brand-700 dark:hover:text-brand-300">
                    Calculadora
                  </a>
                </li>
                <li>
                  <a href="#comparativo" className="hover:text-brand-700 dark:hover:text-brand-300">
                    Comparativo
                  </a>
                </li>
                <li>
                  <a href="#faq" className="hover:text-brand-700 dark:hover:text-brand-300">
                    Dúvidas
                  </a>
                </li>
              </ul>
            </div>

            <div className="lg:col-span-2">
              <p className="text-sm font-semibold text-ink-950 dark:text-white">Acesso</p>
              <ul className="mt-4 space-y-2.5 text-sm text-ink-500">
                <li>
                  <Link to="/entrar" className="hover:text-brand-700 dark:hover:text-brand-300">
                    Entrar
                  </Link>
                </li>
                <li>
                  <Link to="/criar-conta" className="hover:text-brand-700 dark:hover:text-brand-300">
                    Criar conta
                  </Link>
                </li>
                {env.contactEmail && (
                  <li>
                    <a
                      href={`mailto:${env.contactEmail}`}
                      className="break-all hover:text-brand-700 dark:hover:text-brand-300"
                    >
                      {env.contactEmail}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-ink-200 pt-8 dark:border-ink-800">
            <p className="max-w-3xl text-xs leading-relaxed text-ink-500">
              O laudo de rating é um documento informativo que classifica o perfil de risco com base
              nos dados disponíveis na data da emissão. Não constitui garantia de concessão de
              crédito, promessa de resultado nem recomendação de investimento. A decisão de crédito é
              sempre da instituição analisadora.
            </p>
            <p className="mt-5 text-xs text-ink-500">
              © {new Date().getFullYear()} {env.brandName}. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* ------------------------------------------------- WhatsApp flutuante */}
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-3 sm:right-6 sm:bottom-6',
            'font-semibold text-white shadow-lg transition-transform hover:scale-105 motion-reduce:hover:scale-100',
          )}
          aria-label="Falar no WhatsApp"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
            <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.9-4.44 9.9-9.9S17.5 2 12.04 2Zm5.8 14c-.25.7-1.44 1.35-1.98 1.4-.55.05-1.07.25-3.6-.75-3.05-1.2-4.96-4.35-5.1-4.55-.15-.2-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.46.27-.3.6-.37.8-.37.2 0 .4 0 .58.01.19.01.44-.07.68.52.25.6.85 2.07.92 2.22.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.45.52-.15.15-.3.31-.13.61.17.3.77 1.27 1.65 2.06 1.13 1.01 2.08 1.32 2.38 1.47.3.15.47.13.65-.08.17-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.28.1 1.75.82 2.05.97.3.15.5.22.58.35.07.12.07.72-.18 1.42Z" />
          </svg>
          <span className="hidden sm:inline">WhatsApp</span>
        </a>
      )}
    </div>
  );
}
