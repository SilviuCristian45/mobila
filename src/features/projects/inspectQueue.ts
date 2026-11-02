// Verificarea sănătății proiectelor din tablou (F-09): `inspect` parsează complet fiecare proiect (schemă, integritate,
// geometrie), deci cardurile nu o mai pornesc toate deodată pe firul principal. Verificările rulează UNA CÂTE UNA, cu o
// cedare a firului între ele, iar rezultatul se memorează pe (manager, proiect, revizie): remontarea unui card sau
// reîncărcarea listei nu repetă verificarea unui proiect nemodificat.
import type { ProjectManager } from '@/state/manager';

type Result = ReturnType<ProjectManager['inspect']>;

const cache = new WeakMap<ProjectManager, Map<string, Result>>();
const tails = new WeakMap<ProjectManager, Promise<unknown>>();

const yieldToBrowser = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export function inspectQueued(manager: ProjectManager, id: string, revision: number): Result {
  let perManager = cache.get(manager);
  if (!perManager) {
    perManager = new Map();
    cache.set(manager, perManager);
  }
  const key = `${id}:${revision}`;
  const hit = perManager.get(key);
  if (hit) return hit;
  const previous = tails.get(manager) ?? Promise.resolve();
  const run = previous.then(yieldToBrowser).then(() => manager.inspect(id));
  tails.set(
    manager,
    run.catch(() => undefined),
  );
  perManager.set(key, run);
  return run;
}
