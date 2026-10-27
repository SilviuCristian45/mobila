import { readFileSync, writeFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeBudget } from '@/domain/budget';
import {
  canonicalStringify,
  exportProject,
  importProject,
  migrateToLatest,
  MAX_IMPORT_BYTES,
  remapIds,
  utf8Length,
} from '@/domain/io';
import { checkIntegrity } from '@/domain/integrity';
import { buildScene, geometrySignature } from '@/domain/scene';
import { gridProject } from '../reference/grid';
import { lShapeProject, studioProject } from '../reference/projects';

// JSON arbitrar modificat de teste (structura internă e intenționat necontrolată de tipuri)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const META = { exportedAt: '2026-10-27T12:00:00.000Z', appVersion: '0.0.0-test' };
const FIXTURE = 'tests/fixtures/v1/studio.roomcraft.json';

const okImport = (r: ReturnType<typeof importProject>) => {
  if (!r.ok) throw new Error(`${r.stage}: ${r.errors.join('; ')}`);
  return r;
};
/** Exportă referința, aplică `mutate` pe JSON și încearcă importul. */
const attempt = (mutate: (j: Json) => void, doc = studioProject()) => {
  const json = JSON.parse(exportProject(doc, META));
  mutate(json);
  return importProject(JSON.stringify(json));
};
const stage = (r: ReturnType<typeof importProject>) => (r.ok ? 'OK' : r.stage);

describe('format frozen v1 (regresie: schimbarea formatului cere o versiune nouă și o migrare)', () => {
  it('exportul curent al proiectului de referință este IDENTIC cu fișierul înghețat', () => {
    const text = exportProject(studioProject(), META);
    if (process.env.UPDATE_FIXTURES) writeFileSync(FIXTURE, text, 'utf8');
    expect(readFileSync(FIXTURE, 'utf8')).toBe(text);
  });
  it('fișierul înghețat se importă și reconstruiește documentul', () => {
    const r = okImport(importProject(readFileSync(FIXTURE, 'utf8')));
    expect(r.doc).toEqual(studioProject());
    expect(r.remapped).toBe(false);
  });
});

describe('round-trip și autonomie (reconstruire fără catalogul original)', () => {
  for (const [name, make] of [
    ['studio', studioProject],
    ['cameră în L', lShapeProject],
  ] as const) {
    it(`${name}: export → import → export dă aceiași octeți; documentul, scena și bugetul sunt egale`, () => {
      const doc = make();
      const text = exportProject(doc, META);
      const r = okImport(importProject(text));
      expect(r.doc).toEqual(doc);
      expect(exportProject(r.doc, META)).toBe(text);
      expect(buildScene(r.doc).hash).toBe(buildScene(doc).hash);
      expect(computeBudget(r.doc)).toEqual(computeBudget(doc));
    });
  }
  it('fișierul conține tot ce trebuie: catalogSnapshot cu rețete, aspect, prețuri și origini', () => {
    const j = JSON.parse(exportProject(studioProject(), META));
    expect(j.format).toBe('roomcraft');
    expect(j.formatVersion).toBe(1);
    expect(j.project.catalogSnapshot.items['furn.sofa.3seat'].recipe).toEqual({
      id: 'box',
      version: 1,
    });
    expect(j.project.catalogSnapshot.finishes['fin.tile.600'].appearance.texture.type).toBe(
      'solid',
    );
    expect(j.project.catalogSnapshot.items['furn.sofa.3seat'].reference.origin).toBe('demo');
    expect(j.project.budget.overrides['object:oLamp'].unitPriceMinor).toBe(25000);
  });
  it('domeniul nu conține niciun catalog: nimic din src/domain nu referă catalog-data sau un catalog global', () => {
    const files = ['io', 'budget', 'scene', 'quantities', 'integrity', 'cascade', 'factory'].map(
      (m) =>
        readFileSync(
          `src/domain/${m}/index.ts`.replace('/factory/index.ts', '/factory.ts'),
          'utf8',
        ),
    );
    for (const src of files)
      expect(src).not.toMatch(/catalog-data|builtinCatalog|from ['"]@\/features/);
  });
  it('proprietate: pentru proiecte generate (grilă de camere, grosimi pare, obiecte, suprascrieri), export→import păstrează totul', () => {
    const even = fc.integer({ min: 15, max: 100 }).map((x) => x * 2);
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: 25, max: 60 }).map((x) => x * 100),
          { minLength: 1, maxLength: 3 },
        ),
        fc.array(
          fc.integer({ min: 25, max: 50 }).map((x) => x * 100),
          { minLength: 1, maxLength: 3 },
        ),
        even,
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 0, max: 20 }),
        fc.option(fc.integer({ min: 0, max: 100000 }), { nil: undefined }),
        (cols, rows, thickness, sofas, tilePct, priceOverride) => {
          const doc = gridProject({
            cols,
            rows,
            thickness,
            sofas,
            tilePct,
            ...(priceOverride !== undefined ? { priceOverride } : {}),
          });
          expect(checkIntegrity(doc).errors).toEqual([]);
          const text = exportProject(doc, META);
          const r = okImport(importProject(text));
          expect(exportProject(r.doc, META)).toBe(text);
          expect(buildScene(r.doc).hash).toBe(buildScene(doc).hash);
          const b = computeBudget(doc);
          expect(computeBudget(r.doc)).toEqual(b);
          expect(Object.values(b.perRoom).reduce((s, t) => s + t.grossMinor, 0)).toBe(
            b.subtotal.grossMinor,
          );
        },
      ),
      { numRuns: 60 },
    );
  });
  it('serializarea canonică ignoră ordinea cheilor', () => {
    expect(canonicalStringify({ b: 1, a: { d: 1, c: [{ y: 1, x: 2 }] } })).toBe(
      canonicalStringify({ a: { c: [{ x: 2, y: 1 }], d: 1 }, b: 1 }),
    );
  });
});

describe('import: fișierele invalide sunt respinse la etapa corectă, fără efecte', () => {
  it('JSON invalid, trunchiat, gol', () => {
    expect(stage(importProject('{nu e json'))).toBe('parse');
    expect(stage(importProject(exportProject(studioProject(), META).slice(0, 400)))).toBe('parse');
    expect(stage(importProject(''))).toBe('parse');
  });
  it('plic: format greșit, câmp suplimentar, project lipsă / ne-obiect, asset-uri nesuportate', () => {
    expect(
      stage(
        attempt((j) => {
          j.format = 'altceva';
        }),
      ),
    ).toBe('envelope');
    expect(
      stage(
        attempt((j) => {
          j.extra = 1;
        }),
      ),
    ).toBe('envelope');
    expect(
      stage(
        attempt((j) => {
          j.assets = [{ id: 'x' }];
        }),
      ),
    ).toBe('envelope');
    expect(
      stage(
        attempt((j) => {
          j.project = [];
        }),
      ),
    ).toBe('envelope');
    expect(
      stage(
        attempt((j) => {
          j.project = null;
        }),
      ),
    ).toBe('envelope');
    expect(
      stage(
        attempt((j) => {
          j.formatVersion = 1.5;
        }),
      ),
    ).toBe('envelope');
  });
  it('versiune: viitoare → refuz; mai veche fără migrare înregistrată → eroare de migrare', () => {
    expect(
      stage(
        attempt((j) => {
          j.formatVersion = 99;
        }),
      ),
    ).toBe('version');
    const old = attempt((j) => {
      j.formatVersion = 0;
      j.project.schemaVersion = 0;
    });
    expect(old).toMatchObject({ ok: false, stage: 'migrate' });
    expect(!old.ok && old.errors[0]).toMatch(/v0→v1/);
  });
  it('migrare reală v0→v1 printr-un registru dat: succes și document identic', () => {
    const doc = studioProject();
    const v0 = JSON.parse(exportProject(doc, META));
    v0.formatVersion = 0;
    v0.project.schemaVersion = 0;
    v0.project.settings.vat = v0.project.settings.defaultVatBp / 100;
    delete v0.project.settings.defaultVatBp;
    const migrations = {
      0: (raw: Record<string, unknown>) => {
        const s = { ...(raw.settings as Record<string, unknown>) };
        s.defaultVatBp = Math.round(Number(s.vat) * 100);
        delete s.vat;
        return { ...raw, settings: s };
      },
    };
    const r = okImport(importProject(JSON.stringify(v0), { migrations }));
    expect(r.migratedFrom).toBe(0);
    expect(r.doc).toEqual(doc);
  });
  it('schemă: câmp necunoscut, lipsă, tip greșit, valori în afara domeniului', () => {
    const bad: Array<(j: Json) => void> = [
      (j) => {
        j.project.nou = 1;
      },
      (j) => {
        delete j.project.settings;
      },
      (j) => {
        j.project.nodes.n1.x = 10.5;
      },
      (j) => {
        j.project.nodes.n1.x = '10';
      },
      (j) => {
        j.project.nodes.n1.x = 1e300;
      },
      (j) => {
        j.project.walls.w1.thicknessMm = 75;
      },
      (j) => {
        j.project.walls.w1.thicknessMm = 0;
      },
      (j) => {
        j.project.walls.w1.heightMm = -5;
      },
      (j) => {
        j.project.objects.oSofa.rotationDeg = 360;
      },
      (j) => {
        j.project.catalogSnapshot.items['furn.sofa.3seat'].reference.priceMinor = -1;
      },
      (j) => {
        j.project.catalogSnapshot.items['furn.sofa.3seat'].reference.priceMinor = 10.5;
      },
      (j) => {
        j.project.settings.defaultVatBp = 2100.5;
      },
      (j) => {
        j.project.settings.defaultWallThicknessMm = 101;
      },
      (j) => {
        j.project.catalogSnapshot.finishes['fin.tile.600'].appearance.baseColorHex = 'roșu';
      },
      (j) => {
        j.project.catalogSnapshot.finishes['fin.paint.white'].tile =
          j.project.catalogSnapshot.finishes['fin.tile.600'].tile;
      },
      (j) => {
        j.project.name = 'x'.repeat(201);
      },
      (j) => {
        j.project.rooms.rA.nodeLoop = ['n1', 'n2'];
      },
      (j) => {
        j.project.budget.manualLines.mLabor.binding = { kind: 'roomFloorArea' };
      },
    ];
    for (const [i, mutate] of bad.entries())
      expect(stage(attempt(mutate)), `caz ${i}`).toBe('schema');
  });
  it('ID-uri periculoase sau malformate sunt respinse (prototype pollution, caractere interzise)', () => {
    const doc = studioProject();
    const text = exportProject(doc, META).replace('"n1": {', '"__proto__": {');
    expect(stage(importProject(text))).toBe('schema');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(
      stage(
        attempt((j) => {
          j.project.id = 'a/b';
        }),
      ),
    ).toBe('schema');
    expect(
      stage(
        attempt((j) => {
          j.project.id = '';
        }),
      ),
    ).toBe('schema');
    expect(
      stage(
        attempt((j) => {
          j.project.id = 'constructor';
        }),
      ),
    ).toBe('schema');
    expect(
      stage(
        attempt((j) => {
          j.project.id = 'x'.repeat(65);
        }),
      ),
    ).toBe('schema');
  });
  it('prea multe intrări într-un tabel → respins', () => {
    const r = attempt((j) => {
      for (let i = 0; i < 10_001; i++)
        j.project.nodes[`z${i}`] = { id: `z${i}`, levelId: 'L1', x: i, y: 0 };
    });
    expect(stage(r)).toBe('schema');
  });
  it('mărime: peste 50 MB (în octeți UTF-8, nu în caractere) → respins', () => {
    expect(stage(importProject('x'.repeat(MAX_IMPORT_BYTES + 1)))).toBe('size');
    expect(stage(importProject('é'.repeat(MAX_IMPORT_BYTES / 2 + 1)))).toBe('size'); // 2 octeți/caracter
    expect(utf8Length('aé€😀')).toBe(1 + 2 + 3 + 4);
  });
  it('integritate: referințe rupte, geometrie invalidă, buget orfan', () => {
    const cases: Array<(j: Json) => void> = [
      (j) => {
        delete j.project.catalogSnapshot.items['furn.sofa.3seat'];
      },
      (j) => {
        delete j.project.catalogSnapshot.finishes['fin.tile.600'];
      },
      (j) => {
        j.project.budget.overrides['object:fantoma'] = { excluded: true };
      },
      (j) => {
        delete j.project.walls.w4;
      },
      (j) => {
        j.project.walls.w1.endNodeId = 'zzz';
      },
      (j) => {
        j.project.openings.oDoor.offsetMm = 50;
      },
      (j) => {
        j.project.objects.oSofa.size.widthMm = 9000;
      },
      (j) => {
        j.project.rooms.rA.nodeLoop = ['n1', 'n3', 'n2', 'n4'];
      },
      (j) => {
        j.project.nodes.n1.levelId = 'L9';
      },
      (j) => {
        j.project.nodes.n1.id = 'altul';
      },
      (j) => {
        j.project.catalogSnapshot.items['furn.sofa.3seat'].reference.currency = 'EUR';
      },
      (j) => {
        j.project.finishAssignments.fPaint1.target.wallId = 'w1';
      }, // aceeași față + aceeași bandă ca fPaint0
      (j) => {
        j.project.finishAssignments.fFloorA2 = {
          id: 'fFloorA2',
          target: { kind: 'roomFloor', roomId: 'rA' },
          finishId: 'fin.tile.600',
          wastePct: 10,
        };
      },
      (j) => {
        j.project.budget.manualLines.mLabor.binding.roomId = 'rZ';
      },
      (j) => {
        j.project.catalogSnapshot.finishes['fin.tile.600'].tile.piecesPerBox = undefined;
        delete j.project.catalogSnapshot.finishes['fin.tile.600'].tile.piecesPerBox;
      },
    ];
    for (const [i, mutate] of cases.entries())
      expect(stage(attempt(mutate)), `caz ${i}`).toBe('integrity');
  });
  it('discrepanța modului TVA este avertisment, nu eroare', () => {
    const r = okImport(
      attempt((j) => {
        j.project.settings.pricesIncludeVat = false;
      }),
    );
    expect(r.warnings.map((w) => w.code)).toContain('vat-mode-mismatch');
  });
  it('șiruri periculoase rămân text (nu se evaluează, nu se elimină)', () => {
    const r = okImport(
      attempt((j) => {
        j.project.name = '<img src=x onerror=alert(1)> =HYPERLINK("http://x")';
      }),
    );
    expect(r.doc.name).toContain('<img');
  });
});

describe('ID duplicat → copie nouă', () => {
  it('toate ID-urile se regenerează, referințele rămân consistente, geometria și bugetul sunt identice', () => {
    const doc = studioProject();
    let n = 0;
    const r = okImport(
      importProject(exportProject(doc, META), {
        existingIds: new Set([doc.id]),
        genId: () => `id${++n}`,
      }),
    );
    expect(r.remapped).toBe(true);
    expect(r.doc.id).not.toBe(doc.id);
    for (const t of [
      'nodes',
      'walls',
      'openings',
      'rooms',
      'objects',
      'finishAssignments',
    ] as const) {
      expect(
        Object.keys(r.doc[t]).some((k) => k in doc[t]),
        t,
      ).toBe(false);
    }
    const newLampId = Object.keys(r.doc.objects).find(
      (k) => r.doc.objects[k]!.catalogItemId === 'light.pendant.shade',
    )!;
    expect(r.doc.budget.overrides[`object:${newLampId}`]).toEqual(
      doc.budget.overrides['object:oLamp'],
    );
    expect(Object.keys(r.doc.budget.overrides).some((k) => k === 'object:oLamp')).toBe(false);
    expect(checkIntegrity(r.doc).errors).toEqual([]);
    expect(geometrySignature(buildScene(r.doc))).toBe(geometrySignature(buildScene(doc)));
    const a = computeBudget(r.doc);
    const b = computeBudget(doc);
    expect([a.subtotal, a.total, a.perCategory]).toEqual([b.subtotal, b.total, b.perCategory]);
    expect(Object.values(r.doc.budget.manualLines)[0]!.binding).toMatchObject({
      kind: 'roomFloorArea',
    });
  });
  it('conflict fără generator de ID-uri sau cu generator care dă duplicate/valori invalide → respins controlat', () => {
    const doc = studioProject();
    const text = exportProject(doc, META);
    expect(stage(importProject(text, { existingIds: new Set([doc.id]) }))).toBe('remap');
    expect(
      stage(importProject(text, { existingIds: new Set([doc.id]), genId: () => 'same' })),
    ).toBe('remap');
    expect(
      stage(importProject(text, { existingIds: new Set([doc.id]), genId: () => 'nu e valid!' })),
    ).toBe('remap');
  });
  it('remapIds direct păstrează documentul valid și nu modifică originalul', () => {
    const doc = lShapeProject();
    const snap = JSON.stringify(doc);
    let n = 0;
    const copy = remapIds(doc, () => `x${++n}`);
    expect(JSON.stringify(doc)).toBe(snap);
    expect(checkIntegrity(copy).errors).toEqual([]);
  });
});

describe('migrări în lanț', () => {
  it('lanț v0→v3 cu migrări sintetice; migrare lipsă → eroare clară', () => {
    const mig = {
      0: (r: Record<string, unknown>) => ({ ...r, a: 1 }),
      1: (r: Record<string, unknown>) => ({ ...r, b: Number(r.a) + 1 }),
      2: (r: Record<string, unknown>) => ({ ...r, c: Number(r.b) + 1 }),
    };
    expect(migrateToLatest({}, 0, 3, mig)).toMatchObject({ a: 1, b: 2, c: 3, schemaVersion: 3 });
    expect(() => migrateToLatest({}, 0, 3, { 0: mig[0] })).toThrow(/v1→v2/);
    expect(migrateToLatest({ z: 1 }, 1, 1, mig)).toEqual({ z: 1 });
  });
});
