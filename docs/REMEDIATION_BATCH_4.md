# Lot de remediere 4 — F-12 (tastatură și accesibilitate, desktop)

> **Data:** 2026-11-02 · **Branch:** `feat/etapa-6a-buget` · **Sursa:** `docs/TECHNICAL_AUDIT.md` (F-12) · **Decizii:** ADR-053 în [DECISIONS](DECISIONS.md). Platformă: doar desktop.

## 1. Ce s-a livrat
- **Scurtături controlabile** (comutator „Scurtături de tastă”, memorat) — WCAG 2.1.4.
- **Fără taste „nevăzute”:** săgețile și scurtăturile cu o tastă nu acționează în spatele unui buton, tab sau câmp focalizat; zona planului e focalizabilă, descrisă și cu contur de focus.
- **Tab-uri ARIA complete** (săgeți, Home, End, `tabindex` rulant).
- **Anunțarea selecției** pentru cititoare de ecran (regiune `aria-live`).
- **Buton „Rotește camera”** în timpul plasării (alternativă la tasta R).
- **`prefers-reduced-motion` și `forced-colors`** în CSS.
- **Verificator automat de accesibilitate** în teste, rulat pe tablou, dialoguri, mesaje de import, editor (cameră selectată), catalog, materiale, buget și 3D; verificat pe defecte seminate.

## 2. Teste
- **Unitare/UI** (`tests/ui/a11y.test.tsx`, 13): regulile pure de tastatură (inclusiv excepția R la plasare), scanările de accesibilitate ale ecranelor, comportamentul (zona planului, comutatorul și persistența lui, săgeți pe buton vs pe plan, anunțurile live, tab-urile cu săgeți, butonul de rotire), verificatorul pe defecte seminate.
- **E2E** (`e2e/accessibility.spec.ts`, 6 × 3 browsere; contrastul forțat doar în Chromium, unde se poate emula): focus real mutat de săgeți pe tab-uri, taste ignorate pe butoane și active pe plan, comutator persistent la reîncărcare, anunțuri live, cameră aleasă din listă cu Enter și rotită cu R, contur de focus, mișcare redusă, contrast forțat.
- Un test E2E existent (rotirea camerei) apăsa R cu focusul rămas pe un buton: corectat să focalizeze zona planului; a scos la iveală cazul „R la plasare” (acum tratat).

## 3. Rezultate (Node 22.10.0, vezi nota de mediu din STAGE6B_REPORT)
| Verificare | Rezultat |
|---|---|
| `vitest run` | **753/753** (50 fișiere; era 740); la o rulare completă a picat o dată testul de export XLSX (timp: biblioteca se încarcă la cerere, `waitFor` de 1 s sub încărcare), trece izolat; toleranța a fost mărită |
| prettier, lint (0 avertismente), typecheck, depcruise (127 module), `next build` | OK |
| `playwright` (Chromium, pe grupuri): `plan-editor`, `catalog`, `multiselect`, `room-dnd`, `app`, `budget`, `materials`, `viewer-3d`, `import`, `error-recovery`, `accessibility` | toate trec (`accessibility` și în Firefox și WebKit: 5 trec, 1 sărit = contrast forțat, doar Chromium) |

**Neexecutat** (laptop cu memorie puțină): suita E2E completă în toate cele 3 browsere după acest lot, `e2e:base`, `e2e:storage`. Instabilitate cunoscută, nelegată de acest lot: testul de ștergere a unei camere cu perete comun (`room-dnd`) a picat o dată din ~12 rulări, fără legătură cu tastatura.

## 4. Limite
- Netestat cu cititor de ecran real (NVDA, JAWS, VoiceOver) și fără verificare automată de contrast.
- Drag & drop rămâne pentru mouse; alternativele de tastatură există (Enter pe paletă, lista camerelor, câmpuri numerice, săgeți pentru mutare).
- `role="img"` al SVG-ului nu expune copiii; selecția se anunță prin regiunea live.
