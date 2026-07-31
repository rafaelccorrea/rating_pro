import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'rating-pro:sidebar';

function stored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

/**
 * Estado da lateral recolhível no desktop.
 *
 * Fica no localStorage porque é preferência de espaço de trabalho: quem
 * recolheu para ganhar largura na tabela não quer recolher de novo a cada
 * navegação. No mobile a lateral é um drawer sobreposto e ignora isto.
 */
export function useSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(stored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? 'collapsed' : 'expanded');
    } catch {
      // Navegação privada pode bloquear: vale só para esta sessão.
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((value) => !value), []);

  return { collapsed, toggle };
}
