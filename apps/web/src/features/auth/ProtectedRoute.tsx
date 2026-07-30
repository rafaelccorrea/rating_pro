import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui';
import { useAuth } from './AuthProvider';

export function FullPageLoader({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-white dark:bg-ink-950">
      <div className="flex flex-col items-center gap-3">
        <div
          className="size-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600 dark:border-ink-700"
          aria-hidden
        />
        <p className="text-sm text-ink-500">{label}</p>
      </div>
    </div>
  );
}

/** Exige sessão válida; guarda o destino para voltar depois do login. */
export function ProtectedRoute() {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader label="Verificando sua sessão…" />;

  if (!session) {
    return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  }

  // Sessão existe mas o perfil não carregou (ex.: conta suspensa pelo guard da API).
  if (!profile) {
    return (
      <div className="container-page py-20">
        <Card>
          <EmptyState
            icon={<ShieldAlert className="size-6" aria-hidden />}
            title="Não foi possível carregar seu perfil"
            description="Sua conta pode estar aguardando aprovação ou suspensa. Fale com o suporte para liberar o acesso."
          />
        </Card>
      </div>
    );
  }

  return <Outlet />;
}

/** Além da sessão, exige papel de master. */
export function MasterRoute() {
  const { isMaster, loading } = useAuth();

  if (loading) return <FullPageLoader />;

  if (!isMaster) {
    return (
      <div className="container-page py-20">
        <Card>
          <EmptyState
            icon={<ShieldAlert className="size-6" aria-hidden />}
            title="Área restrita"
            description="Esta seção é exclusiva dos usuários master da operação."
          />
        </Card>
      </div>
    );
  }

  return <Outlet />;
}
