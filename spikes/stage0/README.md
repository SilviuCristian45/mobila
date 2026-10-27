# Spike Etapa 0 — prototipuri aruncabile

NU este aplicația RoomCraft. Conține prototipuri pentru validarea tehnică (vezi `docs/STAGE0_REPORT.md`).
Nu se copiază orbește în aplicația finală: codul din `src/domain` este punct de pornire pentru Etapa 1b, refăcut curat.

- `src/domain/` — schemă zod, geometrie pereți, scenă, buget, export/import (TS pur)
- `src/persistence/`, `src/state/` — Dexie, store cu undo/redo, autosave
- `src/features/`, `src/app/` — Konva, R3F, shell Next (include hook-uri `window.__spike` doar pentru teste)
- `tests/` — Vitest (70 teste) · `e2e/` — Playwright (Chromium, Firefox, WebKit)
- `reports/` — rezultate: build-uri, experimente negative, licențe, benchmark, rezumat

Comenzi: vezi `docs/STAGE0_REPORT.md` §10. Foldere generate (se pot șterge): `node_modules/`, `.next/`, `out*/`, `test-results/`.
