'use client';

import type { BudgetLine } from '@/domain';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';

/** „De unde vine cifra?”: pașii de calcul ai unei linii, produși de aceleași funcții care calculează valoarea. */
export function TraceDialog({ line, onClose }: { line: BudgetLine; onClose: () => void }) {
  return (
    <Modal
      title={`De unde vine cifra: ${line.description}`}
      description="Fiecare pas arată formula, valorile folosite și rezultatul. Sumele sunt în unități minore (bani)."
      onClose={onClose}
    >
      <div className="max-h-[60vh] overflow-auto" data-testid="trace-dialog">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Pașii de calcul ai liniei</caption>
          <thead className="text-stone-600">
            <tr>
              <th scope="col" className="pb-1 pr-2 font-medium">
                Pas
              </th>
              <th scope="col" className="pb-1 pr-2 font-medium">
                Formulă
              </th>
              <th scope="col" className="pb-1 pr-2 font-medium">
                Valori
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                Rezultat
              </th>
            </tr>
          </thead>
          <tbody>
            {line.trace.map((s, i) => (
              <tr key={`${s.label}:${i}`} className="border-t border-stone-200 align-top">
                <th scope="row" className="py-1 pr-2 font-medium text-stone-900">
                  {s.label}
                </th>
                <td className="py-1 pr-2 text-stone-700">
                  {s.formula}
                  {s.rounding !== 'none' ? (
                    <span className="ml-1 text-stone-500">
                      (rotunjire {s.rounding === 'ceil' ? 'în sus' : 'la întreg'})
                    </span>
                  ) : null}
                </td>
                <td className="py-1 pr-2 text-stone-600">
                  {Object.entries(s.inputs)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')}
                </td>
                <td
                  className="py-1 text-right font-medium text-stone-900"
                  data-testid={`trace-result-${i}`}
                  data-step={s.label}
                >
                  {String(s.result)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onClose} data-autofocus>
          Închide
        </Button>
      </div>
    </Modal>
  );
}
