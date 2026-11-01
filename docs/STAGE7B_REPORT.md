# Etapa 7b — UX: lista camerelor și redimensionare din mânere (raport)

Stare: implementat; **fără commit** (în așteptarea aprobării). Branch: `feat/etapa-6a-buget`. Decizii: ADR-045 în [DECISIONS](DECISIONS.md). Continuă Etapa 7a: după plasarea unei camere prin drag & drop, dimensiunile se schimbă direct pe plan, nu din cifre.

## 1. Ce s-a livrat

- **Lista camerelor** în panoul lateral (mereu vizibilă când există camere): nume, tip, suprafața utilă din geometrie și totalul. Un clic selectează camera; dacă e în afara ferestrei, planul se centrează pe ea (zoom neschimbat). Accesibilă de la tastatură (`aria-current` pe camera selectată).
- **Mânere de redimensionare:** camera dreptunghiulară selectată are câte un mâner pe fiecare latură (N, E, S, V). Tragerea mută latura, cu snap la grilă (Alt = milimetru), latura opusă rămâne fixă; cotele se actualizează live, UN commit la final, undo. Sub 600 mm pe o latură operația e refuzată cu explicație și camera revine.
- **Domeniu:** `resizeRoomSide` (peste `resizeRectInterior` existent), cu `MIN_ROOM_SIDE_MM = 600`.

## 2. Teste

- **Domeniu** (`tests/domain/room-placement.test.ts`, +2): fiecare latură (dimensiunea cerută, latura opusă fixă, geometrie validă), refuzul sub minim / zecimale / cameră inexistentă, document neatins.
- **Interfață** (`tests/ui/room-resize.test.tsx`, 5): lista (nume, arie din geometrie, total = suma, selecție), mânerele doar la camera selectată, latura de est (previzualizare fără scriere, un `apply`, snap, latura opusă pe loc, undo), laturile de vest și de nord, refuzul sub minim cu mesaj.
- **E2E** (`e2e/room-dnd.spec.ts`, +1 × 3 browsere): mouse real pe mâner, aria din listă și lățimea din panou se schimbă, un pas de istoric, undo.

## 3. Rezultate (Node 22.10.0, vezi nota de mediu din STAGE6B_REPORT)

| Verificare | Rezultat |
|---|---|
| `vitest run` | **671/671** (45 fișiere; era 664) |
| prettier, lint (0 avertismente), typecheck, depcruise, `next build` | OK |
| `playwright test` (toată suita, `--workers=1`, 3 browsere) | **105/105** (era 102) |

**Neexecutat:** `e2e:base` (basePath), `e2e:storage`.

## 4. Descoperiri

- **Regresie prinsă de un test mai vechi:** mânerul laturii nordice stătea exact peste mijlocul peretelui și intercepta clicul de selectare a peretelui (E2E „ușă și fereastră”, în toate browserele). Mânerele sunt acum puțin în interiorul camerei, ca să nu acopere peretele.
- Redimensionarea unei camere care **împarte noduri** cu alta (pereți comuni) mută și nodurile comune: vecinul se deformează sau, dacă rezultatul e invalid, commit-ul îl respinge (mesaj + revenire). Nu s-a adăugat o regulă specială; comportamentul e cel al editării de noduri.

## 5. Limite și amânat

- Mânere doar pentru camere dreptunghiulare cu 4 noduri; camerele de altă formă se editează prin noduri.
- Nu există mânere pe colțuri (redimensionare pe două direcții deodată); se trage o latură pe rând.
- Obiectele din cameră nu se mută la redimensionare (rămân pe loc, în coordonatele lor).
- Sub 1024 px panoul lateral (cu lista) rămâne sub plan.
- Netestat pe tactil real.

## 6. Fișiere

**Noi:** `src/features/plan-editor/RoomList.tsx`, `tests/ui/room-resize.test.tsx`, `docs/STAGE7B_REPORT.md`.
**Modificate:** `src/domain/edit/index.ts` (`resizeRoomSide`, `MIN_ROOM_SIDE_MM`), `src/features/plan-editor/{PlanEditor,PlanCanvas,types}.ts(x)`, `tests/domain/room-placement.test.ts`, `e2e/room-dnd.spec.ts`, `docs/DECISIONS.md`, `docs/ROADMAP.md`.
