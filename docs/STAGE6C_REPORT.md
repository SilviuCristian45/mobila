# Etapa 6c — Selecție multiplă de obiecte (raport)

Stare: implementat; **fără commit** (în așteptarea aprobării). Branch: `feat/etapa-6a-buget`. Decizii: ADR-043 în [DECISIONS](DECISIONS.md). Acoperă singurul criteriu neîndeplinit din Etapa 4 („selecție multiplă, mutare în grup, undo/redo”).

## 1. Ce s-a livrat

- **Selecție multiplă în planul 2D:** Shift / Ctrl / Cmd + clic adaugă sau scoate un obiect; clic simplu selectează doar obiectul; Ctrl+A selectează toate obiectele; clic pe fundal sau Escape golește. Un indicator (`multi-selection`) spune câte obiecte sunt selectate și ce taste merg.
- **Mutare în grup:** tragerea oricărui membru mută tot grupul cu aceeași deplasare (previzualizare pe document temporar, **o singură scriere** la final, snap la grilă ca la un obiect); săgețile mută grupul cu pasul grilei.
- **Duplicare și ștergere în grup:** Ctrl+D face câte o copie decalată pentru fiecare și le selectează; Delete le șterge împreună cu suprascrierile de buget și finisajele lor.
- **Undo/redo:** fiecare acțiune de grup e UN pas („Mută 2 obiecte”, „Duplică 2 obiecte”, „Șterge 2 obiecte”).
- **Domeniu** (atomic, fără schimbare de schemă): `moveObjects`, `duplicateObjects`, `removeObjects`.

## 2. Teste

- **Domeniu** (`tests/domain/objects-group.test.ts`, 7): deplasare identică, id-uri repetate, atomicitate (obiect inexistent, deplasare zecimală, listă goală), ștergerea suprascrierilor de buget, copii decalate în ordine, originalele neatinse.
- **Interfață** (`tests/ui/multiselect.test.tsx`, 4): Shift/Ctrl + clic, scoatere, clic simplu, fundal; tragere de grup (fără scriere în timpul gestului, UN `apply`, neselectatul neatins, undo); săgeți, R inactiv pe grup, Ctrl+D, Delete, undo dintr-un pas; Ctrl+A și Escape.
- **E2E** (`e2e/multiselect.spec.ts`, 3 browsere): Shift + clic cu mouse-ul real, tragere de grup (aceeași deplasare, al treilea obiect pe loc, +1 în istoric), Ctrl+D, Delete, undo, Ctrl+A.

## 3. Rezultate (Node 22.10.0, vezi nota de mediu din STAGE6B_REPORT)

| Verificare | Rezultat |
|---|---|
| `vitest run` | **650/650** (42 fișiere; era 639) |
| lint (0 erori, 0 avertismente), typecheck, depcruise (117 module, 0 încălcări), `next build` | OK |
| `playwright test` (toată suita, `--workers=1`, 3 browsere) | **96/96** (era 93) |

**Neexecutat:** `e2e:base` (basePath), `e2e:storage`.

## 4. Limite și amânat

- Fără selecție prin dreptunghi (lasso).
- **R (rotire) nu acționează pe un grup**: rotirea în jurul centrului grupului necesită o decizie de produs.
- Panoul de proprietăți arată obiectul principal, nu editează grupul. Selecția multiplă nu există în 3D.
- Mutarea nu verifică coliziunile (ca la un singur obiect).
- Netestat pe ecran tactil (fără tastă Shift nu există încă un mod de a adăuga la selecție).
- Observație preexistentă: după adăugarea unui obiect din catalog, selecția de cameră rămâne activă și prima apăsare pe Escape o deselectează pe ea, nu obiectul.

## 5. Fișiere

**Noi:** `tests/domain/objects-group.test.ts`, `tests/ui/multiselect.test.tsx`, `e2e/multiselect.spec.ts`, `docs/STAGE6C_REPORT.md`.
**Modificate:** `src/domain/objects/index.ts`, `src/domain/cascade/index.ts`, `src/features/plan-editor/{PlanEditor,PlanCanvas,types}.ts(x)`, `docs/DECISIONS.md`, `docs/ROADMAP.md`.
