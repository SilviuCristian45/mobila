'use client';

import { useEffect, useId, useRef } from 'react';

const DEFAULT_SWATCHES = [
  '#e7e1d6',
  '#cfc7b8',
  '#b79b7a',
  '#8c6d4f',
  '#6d5a4a',
  '#8a9ba8',
  '#7d8f7a',
  '#3f4a55',
];

/**
 * Selector de culoare: paletă + selector nativ. Aplică la „change” nativ (la închiderea selectorului), nu la fiecare
 * mișcare — un singur pas de undo. `testPrefix` dă `data-testid`-urile `<prefix>-color` și `<prefix>-swatch-<hex>`.
 */
export function ColorField({
  value,
  disabled,
  onCommit,
  label = 'Culoare',
  testPrefix = 'object',
  swatches = DEFAULT_SWATCHES,
}: {
  value: string;
  disabled: boolean;
  onCommit: (hex: string) => void;
  label?: string;
  testPrefix?: string;
  swatches?: readonly string[];
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const id = useId();
  const commit = useRef(onCommit);
  useEffect(() => {
    commit.current = onCommit;
  });
  useEffect(() => {
    if (ref.current) ref.current.value = value;
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChange = () => commit.current(el.value);
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-stone-700">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {swatches.map((hex) => (
          <button
            key={hex}
            type="button"
            disabled={disabled}
            aria-label={`Culoare ${hex}`}
            title={hex}
            onClick={() => onCommit(hex)}
            className={`h-7 w-7 rounded-full border-2 disabled:opacity-50 ${
              hex.toLowerCase() === value.toLowerCase() ? 'border-teal-700' : 'border-stone-300'
            }`}
            style={{ background: hex }}
            data-testid={`${testPrefix}-swatch-${hex.slice(1)}`}
          />
        ))}
        <input
          ref={ref}
          id={id}
          type="color"
          disabled={disabled}
          className="h-8 w-10 cursor-pointer rounded border border-stone-300 bg-white p-0.5 disabled:cursor-not-allowed"
          data-testid={`${testPrefix}-color`}
        />
      </div>
    </div>
  );
}
