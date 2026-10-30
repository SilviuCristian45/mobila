import { describe, expect, it } from 'vitest';
import {
  FinishSchema,
  finishConfigProblems,
  finishSurfaces,
  resolveLook,
  type Finish,
  type ResolvedTexture,
} from '@/domain';
import {
  BUILTIN_MATERIALS,
  MATERIAL_CATEGORIES,
  TEXTURE_PX,
  encodeBmpDataUrl,
  generateTexture,
  getBuiltinMaterial,
  searchMaterials,
  swatchDataUrl,
  swatchRgba,
  textureHash,
  textureKey,
  textureLayout,
  uvTransform,
} from '@/materials';

const NAMES_REQUIRED = [
  // pardoseli
  'Parchet stejar deschis',
  'Parchet stejar natur',
  'Parchet închis',
  'Laminat gri',
  'Gresie albă',
  'Gresie gri',
  'Gresie cu aspect de marmură',
  'Beton șlefuit',
  'Piatră naturală',
  // pereți
  'Alb mat',
  'Alb cald',
  'Gri deschis',
  'Gri antracit',
  'Bej',
  'Verde salvie',
  'Albastru',
  'Vopsea decorativă',
  'Beton aparent',
  'Tapet cu model discret',
  // alte suprafețe
  'Faianță albă',
  'Faianță tip metro',
  'Faianță marmură',
  'Faianță decorativă',
  'Lemn natur',
  'Lemn închis',
  'Metal negru',
  'Metal cromat',
  'Sticlă',
];
const FURNITURE_REQUIRED = [
  'MDF alb mat',
  'MDF gri',
  'Lemn natur',
  'Lemn închis',
  'Finisaj lucios alb',
  'Finisaj negru mat',
  'Finisaj metalic',
];

const texOf = (m: Finish): ResolvedTexture | null => resolveLook(m).texture;

describe('catalogul de materiale', () => {
  it('conține toate materialele cerute, în categoriile lor, cu ID-uri unice', () => {
    const ids = BUILTIN_MATERIALS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^mat\.[a-z-]+\.[a-z0-9-]+$/);
    const names = (cat: string) =>
      BUILTIN_MATERIALS.filter((m) => m.category === cat).map((m) => m.name.ro);
    const nonFurn = BUILTIN_MATERIALS.filter((m) => m.kind !== 'furniture').map((m) => m.name.ro);
    for (const n of NAMES_REQUIRED) expect(nonFurn, n).toContain(n);
    for (const n of FURNITURE_REQUIRED) expect(names('mobilier'), n).toContain(n);
    expect(MATERIAL_CATEGORIES.map((c) => c.id)).toEqual([
      'pardoseli',
      'pereti',
      'alte-suprafete',
      'mobilier',
    ]);
    for (const m of BUILTIN_MATERIALS)
      expect(MATERIAL_CATEGORIES.map((c) => c.id)).toContain(m.category);
    expect(BUILTIN_MATERIALS.length).toBeGreaterThanOrEqual(35);
  });

  it('fiecare definiție respectă schema și regulile de configurare; licență, nume în română, preț demonstrativ', () => {
    for (const m of BUILTIN_MATERIALS) {
      const r = FinishSchema.safeParse(m);
      expect(r.success, `${m.id}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
      expect(finishConfigProblems(m), m.id).toEqual([]);
      expect(m.provenance.license.length, m.id).toBeGreaterThan(0);
      expect(m.priceOrigin, m.id).toBe('demo');
      expect(m.unitPriceMinor, m.id).toBeGreaterThan(0);
      expect(m.name.ro.length, m.id).toBeGreaterThan(2);
      expect(JSON.parse(JSON.stringify(m)), m.id).toEqual(m); // JSON pur
    }
  });

  it('compatibilitatea e coerentă cu categoria: pardoseli → podea; vopsele → perete; mobilier → obiect', () => {
    for (const m of BUILTIN_MATERIALS) {
      const s = finishSurfaces(m);
      if (m.category === 'pardoseli') expect(s, m.id).toContain('floor');
      if (m.kind === 'paint') expect(s, m.id).toEqual(['wall']);
      if (m.category === 'mobilier') expect(s, m.id).toEqual(['object']);
      if (m.kind === 'furniture') expect(m.priceUnit).toBe('piece');
    }
  });

  it('proprietăți vizuale potrivite tipului: metale metalice, sticlă transparentă, vopsele uniforme, lemnul cu fibre', () => {
    const g = (id: string) => getBuiltinMaterial(id)!;
    expect(g('mat.metal.chrome').appearance.metalness).toBe(1);
    expect(g('mat.metal.black').appearance.metalness).toBeGreaterThan(0.5);
    expect(g('mat.glass.clear').appearance.opacity).toBeLessThan(0.5);
    expect(g('mat.paint.white-matt').appearance.texture.type).toBe('solid');
    expect(g('mat.paint.white-matt').appearance.roughness).toBeGreaterThan(0.8);
    expect(g('mat.furn.gloss-white').appearance.roughness).toBeLessThan(0.2);
    for (const id of [
      'mat.parquet.oak-light',
      'mat.parquet.dark',
      'mat.laminate.grey',
      'mat.wood.natural',
    ]) {
      const t = texOf(g(id))!;
      expect(t.pattern, id).toBe('plank');
      expect(t.pieceWidthMm, id).toBeLessThan(t.pieceHeightMm); // scândură: lățime < lungime
    }
    expect(texOf(g('mat.tile.white'))).toMatchObject({
      pattern: 'tile_grid',
      pieceWidthMm: 600,
      groutMm: 2,
    });
    expect(texOf(g('mat.wtile.metro'))).toMatchObject({
      pattern: 'tile_grid',
      offsetPct: 50,
      pieceWidthMm: 75,
      pieceHeightMm: 150,
    });
    expect(texOf(g('mat.tile.marble'))!.pattern).toBe('marble_tile');
    expect(texOf(g('mat.concrete.polished'))!.pattern).toBe('speckle');
    expect(texOf(g('mat.stone.natural'))!.pattern).toBe('flagstone');
    expect(texOf(g('mat.wallpaper.discreet'))!.pattern).toBe('wallpaper');
  });

  it('căutare după nume (fără diacritice), filtrare pe suprafață și categorie', () => {
    const names = (q: string, o = {}) => searchMaterials(q, o).map((m) => m.name.ro);
    expect(names('parchet')).toEqual(
      expect.arrayContaining(['Parchet stejar deschis', 'Parchet închis']),
    );
    expect(names('faianta')).toHaveLength(4);
    expect(names('MARMURĂ')).toHaveLength(2);
    expect(
      searchMaterials('', { surface: 'floor' }).every((m) => finishSurfaces(m).includes('floor')),
    ).toBe(true);
    expect(searchMaterials('', { surface: 'floor' }).some((m) => m.kind === 'paint')).toBe(false);
    expect(searchMaterials('', { surface: 'object' }).every((m) => m.kind === 'furniture')).toBe(
      true,
    );
    expect(
      searchMaterials('', { surface: 'wall', category: 'pereti' }).every(
        (m) => m.category === 'pereti',
      ),
    ).toBe(true);
    expect(searchMaterials('zzz')).toEqual([]);
  });
});

describe('texturi procedurale', () => {
  const textured = BUILTIN_MATERIALS.filter((m) => m.appearance.texture.type === 'procedural');

  it('fiecare model de textură se generează valid: dimensiuni, octeți în interval, opac, mărime rezonabilă', () => {
    const patterns = new Set<string>();
    for (const m of textured) {
      const look = resolveLook(m);
      const td = generateTexture(look.texture!, look.baseColorHex);
      patterns.add(look.texture!.pattern);
      expect(td.width).toBe(TEXTURE_PX);
      expect(td.height).toBe(TEXTURE_PX);
      expect(td.data.length).toBe(TEXTURE_PX * TEXTURE_PX * 4);
      expect(td.data.length).toBeLessThanOrEqual(512 * 1024); // textură mică, reutilizabilă
      for (let i = 3; i < td.data.length; i += 4)
        if (td.data[i] !== 255) throw new Error(`${m.id}: pixel transparent`);
      expect(td.worldWidthMm).toBeGreaterThan(0);
      expect(td.worldHeightMm).toBeGreaterThan(0);
    }
    expect([...patterns].sort()).toEqual(
      ['flagstone', 'plank', 'marble_tile', 'speckle', 'tile_grid', 'wallpaper'].sort(),
    );
    // modelul „brushed” (metal periat) există și produce o textură validă
    const brushed: ResolvedTexture = {
      ...texOf(getBuiltinMaterial('mat.parquet.oak-light')!)!,
      pattern: 'brushed',
      pieceWidthMm: 500,
      pieceHeightMm: 500,
    };
    const td = generateTexture(brushed, '#b0b4b8');
    expect(td.data.length).toBe(TEXTURE_PX * TEXTURE_PX * 4);
  });

  it('DETERMINISM: aceleași intrări ⇒ aceiași octeți (de fiecare dată); seed, culoare sau model diferite ⇒ alte texturi', () => {
    for (const m of textured) {
      const look = resolveLook(m);
      const a = textureHash(generateTexture(look.texture!, look.baseColorHex));
      const b = textureHash(generateTexture({ ...look.texture! }, look.baseColorHex));
      expect(a, m.id).toBe(b);
    }
    const oak = resolveLook(getBuiltinMaterial('mat.parquet.oak-light')!);
    const base = textureHash(generateTexture(oak.texture!, oak.baseColorHex));
    expect(
      textureHash(
        generateTexture({ ...oak.texture!, seed: oak.texture!.seed + 1 }, oak.baseColorHex),
      ),
    ).not.toBe(base);
    expect(textureHash(generateTexture(oak.texture!, '#000000'))).not.toBe(base);
    expect(
      textureHash(generateTexture({ ...oak.texture!, toneVariation: 0.1 }, oak.baseColorHex)),
    ).not.toBe(base);
  });

  it('cheia texturii depinde de conținut, NU de scara/rotația aplicării (o textură pentru toate scările)', () => {
    const oak = getBuiltinMaterial('mat.parquet.oak-light')!;
    const k = (look: object) => {
      const l = resolveLook(oak, look);
      return textureKey(l.texture!, l.baseColorHex);
    };
    expect(k({})).toBe(k({ textureScale: 3, textureRotationDeg: 45 }));
    expect(k({})).toBe(textureKey(resolveLook(oak).texture!, oak.appearance.baseColorHex));
    expect(k({})).not.toBe(
      textureKey(resolveLook(getBuiltinMaterial('mat.parquet.dark')!).texture!, '#5b3f2d'),
    );
    // dar aspectul (cheia de look) diferă la altă scară sau rotație
    expect(resolveLook(oak, { textureScale: 2 }).key).not.toBe(resolveLook(oak).key);
    expect(resolveLook(oak, { textureRotationDeg: 90 }).key).not.toBe(resolveLook(oak).key);
    expect(resolveLook(oak).key).toBe(resolveLook(oak).key);
  });

  it('TILEABIL: la fibre, beton, piatră, tapet cusătura nu iese din variația dintre pixeli vecini; plăcile acoperă piese întregi', () => {
    for (const m of textured) {
      const look = resolveLook(m);
      const t = look.texture!;
      if (t.pattern === 'tile_grid' || t.pattern === 'marble_tile') {
        // plăcile: modulul acoperă un număr ÎNTREG de piese cu rost (rostul de la marginea dreaptă/de jos continuă cu placa următoare)
        const L = textureLayout(t);
        const pw = t.pieceWidthMm + t.groutMm;
        const ph = t.pieceHeightMm + t.groutMm;
        expect(L.worldW % pw, m.id).toBe(0);
        expect(L.worldH % ph, m.id).toBe(0);
        expect(L.rows % (t.offsetPct === 33 ? 3 : t.offsetPct === 50 ? 2 : 1), m.id).toBe(0);
        continue;
      }
      const td = generateTexture(t, look.baseColorHex);
      const px = td.width;
      const lum = (x: number, y: number) => {
        const o = (y * px + x) * 4;
        return 0.3 * td.data[o]! + 0.59 * td.data[o + 1]! + 0.11 * td.data[o + 2]!;
      };
      const seamH: number[] = [],
        innerH: number[] = [],
        seamV: number[] = [],
        innerV: number[] = [];
      for (let i = 0; i < px; i++) {
        seamH.push(Math.abs(lum(px - 1, i) - lum(0, i)));
        seamV.push(Math.abs(lum(i, px - 1) - lum(i, 0)));
        const x = 40 + (i % (px - 80));
        innerH.push(Math.abs(lum(x, i) - lum(x + 1, i)));
        innerV.push(Math.abs(lum(i, x) - lum(i, x + 1)));
      }
      const med = (v: number[]) => [...v].sort((p, q) => p - q)[Math.floor(v.length / 2)]!;
      // mediana (robustă la rosturile reale care cad exact pe marginea modulului): cusătura nu iese din ordinul variației dintre pixeli vecini
      expect(med(seamH)).toBeLessThanOrEqual(med(innerH) * 3 + 4);
      expect(med(seamV)).toBeLessThanOrEqual(med(innerV) * 3 + 4);
    }
  });

  it('modul mare: parchetul acoperă ≥ 2 scânduri pe rând și zeci de scânduri (fără repetiție evidentă la scară mică)', () => {
    const oak = resolveLook(getBuiltinMaterial('mat.parquet.oak-light')!).texture!;
    const L = textureLayout(oak);
    expect(L.cols).toBe(2);
    expect(L.rows).toBeGreaterThanOrEqual(10);
    expect(L.worldW).toBe(2 * 1200);
    expect(L.worldH).toBeGreaterThan(1500);
    // variația de ton între scânduri e reală: nu toate rândurile au aceeași medie
    const td = generateTexture(oak, '#cfae80');
    const rowMeans: number[] = [];
    for (let r = 0; r < L.rows; r++) {
      let s = 0,
        c = 0;
      for (
        let y = Math.floor((r * TEXTURE_PX) / L.rows) + 2;
        y < Math.floor(((r + 1) * TEXTURE_PX) / L.rows) - 2;
        y++
      )
        for (let x = 0; x < TEXTURE_PX; x++) {
          s += td.data[(y * TEXTURE_PX + x) * 4]!;
          c++;
        }
      rowMeans.push(s / c);
    }
    expect(Math.max(...rowMeans) - Math.min(...rowMeans)).toBeGreaterThan(4);
  });

  it('gresia are rosturi (pixeli de culoarea rostului) și variație de ton între plăci; tapetul e discret', () => {
    const tile = resolveLook(getBuiltinMaterial('mat.tile.grey')!);
    const td = generateTexture(tile.texture!, tile.baseColorHex);
    const grout = [0xc9, 0xc9, 0xc7];
    let near = 0;
    const g = parseInt(tile.texture!.groutColorHex.slice(1, 3), 16);
    for (let i = 0; i < td.data.length; i += 4) if (Math.abs(td.data[i]! - g) <= 2) near++;
    expect(near).toBeGreaterThan(TEXTURE_PX * 2); // cel puțin câteva linii de rost
    expect(grout.length).toBe(3);
    const paper = resolveLook(getBuiltinMaterial('mat.wallpaper.discreet')!);
    const pd = generateTexture(paper.texture!, paper.baseColorHex);
    let min = 255,
      max = 0;
    for (let i = 0; i < pd.data.length; i += 4) {
      min = Math.min(min, pd.data[i]!);
      max = Math.max(max, pd.data[i]!);
    }
    expect(max - min).toBeLessThan(80); // model discret, nu contrast puternic
  });

  it('generarea tuturor texturilor rămâne rapidă (< 2 s în total)', () => {
    const t0 = performance.now();
    for (const m of textured) {
      const look = resolveLook(m);
      generateTexture(look.texture!, look.baseColorHex);
    }
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe('UV: scara și rotația aplicării', () => {
  const oak = resolveLook(getBuiltinMaterial('mat.parquet.oak-light')!).texture!;
  it('scara 1 = dimensiuni reale; scara 2 întinde textura; rotația 90° schimbă axele; deterministe', () => {
    const L = textureLayout(oak);
    const u1 = uvTransform(oak);
    expect(u1(L.worldW, 0)[0]).toBeCloseTo(1, 9);
    expect(u1(0, L.worldH)[1]).toBeCloseTo(1, 9);
    expect(uvTransform({ ...oak, scale: 2 })(L.worldW, 0)[0]).toBeCloseTo(0.5, 9);
    expect(uvTransform({ ...oak, scale: 0.5 })(L.worldW, 0)[0]).toBeCloseTo(2, 9);
    const r = uvTransform({ ...oak, rotationDeg: 90 })(1000, 0);
    expect(r[0]).toBeCloseTo(0, 9);
    expect(r[1]).toBeCloseTo(1000 / L.worldH, 9);
    expect(uvTransform(oak)(123, 456)).toEqual(uvTransform({ ...oak })(123, 456));
  });
});

describe('miniaturi (BMP în data-URL)', () => {
  it('BMP valid: antet, dimensiuni, pixelii în ordinea BGR de jos în sus', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 10, 20, 30, 255]); // 2×2
    const url = encodeBmpDataUrl(rgba, 2, 2);
    expect(url.startsWith('data:image/bmp;base64,')).toBe(true);
    const bin = Uint8Array.from(atob(url.split(',')[1]!), (c) => c.charCodeAt(0));
    expect(String.fromCharCode(bin[0]!, bin[1]!)).toBe('BM');
    const dv = new DataView(bin.buffer);
    expect(dv.getInt32(18, true)).toBe(2);
    expect(dv.getInt32(22, true)).toBe(2);
    expect(dv.getUint16(28, true)).toBe(24);
    expect(bin.length).toBe(54 + 8 * 2); // rânduri de 6 B rotunjite la 8
    // primul rând din fișier = ultimul rând din imagine (jos): (0,0,255)→BGR=255,0,0 apoi (10,20,30)→30,20,10
    expect([...bin.slice(54, 60)]).toEqual([255, 0, 0, 30, 20, 10]);
  });

  it('fiecare material are o miniatură determinată, distinctă și memorată', () => {
    const urls = new Set<string>();
    for (const m of BUILTIN_MATERIALS) {
      const look = resolveLook(m);
      const a = swatchDataUrl(look);
      expect(a).toBe(swatchDataUrl(look));
      expect(a.length).toBeGreaterThan(2000);
      urls.add(a);
    }
    expect(urls.size).toBeGreaterThan(BUILTIN_MATERIALS.length - 6); // câteva materiale pot arăta la fel (ex. două tonuri apropiate)
    const rgba = swatchRgba(resolveLook(getBuiltinMaterial('mat.glass.clear')!));
    expect(rgba.length).toBe(64 * 64 * 4);
  });
});
