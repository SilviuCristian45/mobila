/** Verificare WebGL (doar pe client): fără ea, un canvas gol n-ar avea nicio explicație. Rezultatul se memorează. */
let cached: boolean | undefined;
export function webglAvailable(): boolean {
  if (cached !== undefined) return cached;
  try {
    const c = document.createElement('canvas');
    cached = !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    cached = false;
  }
  return cached;
}
