import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';

const CONTROL = cn(
  'w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-colors',
  'border-ink-300 text-ink-900 placeholder:text-ink-400',
  'focus:border-brand-500 focus:ring-brand-500/25 focus:ring-4 focus:outline-none',
  'dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:placeholder:text-ink-500',
  'disabled:opacity-60',
);

interface WrapperProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

/** Rótulo + controle + erro, com aria-describedby ligado corretamente. */
function Wrapper({ label, error, hint, children }: WrapperProps) {
  const id = useId();
  const messageId = error || hint ? `${id}-msg` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink-700 dark:text-ink-200">
        {label}
      </label>

      {children(id, messageId)}

      {(error || hint) && (
        <p
          id={messageId}
          className={cn('text-xs', error ? 'text-red-600 dark:text-red-400' : 'text-ink-500')}
          role={error ? 'alert' : undefined}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
};

export function Input({ label, error, hint, className, ...props }: InputProps) {
  return (
    <Wrapper label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(CONTROL, error && 'border-red-500 dark:border-red-500', className)}
          {...props}
        />
      )}
    </Wrapper>
  );
}

/**
 * Campo de senha com alternância de visibilidade. O botão fica fora do fluxo do
 * label para o `aria-describedby` do Wrapper continuar valendo.
 */
export function PasswordInput({ label, error, hint, className, ...props }: InputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Wrapper label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <div className="relative">
          <input
            id={id}
            type={visible ? 'text' : 'password'}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={cn(CONTROL, 'pr-11', error && 'border-red-500', className)}
            {...props}
          />

          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-ink-400 transition-colors hover:text-ink-700 dark:hover:text-ink-200"
            aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
            tabIndex={-1}
          >
            {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      )}
    </Wrapper>
  );
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
};

export function Textarea({ label, error, hint, className, ...props }: TextareaProps) {
  return (
    <Wrapper label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(CONTROL, 'min-h-24 resize-y', error && 'border-red-500', className)}
          {...props}
        />
      )}
    </Wrapper>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
};

export function Select({ label, error, hint, className, children, ...props }: SelectProps) {
  return (
    <Wrapper label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(CONTROL, 'pr-8', error && 'border-red-500', className)}
          {...props}
        >
          {children}
        </select>
      )}
    </Wrapper>
  );
}
