import { describe, expect, it } from 'vitest';
import { CatalogItemSchema, defaultParams, paramProblems, sizeProblems } from '@/domain';
import {
  BUILTIN_ITEMS,
  CATEGORIES,
  RECIPES,
  buildMesh,
  buildParts,
  getBuiltinItem,
  optionLabel,
  paramLabel,
  partsBounds,
  resolveRecipe,
  searchCatalog,
} from '@/catalog';

type Params = Record<string, number | string | boolean>;
type Item = (typeof BUILTIN_ITEMS)[number];

/** Variantele de parametri ale unui item: implicit + fiecare valoare a fiecărui parametru, pe rând. */
function paramVariants(item: Item): Params[] {
  const base = defaultParams(item);
  const out: Params[] = [base];
  for (const [k, s] of Object.entries(item.paramSpecs)) {
    const values: Array<number | string | boolean> =
      s.type === 'enum' ? s.options : s.type === 'bool' ? [true, false] : [s.min, s.default, s.max];
    for (const v of values) out.push({ ...base, [k]: v });
  }
  return out;
}

const sizesOf = (item: Item) => {
  const L = item.sizeLimits;
  const D = item.defaultSize;
  const mk = (pick: 'min' | 'max' | 'def') => ({
    widthMm: pick === 'def' ? D.widthMm : L.widthMm[pick],
    depthMm: pick === 'def' ? D.depthMm : L.depthMm[pick],
    heightMm: pick === 'def' ? D.heightMm : L.heightMm[pick],
  });
  return [mk('min'), mk('def'), mk('max')];
};

describe('catalogul încorporat', () => {
  it('are ~40 de itemi, ID-uri unice și stabile, în categoriile așteptate', () => {
    expect(BUILTIN_ITEMS.length).toBeGreaterThanOrEqual(38);
    expect(BUILTIN_ITEMS.length).toBeLessThanOrEqual(44);
    const ids = BUILTIN_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+\.[a-z0-9-]+$/);
    const cats = new Set(BUILTIN_ITEMS.map((i) => i.category));
    expect([...cats].sort()).toEqual(CATEGORIES.map((c) => c.id).sort());
    for (const c of CATEGORIES)
      expect(BUILTIN_ITEMS.filter((i) => i.category === c.id).length).toBeGreaterThanOrEqual(4);
  });

  it('fiecare item respectă schema documentului (se poate copia în catalogSnapshot)', () => {
    for (const item of BUILTIN_ITEMS) {
      const r = CatalogItemSchema.safeParse(item);
      expect(r.success, `${item.id}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(
        true,
      );
    }
  });

  it('licență, nume în română, prețuri demonstrative și rețete cunoscute', () => {
    for (const item of BUILTIN_ITEMS) {
      expect(item.provenance.license.length, item.id).toBeGreaterThan(0);
      expect(item.provenance.origin).toBe('original');
      expect(item.name.ro.length).toBeGreaterThanOrEqual(2);
      expect(item.reference?.origin, item.id).toBe('demo');
      expect(resolveRecipe(item.recipe.id, item.recipe.version), item.id).not.toBeNull();
    }
  });

  it('dimensiunile implicite sunt în limite, iar parametrii impliciți sunt valizi', () => {
    for (const item of BUILTIN_ITEMS) {
      expect(sizeProblems(item, item.defaultSize), item.id).toEqual([]);
      const p = paramProblems(item, defaultParams(item));
      expect(p.invalid, item.id).toEqual([]);
      expect(p.unknown, item.id).toEqual([]);
    }
  });

  it('montare: perete ⇒ elevație implicită > 0; podea/tavan ⇒ 0 (tavanul se calculează la plasare)', () => {
    for (const i of BUILTIN_ITEMS) {
      if (i.mounting === 'wall') expect(i.defaultElevationMm, i.id).toBeGreaterThan(0);
      else expect(i.defaultElevationMm, i.id).toBe(0);
    }
    expect(BUILTIN_ITEMS.some((i) => i.mounting === 'ceiling')).toBe(true);
    expect(getBuiltinItem('decor.mirror')?.mounting).toBe('wall');
  });

  it('fiecare parametru are etichetă în română (și fiecare opțiune enum)', () => {
    for (const item of BUILTIN_ITEMS)
      for (const [k, s] of Object.entries(item.paramSpecs)) {
        expect(paramLabel(k), `${item.id}.${k}`).not.toBe(k);
        if (s.type === 'enum')
          for (const o of s.options) expect(optionLabel(o), `${item.id}.${k}=${o}`).not.toBe(o);
      }
  });
});

describe('rețete: toți itemii × {min, implicit, max} × variante de parametri', () => {
  it('geometrie validă: fără NaN, cutia părților = dimensiunile cerute', () => {
    let checked = 0;
    for (const item of BUILTIN_ITEMS) {
      for (const size of sizesOf(item)) {
        for (const params of paramVariants(item)) {
          const dims: [number, number, number] = [
            size.widthMm / 1000,
            size.heightMm / 1000,
            size.depthMm / 1000,
          ];
          const { parts, placeholder } = buildParts(item.recipe, dims, params);
          const tag = `${item.id} ${JSON.stringify(size)} ${JSON.stringify(params)}`;
          expect(placeholder, tag).toBe(false);
          expect(parts.length, tag).toBeGreaterThan(0);
          for (const p of parts)
            for (const v of [...p.center, ...p.size]) expect(Number.isFinite(v), tag).toBe(true);
          const b = partsBounds(parts)!;
          // cadrul local: x și z centrate pe amprentă, y de la 0
          expect(b.min[0], tag).toBeCloseTo(-dims[0] / 2, 6);
          expect(b.max[0], tag).toBeCloseTo(dims[0] / 2, 6);
          expect(b.min[1], tag).toBeCloseTo(0, 6);
          expect(b.max[1], tag).toBeCloseTo(dims[1], 6);
          expect(b.min[2], tag).toBeCloseTo(-dims[2] / 2, 6);
          expect(b.max[2], tag).toBeCloseTo(dims[2] / 2, 6);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(600);
  });

  it('plasa: poziții finite, normale unitare, culori 0–1; aceleași intrări ⇒ aceeași plasă', () => {
    for (const item of BUILTIN_ITEMS) {
      const dims: [number, number, number] = [
        item.defaultSize.widthMm / 1000,
        item.defaultSize.heightMm / 1000,
        item.defaultSize.depthMm / 1000,
      ];
      const hex = item.defaultColorHex ?? '#bbbbbb';
      const { parts } = buildParts(item.recipe, dims, defaultParams(item));
      const m = buildMesh(parts, hex);
      expect(m.triangles, item.id).toBeGreaterThan(10);
      expect(m.positions.every(Number.isFinite), item.id).toBe(true);
      for (let i = 0; i < m.normals.length; i += 3)
        expect(Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!)).toBeCloseTo(1, 4);
      expect(Math.max(...m.colors)).toBeLessThanOrEqual(1);
      expect(Math.min(...m.colors)).toBeGreaterThanOrEqual(0);
      const again = buildMesh(buildParts(item.recipe, dims, defaultParams(item)).parts, hex);
      expect(Array.from(again.positions)).toEqual(Array.from(m.positions));
    }
  });

  it('parametrii schimbă geometria (nu sunt decorativi), iar culoarea corpului ajunge în plasă', () => {
    const sofa = getBuiltinItem('living.sofa-3')!;
    const dims: [number, number, number] = [2.1, 0.85, 0.95];
    const n = (seats: number, armrests = true) =>
      buildParts(sofa.recipe, dims, { ...defaultParams(sofa), seats, armrests }).parts.length;
    expect(n(5)).toBeGreaterThan(n(2));
    expect(n(3, false)).toBeLessThan(n(3, true));
    const wardrobe = getBuiltinItem('bedroom.wardrobe')!;
    const fr = (fronts: number) =>
      buildParts(wardrobe.recipe, [1, 2.1, 0.6], { ...defaultParams(wardrobe), fronts }).parts
        .length;
    expect(fr(4)).toBeGreaterThan(fr(1));
    const parts = buildParts(sofa.recipe, dims, defaultParams(sofa)).parts;
    expect(Array.from(buildMesh(parts, '#ff0000').colors)).not.toEqual(
      Array.from(buildMesh(parts, '#0000ff').colors),
    );
  });

  it('rețetă necunoscută sau mai nouă ⇒ cutie de înlocuire la dimensiunile cerute', () => {
    for (const r of [{ id: 'nu-exista', version: 1 }, { id: 'sofa', version: 99 }, null]) {
      const { parts, placeholder } = buildParts(r, [1, 0.8, 0.5], {});
      expect(placeholder).toBe(true);
      expect(parts).toHaveLength(1);
      expect(parts[0]!.shape).toBe('box');
      const b = partsBounds(parts)!;
      expect(b.max[0] - b.min[0]).toBeCloseTo(1, 9);
      expect(b.max[1] - b.min[1]).toBeCloseTo(0.8, 9);
    }
    expect(Object.keys(RECIPES).length).toBeGreaterThanOrEqual(20);
  });
});

describe('căutare', () => {
  it('fără diacritice și pe etichete; filtrare pe categorie', () => {
    expect(searchCatalog('masuta').map((i) => i.id)).toContain('living.coffee-table');
    expect(searchCatalog('MĂSUȚĂ').map((i) => i.id)).toContain('living.coffee-table');
    expect(searchCatalog('wc').map((i) => i.id)).toEqual(['bath.toilet']);
    expect(searchCatalog('', 'baie').every((i) => i.category === 'baie')).toBe(true);
    expect(searchCatalog('canapea', 'baie')).toEqual([]);
    expect(searchCatalog('zzzz')).toEqual([]);
    expect(searchCatalog('').length).toBe(BUILTIN_ITEMS.length);
  });
});
