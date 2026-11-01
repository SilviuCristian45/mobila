// Operații pure pe bugetul din document: linii manuale și setări. Fiecare întoarce un document NOU sau o eroare în
// română; documentul primit nu se modifică. Valorile derivate (cantități, totaluri) nu se stochează niciodată.
import { cloneDocument } from '../factory';
import type { Result } from '../result';
import {
  BUDGET_CATEGORIES,
  IdSchema,
  MAX_NAME_LENGTH,
  UNITS,
  type BudgetCategory,
  type ManualLine,
  type ProjectDocument,
  type Unit,
} from '../schema';

const MAX_NOTE = 1000;
const MAX_BP = 100_000;

export interface ManualLineInput {
  category: BudgetCategory;
  description: string;
  unit: Unit;
  quantity: number;
  /** Preț unitar în unități minore (bani). */
  unitPriceMinor: number;
  /** TVA în puncte-bază (1900 = 19%). */
  vatBp: number;
  roomId?: string | null;
  /** Legare de o arie din model: cantitatea se calculează, `quantity` e ignorată la calcul. */
  binding?: ManualLine['binding'];
  note?: string;
  excluded?: boolean;
}

/** Câmpurile opționale se șterg cu `null`. */
export type ManualLinePatch = Partial<
  Omit<ManualLineInput, 'roomId' | 'binding' | 'note'> & {
    roomId: string | null;
    binding: ManualLine['binding'] | null;
    note: string | null;
  }
>;

function problem(doc: ProjectDocument, l: ManualLineInput): string | null {
  const description = l.description.trim();
  if (description === '') return 'Descrierea liniei nu poate fi goală.';
  if (description.length > MAX_NAME_LENGTH)
    return `Descrierea poate avea cel mult ${MAX_NAME_LENGTH} de caractere.`;
  if (!(BUDGET_CATEGORIES as readonly string[]).includes(l.category))
    return 'Categorie necunoscută.';
  if (!(UNITS as readonly string[]).includes(l.unit)) return 'Unitate de măsură necunoscută.';
  if (!Number.isFinite(l.quantity) || l.quantity < 0)
    return 'Cantitatea trebuie să fie un număr pozitiv sau zero.';
  if (!Number.isInteger(l.unitPriceMinor) || l.unitPriceMinor < 0)
    return 'Prețul trebuie să fie pozitiv sau zero, cu cel mult două zecimale.';
  if (!Number.isInteger(l.vatBp) || l.vatBp < 0 || l.vatBp > MAX_BP)
    return 'TVA trebuie să fie între 0% și 1000%.';
  if (l.note !== undefined && l.note.length > MAX_NOTE)
    return `Nota poate avea cel mult ${MAX_NOTE} de caractere.`;
  if (l.roomId != null && !doc.rooms[l.roomId]) return 'Camera aleasă nu mai există.';
  const b = l.binding;
  if (b && 'roomId' in b && !doc.rooms[b.roomId])
    return 'Camera la care e legată cantitatea nu mai există.';
  if (b?.kind === 'assignmentArea' && !doc.finishAssignments[b.assignmentId])
    return 'Atribuirea la care e legată cantitatea nu mai există.';
  return null;
}

const inputOf = (l: ManualLine): ManualLineInput => ({
  category: l.category,
  description: l.description,
  unit: l.unit,
  quantity: l.quantity,
  unitPriceMinor: l.unitPriceMinor,
  vatBp: l.vatBp,
  ...(l.roomId !== undefined ? { roomId: l.roomId } : {}),
  ...(l.binding ? { binding: l.binding } : {}),
  ...(l.note !== undefined ? { note: l.note } : {}),
  ...(l.excluded !== undefined ? { excluded: l.excluded } : {}),
});

function toLine(id: string, i: ManualLineInput): ManualLine {
  return {
    id,
    category: i.category,
    description: i.description.trim(),
    unit: i.unit,
    quantity: i.quantity,
    unitPriceMinor: i.unitPriceMinor,
    vatBp: i.vatBp,
    ...(i.roomId !== undefined ? { roomId: i.roomId } : {}),
    ...(i.binding ? { binding: i.binding } : {}),
    ...(i.note !== undefined && i.note !== '' ? { note: i.note } : {}),
    ...(i.excluded ? { excluded: true } : {}),
  };
}

export function addManualLine(
  doc: ProjectDocument,
  genId: () => string,
  input: ManualLineInput,
): Result<ProjectDocument> {
  const p = problem(doc, input);
  if (p) return { ok: false, error: p };
  let id: string | null = null;
  for (let i = 0; i < 50 && id === null; i++) {
    const c = genId();
    if (IdSchema.safeParse(c).success && !(c in doc.budget.manualLines)) id = c;
  }
  if (id === null) return { ok: false, error: 'Nu s-a putut genera un identificator nou.' };
  const next = cloneDocument(doc);
  next.budget.manualLines[id] = toLine(id, input);
  return { ok: true, value: next };
}

export function updateManualLine(
  doc: ProjectDocument,
  id: string,
  patch: ManualLinePatch,
): Result<ProjectDocument> {
  const current = doc.budget.manualLines[id];
  if (!current) return { ok: false, error: 'Linia nu mai există.' };
  const merged: ManualLineInput = { ...inputOf(current) };
  const { roomId, binding, note, ...rest } = patch;
  Object.assign(
    merged,
    Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
  );
  if (roomId !== undefined) {
    if (roomId === null) delete merged.roomId;
    else merged.roomId = roomId;
  }
  if (binding !== undefined) {
    if (binding === null) delete merged.binding;
    else merged.binding = binding;
  }
  if (note !== undefined) {
    if (note === null || note === '') delete merged.note;
    else merged.note = note;
  }
  const p = problem(doc, merged);
  if (p) return { ok: false, error: p };
  const next = cloneDocument(doc);
  next.budget.manualLines[id] = toLine(id, merged);
  return { ok: true, value: next };
}

export function removeManualLine(doc: ProjectDocument, id: string): Result<ProjectDocument> {
  if (!doc.budget.manualLines[id]) return { ok: false, error: 'Linia nu mai există.' };
  const next = cloneDocument(doc);
  delete next.budget.manualLines[id];
  return { ok: true, value: next };
}

export interface BudgetSettingsPatch {
  currency?: string;
  pricesIncludeVat?: boolean;
  defaultVatBp?: number;
  contingencyBp?: number;
}

/** Moneda, modul TVA, TVA implicit și rezerva. Doar setări: cantitățile și suprascrierile rămân neatinse. */
export function setBudgetSettings(
  doc: ProjectDocument,
  patch: BudgetSettingsPatch,
): Result<ProjectDocument> {
  if (patch.currency !== undefined && !/^[A-Z]{3}$/.test(patch.currency))
    return { ok: false, error: 'Moneda se scrie cu 3 litere mari (de exemplu RON, EUR).' };
  if (patch.currency !== undefined && patch.currency !== doc.settings.currency) {
    // prețurile din catalog au moneda lor și nu se convertesc: schimbarea monedei ar falsifica sumele
    const clash = Object.values(doc.objects)
      .map((o) => doc.catalogSnapshot.items[o.catalogItemId])
      .find((i) => i?.reference && i.reference.currency !== patch.currency);
    if (clash?.reference)
      return {
        ok: false,
        error: `Moneda nu se poate schimba în ${patch.currency}: prețurile obiectelor din proiect (de exemplu „${clash.name.ro}”) sunt în ${clash.reference.currency} și nu se convertesc automat.`,
      };
  }
  for (const [name, v] of [
    ['TVA implicit', patch.defaultVatBp],
    ['Rezerva', patch.contingencyBp],
  ] as const)
    if (v !== undefined && (!Number.isInteger(v) || v < 0 || v > MAX_BP))
      return { ok: false, error: `${name} trebuie să fie între 0% și 1000%.` };
  const next = cloneDocument(doc);
  if (patch.currency !== undefined) next.settings.currency = patch.currency;
  if (patch.pricesIncludeVat !== undefined) next.settings.pricesIncludeVat = patch.pricesIncludeVat;
  if (patch.defaultVatBp !== undefined) next.settings.defaultVatBp = patch.defaultVatBp;
  if (patch.contingencyBp !== undefined) next.settings.contingencyBp = patch.contingencyBp;
  return { ok: true, value: next };
}
