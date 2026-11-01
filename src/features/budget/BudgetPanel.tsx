'use client';

import { useMemo, useState } from 'react';
import {
  CATEGORY_LABELS_RO,
  InvalidDocumentError,
  PRICE_SOURCE_LABELS_RO,
  UNIT_LABELS_RO,
  addManualLine,
  budgetToCsv,
  removeManualLine,
  roomLabel,
  setBudgetSettings,
  setLineOverride,
  updateManualLine,
  type BudgetLine,
  type BudgetSettingsPatch,
  type CsvSeparator,
  type ManualLine,
  type ManualLineInput,
  type ManualLinePatch,
  type OverridePatch,
  type ProjectDocument,
  type Totals,
} from '@/domain';
import { budgetFileName, budgetXlsxFileName, downloadBlob, downloadTextFile } from '@/lib/download';
import { formatMoney } from '@/lib/format';
import { newId } from '@/lib/ids';
import { describeCommitFailure } from '@/lib/messages';
import { selectBudget } from '@/state/selectors';
import type { CommitResult, ProjectSession, SessionState } from '@/state/session';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Alert, Badge } from '@/ui/feedback';
import { InlineNumber, InlineText } from './InlineFields';
import { ManualLineDialog } from './ManualLineDialog';
import { TraceDialog } from './TraceDialog';

const failure = (r: Extract<CommitResult, { ok: false }>): string =>
  r.reason === 'invalid' ? describeCommitFailure(r) : r.message;

const SEPARATORS: ReadonlyArray<{ value: CsvSeparator; label: string }> = [
  { value: ';', label: 'Punct și virgulă (;) — Excel în română' },
  { value: ',', label: 'Virgulă (,)' },
  { value: '\t', label: 'Tab' },
];

type Result =
  | { ok: true; lines: BudgetLine[]; summary: ReturnType<typeof selectBudget> }
  | { ok: false; message: string; issues: string[] };

function computeResult(doc: ProjectDocument): Result {
  try {
    const summary = selectBudget(doc);
    return { ok: true, lines: summary.lines, summary };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Bugetul nu se poate calcula.',
      issues: e instanceof InvalidDocumentError ? e.issues.slice(0, 8).map((i) => i.message) : [],
    };
  }
}

const sumLabel = (t: Totals, currency: string): string => formatMoney(t.grossMinor, currency);

/**
 * Bugetul proiectului: linii derivate din model (obiecte, finisaje) + linii manuale, cu valori editabile, totaluri, urmă
 * de calcul și export CSV. Totul trece prin `session.apply` (un pas de undo, autosave); nimic derivat nu se stochează.
 */
export function BudgetPanel({
  session,
  state,
  genId = newId,
}: {
  session: ProjectSession;
  state: SessionState;
  genId?: () => string;
}) {
  const doc = state.doc;
  const editable = !state.readOnly && !state.conflict && state.status !== 'closed';
  const currency = doc.settings.currency;
  const result = useMemo(() => computeResult(doc), [doc]);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<string | null>(null);
  const [manual, setManual] = useState<{ line?: ManualLine } | null>(null);
  const [removing, setRemoving] = useState<ManualLine | null>(null);
  const [separator, setSeparator] = useState<CsvSeparator>(';');
  const [xlsxBusy, setXlsxBusy] = useState(false);

  /** Aplică o operație de domeniu; întoarce mesajul de eroare (pentru câmpuri) sau `null`. */
  const edit = (
    label: string,
    op: (d: ProjectDocument) => { ok: true; value: ProjectDocument } | { ok: false; error: string },
  ): string | null => {
    const r = session.apply(label, op);
    setError(null);
    return r.ok ? null : failure(r);
  };
  const run = (label: string, op: Parameters<typeof edit>[1]): void => setError(edit(label, op));

  const setOverride = (line: BudgetLine, patch: OverridePatch): string | null =>
    edit(`Buget: ${line.description}`, (d) => setLineOverride(d, line.key, patch));
  const patchManual = (line: BudgetLine, patch: ManualLinePatch): string | null =>
    edit(`Buget: ${line.description}`, (d) =>
      updateManualLine(d, line.key.slice('manual:'.length), patch),
    );
  const settings = (patch: BudgetSettingsPatch): string | null =>
    edit('Setări buget', (d) => setBudgetSettings(d, patch));

  const exportCsv = () => {
    if (!result.ok) return;
    downloadTextFile(
      budgetFileName(doc.name),
      budgetToCsv(doc, result.summary, { separator }),
      'text/csv',
    );
  };

  const exportXlsx = async () => {
    if (!result.ok) return;
    setXlsxBusy(true);
    try {
      // biblioteca XLSX se încarcă abia acum: nu intră în pachetul inițial
      const { budgetXlsxBlob } = await import('./xlsxExport');
      downloadBlob(budgetXlsxFileName(doc.name), await budgetXlsxBlob(doc, result.summary));
      setError(null);
    } catch {
      setError('Exportul XLSX nu a reușit. Încearcă din nou sau exportă CSV.');
    } finally {
      setXlsxBusy(false);
    }
  };

  const percent = (bp: number): number => bp / 100;
  const toBp = (pct: number): number => Math.round(pct * 100);
  const toMinor = (v: number): number | string => {
    if (v < 0) return 'Prețul nu poate fi negativ.';
    const minor = Math.round(v * 100);
    return Math.abs(v * 100 - minor) > 1e-6 ? 'Cel mult două zecimale.' : minor;
  };

  return (
    <section aria-label="Buget" className="space-y-4" data-testid="budget-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Buget</h2>
          <p className="mt-1 max-w-3xl text-sm text-stone-700" data-testid="budget-disclaimer">
            Estimare orientativă, nu ofertă. Liniile marcate „{PRICE_SOURCE_LABELS_RO.demo}” au
            prețuri arbitrare din catalog, nu prețuri de piață. Manopera, transportul și pierderile
            de șantier nu sunt incluse decât dacă le adaugi ca linii manuale.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            variant="primary"
            disabled={!editable}
            onClick={() => setManual({})}
            data-testid="budget-add-manual"
          >
            + Linie manuală
          </Button>
          <label className="text-xs font-medium text-stone-700">
            Separator CSV
            <select
              className="ml-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
              value={separator}
              data-testid="budget-csv-separator"
              onChange={(e) => setSeparator(e.target.value as CsvSeparator)}
            >
              {SEPARATORS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={!result.ok} onClick={exportCsv} data-testid="budget-export-csv">
            Exportă CSV
          </Button>
          <Button
            disabled={!result.ok || xlsxBusy}
            onClick={() => void exportXlsx()}
            data-testid="budget-export-xlsx"
          >
            {xlsxBusy ? 'Se generează…' : 'Exportă XLSX'}
          </Button>
        </div>
      </div>

      {error ? <Alert tone="error" title={error} testId="budget-error" /> : null}

      <details
        className="rounded-xl border border-stone-200 bg-white p-3"
        data-testid="budget-settings"
      >
        <summary className="cursor-pointer text-sm font-medium text-stone-900">
          Setări buget ({currency},{' '}
          {doc.settings.pricesIncludeVat ? 'prețuri cu TVA' : 'prețuri fără TVA'}, rezervă{' '}
          {percent(doc.settings.contingencyBp)}%)
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-medium text-stone-700">
            Moneda (3 litere)
            <InlineText
              label="Moneda"
              value={currency}
              maxLength={3}
              disabled={!editable}
              testId="budget-setting-currency"
              onCommit={(v) => settings({ currency: v.toUpperCase() })}
            />
          </label>
          <label className="block text-xs font-medium text-stone-700">
            Prețurile introduse
            <select
              className="mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-sm min-h-9"
              value={doc.settings.pricesIncludeVat ? 'gross' : 'net'}
              disabled={!editable}
              data-testid="budget-setting-vat-mode"
              onChange={(e) =>
                run('Mod TVA', (d) =>
                  setBudgetSettings(d, { pricesIncludeVat: e.target.value === 'gross' }),
                )
              }
            >
              <option value="net">Nu includ TVA (se adaugă)</option>
              <option value="gross">Includ TVA</option>
            </select>
          </label>
          <div className="text-xs font-medium text-stone-700">
            TVA implicit (%)
            <InlineNumber
              label="TVA implicit (%)"
              value={percent(doc.settings.defaultVatBp)}
              disabled={!editable}
              testId="budget-setting-default-vat"
              onCommit={(v) => settings({ defaultVatBp: toBp(v) })}
            />
          </div>
          <div className="text-xs font-medium text-stone-700">
            Rezervă (%)
            <InlineNumber
              label="Rezervă (%)"
              value={percent(doc.settings.contingencyBp)}
              disabled={!editable}
              testId="budget-setting-contingency"
              onCommit={(v) => settings({ contingencyBp: toBp(v) })}
            />
          </div>
        </div>
      </details>

      {!result.ok ? (
        <Alert tone="error" title="Bugetul nu se poate calcula" testId="budget-invalid">
          <p>
            {result.message} Corectează planul 2D (de exemplu un perete care se intersectează sau o
            cameră neînchisă) și revino la buget.
          </p>
          {result.issues.length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {result.issues.map((m, i) => (
                <li key={`${m}:${i}`}>{m}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : result.lines.length === 0 ? (
        <p
          className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-700"
          data-testid="budget-empty"
        >
          Bugetul e gol. Adaugă obiecte din catalog, aplică materiale pe suprafețe sau adaugă o
          linie manuală.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-[56rem] text-left text-sm" data-testid="budget-table">
              <caption className="sr-only">Liniile bugetului</caption>
              <thead className="bg-stone-100 text-xs text-stone-700">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Descriere
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Inclusă
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Cantitate
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    UM
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Preț unitar ({currency})
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    TVA (%)
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Total brut
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Notă
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Acțiuni
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((line) => {
                  const isManual = line.origin === 'manual';
                  const modified = Object.values(line.overridden).some(Boolean);
                  const manualLine = isManual
                    ? doc.budget.manualLines[line.key.slice('manual:'.length)]
                    : undefined;
                  const bound = isManual && manualLine?.binding !== undefined;
                  const num = (
                    field: 'quantity' | 'unitPriceMinor' | 'vatBp',
                    value: number,
                  ): string | null => {
                    const patch =
                      field === 'quantity'
                        ? value
                        : field === 'unitPriceMinor'
                          ? toMinor(value)
                          : toBp(value);
                    if (typeof patch === 'string') return patch;
                    if (field === 'quantity' && value < 0)
                      return 'Cantitatea nu poate fi negativă.';
                    return isManual
                      ? patchManual(line, { [field]: patch })
                      : setOverride(line, {
                          [field]: patch === line.computed[field] ? null : patch,
                        });
                  };
                  return (
                    <tr
                      key={line.key}
                      className={`border-t border-stone-200 align-top ${line.excluded ? 'bg-stone-50 text-stone-500' : ''}`}
                      data-testid={`budget-line-${line.key}`}
                      data-excluded={line.excluded}
                    >
                      <th scope="row" className="px-3 py-2 font-medium text-stone-900">
                        <div className={line.excluded ? 'line-through' : ''}>
                          {line.description}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge>{CATEGORY_LABELS_RO[line.category]}</Badge>
                          {isManual ? <Badge>Manuală</Badge> : null}
                          {line.priceSource === 'demo' ? (
                            <span data-testid={`budget-demo-${line.key}`}>
                              <Badge tone="warning">{PRICE_SOURCE_LABELS_RO.demo}</Badge>
                            </span>
                          ) : null}
                          {modified ? (
                            <span data-testid={`budget-modified-${line.key}`}>
                              <Badge tone="ok">Modificat</Badge>
                            </span>
                          ) : null}
                          {line.excluded ? <Badge>Exclusă din total</Badge> : null}
                        </div>
                        <div className="mt-1 text-xs font-normal text-stone-600">
                          {Object.keys(line.byRoom)
                            .sort()
                            .map((r) => roomLabel(doc.rooms, r))
                            .join(', ')}
                        </div>
                      </th>
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Inclusă în total: ${line.description}`}
                          checked={!line.excluded}
                          disabled={!editable}
                          data-testid={`budget-include-${line.key}`}
                          onChange={(e) =>
                            run(`Buget: ${line.description}`, (d) =>
                              isManual
                                ? updateManualLine(d, line.key.slice('manual:'.length), {
                                    excluded: !e.target.checked,
                                  })
                                : setLineOverride(d, line.key, {
                                    excluded: e.target.checked ? null : true,
                                  }),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <InlineNumber
                          label={`Cantitate: ${line.description}`}
                          value={line.effective.quantity}
                          disabled={!editable || bound}
                          title={
                            bound
                              ? 'Cantitatea e legată de o arie din plan și se calculează automat.'
                              : undefined
                          }
                          testId={`budget-qty-${line.key}`}
                          onCommit={(v) => num('quantity', v)}
                        />
                      </td>
                      <td className="px-2 py-2 text-stone-700">{UNIT_LABELS_RO[line.unit]}</td>
                      <td className="px-2 py-2">
                        <InlineNumber
                          label={`Preț unitar: ${line.description}`}
                          value={line.effective.unitPriceMinor / 100}
                          disabled={!editable}
                          testId={`budget-price-${line.key}`}
                          onCommit={(v) => num('unitPriceMinor', v)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <InlineNumber
                          label={`TVA (%): ${line.description}`}
                          value={percent(line.effective.vatBp)}
                          disabled={!editable}
                          testId={`budget-vat-${line.key}`}
                          onCommit={(v) =>
                            v < 0 || v > 1000
                              ? 'TVA trebuie să fie între 0% și 1000%.'
                              : num('vatBp', v)
                          }
                        />
                      </td>
                      <td
                        className="px-2 py-2 text-right font-medium tabular-nums"
                        data-testid={`budget-total-${line.key}`}
                      >
                        {formatMoney(line.totals.grossMinor, currency)}
                      </td>
                      <td className="px-2 py-2">
                        <InlineText
                          label={`Notă: ${line.description}`}
                          value={line.note ?? ''}
                          disabled={!editable}
                          testId={`budget-note-${line.key}`}
                          onCommit={(v) =>
                            isManual
                              ? patchManual(line, { note: v === '' ? null : v })
                              : setOverride(line, { note: v === '' ? null : v })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            onClick={() => setTrace(line.key)}
                            data-testid={`budget-trace-${line.key}`}
                            aria-label={`De unde vine cifra: ${line.description}`}
                          >
                            Urmă
                          </Button>
                          {!isManual && modified ? (
                            <Button
                              disabled={!editable}
                              onClick={() =>
                                setOverride(line, {
                                  quantity: null,
                                  unitPriceMinor: null,
                                  vatBp: null,
                                })
                              }
                              data-testid={`budget-reset-${line.key}`}
                              aria-label={`Revino la valorile calculate: ${line.description}`}
                            >
                              Revino
                            </Button>
                          ) : null}
                          {isManual && manualLine ? (
                            <>
                              <Button
                                disabled={!editable}
                                onClick={() => setManual({ line: manualLine })}
                                data-testid={`budget-edit-${line.key}`}
                                aria-label={`Editează linia: ${line.description}`}
                              >
                                Editează
                              </Button>
                              <Button
                                variant="ghost"
                                className="text-red-700"
                                disabled={!editable}
                                onClick={() => setRemoving(manualLine)}
                                data-testid={`budget-remove-${line.key}`}
                                aria-label={`Șterge linia: ${line.description}`}
                              >
                                Șterge
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:grid-cols-3" data-testid="budget-totals">
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <h3 className="mb-1 text-sm font-semibold text-stone-900">Pe categorii</h3>
              <ul className="space-y-0.5 text-sm" data-testid="budget-by-category">
                {Object.entries(result.summary.perCategory).map(([c, t]) => (
                  <li key={c} className="flex justify-between gap-2">
                    <span>{CATEGORY_LABELS_RO[c as keyof typeof CATEGORY_LABELS_RO]}</span>
                    <span className="tabular-nums">{sumLabel(t, currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <h3 className="mb-1 text-sm font-semibold text-stone-900">Pe camere</h3>
              <ul className="space-y-0.5 text-sm" data-testid="budget-by-room">
                {Object.entries(result.summary.perRoom).map(([r, t]) => (
                  <li key={r} className="flex justify-between gap-2">
                    <span>{roomLabel(doc.rooms, r)}</span>
                    <span className="tabular-nums">{sumLabel(t, currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <dl
              className="rounded-xl border border-stone-200 bg-white p-3 text-sm"
              data-testid="budget-summary"
            >
              <h3 className="mb-1 text-sm font-semibold text-stone-900">Total</h3>
              {(
                [
                  ['Subtotal', result.summary.subtotal, 'subtotal'],
                  [
                    `Rezervă (${percent(doc.settings.contingencyBp)}%)`,
                    result.summary.contingency,
                    'contingency',
                  ],
                  ['Total', result.summary.total, 'total'],
                ] as const
              ).map(([label, t, id]) => (
                <div
                  key={id}
                  className={`flex justify-between gap-2 ${id === 'total' ? 'mt-1 border-t border-stone-200 pt-1 font-semibold text-stone-900' : ''}`}
                >
                  <dt>{label}</dt>
                  <dd className="tabular-nums" data-testid={`budget-${id}`}>
                    {sumLabel(t, currency)}
                  </dd>
                </div>
              ))}
              <p className="mt-2 text-xs text-stone-600">
                Net {formatMoney(result.summary.total.netMinor, currency)} · TVA{' '}
                {formatMoney(result.summary.total.vatMinor, currency)}
              </p>
            </dl>
          </div>
        </>
      )}

      {trace && result.ok
        ? (() => {
            const line = result.lines.find((l) => l.key === trace);
            return line ? <TraceDialog line={line} onClose={() => setTrace(null)} /> : null;
          })()
        : null}
      {manual ? (
        <ManualLineDialog
          doc={doc}
          {...(manual.line ? { initial: manual.line } : {})}
          onClose={() => setManual(null)}
          onSubmit={(input: ManualLineInput) => {
            const err = edit(
              manual.line ? `Buget: ${manual.line.description}` : 'Buget: linie manuală nouă',
              (d) =>
                manual.line
                  ? updateManualLine(d, manual.line.id, {
                      ...input,
                      roomId: input.roomId ?? null,
                      binding: input.binding ?? null,
                      note: input.note ?? null,
                    })
                  : addManualLine(d, genId, input),
            );
            if (!err) setManual(null);
            return err;
          }}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          title="Ștergi linia?"
          description={`Linia „${removing.description}” va fi eliminată din buget. O poți reface cu „Anulează” (Ctrl+Z).`}
          confirmLabel="Șterge linia"
          onConfirm={async () => {
            const err = edit(`Buget: șterge ${removing.description}`, (d) =>
              removeManualLine(d, removing.id),
            );
            if (!err) setRemoving(null);
            return err;
          }}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </section>
  );
}
