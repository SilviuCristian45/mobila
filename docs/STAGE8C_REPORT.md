# Etapa 8c — Ștergerea camerelor cu pereți comuni (raport)

Stare: implementat și comis. Branch: `feat/etapa-6a-buget`. Decizii: ADR-048 în [DECISIONS](DECISIONS.md). Aplicația rămâne doar pentru desktop.

## 1. Ce s-a livrat

- **Ștergerea unei camere acum curăță și pereții ei:** dialogul oferă **„Șterge camera și pereții”** (implicit) și **„Doar camera”** (comportamentul de până acum, pereții rămân). În varianta implicită se șterg pereții pe care nu-i folosește nicio altă cameră (cu golurile și finisajele lor), nodurile rămase fără pereți dispar, iar **pereții comuni cu vecinii rămân**.
- **Finisajele feței dinspre camera ștearsă** a unui perete comun dispar (nu mai dau în nicio cameră); cele dinspre vecină rămân.
- Dialogul spune câți pereți se șterg și câți rămân vecinilor. Dacă toți pereții sunt comuni, dialogul e cel vechi („pereții rămân, sunt folosiți de vecini”).
- Ștergerea e refuzată, cu explicație, dacă pereții ei au obiecte atașate sau linii manuale de buget legate (atunci rămâne „Doar camera”).
- Un singur pas de undo, cu eticheta „Șterge camera și pereții”.
- **Domeniu:** `roomOwnWalls`, `removeRoom(doc, id, { withWalls })`. **UI:** `ConfirmDialog` acceptă o acțiune secundară.

## 2. Teste

- **Domeniu** (`tests/domain/shared-walls.test.ts`, +4): camera singură (zero pereți și noduri rămase), vecine cu perete comun (doar 3 pereți proprii se șterg, vecina rămâne validă cu aria intactă, fără `withWalls` pereții rămân), goluri (cele de pe pereții șterși dispar, cel de pe peretele comun rămâne), finisaje pe fața peretelui comun.
- **Interfață** (`tests/ui/plan-editor.test.tsx`): „Doar camera” lasă pereții, varianta implicită îi șterge, un pas de undo.
- **E2E** (`e2e/room-dnd.spec.ts`, +1 × 3 browsere): Living + Bucătărie cu perete comun, Delete, ambele variante, vecina rămâne intactă și plan valid, undo.

## 3. Rezultate (Node 22.10.0, vezi nota de mediu din STAGE6B_REPORT)

| Verificare | Rezultat |
|---|---|
| `vitest run` | **693/693** (46 fișiere; era 689) |
| prettier, lint, typecheck, depcruise (122 module), `next build` | OK |
| `playwright test` (toată suita, `--workers=1`, 3 browsere) | **111/111** (era 108) |

**Neexecutat:** `e2e:base` (basePath), `e2e:storage`.

## 4. Limite

- Un nod rămas pe peretele vecinei după despărțire (joncțiunea în T) rămâne în buclă și după ștergerea camerei care l-a creat; nu are efect vizibil, dar peretele vecinei rămâne împărțit în două segmente.
- Pereții desenați liber (nefăcând parte din nicio cameră) nu sunt afectați.
- Finisajele de pe pereții comuni, față de vecină, se păstrează.

## 5. Fișiere

**Modificate:** `src/domain/edit/index.ts` (`roomOwnWalls`, `removeRoom`), `src/ui/ConfirmDialog.tsx`, `src/features/plan-editor/PlanEditor.tsx`, `tests/domain/shared-walls.test.ts`, `tests/ui/plan-editor.test.tsx`, `e2e/room-dnd.spec.ts`, `docs/DECISIONS.md`, `docs/ROADMAP.md`. **Nou:** `docs/STAGE8C_REPORT.md`.
