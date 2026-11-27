'use client';

import { useId, useMemo, useState } from 'react';
import type { CatalogItem } from '@/domain';
import { BUILTIN_ITEMS, CATEGORIES, isExteriorCategory, searchCatalog } from '@/catalog';
import { formatLength } from '@/lib/format';
import { IconSearch, IconX } from '@/ui/icons';
import { ItemPreview } from './ItemPreview';

const chip = (active: boolean) =>
  `shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 ${
    active
      ? 'border-primary bg-primary text-white shadow-2xs'
      : 'border-stone-200 bg-surface-subtle text-stone-700 hover:border-stone-300 hover:bg-surface'
  }`;

/** Catalogul încorporat: căutare sticky, categorii compacte, miniaturi 2-coloane și inserare cu un clic. */
export function CatalogBrowser({
  items = BUILTIN_ITEMS,
  unit,
  editable,
  scope = 'all',
  onAdd,
  onClose,
}: {
  items?: readonly CatalogItem[];
  unit: 'mm' | 'cm' | 'm';
  editable: boolean;
  scope?: 'all' | 'exterior';
  onAdd: (item: CatalogItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const exteriorOnly = scope === 'exterior' && !showAll;
  const searchId = useId();
  const visibleCategories = useMemo(
    () => (exteriorOnly ? CATEGORIES.filter((c) => isExteriorCategory(c.id)) : CATEGORIES),
    [exteriorOnly],
  );
  const scopedItems = useMemo(
    () => (exteriorOnly ? items.filter((i) => isExteriorCategory(i.category)) : items),
    [exteriorOnly, items],
  );
  const activeCategory =
    category && visibleCategories.some((c) => c.id === category) ? category : null;
  const found = useMemo(
    () => searchCatalog(query, activeCategory, scopedItems),
    [query, activeCategory, scopedItems],
  );

  return (
    <section
      aria-label={exteriorOnly ? 'Catalog exterior' : 'Catalog de obiecte'}
      className="flex flex-col space-y-2.5"
      data-testid="catalog-panel"
    >
      {/* Header + căutare sticky */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold tracking-tight text-stone-900">
            {exteriorOnly ? 'Catalog Exterior' : 'Catalog obiecte'}
          </h2>
          <div className="flex items-center gap-1">
            {scope === 'exterior' ? (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="rounded-md border border-stone-200 bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                data-testid="catalog-scope-toggle"
              >
                {showAll ? 'Doar exterior' : 'Tot catalogul'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Închide catalogul"
              title="Închide catalogul"
              data-testid="catalog-close"
              className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-teal-700"
            >
              <IconX size={14} />
            </button>
          </div>
        </div>

        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Caută după denumire
          </label>
          <IconSearch
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={exteriorOnly ? 'Caută gard, hală, copac…' : 'Caută canapea, dulap, WC…'}
            className="min-h-8 w-full rounded-lg border border-stone-200 bg-surface-subtle py-1 pr-2.5 pl-8 text-xs text-stone-900 placeholder:text-stone-400 focus-visible:border-teal-600 focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700"
            data-testid="catalog-search"
          />
        </div>

        {/* Categorii compacte scrollabile orizontal */}
        <div
          className="studio-scroll flex gap-1 overflow-x-auto pb-1"
          role="group"
          aria-label="Categorii"
        >
          <button
            type="button"
            className={chip(activeCategory === null)}
            aria-pressed={activeCategory === null}
            onClick={() => setCategory(null)}
            data-testid="catalog-category-all"
          >
            {exteriorOnly ? 'Toate (exterior)' : 'Toate'}
          </button>
          {visibleCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={chip(activeCategory === c.id)}
              aria-pressed={activeCategory === c.id}
              onClick={() => setCategory(c.id)}
              data-testid={`catalog-category-${c.id}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {!editable ? (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
          role="status"
        >
          Proiectul este doar pentru citire în acest tab: nu se pot adăuga obiecte.
        </p>
      ) : null}

      <p
        className="text-[11px] tabular-nums text-stone-500"
        role="status"
        data-testid="catalog-count"
      >
        {found.length} {found.length === 1 ? 'obiect' : 'obiecte'}
      </p>

      {found.length === 0 ? (
        <p
          className="rounded-xl border border-stone-200 bg-surface-subtle p-3 text-xs text-stone-600"
          data-testid="catalog-empty"
        >
          Nu s-a găsit niciun obiect pentru „{query}”. Încearcă alt termen sau alege altă categorie.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-1.5" data-testid="catalog-list">
          {found.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={!editable}
                onClick={() => onAdd(item)}
                title={`Adaugă „${item.name.ro}” în cameră`}
                className="group flex h-full w-full flex-col items-center gap-1 rounded-xl border border-stone-200 bg-surface-subtle p-2 text-center transition-all hover:border-teal-600 hover:bg-surface hover:shadow-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid={`catalog-item-${item.id}`}
              >
                <ItemPreview item={item} px={72} />
                <span className="line-clamp-2 text-[11px] leading-tight font-medium text-stone-900">
                  {item.name.ro}
                </span>
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] tabular-nums text-stone-500">
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
