// Etichete în română pentru categoriile și unitățile bugetului (folosite de interfață și de exporturi).
import type { BudgetCategory, Unit } from '../schema';

export const CATEGORY_LABELS_RO: Record<BudgetCategory, string> = {
  furniture: 'Mobilier',
  sanitary: 'Obiecte sanitare',
  mirror: 'Oglinzi',
  lighting: 'Iluminat',
  decor: 'Decor',
  flooring: 'Pardoseli',
  wall_finish: 'Finisaje de perete',
  paint: 'Vopsea',
  labor: 'Manoperă',
  transport: 'Transport',
  other: 'Altele',
};

export const UNIT_LABELS_RO: Record<Unit, string> = {
  buc: 'buc',
  m2: 'm²',
  ml: 'ml',
  l: 'l',
  cutie: 'cutie',
  doza: 'doză',
  h: 'oră',
  zi: 'zi',
  lot: 'lot',
};

/** `demo` = preț demonstrativ din catalog (nu e preț de piață); `user` = introdus sau editat de utilizator. */
export const PRICE_SOURCE_LABELS_RO = {
  demo: 'Preț demonstrativ',
  user: 'Introdus de utilizator',
} as const;

/** Numele afișat al „camerei” unei linii; `none` = linie fără cameră. */
export const roomLabel = (
  rooms: Readonly<Record<string, { name: string }>>,
  roomId: string,
): string => (roomId === 'none' ? 'Fără cameră' : (rooms[roomId]?.name ?? roomId));
