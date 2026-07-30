import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/**
 * Versionada de propósito. A versão anterior persistia aqui o tema resolvido a
 * partir de `prefers-color-scheme`, então quem usa o sistema no escuro acabou
 * com 'dark' gravado sem ter escolhido — e passava a ignorar o padrão claro do
 * produto. A chave nova descarta essas preferências herdadas.
 *
 * Precisa bater com a chave usada no script inline do index.html.
 */
const STORAGE_KEY = 'rating-pro:theme.v2';

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

/**
 * O tema inicial já foi aplicado pelo script inline do index.html — aqui só
 * espelhamos o estado e cuidamos da troca manual.
 *
 * Padrão claro, e não `prefers-color-scheme`: precisa bater exatamente com a
 * lógica daquele script, senão o React troca o tema depois da primeira pintura.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? 'light');

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Navegação privada pode bloquear: o tema vale só para esta sessão.
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
