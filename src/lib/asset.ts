/**
 * Prefixează căile resurselor și linkurilor cu `basePath` (ARCHITECTURE §13, I4).
 * Toate URL-urile de resurse (JSON, texturi, workeri) și linkurile către editor trec prin acest helper.
 * Variabila se citește la apel (Next o înlocuiește static la build); astfel funcția rămâne testabilă.
 */
export const basePath = (): string => process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function asset(path: string): string {
  return `${basePath()}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Linkul către editorul unui proiect (rută statică cu query: ADR-002). */
export const editorHref = (projectId: string): string =>
  asset(`/editor/?p=${encodeURIComponent(projectId)}`);

export const dashboardHref = (): string => asset('/');
