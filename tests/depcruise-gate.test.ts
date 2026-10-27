import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const bin = 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs';
const run = (dir: string, extra: string[] = []) =>
  spawnSync(process.execPath, [bin, dir, '--config', '.dependency-cruiser.cjs', ...extra], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

type Violation = { rule: { name: string }; from: string };
// Codul de ieșire îl dă raportorul implicit (același folosit de `pnpm depcruise` și de CI);
// raportorul JSON întoarce mereu 0, deci îl folosim doar pentru detalii.
const details = (dir: string): Violation[] =>
  JSON.parse(run(dir, ['--output-type', 'json']).stdout).summary.violations;

describe('dependency-cruiser: încălcările regulilor de straturi eșuează explicit', () => {
  const bad = 'tests/fixtures/gates/depcruise/violations';

  it('fixture cu încălcări → cod ≠ 0 și toate cele 8 reguli declanșate', () => {
    expect(run(bad).status).toBe(details(bad).length); // codul de ieșire = numărul de încălcări „error”
    expect(details(bad).length).toBeGreaterThanOrEqual(9);
    const rules = [...new Set(details(bad).map((v) => v.rule.name))].sort();
    expect(rules).toEqual([
      'app-fara-domain',
      'domain-este-pur',
      'fara-dependente-circulare',
      'features-fara-persistence',
      'features-izolate',
      'persistence-fara-ui',
      'state-fara-features',
      'state-persistence-doar-interfata',
    ]);
  });
  it('domain/ care importă React și un modul Node este semnalat pe ambele fișiere', () => {
    const sources = details(bad)
      .filter((v) => v.rule.name === 'domain-este-pur')
      .map((v) => v.from.split('/').pop())
      .sort();
    expect(sources).toEqual(['uses-node.ts', 'uses-react.ts']);
  });
  it('fixture curat → cod 0, fără încălcări', () => {
    const ok = 'tests/fixtures/gates/depcruise/clean';
    expect(run(ok).status).toBe(0);
    expect(details(ok)).toEqual([]);
  });
});
