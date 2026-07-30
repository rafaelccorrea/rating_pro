import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthSession, Profile, SignUpInput } from '@rating-pro/shared';
import { api } from '@/lib/api';
import { clearSession, readSession, writeSession, type StoredSession } from '@/lib/session';

interface AuthContextValue {
  session: StoredSession | null;
  profile: Profile | null;
  /** true enquanto o perfil da sessão restaurada ainda não foi resolvido. */
  loading: boolean;
  isMaster: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // A sessão vem do localStorage já na primeira renderização: não há chamada de
  // rede para descobrir se o usuário está logado, então não pisca a tela de login.
  const [session, setSession] = useState<StoredSession | null>(() => readSession());

  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useQuery({
    queryKey: ['me', session?.token],
    queryFn: () => api.get<Profile>('/me'),
    enabled: Boolean(session),
    retry: false,
    staleTime: 60_000,
  });

  /*
   * Se o perfil falhar com a sessão presente, o token não vale mais (expirado,
   * revogado, ou conta suspensa). O api.ts já limpou o storage no 401; aqui o
   * estado acompanha para o roteador redirecionar ao login.
   */
  useEffect(() => {
    if (session && profileError) {
      setSession(null);
    }
  }, [session, profileError]);

  const adopt = useCallback(
    (authSession: AuthSession) => {
      const stored: StoredSession = {
        token: authSession.token,
        expiresAt: authSession.expiresAt,
      };

      writeSession(stored);
      setSession(stored);
      // Semeia o cache com o perfil que já veio na resposta do login.
      queryClient.setQueryData(['me', stored.token], authSession.profile);
    },
    [queryClient],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const authSession = await api.publicPost<AuthSession>('/auth/login', { email, password });
      adopt(authSession);
    },
    [adopt],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const authSession = await api.publicPost<AuthSession>('/auth/signup', input);
      adopt(authSession);
    },
    [adopt],
  );

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile: profile ?? null,
      loading: Boolean(session) && profileLoading,
      isMaster: profile?.role === 'master',
      signIn,
      signUp,
      signOut,
    }),
    [session, profile, profileLoading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  }

  return context;
}
