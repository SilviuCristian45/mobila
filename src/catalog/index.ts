// Catalogul încorporat: categorii, căutare, etichete în română pentru parametri și acces la rețete. Pur (fără DOM/Three).
import type { CatalogItem } from '@/domain';
import { BUILTIN_ITEMS } from './items';

export { BUILTIN_ITEMS } from './items';
export { RECIPES, buildParts, resolveRecipe, type Recipe } from './recipes';
export { buildMesh, partTriangles, SEGMENTS, type Mesh } from './mesh';
export { buildPreview, type Preview, type PreviewPolygon } from './preview';
export {
  builder,
  partsBounds,
  roleColor,
  roleMaterial,
  shade,
  slotOfRole,
  slotsOfParts,
  type SlotLook,
  type SlotLooks,
  type ColorRole,
  type Params,
  type Part,
  type Size3,
} from './parts';

export interface CatalogCategory {
  id: string;
  label: string;
}

/** Ordinea de afișare a categoriilor în catalog. */
export const CATEGORIES: readonly CatalogCategory[] = [
  { id: 'living', label: 'Living' },
  { id: 'dormitor', label: 'Dormitor' },
  { id: 'bucatarie', label: 'Bucătărie' },
  { id: 'baie', label: 'Baie' },
  { id: 'electrocasnice', label: 'Electrocasnice' },
  { id: 'iluminat-decor', label: 'Iluminat și decorațiuni' },
  { id: 'diverse', label: 'Diverse' },
];

export const categoryLabel = (id: string): string =>
  CATEGORIES.find((c) => c.id === id)?.label ?? id;

const byId = new Map(BUILTIN_ITEMS.map((i) => [i.id, i]));
export const getBuiltinItem = (id: string): CatalogItem | undefined => byId.get(id);

/** Fără diacritice, litere mici: „Măsuță” ≈ „masuta”. */
export const normalizeText = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Itemii care conțin textul în nume sau etichete (și, opțional, dintr-o singură categorie), în ordinea catalogului. */
export function searchCatalog(
  query: string,
  categoryId: string | null = null,
  items: readonly CatalogItem[] = BUILTIN_ITEMS,
): CatalogItem[] {
  const q = normalizeText(query);
  return items.filter(
    (i) =>
      (categoryId === null || i.category === categoryId) &&
      (q === '' ||
        normalizeText(i.name.ro).includes(q) ||
        (i.tags ?? []).some((t) => normalizeText(t).includes(q))),
  );
}

// ───────────── etichete pentru parametri (spre UI) ─────────────
// Documentul stochează chei și valori tehnice (ASCII); etichetele în română trăiesc aici.

const PARAM_LABELS: Record<string, string> = {
  seats: 'Număr de locuri',
  armrests: 'Cotiere',
  layout: 'Configurație',
  shape: 'Formă',
  legs: 'Picioare',
  fronts: 'Număr de fronturi',
  frontType: 'Tip fronturi',
  handles: 'Mânere',
  base: 'Bază',
  worktop: 'Blat',
  sink: 'Chiuvetă integrată',
  overhangMm: 'Prelungire blat în față (mm)',
  shelves: 'Număr de rafturi',
  back: 'Spate',
  boards: 'Număr de polițe',
  brackets: 'Console',
  type: 'Tip',
  headboard: 'Tăblie',
  drawers: 'Sertare',
  corner: 'Formă blat',
  freezer: 'Congelator',
  knobs: 'Butoane',
  burners: 'Număr de ochiuri',
  loadFromTop: 'Încărcare pe sus',
  style: 'Stil',
  tank: 'Rezervor',
  mount: 'Montaj',
  doorSide: 'Partea ușii',
  enclosure: 'Închidere',
  shade: 'Abajur',
  frame: 'Ramă',
  mat: 'Passe-partout',
  kind: 'Specie',
  backrest: 'Spătar',
  upholstered: 'Tapițat',
};
const OPTION_LABELS: Record<string, string> = {
  straight: 'Dreaptă',
  'corner-left': 'Colț stânga',
  'corner-right': 'Colț dreapta',
  rectangular: 'Dreptunghiulară',
  round: 'Rotundă',
  oval: 'Ovală',
  square: 'Pătrată',
  legs: 'Picioare',
  pedestal: 'Picior central',
  doors: 'Uși',
  drawers: 'Sertare',
  open: 'Deschis (rafturi)',
  plinth: 'Soclu',
  none: 'Fără',
  platform: 'Cu platformă',
  frame: 'Cu cadru și picioare',
  low: 'Joasă',
  high: 'Înaltă',
  left: 'Stânga',
  right: 'Dreapta',
  panels: 'Panouri',
  bottom: 'Jos',
  top: 'Sus',
  chimney: 'Coș',
  flat: 'Plată',
  cistern: 'Cu rezervor',
  concealed: 'Încastrat',
  'built-in': 'Încastrată',
  freestanding: 'Independentă',
  corner: 'Colț',
  'walk-in': 'Walk-in',
  cone: 'Con',
  cylinder: 'Cilindru',
  sphere: 'Sferă',
  disc: 'Disc',
  pendant: 'Pendul',
  thin: 'Subțire',
  thick: 'Groasă',
  ficus: 'Ficus',
  palm: 'Palmier',
  cactus: 'Cactus',
};

export const paramLabel = (key: string): string => PARAM_LABELS[key] ?? key;
export const optionLabel = (option: string): string => OPTION_LABELS[option] ?? option;
