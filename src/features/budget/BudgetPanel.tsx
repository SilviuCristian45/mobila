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
  type BudgetCategory,
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
import { IconDownload, IconPlus } from '@/ui/icons';
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

const CATEGORY_BADGE_CLASS: Partial<Record<BudgetCategory, string>> = {
  furniture: 'bg-amber-100 text-amber-900',
  flooring: 'bg-teal-100 text-teal-900',
  wall_finish: 'bg-sky-100 text-sky-900',
  paint: 'bg-sky-100 text-sky-900',
  sanitary: 'bg-emerald-100 text-emerald-900',
  labor: 'bg-stone-200 text-stone-800',
  transport: 'bg-stone-200 text-stone-800',
};

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
 * Bugetul proiectului în stil Studio:
 * - Antet curat cu acțiuni de export (`CSV`, `XLSX`) și `+ Linie manuală`
 * - KPI Summary Strip sus (Subtotal · Rezervă · Total estimat cu TVA)
 * - Tabel respirabil cu sticky header, badge-uri colorate pe categorii și editare inline.
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
      {/* Header + acțiuni export */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-stone-900">
            Buget & Estimare Costuri
          </h2>
          <p
            className="mt-1 max-w-3xl text-xs leading-relaxed text-stone-600"
            data-testid="budget-disclaimer"
          >
            Estimare orientativă, nu ofertă. Liniile marcate „{PRICE_SOURCE_LABELS_RO.demo}” au
            prețuri arbitrare din catalog, nu prețuri de piață. Manopera, transportul și pierderile
            de șantier nu sunt incluse decât dacă le adaugi ca linii manuale.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={!editable}
            onClick={() => setManual({})}
            data-testid="budget-add-manual"
          >
            <IconPlus size={14} />
            Linie manuală
          </Button>
          <label className="flex items-center gap-1.5 text-xs font-medium text-stone-600">
            <span>CSV</span>
            <select
              className="h-8 rounded-lg border border-stone-200 bg-surface px-2 text-xs text-stone-800"
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
          <Button
            size="sm"
            disabled={!result.ok}
            onClick={exportCsv}
            data-testid="budget-export-csv"
          >
            <IconDownload size={14} />
            Exportă CSV
          </Button>
          <Button
            size="sm"
            disabled={!result.ok || xlsxBusy}
            onClick={() => void exportXlsx()}
            data-testid="budget-export-xlsx"
          >
            <IconDownload size={14} />
            {xlsxBusy ? 'Se generează…' : 'Exportă XLSX'}
          </Button>
        </div>
      </div>

      {error ? <Alert tone="error" title={error} testId="budget-error" /> : null}

      {/* KPI Summary Strip (3 carduri curate sus) */}
      {result.ok && result.lines.length > 0 ? (
        <dl className="grid gap-3 sm:grid-cols-3" data-testid="budget-summary">
          <div className="rounded-2xl border border-stone-200 bg-surface p-4 shadow-2xs">
            <dt className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
              Subtotal
            </dt>
            <dd
              className="mt-1 text-xl font-bold tracking-tight tabular-nums text-stone-900"
              data-testid="budget-subtotal"
            >
              {sumLabel(result.summary.subtotal, currency)}
            </dd>
            <p className="mt-0.5 text-[11px] tabular-nums text-stone-500">
              {result.lines.filter((l) => !l.excluded).length} linii incluse
            </p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-surface p-4 shadow-2xs">
            <dt className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
              Rezervă ({percent(doc.settings.contingencyBp)}%)
            </dt>
            <dd
              className="mt-1 text-xl font-bold tracking-tight tabular-nums text-stone-900"
              data-testid="budget-contingency"
            >
              {sumLabel(result.summary.contingency, currency)}
            </dd>
            <p className="mt-0.5 text-[11px] text-stone-500">Marjă neprevăzute</p>
          </div>
          <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 shadow-2xs">
            <dt className="text-[11px] font-semibold tracking-wider text-teal-800 uppercase">
              Total estimat (cu TVA)
            </dt>
            <dd
              className="mt-1 text-xl font-bold tracking-tight tabular-nums text-teal-950"
              data-testid="budget-total"
            >
              {sumLabel(result.summary.total, currency)}
            </dd>
            <p className="mt-0.5 text-[11px] tabular-nums text-teal-800/80">
              Net {formatMoney(result.summary.total.netMinor, currency)} · TVA{' '}
              {formatMoney(result.summary.total.vatMinor, currency)}
            </p>
          </div>
        </dl>
      ) : null}

      {/* Setări buget colapsabile */}
      <details
        className="rounded-2xl border border-stone-200 bg-surface p-3.5"
        data-testid="budget-settings"
      >
        <summary className="cursor-pointer text-xs font-semibold text-stone-800">
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
              className="mt-1 min-h-9 w-full rounded-md border border-stone-300 bg-surface px-2 py-1 text-sm"
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
          className="rounded-2xl border border-dashed border-stone-300 bg-surface p-8 text-center text-sm text-stone-600"
          data-testid="budget-empty"
        >
          Bugetul e gol. Adaugă obiecte din catalog, configurează mobilă la comandă, aplică
          materiale pe suprafețe sau adaugă o linie manuală.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-surface shadow-2xs">
            <table className="w-full min-w-[58rem] text-left text-sm" data-testid="budget-table">
              <caption className="sr-only">Liniile bugetului</caption>
              <thead className="sticky top-0 z-10 border-b border-stone-200 bg-surface-subtle text-[11px] tracking-wider text-stone-500 uppercase">
                <tr>
                  <th scope="col" className="px-3.5 py-2.5 font-semibold">
                    Descriere
                  </th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">
                    Inclusă
                  </th>
                  <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                    Cantitate
                  </th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">
                    UM
                  </th>
                  <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                    Preț unitar ({currency})
                  </th>
                  <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                    TVA (%)
                  </th>
                  <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                    Total brut
                  </th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">
                    Notă
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
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
                  const catBadge =
                    CATEGORY_BADGE_CLASS[line.category] ?? 'bg-stone-200 text-stone-800';
                  return (
                    <tr
                      key={line.key}
                      className={`border-t border-stone-200/80 align-top transition-colors hover:bg-surface-subtle/60 ${
                        line.excluded ? 'bg-stone-50/80 text-stone-500' : ''
                      }`}
                      data-testid={`budget-line-${line.key}`}
                      data-excluded={line.excluded}
                    >
                      <th scope="row" className="px-3.5 py-2.5 font-medium text-stone-900">
                        <div className={line.excluded ? 'line-through' : ''}>
                          {line.description}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${catBadge}`}
                          >
                            {CATEGORY_LABELS_RO[line.category]}
                          </span>
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
                        <div className="mt-1 text-[11px] font-normal text-stone-500">
                          {Object.keys(line.byRoom)
                            .sort()
                            .map((r) => roomLabel(doc.rooms, r))
                            .join(', ')}
                        </div>
                      </th>
                      <td className="px-2 py-2.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-teal-700"
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
                      <td className="px-2 py-2.5">
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
                      <td className="px-2 py-2.5 text-xs text-stone-600">
                        {UNIT_LABELS_RO[line.unit]}
                      </td>
                      <td className="px-2 py-2.5">
                        <InlineNumber
                          label={`Preț unitar: ${line.description}`}
                          value={line.effective.unitPriceMinor / 100}
                          disabled={!editable}
                          testId={`budget-price-${line.key}`}
                          onCommit={(v) => num('unitPriceMinor', v)}
                        />
                      </td>
                      <td className="px-2 py-2.5">
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
                        className="px-2 py-2.5 text-right font-semibold tabular-nums text-stone-900"
                        data-testid={`budget-total-${line.key}`}
                      >
                        {formatMoney(line.totals.grossMinor, currency)}
                      </td>
                      <td className="px-2 py-2.5">
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
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="xs"
                            onClick={() => setTrace(line.key)}
                            data-testid={`budget-trace-${line.key}`}
                            aria-label={`De unde vine cifra: ${line.description}`}
                          >
                            Urmă
                          </Button>
                          {!isManual && modified ? (
                            <Button
                              size="xs"
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
                                size="xs"
                                disabled={!editable}
                                onClick={() => setManual({ line: manualLine })}
                                data-testid={`budget-edit-${line.key}`}
                                aria-label={`Editează linia: ${line.description}`}
                              >
                                Editează
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                className="text-red-700 hover:bg-red-50"
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

          <div className="grid gap-4 md:grid-cols-2" data-testid="budget-totals">
            <div className="rounded-2xl border border-stone-200 bg-surface p-4 shadow-2xs">
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-stone-500 uppercase">
                Defalcare pe categorii
              </h3>
              <ul className="space-y-1.5 text-sm" data-testid="budget-by-category">
                {Object.entries(result.summary.perCategory).map(([c, t]) => (
                  <li key={c} className="flex justify-between gap-2">
                    <span className="text-stone-700">
                      {CATEGORY_LABELS_RO[c as keyof typeof CATEGORY_LABELS_RO]}
                    </span>
                    <span className="font-medium tabular-nums text-stone-900">
                      {sumLabel(t, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-surface p-4 shadow-2xs">
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-stone-500 uppercase">
                Defalcare pe camere
              </h3>
              <ul className="space-y-1.5 text-sm" data-testid="budget-by-room">
                {Object.entries(result.summary.perRoom).map(([r, t]) => (
                  <li key={r} className="flex justify-between gap-2">
                    <span className="text-stone-700">{roomLabel(doc.rooms, r)}</span>
                    <span className="font-medium tabular-nums text-stone-900">
                      {sumLabel(t, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
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
