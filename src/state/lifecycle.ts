// Legătura cu ciclul de viață al paginii: salvare imediată la ascundere/închidere. Primește ținte injectate
// (în browser: `window` și `document`), deci rămâne testabil fără DOM.
import type { ProjectSession } from './session';

export interface WindowLike {
  addEventListener(type: 'pagehide' | 'beforeunload', listener: (e: unknown) => void): void;
  removeEventListener(type: 'pagehide' | 'beforeunload', listener: (e: unknown) => void): void;
}
export interface DocumentLike {
  visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/**
 * - `visibilitychange → hidden` și `pagehide`: salvare imediată (ocolește debounce-ul).
 * - `beforeunload`: dacă mai există modificări nesalvate (eroare de stocare, conflict), cere confirmarea utilizatorului
 *   (prin `preventDefault`); nu se pierd silențios.
 * Întoarce funcția de dezinstalare.
 */
export function attachLifecycle(
  session: ProjectSession,
  win: WindowLike,
  doc: DocumentLike,
): () => void {
  const flushNow = () => {
    void session.flush();
  };
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') flushNow();
  };
  const onBeforeUnload = (e: unknown) => {
    flushNow();
    if (session.getState().hasUnsavedChanges && !session.getState().readOnly) {
      (e as { preventDefault?: () => void } | undefined)?.preventDefault?.();
    }
  };
  win.addEventListener('pagehide', flushNow);
  win.addEventListener('beforeunload', onBeforeUnload);
  doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    win.removeEventListener('pagehide', flushNow);
    win.removeEventListener('beforeunload', onBeforeUnload);
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
