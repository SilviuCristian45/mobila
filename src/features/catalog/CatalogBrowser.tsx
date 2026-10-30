'use client';

import { useId, useMemo, useState } from 'react';
import type { CatalogItem } from '@/domain';
import { BUILTIN_ITEMS, CATEGORIES, searchCatalog } from '@/catalog';
import { formatLength } from '@/lib/format';
import { Button } from '@/ui/Button';
import { ItemPreview } from './ItemPreview';

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 ${
    active
      ? 'border-teal-700 bg-teal-700 text-white'
      : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-50'
  }`;

/** Catalogul încorporat: căutare, categorii, miniaturi și „Adaugă în cameră”. Nu modifică documentul: `onAdd` o face. */
export function CatalogBrowser({
  items = BUILTIN_ITEMS,
  unit,
  editable,
  onAdd,
  onClose,
}: {
  items?: readonly CatalogItem[];
  unit: 'mm' | 'cm' | 'm';
  editable: boolean;
  onAdd: (item: CatalogItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const searchId = useId();
  const found = useMemo(() => searchCatalog(query, category, items), [query, category, items]);

  return (
    <section aria-label="Catalog de obiecte" className="space-y-3" data-testid="catalog-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-stone-900">Catalog de obiecte</h2>
        <Button onClick={onClose} aria-label="Închide catalogul" data-testid="catalog-close">
          Închide
        </Button>
      </div>

      <div className="space-y-1">
        <label htmlFor={searchId} className="block text-xs font-medium text-stone-700">
          Caută după denumire
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ex. canapea, dulap, WC"
          className="min-h-10 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700"
          data-testid="catalog-search"
        />
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categorii">
        <button
          type="button"
          className={chip(category === null)}
          aria-pressed={category === null}
          onClick={() => setCategory(null)}
          data-testid="catalog-category-all"
        >
          Toate
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={chip(category === c.id)}
            aria-pressed={category === c.id}
            onClick={() => setCategory(c.id)}
            data-testid={`catalog-category-${c.id}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {!editable ? (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
          role="status"
        >
          Proiectul este doar pentru citire în acest tab: nu se pot adăuga obiecte.
        </p>
      ) : null}

      <p className="text-xs text-stone-600" role="status" data-testid="catalog-count">
        {found.length} {found.length === 1 ? 'obiect' : 'obiecte'}
      </p>

      {found.length === 0 ? (
        <p
          className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700"
          data-testid="catalog-empty"
        >
          Nu s-a găsit niciun obiect pentru „{query}”. Încearcă alt termen sau alege altă categorie.
        </p>
      ) : (
        <ul
          className="grid max-h-[28rem] grid-cols-2 gap-2 overflow-y-auto pr-1"
          data-testid="catalog-list"
        >
          {found.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={!editable}
                onClick={() => onAdd(item)}
                title={`Adaugă „${item.name.ro}” în cameră`}
                className="flex h-full w-full flex-col items-center gap-1 rounded-xl border border-stone-200 bg-white p-2 text-center hover:border-teal-600 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid={`catalog-item-${item.id}`}
              >
                <ItemPreview item={item} />
                <span className="text-xs font-medium text-stone-900">{item.name.ro}</span>
                <span className="text-[11px] text-stone-600">
                  {formatLength(item.defaultSize.widthMm, unit).replace(/ (mm|cm|m)$/, '')} ×{' '}
                  {formatLength(item.defaultSize.depthMm, unit).replace(/ (mm|cm|m)$/, '')} ×{' '}
                  {formatLength(item.defaultSize.heightMm, unit)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
