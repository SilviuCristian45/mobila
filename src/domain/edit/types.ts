// Tipuri comune ale operațiilor de editare (separate ca `index` și `shared` să nu depindă ciclic unul de altul).
import type { Pt } from '../geometry';

export type IdGenerator = () => string;

export interface NewRectRoom {
  /** Dimensiuni interioare (față interioară la față interioară), mm. */
  widthMm: number;
  depthMm: number;
  /** Colțul interior stânga-sus. */
  anchor: Pt;
  thicknessMm?: number;
  name?: string;
}
