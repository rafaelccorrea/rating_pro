import { useEffect, useRef } from 'react';

/**
 * Marca `data-visible` quando o elemento entra na viewport, para a classe
 * `.reveal` animar a entrada. Se o browser não tiver IntersectionObserver, o
 * elemento é marcado visível na hora — nunca fica escondido.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.15) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      node.dataset.visible = 'true';
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            node.dataset.visible = 'true';
            observer.disconnect();
          }
        }
      },
      { threshold, rootMargin: '0px 0px -60px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return ref;
}
