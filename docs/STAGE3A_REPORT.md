# Etapa 3a — Fundația vizualizării 3D (raport)

Stare: implementat; **fără commit** (în așteptarea aprobării). Decizia: ADR-038 în [DECISIONS](DECISIONS.md); arhitectura: ARCHITECTURE §4.8.

## Ce s-a livrat

- `src/features/viewer-3d/`
  - `sceneObjects.ts` — `SceneDescription` → geometrii Three (pur, testabil în Node), `sceneBounds`, `frameCamera`.
  - `ViewerCanvas.tsx` — canvas R3F, lumini, `OrbitControls`, încadrare/reset.
  - `Viewer3D.tsx` — panou cu stări controlate (document invalid, proiect gol, fără WebGL, eroare de randare), buton „Resetează vederea”.
  - `webgl.ts` — verificarea WebGL (doar client, memorată).
- `src/app/editor/EditorClient.tsx` — tab-uri „Plan 2D” / „Vizualizare 3D” peste aceeași sesiune.
- Domeniul (`src/domain`, `selectScene`) **nu a fost modificat**: `buildScene` oferea deja prisme cu goluri segmentate, îmbinări în mitră și podele. Nicio dependență nouă, niciun script de build aprobat.

## Ce s-a testat efectiv

Mediu: Node **22.23.4** (arhivă oficială descărcată în directorul temporar al sesiunii, SHA-256 verificat față de `SHASUMS256.txt`; pus în `PATH` doar pentru comenzi — instalarea globală (Node 24.18.1 / nvm) nu a fost atinsă). pnpm 10.34.9.

- `pnpm verify`: format, lint, typecheck, depcruise (80 module, 0 încălcări), licențe (535 pachete, 0 încălcări), **407 teste** (22 fișiere), build static — **verde**.
- Teste noi (Vitest):
  - `tests/ui/viewer-3d-objects.test.ts` (Node): număr de obiecte = prisme/podele din scenă; cote Y și poligon din plan = geometria Three; fereastra lasă parapet + buiandrug, ușa doar buiandrug; podea plată la 0; volumul fiecărei prisme extrudate = arie × înălțime (domeniu); `dispose`; bounds; **toate colțurile proiectului intră în frustum** pentru aspecte 0,6 / 1,5 / 2,4.
  - `tests/ui/viewer-3d.test.tsx` (jsdom, canvas înlocuit cu stub; jsdom nu are WebGL): scena se actualizează la schimbarea documentului; reset; document invalid (cu motive); proiect gol; fără WebGL; eroare de randare + reîncercare; navigare 2D↔3D în editorul real, cu modificare prin sesiune cât timp 3D e deschis.
  - `tests/ui/prerender.test.tsx` (Node, fără DOM): `Viewer3D` se prerandează fără `window`/WebGL și **fără a evalua modulul canvas-ului**; `sceneObjects` rulează în Node.
- E2E noi (`e2e/viewer-3d.spec.ts`, WebGL real în Chromium, Firefox și WebKit headless): 2D→3D→2D păstrează proiectul; 4 pereți + 1 podea; pixeli desenați > 5%; orbitare, zoom și deplasare cu mouse-ul schimbă imaginea; reset readuce exact vederea inițială; ușă adăugată în 2D ⇒ 6 prisme în 3D; autosave + reîncărcare; proiect gol ⇒ mesaj. Rulează și la rădăcină, și sub `basePath` (`/rc-test`).
- Verificare vizuală: captură a scenei (cameră de 4×3 m) — pereți cu colțuri îmbinate curat, fără suprapuneri vizibile.

Rezultatul final `pnpm verify:e2e`: verde (vezi „Rulări e2e”).

## Rulări e2e

Prima rulare completă a avut 2 eșecuri în teste **existente** (nu 3D): `app.spec.ts` „stare goală…” (Firefox, `editor` nevăzut în 5 s) și „undo / redo…” (WebKit, `save-status` rămas pe „saving”). Rerulate izolat, de 3 ori fiecare, pe toate browserele: 18/18 verzi ⇒ instabilitate sub încărcare (3 browsere în paralel), nu regresie. A doua rulare completă `pnpm verify:e2e` (Node 22.23.4): **verde** — 57 la rădăcină + 57 sub `basePath` + 21 de stocare, 0 eșecuri.

## Limite

- Doar citire: nu se desenează obiecte (`scene.boxes`), fără mobilier, catalog, materiale configurabile sau buget.
- Ferestrele sunt goluri fără geam; pereții au o culoare neutră unică; podeaua ia culoarea din document sau `#dddddd`.
- Navigarea tactilă **nu e validată** (controalele sunt cele implicite OrbitControls, testate doar cu mouse-ul).
- Starea efemeră a planului 2D (selecție, zoom, unealtă) se pierde la comutarea în 3D; documentul, istoricul și autosave-ul nu.
- Fără test de performanță pe proiecte mari (fiecare prismă e un mesh separat; de măsurat în etapele următoare).
- WebGL lipsă ⇒ doar mesaj explicativ (testat în jsdom prin mock; în e2e toate cele 3 motoare au avut WebGL).
- Un singur nivel; `selectScene` trebuie să nu arunce, altfel se afișează erorile (acoperit).

## Extensii de domeniu necesare

Niciuna în 3a. Pentru etapele următoare: desenarea obiectelor va cere un `BoxDesc` consumat de un modul de „rețete” (deja descris în scenă), iar geamurile ar cere o prismă/atribut „vitraj” pe goluri.
