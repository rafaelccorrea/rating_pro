import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LandingPage } from '@/features/landing/LandingPage';
import { LoginPage, ResetPasswordPage, SignUpPage } from '@/features/auth/pages';
import { FullPageLoader, MasterRoute, ProtectedRoute } from '@/features/auth/ProtectedRoute';

/**
 * Rotas autenticadas em chunks separados: quem chega pela landing não baixa o
 * bundle do painel nem do recharts do dashboard.
 */
/** Página pública, mas fora do caminho crítico da landing. */
const TrackingPage = lazy(() =>
  import('@/features/tracking/TrackingPage').then((m) => ({ default: m.TrackingPage })),
);

const PanelLayout = lazy(() =>
  import('@/features/panel/PanelLayout').then((m) => ({ default: m.PanelLayout })),
);
const DashboardPage = lazy(() =>
  import('@/features/panel/pages').then((m) => ({ default: m.DashboardPage })),
);
const OrdersPage = lazy(() =>
  import('@/features/panel/pages').then((m) => ({ default: m.OrdersPage })),
);
const ClientsPage = lazy(() =>
  import('@/features/panel/pages').then((m) => ({ default: m.ClientsPage })),
);
const ProfilePage = lazy(() =>
  import('@/features/panel/pages').then((m) => ({ default: m.ProfilePage })),
);
const NewOrderPage = lazy(() =>
  import('@/features/panel/OrderPages').then((m) => ({ default: m.NewOrderPage })),
);
const OrderDetailPage = lazy(() =>
  import('@/features/panel/OrderPages').then((m) => ({ default: m.OrderDetailPage })),
);
const RatingPFPage = lazy(() =>
  import('@/features/rating/RatingWizard').then((m) => ({ default: m.RatingPFPage })),
);
const RatingPJPage = lazy(() =>
  import('@/features/rating/RatingWizard').then((m) => ({ default: m.RatingPJPage })),
);
const QueuePage = lazy(() =>
  import('@/features/master/pages').then((m) => ({ default: m.QueuePage })),
);
const IssueRatingPage = lazy(() =>
  import('@/features/master/pages').then((m) => ({ default: m.IssueRatingPage })),
);
const ResellersPage = lazy(() =>
  import('@/features/master/pages').then((m) => ({ default: m.ResellersPage })),
);
const LeadsPage = lazy(() =>
  import('@/features/master/pages').then((m) => ({ default: m.LeadsPage })),
);
const PartnersPage = lazy(() =>
  import('@/features/partners/PartnersPage').then((m) => ({ default: m.PartnersPage })),
);

export function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/criar-conta" element={<SignUpPage />} />
        <Route path="/recuperar-senha" element={<ResetPasswordPage />} />

        {/* Link que o revendedor manda para o cliente final; sem login. */}
        <Route path="/acompanhamento/:token" element={<TrackingPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<PanelLayout />}>
            <Route path="/painel" element={<DashboardPage />} />
            <Route path="/painel/pedidos" element={<OrdersPage />} />
            <Route path="/painel/pedidos/novo" element={<NewOrderPage />} />
            <Route path="/painel/pedidos/:id" element={<OrderDetailPage />} />
            <Route path="/painel/rating/pf" element={<RatingPFPage />} />
            <Route path="/painel/rating/pj" element={<RatingPJPage />} />
            <Route path="/painel/clientes" element={<ClientsPage />} />
            <Route path="/painel/perfil" element={<ProfilePage />} />

            <Route element={<MasterRoute />}>
              <Route path="/master" element={<QueuePage />} />
              <Route path="/master/emitir/:id" element={<IssueRatingPage />} />
              <Route path="/master/revendedores" element={<ResellersPage />} />
              <Route path="/master/leads" element={<LeadsPage />} />
              <Route path="/master/socios" element={<PartnersPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
