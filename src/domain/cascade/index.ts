// Operații pe document care păstrează derivatele consistente. Fiecare întoarce un document NOU; curățarea
// suprascrierilor are loc în ACEEAȘI operație cu ștergerea sursei (altfel `undo` ar pierde prețul editat).
import { cloneDocument } from '../factory';
import type { Result } from '../result';
import type { LineOverride, ProjectDocument } from '../schema';

/** Elimină suprascrierile de buget care nu mai au sursă. */
export function pruneOrphanOverrides(doc: ProjectDocument): ProjectDocument {
  const next = cloneDocument(doc);
  const usedFinishes = new Set(Object.values(next.finishAssignments).map((a) => a.finishId));
  for (const key of Object.keys(next.budget.overrides)) {
    const i = key.indexOf(':');
    const kind = key.slice(0, i);
    const ref = key.slice(i + 1);
    const alive =
      (kind === 'object' && ref in next.objects) || (kind === 'finish' && usedFinishes.has(ref));
    if (!alive) delete next.budget.overrides[key];
  }
  return next;
}

export function removeObject(doc: ProjectDocument, objectId: string): Result<ProjectDocument> {
  if (!doc.objects[objectId]) return { ok: false, error: `obiect inexistent: ${objectId}` };
  const next = cloneDocument(doc);
  delete next.objects[objectId];
  delete next.budget.overrides[`object:${objectId}`];
  return { ok: true, value: next };
}

/** Șterge o atribuire de finisaj; refuză dacă o linie manuală este legată de ea. */
export function removeFinishAssignment(
  doc: ProjectDocument,
  assignmentId: string,
): Result<ProjectDocument> {
  if (!doc.finishAssignments[assignmentId])
    return { ok: false, error: `atribuire inexistentă: ${assignmentId}` };
  const bound = Object.values(doc.budget.manualLines).filter(
    (l) => l.binding?.kind === 'assignmentArea' && l.binding.assignmentId === assignmentId,
  );
  if (bound.length > 0)
    return {
      ok: false,
      error: `atribuirea este legată de liniile manuale: ${bound.map((l) => l.id).join(', ')}`,
    };
  const next = cloneDocument(doc);
  delete next.finishAssignments[assignmentId];
  return { ok: true, value: pruneOrphanOverrides(next) };
}

export type OverridePatch = { [K in keyof LineOverride]?: LineOverride[K] | null };

/**
 * Setează/șterge câmpuri ale unei suprascrieri (cheia = sursa liniei). `null` șterge câmpul; o suprascriere goală dispare.
 * Nu atinge cantitățile calculate: acestea se recalculează din model la fiecare `computeBudget`.
 */
export function setLineOverride(
  doc: ProjectDocument,
  key: string,
  patch: OverridePatch,
): Result<ProjectDocument> {
  const i = key.indexOf(':');
  const kind = key.slice(0, i);
  const ref = key.slice(i + 1);
  const usedFinishes = new Set(Object.values(doc.finishAssignments).map((a) => a.finishId));
  const exists =
    (kind === 'object' && ref in doc.objects) || (kind === 'finish' && usedFinishes.has(ref));
  if (!exists)
    return {
      ok: false,
      error: `nu există sursă pentru cheia „${key}” (liniile manuale se editează direct)`,
    };
  const next = cloneDocument(doc);
  const merged: Record<string, unknown> = { ...(next.budget.overrides[key] ?? {}) };
  for (const [field, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete merged[field];
    else merged[field] = value;
  }
  if (Object.keys(merged).length === 0) delete next.budget.overrides[key];
  else next.budget.overrides[key] = merged as LineOverride;
  return { ok: true, value: next };
}

export const clearLineOverride = (doc: ProjectDocument, key: string): ProjectDocument => {
  const next = cloneDocument(doc);
  delete next.budget.overrides[key];
  return next;
};
