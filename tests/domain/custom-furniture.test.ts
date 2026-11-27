import { describe, expect, it } from 'vitest';
import { computeCutList, cutListToCsv, defaultParams } from '@/domain';
import { BUILTIN_ITEMS, isCustomFurnitureCategory } from '@/catalog';

const CUSTOM_ITEMS = BUILTIN_ITEMS.filter((i) => isCustomFurnitureCategory(i.category));

describe('mobilă la comandă — listă de debitare și estimare cost', () => {
  it('calculează panouri, cant, feronerie și cost pozitiv pentru toate șabloanele de mobilă la comandă', () => {
    expect(CUSTOM_ITEMS).toHaveLength(4);
    for (const item of CUSTOM_ITEMS) {
      const cut = computeCutList(item.recipe.id, item.defaultSize, defaultParams(item));
      expect(cut.panels.length, item.id).toBeGreaterThanOrEqual(4);
      expect(cut.hardware.length, item.id).toBeGreaterThanOrEqual(1);
      expect(cut.boardAreaNetM2, item.id).toBeGreaterThan(0);
      expect(cut.boardAreaGrossM2, item.id).toBeGreaterThan(cut.boardAreaNetM2);
      expect(cut.sheetsNeeded, item.id).toBeGreaterThanOrEqual(1);
      expect(cut.edgeBandMl, item.id).toBeGreaterThan(0);
      expect(cut.cost.totalMinor, item.id).toBeGreaterThan(0);
      expect(cut.cost.totalMinor).toBe(
        cut.cost.boardsMinor +
          cut.cost.backMinor +
          cut.cost.edgeBandMinor +
          cut.cost.hardwareMinor +
          cut.cost.cuttingMinor,
      );
    }
  });

  it('dressingul cu dimensiuni mai mari și mai multe sertare crește aria de plăci, cantul și costul', () => {
    const small = computeCutList(
      'custom-wardrobe',
      { widthMm: 1000, depthMm: 500, heightMm: 2000 },
      {
        columns: 2,
        doorStyle: 'open',
        shelves: 3,
        drawers: 0,
        hangingRod: false,
        base: 'none',
        boardMm: '18',
      },
    );
    const large = computeCutList(
      'custom-wardrobe',
      { widthMm: 2800, depthMm: 650, heightMm: 2600 },
      {
        columns: 4,
        doorStyle: 'sliding',
        shelves: 6,
        drawers: 6,
        hangingRod: true,
        base: 'plinth',
        boardMm: '36',
      },
    );
    expect(large.boardAreaNetM2).toBeGreaterThan(small.boardAreaNetM2 * 2);
    expect(large.edgeBandMl).toBeGreaterThan(small.edgeBandMl * 2);
    expect(large.cost.totalMinor).toBeGreaterThan(small.cost.totalMinor * 2);
    expect(large.hardware.some((h) => h.id === 'sliding-kit')).toBe(true);
    expect(large.hardware.some((h) => h.id === 'slides')).toBe(true);
  });

  it('exportul CSV conține BOM UTF-8, panourile, feroneria și protejează împotriva formulelor Excel', () => {
    const item = CUSTOM_ITEMS[0]!;
    const cut = computeCutList(item.recipe.id, item.defaultSize, defaultParams(item));
    const csv = cutListToCsv('=Dressing living', item.defaultSize, cut, ';');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain("'=Dressing living");
    expect(csv).toContain('Lateral exterior');
    expect(csv).toContain('Total cant ABS (ml)');
  });
});
