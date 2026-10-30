'use client';

import { useMemo } from 'react';
import type { CatalogItem } from '@/domain';
import { buildParts, buildPreview, type Params, type SlotLooks } from '@/catalog';

/**
 * Miniatură izometrică (SVG) a unui obiect, generată din aceeași rețetă ca scena 3D. Nu folosește WebGL, deci o listă cu
 * zeci de miniaturi nu consumă contexte grafice.
 */
export function ItemPreview({
  item,
  size,
  params,
  colorHex,
  slots,
  px = 72,
}: {
  item: Pick<CatalogItem, 'recipe' | 'defaultSize' | 'defaultColorHex' | 'paramSpecs' | 'name'>;
  size?: { widthMm: number; depthMm: number; heightMm: number };
  params?: Params;
  colorHex?: string;
  /** Finisajele zonelor (din materialele aplicate), ca previzualizarea să le arate. */
  slots?: SlotLooks;
  px?: number;
}) {
  const s = size ?? item.defaultSize;
  const preview = useMemo(() => {
    const p: Params =
      params ?? Object.fromEntries(Object.entries(item.paramSpecs).map(([k, v]) => [k, v.default]));
    const { parts } = buildParts(
      item.recipe,
      [s.widthMm / 1000, s.heightMm / 1000, s.depthMm / 1000],
      p,
    );
    return buildPreview(parts, colorHex ?? item.defaultColorHex ?? '#bbbbbb', 100, slots);
  }, [item, s.widthMm, s.heightMm, s.depthMm, params, colorHex, slots]);
  return (
    <svg
      viewBox={preview.viewBox}
      width={px}
      height={px}
      role="img"
      aria-label={`Previzualizare: ${item.name.ro}`}
      data-testid="item-preview"
      data-polygons={preview.polygons.length}
    >
      {preview.polygons.map((p, i) => (
        <polygon key={i} points={p.points} fill={p.fill} stroke={p.fill} strokeWidth={0.4} />
      ))}
    </svg>
  );
}
