// Camerele predefinite din paletă (dimensiuni interioare, mm). Doar valori de pornire: după plasare se editează în panou.
import type { RoomPreset } from './types';

export const ROOM_PRESETS: readonly RoomPreset[] = [
  { id: 'living', label: 'Living', type: 'living', widthMm: 5000, depthMm: 4000 },
  { id: 'bedroom', label: 'Dormitor', type: 'bedroom', widthMm: 4000, depthMm: 3500 },
  { id: 'kitchen', label: 'Bucătărie', type: 'kitchen', widthMm: 3000, depthMm: 3000 },
  { id: 'bathroom', label: 'Baie', type: 'bathroom', widthMm: 2000, depthMm: 2500 },
  { id: 'hall', label: 'Hol', type: 'hall', widthMm: 3000, depthMm: 1500 },
  { id: 'office', label: 'Birou', type: 'office', widthMm: 3000, depthMm: 2500 },
  { id: 'other', label: 'Cameră liberă', type: 'other', widthMm: 4000, depthMm: 3000 },
];
