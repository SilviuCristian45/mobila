// Catalogul încorporat de materiale (36), ca `Finish`-uri gata de copiat în `catalogSnapshot`. Date statice, offline.
// Prețurile sunt DEMONSTRATIVE (`priceOrigin: 'demo'`, RON, vezi docs/PRICING_NOTES.md): nu sunt prețuri de piață.
import type { Finish, FinishSurface } from '@/domain';

export interface MaterialCategory {
  id: string;
  label: string;
}
export const MATERIAL_CATEGORIES: readonly MaterialCategory[] = [
  { id: 'pardoseli', label: 'Pardoseli' },
  { id: 'pereti', label: 'Pereți' },
  { id: 'alte-suprafete', label: 'Alte suprafețe' },
  { id: 'mobilier', label: 'Mobilier' },
];

const provenance = { origin: 'original', license: 'proprietar-proiect' } as const;
type Pattern = Extract<Finish['appearance']['texture'], { type: 'procedural' }>['pattern'];

interface Tex {
  pattern: Pattern;
  accent: string;
  offset?: 0 | 33 | 50;
  tone: number;
  seed: number;
}
interface Common {
  id: string;
  name: string;
  category: string;
  color: string;
  roughness: number;
  metalness?: number;
  opacity?: number;
  /** preț demonstrativ în RON, pe unitatea de preț a materialului */
  price: number;
  tex?: Tex;
  surfaces?: FinishSurface[];
  waste?: number;
}

function appearance(c: Common): Finish['appearance'] {
  return {
    baseColorHex: c.color,
    roughness: c.roughness,
    ...(c.metalness !== undefined ? { metalness: c.metalness } : {}),
    ...(c.opacity !== undefined ? { opacity: c.opacity } : {}),
    texture: c.tex
      ? {
          type: 'procedural',
          pattern: c.tex.pattern,
          groutColorHex: c.tex.accent,
          offsetPct: c.tex.offset ?? 0,
          toneVariation: c.tex.tone,
          seed: c.tex.seed,
        }
      : { type: 'solid' },
  };
}
const base = (c: Common) => ({
  id: c.id,
  version: 1,
  name: { ro: c.name },
  category: c.category,
  appearance: appearance(c),
  unitPriceMinor: Math.round(c.price * 100),
  priceOrigin: 'demo' as const,
  defaultWastePct: c.waste ?? 10,
  provenance,
});

/** Placă/scândură/lamă: `kind` tile | wall_tile | parquet, cu dimensiunile piesei și rostul. */
function tiled(
  kind: 'tile' | 'wall_tile' | 'parquet',
  c: Common,
  w: number,
  h: number,
  grout: number,
): Finish {
  return {
    ...base(c),
    kind,
    ...(c.surfaces ? { surfaces: c.surfaces } : {}),
    priceUnit: 'm2',
    tile: { pieceWidthMm: w, pieceHeightMm: h, groutMm: grout },
  };
}
/** Vopsea: doze de 10 L, randament 10 m²/L, 2 straturi. */
function paint(c: Common): Finish {
  return {
    ...base(c),
    kind: 'paint',
    priceUnit: 'can',
    paint: { coverageM2PerLiter: 10, coats: 2, canVolumeLiters: 10 },
    defaultWastePct: c.waste ?? 5,
  };
}
/** Suprafață generică la m² (beton, piatră, tapet, lemn, metal, sticlă). */
function surface(c: Common, surfaces: FinishSurface[]): Finish {
  return { ...base(c), kind: 'surface', surfaces, priceUnit: 'm2' };
}
/** Finisaj de mobilier: preț pe zonă finisată (supliment față de prețul obiectului). */
function furniture(c: Common): Finish {
  return {
    ...base(c),
    kind: 'furniture',
    surfaces: ['object'],
    priceUnit: 'piece',
    defaultWastePct: 0,
  };
}

const P = 'pardoseli',
  W = 'pereti',
  A = 'alte-suprafete',
  M = 'mobilier';

export const BUILTIN_MATERIALS: readonly Finish[] = [
  // ───────────── Pardoseli ─────────────
  tiled(
    'parquet',
    {
      id: 'mat.parquet.oak-light',
      name: 'Parchet stejar deschis',
      category: P,
      color: '#cfae80',
      roughness: 0.55,
      price: 145,
      tex: { pattern: 'plank', accent: '#8d6d48', offset: 33, tone: 0.5, seed: 11 },
    },
    140,
    1200,
    0,
  ),
  tiled(
    'parquet',
    {
      id: 'mat.parquet.oak-natural',
      name: 'Parchet stejar natur',
      category: P,
      color: '#b9834f',
      roughness: 0.55,
      price: 165,
      tex: { pattern: 'plank', accent: '#7a4f2c', offset: 33, tone: 0.55, seed: 12 },
    },
    140,
    1200,
    0,
  ),
  tiled(
    'parquet',
    {
      id: 'mat.parquet.dark',
      name: 'Parchet închis',
      category: P,
      color: '#5b3f2d',
      roughness: 0.5,
      price: 185,
      tex: { pattern: 'plank', accent: '#2f1f15', offset: 50, tone: 0.45, seed: 13 },
    },
    140,
    1200,
    0,
  ),
  tiled(
    'parquet',
    {
      id: 'mat.laminate.grey',
      name: 'Laminat gri',
      category: P,
      color: '#8d8f91',
      roughness: 0.62,
      price: 65,
      tex: { pattern: 'plank', accent: '#5f6163', offset: 33, tone: 0.35, seed: 14 },
    },
    192,
    1285,
    0,
  ),
  tiled(
    'tile',
    {
      id: 'mat.tile.white',
      name: 'Gresie albă',
      category: P,
      color: '#eeeeec',
      roughness: 0.3,
      price: 70,
      tex: { pattern: 'tile_grid', accent: '#c9c9c7', tone: 0.15, seed: 21 },
    },
    600,
    600,
    2,
  ),
  tiled(
    'tile',
    {
      id: 'mat.tile.grey',
      name: 'Gresie gri',
      category: P,
      color: '#9a9c9e',
      roughness: 0.4,
      price: 75,
      tex: { pattern: 'tile_grid', accent: '#6f7173', tone: 0.3, seed: 22 },
    },
    600,
    600,
    2,
  ),
  tiled(
    'tile',
    {
      id: 'mat.tile.marble',
      name: 'Gresie cu aspect de marmură',
      category: P,
      color: '#e9e6e0',
      roughness: 0.2,
      price: 120,
      tex: { pattern: 'marble_tile', accent: '#8c8883', tone: 0.5, seed: 23 },
    },
    600,
    600,
    2,
  ),
  surface(
    {
      id: 'mat.concrete.polished',
      name: 'Beton șlefuit',
      category: P,
      color: '#9c9b98',
      roughness: 0.45,
      price: 130,
      tex: { pattern: 'speckle', accent: '#6e6d6a', tone: 0.5, seed: 31 },
    },
    ['floor', 'wall'],
  ),
  surface(
    {
      id: 'mat.stone.natural',
      name: 'Piatră naturală',
      category: P,
      color: '#a59c8c',
      roughness: 0.7,
      price: 190,
      tex: { pattern: 'flagstone', accent: '#6c6457', tone: 0.6, seed: 32 },
    },
    ['floor', 'wall'],
  ),

  // ───────────── Pereți ─────────────
  paint({
    id: 'mat.paint.white-matt',
    name: 'Alb mat',
    category: W,
    color: '#f4f4f2',
    roughness: 0.95,
    price: 220,
  }),
  paint({
    id: 'mat.paint.white-warm',
    name: 'Alb cald',
    category: W,
    color: '#f0e9db',
    roughness: 0.95,
    price: 230,
  }),
  paint({
    id: 'mat.paint.grey-light',
    name: 'Gri deschis',
    category: W,
    color: '#d3d4d4',
    roughness: 0.9,
    price: 240,
  }),
  paint({
    id: 'mat.paint.anthracite',
    name: 'Gri antracit',
    category: W,
    color: '#4a4d52',
    roughness: 0.85,
    price: 280,
  }),
  paint({
    id: 'mat.paint.beige',
    name: 'Bej',
    category: W,
    color: '#d8c8ac',
    roughness: 0.9,
    price: 240,
  }),
  paint({
    id: 'mat.paint.sage',
    name: 'Verde salvie',
    category: W,
    color: '#9bae97',
    roughness: 0.9,
    price: 260,
  }),
  paint({
    id: 'mat.paint.blue',
    name: 'Albastru',
    category: W,
    color: '#7e9eb7',
    roughness: 0.9,
    price: 260,
  }),
  paint({
    id: 'mat.paint.terracotta',
    name: 'Teracotă',
    category: W,
    color: '#c3805f',
    roughness: 0.9,
    price: 270,
  }),
  paint({
    id: 'mat.paint.decorative',
    name: 'Vopsea decorativă',
    category: W,
    color: '#c9bfae',
    roughness: 0.8,
    price: 420,
    tex: { pattern: 'speckle', accent: '#a99d89', tone: 0.45, seed: 41 },
  }),
  surface(
    {
      id: 'mat.concrete.exposed',
      name: 'Beton aparent',
      category: W,
      color: '#a8a7a3',
      roughness: 0.85,
      price: 110,
      tex: { pattern: 'speckle', accent: '#76746f', tone: 0.7, seed: 42 },
    },
    ['wall'],
  ),
  surface(
    {
      id: 'mat.wallpaper.discreet',
      name: 'Tapet cu model discret',
      category: W,
      color: '#e6dfd2',
      roughness: 0.9,
      price: 75,
      tex: { pattern: 'wallpaper', accent: '#c4b8a4', tone: 0.2, seed: 43 },
    },
    ['wall'],
  ),

  // ───────────── Alte suprafețe ─────────────
  tiled(
    'wall_tile',
    {
      id: 'mat.wtile.white',
      name: 'Faianță albă',
      category: A,
      color: '#f3f3f1',
      roughness: 0.15,
      price: 85,
      tex: { pattern: 'tile_grid', accent: '#d4d4d2', tone: 0.1, seed: 51 },
    },
    300,
    600,
    2,
  ),
  tiled(
    'wall_tile',
    {
      id: 'mat.wtile.metro',
      name: 'Faianță tip metro',
      category: A,
      color: '#f4f4f2',
      roughness: 0.1,
      price: 95,
      tex: { pattern: 'tile_grid', accent: '#cfcfcd', offset: 50, tone: 0.2, seed: 52 },
    },
    75,
    150,
    2,
  ),
  tiled(
    'wall_tile',
    {
      id: 'mat.wtile.marble',
      name: 'Faianță marmură',
      category: A,
      color: '#eceae6',
      roughness: 0.15,
      price: 140,
      tex: { pattern: 'marble_tile', accent: '#8f8b86', tone: 0.5, seed: 53 },
    },
    300,
    600,
    2,
  ),
  tiled(
    'wall_tile',
    {
      id: 'mat.wtile.decorative',
      name: 'Faianță decorativă',
      category: A,
      color: '#3f7f86',
      roughness: 0.2,
      price: 130,
      tex: { pattern: 'tile_grid', accent: '#e2e2e0', tone: 0.7, seed: 54 },
    },
    200,
    200,
    2,
  ),
  surface(
    {
      id: 'mat.wood.natural',
      name: 'Lemn natur',
      category: A,
      color: '#c19b6c',
      roughness: 0.6,
      price: 160,
      tex: { pattern: 'plank', accent: '#80603c', offset: 50, tone: 0.5, seed: 61 },
    },
    ['wall', 'floor'],
  ),
  surface(
    {
      id: 'mat.wood.dark',
      name: 'Lemn închis',
      category: A,
      color: '#4f3727',
      roughness: 0.55,
      price: 175,
      tex: { pattern: 'plank', accent: '#2a1c12', offset: 50, tone: 0.45, seed: 62 },
    },
    ['wall', 'floor'],
  ),
  surface(
    {
      id: 'mat.metal.black',
      name: 'Metal negru',
      category: A,
      color: '#2c2c2f',
      roughness: 0.45,
      metalness: 0.85,
      price: 240,
    },
    ['wall'],
  ),
  surface(
    {
      id: 'mat.metal.chrome',
      name: 'Metal cromat',
      category: A,
      color: '#d9dce0',
      roughness: 0.12,
      metalness: 1,
      price: 320,
    },
    ['wall'],
  ),
  surface(
    {
      id: 'mat.glass.clear',
      name: 'Sticlă',
      category: A,
      color: '#bdd7e4',
      roughness: 0.05,
      metalness: 0.1,
      opacity: 0.35,
      price: 280,
    },
    ['wall'],
  ),

  // ───────────── Mobilier (preț = supliment pe zonă finisată) ─────────────
  furniture({
    id: 'mat.furn.mdf-white',
    name: 'MDF alb mat',
    category: M,
    color: '#f1f1ee',
    roughness: 0.9,
    price: 60,
  }),
  furniture({
    id: 'mat.furn.mdf-grey',
    name: 'MDF gri',
    category: M,
    color: '#8f9396',
    roughness: 0.85,
    price: 60,
  }),
  furniture({
    id: 'mat.furn.wood-natural',
    name: 'Lemn natur',
    category: M,
    color: '#c19a6b',
    roughness: 0.6,
    price: 220,
    tex: { pattern: 'plank', accent: '#80603c', offset: 50, tone: 0.5, seed: 71 },
  }),
  furniture({
    id: 'mat.furn.wood-dark',
    name: 'Lemn închis',
    category: M,
    color: '#4f3727',
    roughness: 0.55,
    price: 250,
    tex: { pattern: 'plank', accent: '#2a1c12', offset: 50, tone: 0.45, seed: 72 },
  }),
  furniture({
    id: 'mat.furn.gloss-white',
    name: 'Finisaj lucios alb',
    category: M,
    color: '#f6f6f4',
    roughness: 0.12,
    price: 180,
  }),
  furniture({
    id: 'mat.furn.matte-black',
    name: 'Finisaj negru mat',
    category: M,
    color: '#262628',
    roughness: 0.9,
    price: 150,
  }),
  furniture({
    id: 'mat.furn.metallic',
    name: 'Finisaj metalic',
    category: M,
    color: '#b4b8bd',
    roughness: 0.3,
    metalness: 0.9,
    price: 300,
  }),
];
