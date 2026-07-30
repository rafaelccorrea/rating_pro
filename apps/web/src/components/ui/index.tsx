import type { HTMLAttributes, Ref, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@rating-pro/shared';
import { cn } from '@/lib/cn';

export { Button } from './Button';
export { Input, PasswordInput, Select, Textarea } from './Field';

/**
 * Link com aparência de botão. Existe para não aninhar <a> dentro de <button>,
 * que é HTML inválido e quebra a navegação por teclado.
 */
export function ButtonLink({
  className,
  icon,
  children,
  ...props
}: LinkProps & { icon?: ReactNode }) {
  return (
    <Link
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium',
        'bg-brand-600 text-white shadow-soft transition-all hover:bg-brand-700',
        'dark:bg-brand-500 dark:hover:bg-brand-400',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </Link>
  );
}

// No React 19 `ref` chega como prop normal em componentes de função.
export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      className={cn(
        'rounded-card border border-ink-200 bg-white p-5',
        'dark:border-ink-800 dark:bg-ink-900/60',
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-ink-200 dark:bg-ink-800', className)}
      aria-hidden
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-full bg-ink-100 p-3 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
        {icon ?? <Inbox className="size-6" aria-hidden />}
      </div>
      <h3 className="text-base font-semibold text-ink-900 dark:text-ink-100">{title}</h3>
      {description && <p className="max-w-sm text-sm text-ink-500">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="rounded-card border border-red-200 bg-red-50 p-5 text-sm dark:border-red-900/50 dark:bg-red-950/30">
      <p className="font-medium text-red-800 dark:text-red-300">Não foi possível carregar</p>
      <p className="mt-1 text-red-700 dark:text-red-400">{message}</p>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-3 text-sm font-semibold text-red-800 underline dark:text-red-300"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}

/** Cores por status do pedido; o rótulo vem sempre de ORDER_STATUS_LABEL. */
const STATUS_STYLE: Record<OrderStatus, string> = {
  draft: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300',
  submitted: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  in_analysis: 'bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300',
  pending_doc: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  delivered: 'bg-emerald-600 text-white dark:bg-emerald-600',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  cancelled: 'bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-400',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        STATUS_STYLE[status],
      )}
    >
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
        'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300',
        className,
      )}
    >
      {children}
    </span>
  );
}
