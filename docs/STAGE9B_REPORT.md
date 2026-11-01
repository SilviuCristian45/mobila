# Etapa 9b — Obiectele rămân în camera lor (raport)

Stare: implementat și comis. Branch: `feat/etapa-6a-buget`. Decizii: ADR-050 în [DECISIONS](DECISIONS.md). Aplicația rămâne doar pentru desktop.

## 1. Ce s-a livrat

- Când conturul unei camere se schimbă, **mobilierul din ea rămâne în ea**: un obiect rămas în afară e adus înapoi pe cel mai apropiat punct al noului contur, împins spre interior. Se aplică la tragerea unui nod, la mutarea unei camere cu pereți comuni (vecina se deformează), la mutarea unei laturi (L sau dreptunghi) și la redimensionarea din mânere. Tot în același pas de undo.
- Obiectele care nu erau în nicio cameră și cele rămase în interior nu se ating; un obiect atașat de un perete se desprinde când e adus înapoi.
- Domeniu: `keepObjectsInRooms(before, after)`, aplicată în `moveNode`, `moveRoom`, `moveRoomEdge`, `resizeRoomSide`.

## 2. Teste

- **Domeniu** (`tests/domain/keep-inside.test.ts`, 6): peretele comun mutat în camera vecină (obiectul revine în A, nu trece în B), obiecte rămase în interior neatinse (și identitatea documentului păstrată când nimic nu iese), mutarea camerei vecine care deformează camera cu obiectul, micșorare din mâner (obiectele din alte camere rămân), nod tras spre interior, desprinderea de perete.
- **Interfață** (`tests/ui/room-resize.test.tsx`, +1): micșorarea camerei din mâner cu o canapea lângă latura de est: canapeaua rămâne în cameră, un singur `apply`, undo readuce și camera și canapeaua.

## 3. Rezultate (Node 22.10.0, vezi nota de mediu din STAGE6B_REPORT)

| Verificare | Rezultat |
|---|---|
| `vitest run` | **720/720** (48 fișiere; era 713) |
| prettier, lint (0 avertismente), typecheck, depcruise (124 module), `next build` | OK |
| `playwright test` (toată suita, `--workers=1`, 3 browsere) | **113/114** la prima rulare; testul picat (ștergerea unei camere cu perete comun, Chromium) a trecut **12/12** la repetare (`--repeat-each=4`, 3 browsere): instabilitate de timp, nu regresie |

**Neexecutat:** `e2e:base` (basePath), `e2e:storage`.

## 4. Limite

- Se corectează centrul obiectului, nu amprenta întreagă: un obiect mare poate depăși peretele cu o parte din el.
- Obiectele aduse înapoi nu se verifică între ele (pot ajunge unul peste altul).
- Un obiect revine în camera din care făcea parte, nu în vecina peste care a trecut peretele.

## 5. Observație

La prima încercare, testul UI pe proiectul de referință a fost respins corect de validare (o ușă ar fi ieșit din porțiunea dreaptă a peretelui); testul folosește acum un proiect curat, fără goluri.

## 6. Fișiere

**Noi:** `src/domain/edit/keepInside.ts`, `tests/domain/keep-inside.test.ts`, `docs/STAGE9B_REPORT.md`.
**Modificate:** `src/domain/edit/{index,roomEdges}.ts`, `tests/ui/room-resize.test.tsx`, `docs/DECISIONS.md`, `docs/ROADMAP.md`.
