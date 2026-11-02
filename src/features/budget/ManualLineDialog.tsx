'use client';

import { useId, useState, type ReactNode } from 'react';
import {
  BUDGET_CATEGORIES,
  CATEGORY_LABELS_RO,
  UNITS,
  UNIT_LABELS_RO,
  type BudgetCategory,
  type ManualLine,
  type ManualLineInput,
  type ProjectDocument,
  type Unit,
} from '@/domain';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';

const inputClass =
  'w-full rounded-lg border border-stone-300 bg-surface px-3 py-1.5 text-sm text-stone-900 min-h-10 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700';

type BindingKind = 'none' | 'roomFloorArea' | 'roomWallArea';

function Labeled({ label, children, id }: { label: string; children: ReactNode; id: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-stone-700">
        {label}
      </label>
      {children}
    </div>
  );
}

const toNumber = (s: string): number =>
  s.trim() === '' ? Number.NaN : Number(s.replace(',', '.'));

/**
 * Adăugarea / editarea unei linii manuale (manoperă, transport, alte costuri). Prețul se introduce în unitatea mare a
 * monedei (ex. lei) și se salvează în unități minore (bani). Cantitatea poate fi legată de aria podelei sau a pereților unei
 * camere: atunci se calculează din model și se actualizează la orice modificare a planului.
 */
export function ManualLineDialog({
  doc,
  initial,
  onSubmit,
  onClose,
}: {
  doc: ProjectDocument;
  initial?: ManualLine;
  /** Întoarce un mesaj de eroare (dialogul rămâne deschis) sau `null` la succes. */
  onSubmit: (input: ManualLineInput) => string | null;
  onClose: () => void;
}) {
  const ids = [useId(), useId(), useId(), useId(), useId(), useId(), useId(), useId(), useId()];
  const rooms = Object.values(doc.rooms).sort((a, b) => a.id.localeCompare(b.id));
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<BudgetCategory>(initial?.category ?? 'labor');
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? 'h');
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1));
  const [price, setPrice] = useState(initial ? String(initial.unitPriceMinor / 100) : '0');
  const [vat, setVat] = useState(String((initial?.vatBp ?? doc.settings.defaultVatBp) / 100));
  const [roomId, setRoomId] = useState<string>(initial?.roomId ?? '');
  const [binding, setBinding] = useState<BindingKind>(
    initial?.binding && initial.binding.kind !== 'assignmentArea' ? initial.binding.kind : 'none',
  );
  const [bindRoom, setBindRoom] = useState<string>(
    initial?.binding && 'roomId' in initial.binding ? initial.binding.roomId : (rooms[0]?.id ?? ''),
  );
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  // legarea de tip „atribuire” nu se poate edita aici; o păstrăm neschimbată dacă linia o are
  const keepsAssignmentBinding = initial?.binding?.kind === 'assignmentArea';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const priceNum = toNumber(price);
    const minor = Math.round(priceNum * 100);
    if (!Number.isFinite(priceNum) || Math.abs(priceNum * 100 - minor) > 1e-6)
      return setError('Prețul trebuie să fie un număr cu cel mult două zecimale.');
    const vatNum = toNumber(vat);
    if (!Number.isFinite(vatNum)) return setError('TVA trebuie să fie un număr.');
    const vatBp = Math.round(vatNum * 100);
    if (Math.abs(vatNum * 100 - vatBp) > 1e-6)
      return setError('TVA poate avea cel mult două zecimale.');
    const qty = toNumber(quantity);
    if (binding === 'none' && !keepsAssignmentBinding && !Number.isFinite(qty))
      return setError('Cantitatea trebuie să fie un număr.');
    if (binding !== 'none' && bindRoom === '')
      return setError('Alege camera pentru legarea cantității.');
    const input: ManualLineInput = {
      category,
      description,
      unit,
      quantity: Number.isFinite(qty) ? qty : (initial?.quantity ?? 0),
      unitPriceMinor: minor,
      vatBp,
      roomId: roomId === '' ? null : roomId,
      ...(keepsAssignmentBinding && initial?.binding
        ? { binding: initial.binding }
        : binding === 'none'
          ? {}
          : { binding: { kind: binding, roomId: bindRoom } }),
      ...(note.trim() === '' ? {} : { note: note.trim() }),
    };
    const err = onSubmit(input);
    if (err) setError(err);
  }

  return (
    <Modal title={initial ? 'Editează linia manuală' : 'Linie manuală de buget'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" data-testid="manual-line-form">
        <Labeled label="Descriere" id={ids[0]!}>
          <input
            id={ids[0]}
            className={inputClass}
            value={description}
            maxLength={200}
            data-autofocus
            data-testid="manual-description"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Categorie" id={ids[1]!}>
            <select
              id={ids[1]}
              className={inputClass}
              value={category}
              data-testid="manual-category"
              onChange={(e) => setCategory(e.target.value as BudgetCategory)}
            >
              {BUDGET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS_RO[c]}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Unitate de măsură" id={ids[2]!}>
            <select
              id={ids[2]}
              className={inputClass}
              value={unit}
              data-testid="manual-unit"
              onChange={(e) => setUnit(e.target.value as Unit)}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS_RO[u]}
                </option>
              ))}
            </select>
          </Labeled>
        </div>
        <Labeled label="Cantitate" id={ids[3]!}>
          <select
            id={ids[3]}
            className={inputClass}
            value={binding}
            disabled={keepsAssignmentBinding}
            data-testid="manual-binding"
            onChange={(e) => setBinding(e.target.value as BindingKind)}
          >
            <option value="none">Introdusă manual</option>
            <option value="roomFloorArea">Legată de aria podelei unei camere</option>
            <option value="roomWallArea">Legată de aria pereților unei camere</option>
          </select>
        </Labeled>
        {keepsAssignmentBinding ? (
          <p className="text-xs text-stone-600">
            Cantitatea e legată de aria unei atribuiri de finisaj și se calculează automat.
          </p>
        ) : binding === 'none' ? (
          <Labeled label="Valoare cantitate" id={ids[4]!}>
            <input
              id={ids[4]}
              className={inputClass}
              inputMode="decimal"
              value={quantity}
              data-testid="manual-quantity"
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Labeled>
        ) : (
          <Labeled label="Camera pentru legare" id={ids[5]!}>
            <select
              id={ids[5]}
              className={inputClass}
              value={bindRoom}
              data-testid="manual-bind-room"
              onChange={(e) => setBindRoom(e.target.value)}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Labeled>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Labeled
            label={`Preț unitar (${doc.settings.currency}${doc.settings.pricesIncludeVat ? ', cu TVA' : ', fără TVA'})`}
            id={ids[6]!}
          >
            <input
              id={ids[6]}
              className={inputClass}
              inputMode="decimal"
              value={price}
              data-testid="manual-price"
              onChange={(e) => setPrice(e.target.value)}
            />
          </Labeled>
          <Labeled label="TVA (%)" id={ids[7]!}>
            <input
              id={ids[7]}
              className={inputClass}
              inputMode="decimal"
              value={vat}
              data-testid="manual-vat"
              onChange={(e) => setVat(e.target.value)}
            />
          </Labeled>
        </div>
        {binding === 'none' && !keepsAssignmentBinding ? (
          <Labeled label="Cameră (opțional)" id={ids[8]!}>
            <select
              id={ids[8]}
              className={inputClass}
              value={roomId}
              data-testid="manual-room"
              onChange={(e) => setRoomId(e.target.value)}
            >
              <option value="">Fără cameră</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Labeled>
        ) : null}
        <Labeled label="Notă (opțional)" id={`${ids[0]}-note`}>
          <input
            id={`${ids[0]}-note`}
            className={inputClass}
            value={note}
            maxLength={1000}
            data-testid="manual-note"
            onChange={(e) => setNote(e.target.value)}
          />
        </Labeled>
        {error ? (
          <p role="alert" className="text-sm text-red-700" data-testid="manual-error">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Anulează
          </Button>
          <Button type="submit" variant="primary" data-testid="manual-submit">
            {initial ? 'Salvează' : 'Adaugă linia'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
