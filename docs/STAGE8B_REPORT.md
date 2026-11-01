# Etapa 8b — Mutarea camerelor cu pereți comuni (raport)

Stare: implementat și comis. Branch: `feat/etapa-6a-buget`. Decizii: ADR-047 în [DECISIONS](DECISIONS.md). Aplicația rămâne doar pentru desktop.

## 1. Ce s-a livrat

- O cameră care **împarte pereți sau noduri** cu alte camere se poate acum trage întreagă (selectată, apoi trasă, cu previzualizare, un singur commit, undo). Nodurile ei, inclusiv cele comune, se mută; **vecinii se deformează** acolo unde pereții lor pleacă din nodurile comune. Obiectele din interiorul camerei mutate merg cu ea.
- Dacă planul rezultat e invalid, previzualizarea arată problema și la eliberare camera revine, cu mesaj (comportamentul existent al tragerii).
- Rotirea rămâne doar pentru camerele cu noduri proprii (mesaj explicativ).

## 2. Teste

- **Domeniu:** `tests/domain/room-placement.test.ts` (nodurile comune se mută, nodul propriu al vecinei rămâne) și `tests/domain/shared-walls.test.ts` (o cameră cu perete comun se mută, nodurile comune o urmează, aria camerei mutate se păstrează, geometrie validă; rotirea ei rămâne refuzată).
- **E2E:** `e2e/room-dnd.spec.ts` (3 browsere): bucătăria cu perete comun se trage cu mouse-ul, un pas de istoric, plan valid, undo.

## 3. Rezultate (Node 22.10.0, vezi nota de mediu din STAGE6B_REPORT)

| Verificare | Rezultat |
|---|---|
| `vitest run` | **689/689** |
| prettier, lint, typecheck, depcruise, `next build` | OK |
| `playwright test` (toată suita, `--workers=1`, 3 browsere) | **108/108** |

**Neexecutat:** `e2e:base` (basePath), `e2e:storage`.

## 4. Limite

- O deplasare perpendiculară pe peretele comun deformează vecina (colțurile ei comune se mută). Pentru ca vecina să rămână dreptunghiulară, camera se redimensionează din mânere, nu se mută.
- Obiectele din vecina deformată nu se mută; pot ajunge în afara conturului ei dacă deformarea e mare (nu se validează).
- Rotirea unei camere cu pereți comuni rămâne refuzată.

## 5. Fișiere

**Modificate:** `src/domain/edit/index.ts` (`moveRoom`), `tests/domain/{room-placement,shared-walls}.test.ts`, `e2e/room-dnd.spec.ts`, `docs/DECISIONS.md`, `docs/ROADMAP.md`. **Nou:** `docs/STAGE8B_REPORT.md`.
