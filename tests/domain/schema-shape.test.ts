// F-04 (audit tehnic) / ADR-052: politica de compatibilitate între versiuni, aplicată automat.
//
// Documentul salvat e validat cu o schemă STRICTĂ: o versiune veche a aplicației (cache de browser, rollback de deploy) declară
// „invalid” orice document cu un câmp sau o valoare de enum pe care nu le cunoaște, nu „creat cu o versiune mai nouă”. De aceea
// ORICE schimbare a FORMEI persistate (câmp nou, câmp șters, enum cu o valoare în plus, tip schimbat) trebuie să crească
// `CURRENT_VERSION`, cu o migrare pură (vezi Anexa A din auditul tehnic). Acest test îngheață forma curentă (amprentă SHA-256 a
// schemei JSON): dacă se schimbă, pică și explică ce e de făcut. Limitele de mărime (`.refine`) nu fac parte din formă.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { canonicalStringify } from '@/domain/io';
import { CURRENT_VERSION, ProjectDocumentSchema } from '@/domain/schema';

const GOLDEN = 'tests/fixtures/schema-shape.json';

function currentShape(): { schemaVersion: number; sha256: string; properties: number } {
  const json = z.toJSONSchema(ProjectDocumentSchema, { unrepresentable: 'any', io: 'input' });
  const text = canonicalStringify(json as never);
  return {
    schemaVersion: CURRENT_VERSION,
    sha256: createHash('sha256').update(text).digest('hex'),
    properties: Object.keys((json as { properties?: object }).properties ?? {}).length,
  };
}

describe('forma persistată a documentului este înghețată pe versiune (ADR-052)', () => {
  it('amprenta schemei coincide cu cea înghețată pentru versiunea curentă', () => {
    const now = currentShape();
    if (process.env.UPDATE_SCHEMA_SHAPE === '1') {
      writeFileSync(GOLDEN, `${JSON.stringify(now, null, 2)}\n`);
      return;
    }
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as typeof now;
    const hint =
      'Forma documentului persistat s-a schimbat. Politica (ADR-052): orice schimbare a formei — inclusiv o valoare nouă de ' +
      'enum — crește CURRENT_VERSION (src/domain/schema) și adaugă o migrare pură în io/ (vezi Anexa A din auditul tehnic), ' +
      'cu fixture înghețat pentru versiunea veche. Abia apoi se actualizează amprenta: ' +
      'UPDATE_SCHEMA_SHAPE=1 pnpm test tests/domain/schema-shape.test.ts';
    expect(now.schemaVersion, hint).toBe(golden.schemaVersion);
    expect(now.sha256, hint).toBe(golden.sha256);
  });

  it('schema JSON se poate calcula și descrie tabelele documentului (gardă împotriva unei amprente goale)', () => {
    const now = currentShape();
    expect(now.properties).toBeGreaterThan(10);
    expect(now.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
