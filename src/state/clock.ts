// Ceas și temporizatoare injectabile: strat de stare, nu domeniu (domeniul nu citește ceasul). Permite teste deterministe.
export interface Clock {
  nowMs(): number;
  nowIso(): string;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export const systemClock: Clock = {
  nowMs: () => Date.now(),
  nowIso: () => new Date().toISOString(),
  setTimer: (cb, ms) => setTimeout(cb, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};
