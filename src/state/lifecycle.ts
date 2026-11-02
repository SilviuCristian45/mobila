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
 * - `beforeunload`: pornește o salvare imediată și cere confirmarea utilizatorului (prin `preventDefault`) DOAR când
 *   modificările nu se pot salva: eroare de stocare sau conflict. O salvare normală în curs sau fereastra de debounce nu
 *   cer confirmare (ar apărea dialoguri false la orice plecare rapidă, iar utilizatorii ar învăța să le ignore).
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
    const st = session.getState();
    const cannotSave = st.error !== null || st.conflict !== null;
    if (cannotSave && st.hasUnsavedChanges && !st.readOnly) {
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
