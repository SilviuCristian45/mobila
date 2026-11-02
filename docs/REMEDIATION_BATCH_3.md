# Lot de remediere 3 — F-02, F-03(a), F-04, F-09, F-10, F-11, F-14, F-18, F-21

> **Data:** 2026-11-02 · **Branch:** `feat/etapa-6a-buget` · **Sursa:** `docs/TECHNICAL_AUDIT.md` · **Decizii:** ADR-052 în [DECISIONS](DECISIONS.md). Aplicația rămâne doar pentru desktop; fără măsurători de performanță (excluse de utilizator).

## 1. Ce era deja rezolvat înainte de acest lot
F-01, F-07 (lotul 1: recuperare sigură, plafon separat pentru copiile de siguranță), F-05 (lotul 2: granițe de erori) și, în Etapa 10a, F-17 (context WebGL pierdut).

## 2. Ce s-a rezolvat acum
| Constatare | Rezultat |
|---|---|
| **F-02** (P1) import în UI | Buton „Importă proiect”, drag & drop, mai multe fișiere, mesaje pe etape în română, mărimea verificată înainte de citire; circuitul export → import testat în 3 browsere |
| **F-10** (P2) plafoane | 10 MB pe fișier, 2000 de intrări pe dicționarele fără chei-ID |
| **F-04** (P1) politică de versiuni | ADR-052 + gardă automată a formei schemei (amprentă SHA-256, verificată prin modificare temporară) |
| **F-03** (P1) derivate la autosave | Rezultatele derivate se păstrează după alinierea `updatedAt` (partea a); partea b rămâne |
| **F-09** (P2) sănătatea cardurilor | Verificări secvențiale, memorate pe revizie |
| **F-11** (P2) `beforeunload` | Confirmare doar la eroare/conflict |
| **F-14** (P2) fără Web Locks | Avertisment explicit în editor |
| **F-18** (P3) dependențe | Eliminate `konva`, `react-konva` și `package-lock.json` |
| **F-21** (P3) straturi | 3 reguli noi în dependency-cruiser |

## 3. Teste
- Domeniu: `schema-shape` (2), plafoane de import (1). Stare: `beforeunload` în fereastra de debounce, `adoptDerived` după salvare. UI: import (6 scenarii), sănătatea cardurilor (concurență 1, fără repetări), avertismentul fără Web Locks. **E2E** (`e2e/import.spec.ts`, 2 × 3 browsere): export din editor → import în tablou, fișiere respinse, drag & drop.

## 4. Rezultate (Node 22.10.0, vezi nota de mediu din STAGE6B_REPORT)
| Verificare | Rezultat |
|---|---|
| `vitest run` | **740/740** (49 fișiere; era 727) |
| prettier, lint, typecheck, depcruise (126 module), `license:check` (532 pachete), `next build` | OK |
| `playwright`: `app`, `error-recovery`, `import` (Chromium) | **22/22**; `import` și în Firefox și WebKit (2/2 fiecare) |
| `e2e:storage` (Chromium) | **7/7** |

**Neexecutat** (laptop cu memorie puțină): suita E2E completă după acest lot, `e2e:base`, `e2e:storage` în Firefox/WebKit.

## 5. Ce rămâne din audit
- **F-06, F-08** (performanță: măsurare la scară, reconstruirea 3D) și (b) din F-03: excluse de utilizator (fără măsurători).
- **F-12** (tastatură și accesibilitate, cititor de ecran): netratat; face parte din finisarea pentru lansare.
- **F-13** (ecrane mici, tactil): în afara scopului (aplicație doar pentru desktop).
- **F-15** (lacune de testare), **F-16** (componente-monolit: `PlanEditor` are acum peste 1500 de linii), **F-19** (context sigur), **F-20** (duplicări mici), **F-22** (funcții planificate: rezerva BroadcastChannel, memento de backup, `rc:prefs`).
