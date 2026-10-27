# RoomCraft — Raport Etapa 0 (validare tehnică)

> Data: 2026-10-27. Prototipurile sunt în `spikes/stage0/` (aruncabile, separate de aplicația finală; aplicația nu a fost inițializată). Regula acestui raport: **„Testat”** înseamnă că am rulat codul și am văzut rezultatul; **„Analizat”** înseamnă că am citit documentația sau am dedus, fără să rulez.

## 1. Verdict

**Continuăm cu Next.js export static.** Toate cele 8 condiții I1–I8 au fost verificate; nu a apărut niciun motiv de a trece la Vite. Au apărut două constatări noi (I9, I10), ambele cu soluție, și mai multe erori/ambiguități în documentele mele, corectate (§4). Limitele a ceea ce **nu** am putut testa sunt în §5 și trebuie citite înainte de a trata Etapa 0 ca „închisă” pentru Safari iOS și pentru gazde reale.

## 2. Condițiile I1–I10

| # | Condiție | Rezultat | Testat efectiv | Doar analizat / netestat |
|---|---|---|---|---|
| I1 | Rute dinamice nu merg în export static | ✅ confirmat | Build negativ: `/projects/[id]` fără `generateStaticParams` → eroare Next: *„missing generateStaticParams() so it cannot be used with output: export”*. Soluția `/editor/?p=<id>`: încărcare directă, reîncărcare, `/editor?p=x` (redirect 308 al serverului emulat), rută inexistentă → 404; în Chromium, Firefox, WebKit | — |
| I2 | Acces browser-only (IndexedDB/Konva/Three) | ✅ cu reguli | Build negative: `localStorage` la randare într-un client component → **build eșuat** (`ReferenceError: localStorage is not defined`); `next/dynamic` cu `ssr:false` într-un **Server Component** → **eroare de build**; `new RcDb()` (Dexie) la nivel de modul → build OK (Dexie e lazy); import **static** de `react-konva` și de `@react-three/fiber` → build OK (deci `ssr:false` e pentru împărțirea codului, nu obligatoriu pentru build). Runtime: baza `roomcraft` creată; Konva a desenat 19 forme; R3F 16 mesh-uri | Nu am verificat în browser hidratarea paginilor cu import static Konva/R3F (am verificat doar că se construiesc) |
| I3 | `useSearchParams` + `Suspense` | ✅ | Pagina `/editor` cu `Suspense` se construiește și funcționează în 3 motoare | **Nu** am testat varianta fără `Suspense`; nu știu dacă ar eșua build-ul. Cerința rămâne „folosește Suspense” |
| I4 | `basePath` | ✅ | Build cu `/rc-test`; suita completă (14 teste × 3 motoare) a trecut sub prefix; `asset('/catalog-test.json')` → 200; `fetch('/catalog-test.json')` fără helper → **404** sub prefix (dovedește necesitatea helperului) | Serverul de test este al meu, nu GitHub Pages real |
| I5 | Antete/redirecționări/rescrieri indisponibile | ✅ nu depindem de ele | Aplicația funcționează pe un server **fără** rescrieri SPA (doar redirect director→director/ și `404.html`) | Că Next nu le suportă în export: din documentația oficială (citită), netestat. Comportamentul gazdelor reale: netestat |
| I6 | Formatare `Intl` build vs browser | ⚠️ parțial | `Intl.NumberFormat('ro-RO')` în browser = `1.234.567,89`; totalul afișat `4.567,08 RON`; 0 erori de hidratare în consolă (3 motoare) | N-am provocat o nepotrivire intenționată; Node 22 are ICU complet, deci riscul real este la date/fusuri orare — **netestat** |
| I7 | `/editor` vs `/editor/` | ✅ cu `trailingSlash:true` | Cu `true`: totul trece. Cu `false` și un server cu „pretty URLs” emulat: funcționează dacă linkurile sunt fără slash; un link hardcodat `/editor/` dă 404 pe server strict → confirmă alegerea `true` | Gazde reale: netestat |
| I8 | IndexedDB nu se mută între origini | ✅ | Un context de browser nou (stocare goală) + import din fișier exportat → aceeași scenă (hash) și același buget | Nu am schimbat efectiv domeniul; contextul nou simulează o origine nouă |
| **I9** (nou) | `<Link>` către `/editor/?p=…` → cerere RSC `…/__next.editor.__PAGE__.txt?p=…&_rsc=…` cu **404** pe gazdă strictă | ⚠️ constatare | Reprodus în Chromium (și cu `trailingSlash` true/false); după trecerea la `<a href>` nu mai apar 404-uri (suita verde) | Cauza exactă în Next 16.4.3 neinvestigată (fișierul generat este `editor/__next.editor/__PAGE__.txt`, clientul cere numele cu punct). Posibil dependent de serverul meu de test; regula `<a>` rămâne sigură |
| **I10** (nou) | Lanț de unelte | ⚠️ constatare | Vitest 5.0.5 / Vite 8 cer Node ≥ 22.12, mediul are **22.10.0** (config `.ts` pica cu `ERR_REQUIRE_ESM`; folosit `vitest 4.1.12` + `vite 6.4.5` și `vitest.config.mts`). **npm 10.9.0 pică** la instalarea vitest (`Cannot read properties of null (reading 'edgesOut')`); a mers cu `npx npm@11`. `pnpm` nu e instalat (spike-ul folosește npm) | pnpm nu a fost încercat |

## 3. Prototipuri rulate și rezultate

Rezultat global: **70 teste unitare** (5 fișiere, Vitest) + **tsc strict `--noEmit` curat** + **40 teste E2E trecute, 2 omise** (bench doar în Chromium) în configurația de rădăcină și **40 + 2** sub `basePath`, adică 3 motoare: Chromium, Firefox, WebKit (Playwright 1.64). Rulările finale: `spikes/stage0/reports/summary.txt`.

### 3.1 Editor 2D (React Konva) — testat
- Randare camere (poligon interior), pereți (amprente cu îmbinări), goluri, obiecte, noduri trase. 19 forme, ~62% din pânză acoperită.
- Tragere de nod pe canvas prin mouse real (Playwright): poziția se rotunjește la 10 mm, **un singur pas de undo**, `undo` readuce 4000.
- Versiuni care merg împreună: Next 16.4.3, React 19.3.1, react-konva 19.3.2, konva 10.9.0.
- **Indicativ, nu valid pentru hardware-ul țintă:** pan/zoom ~60 fps (limitat de `requestAnimationFrame`) cu 419 forme (20 camere/300 obiecte) în Chromium headless, randare software.

### 3.2 Scenă 3D (Three/R3F) — testat
- `buildScene(doc)` produce date; R3F le randează. 16 mesh-uri pentru proiectul de referință; 409 pentru cel mare.
- **Orientarea 2D↔3D verificată pe pixeli** (vedere de sus, material fără tone mapping): culoarea canapelei apare exact (138,155,168) la poziția 3D proiectată din (x=1200, y=2400); pozițiile oglindite pe X sau Z **nu** au culoarea canapelei. Rezultat identic în 3 motoare.
- Indicativ: 3,9–4,6 ms per `gl.render` pentru 409 mesh-uri (randare software headless) — **nu** demonstrează 30 fps pe GPU integrat.
- Nu am testat: pierderea contextului WebGL, scurgeri de memorie, `dispose` la editări repetate, texturi.

### 3.3 Geometria pereților — testat (teste unitare + proprietăți)
- Reguli DATA_MODEL §3.A implementate și verificate: axă, grosime simetrică, miter/bevel, T cu 3 pereți, treaptă la grosimi diferite, goluri cu marjă, benzi de finisaj cu goluri scăzute.
- Cameră din dimensiuni interioare `W×D`: pentru 300 de cazuri aleatoare (W,D ≤ 9 m, grosimi pare 60–300 mm) aria interioară = `W×D` cu eroare < 5·10⁻⁵ mm².
- Cazuri de referință: interior A = 11,31 m², B = 8,41 m²; fețe interioare 3900/2900; treaptă → 11,2125 m²; w1 (fereastră) 4 prisme, w2 (ușă) 3; volumul prismelor = amprentă×H − goluri×grosime.
- Bevel la 20° și 28°, miter la 31° și 60°.
- **Constatare:** grosime impară (75) → axe la jumătăți de mm. Rezolvat prin regula „grosime pară” (schema o impune; test de respingere).

### 3.4 Persistență locală — testat
- Dexie 4.4.7: tranzacție atomică meta+document, concurență optimistă pe `revision`, instantanee (se păstrează 5).
- În browser real, în 3 motoare: mutare nod → `dirty` → `saved` (debounce 800 ms) → reîncărcare păstrează; `pagehide` forțează salvarea; **două taburi pe același proiect**: al doilea scriitor primește `conflict`, nu suprascrie, iar reîncărcarea arată scrisul primului.
- Nu am testat: `QuotaExceededError`, `navigator.locks`, `storage.persist()`, mod privat, Safari ITP.

### 3.5 Export/import — testat
- Round-trip: export → import → export dă **aceiași octeți**; documentul este egal.
- **Test „catalog gol”** (D11): catalogul încorporat înlocuit cu unul gol → aceeași scenă (hash) și același buget (456 708 bani brut). Plus verificare statică: `scene.ts`/`budget.ts`/`geometry.ts`/`io.ts` nu importă catalogul.
- Și în browser: export din instalarea A, import într-un context nou cu IndexedDB gol → același hash de scenă, același total.
- **Respins fără efecte** (17 cazuri): JSON invalid, trunchiat, plic greșit, versiune viitoare, câmp necunoscut, câmp lipsă, mm ne-întregi, grosime impară, item/finisaj lipsă din snapshot, suprascriere orfană, perete lipsă între nodurile camerei, nod inexistent, gol în afara peretelui, dimensiuni obiect în afara limitelor, cameră autointersectată, fișier > 50 MB. În browser: un import `"{"` este respins și nu scrie nimic în IndexedDB. Șiruri cu HTML/formule rămân text.
- ID duplicat → copie nouă: toate ID-urile regenerate, referințe consistente, **cheile `object:<id>` din buget remapate**, geometrie și buget identice.
- Migrări: v0 sintetic → v1 (document identic cu originalul); lanț v0→v3 cu migrări sintetice; migrare lipsă → eroare clară.
- **Nu** am testat: fișiere de mărime apropiată de limită (timp de parsare), `.roomcraft.json` descărcat/încărcat prin `<input type=file>` real (am folosit funcția de import, nu fluxul UI).

### 3.6 Undo/redo cu autosave — testat (15 teste unitare + 1 test browser)
Concluzie: **funcționează fără schimbări structurale ale modelului de date**, cu reguli de comportament (ADR-029):
- istoricul este doar în memorie (se golește la încărcare/import);
- `undo`/`redo` declanșează autosave; starea din DB urmărește exact starea din memorie după fiecare pas;
- o tragere = 1 pas, 1 salvare; rafală de 30 editări → ≤ 2 salvări; editare continuă > 5 s se salvează (maxWait);
- `undo` în timpul unei salvări în curs: starea finală din DB = starea din memorie;
- `updatedAt` scris la salvare, fără patch-uri;
- **constatare**: ștergerea unui obiect și curățarea suprascrierii de preț trebuie să fie **același patch**; altfel `undo` restaurează obiectul fără prețul editat (test care demonstrează defectul);
- **bug găsit și corectat în prototip**: un proiect nou nu se salva niciodată (nimic „murdar”); acum primul salvare e imediată.
- Limita de 100 de pași verificată.

### 3.7 Buget — testat (golden cu calcul manual)
Valorile așteptate au fost calculate manual înainte (în comentariile testului): gresie 35 buc → 9 cutii = 801,00 lei; vopsea 32,03 m² → 3 doze = 420,00 lei; total brut cu rezervă 5% = **4.567,08 lei**, net 3.774,45, TVA 792,63. Rezultatele codului coincid la bani.
- **Constatare:** rotunjirea per atribuire dă 4 doze în loc de 3 → agregare pe finisaj (ADR-030); alocare pe camere cu cea mai mare rămășiță (proprietate: suma părților = total, 100 de cazuri).
- **Constatare:** regula „rost inclus” era ambiguă; acum pasul piesei = piesă + rost (rezultatul de referință rămâne 35 buc).
- Proprietate: Σ linii = subtotal pentru orice suprascriere de preț/cantitate/excludere (200 de cazuri).

### 3.8 Performanță de calcul (Node, indicativ) și dimensiuni
- 20 camere / 300 obiecte: poligoane interioare 2,3 ms; `buildScene` 24 ms; buget 25 ms (total ≈ 51 ms). **Prima variantă a bugetului dura 368 ms** (poligoanele camerelor recalculate pentru fiecare obiect); memoizat în prototip (−93%).
- Bundle (build static, gzip): pagina de start ≈ **175 KB** JS (bază Next/React), editorul inițial ≈ **220 KB**; toate JS ≈ 606 KB. Chunk-urile Three (927 KB brut), Konva (331 KB brut) și Dexie (99 KB brut) **nu** sunt în scripturile inițiale ale paginii de start sau ale editorului (verificat prin comparație cu `index.html`). `out/` total: 2,2 MB.

## 4. Contradicții, ambiguități și erori găsite în documentele mele (și corecția)

| # | Problemă | Unde | Corecție |
|---|---|---|---|
| 1 | Etapa 0 din ROADMAP cerea inițializarea aplicației, dar tu ai redefinit-o ca validare | ROADMAP | Etapa 0 = validare (executată); scheletul aplicației s-a mutat la **Etapa 1a** |
| 2 | „Lungimea miterului depășește `4×(t/2)`” era ambiguă; implementarea corectă e distanța nod→vârf > `2·t_max` (≈ 29°) **doar pe partea reflexă**; „bevel la distanța t/2” era greșit (capăt drept la nod) | DATA_MODEL A.3 | Reformulat |
| 3 | Grosime impară → axe la ½ mm, în contradicție cu „mm întregi”; presetarea 75 mm o încălca | DATA_MODEL A.1/A.4, DECISIONS | Regulă: grosime **pară**; presetări 80/100/150/250/300; validare în schemă |
| 4 | A.7 promitea ≤ 1 mm² la 100 m²; măsurat < 5·10⁻⁵ mm² și punctele derivate nu se stochează (deci „rotunjire pentru stocare” nu avea sens) | DATA_MODEL A.7 | Rescris cu valorile măsurate |
| 5 | `buildScene(doc, catalog)` contrazicea exportul autonom (D11) | ARCHITECTURE §3/§4.4/§6 | `buildScene(doc)` |
| 6 | Linii de buget per atribuire → supracumpărare prin rotunjire; cheie `finish:<assignmentId>` | DATA_MODEL §6, ARCHITECTURE §8 | Linie per finisaj, cheie `finish:<finishId>`, `byRoom` în loc de `roomId` |
| 7 | „Curățare la comitere” a suprascrierilor ambiguă → `undo` pierde prețul | DATA_MODEL 6.2 | Curățarea e în același patch |
| 8 | „`revision++` la fiecare acțiune” vs implementare (`editVersion` în memorie, `revision` la salvare); proiectul nou nesalvat | ARCHITECTURE §7.3 | Reformulat; salvare inițială |
| 9 | Câmpuri necunoscute la import: „respinse **sau** eliminate” | ARCHITECTURE §7.6 | Respinse |
| 10 | Numărători/categorii catalog: `kind` avea `appliance` (fără itemi) și `mirror` fără categorie de buget; FR-07 enumera altfel decât Anexa A; `Finish.kind` avea `laminate` (nelistat în cerință) | DATA_MODEL §5/§6, PRODUCT_SPEC FR-07 | **40 = 20+8+3+9** peste tot; `kind` = furniture/sanitary/mirror/lighting (+decor rezervat); `appliance` și `laminate` eliminate; `mirror` în `BudgetCategory` |
| 11 | Exemplul JSON din §10 nu respecta schema (lipseau `openingEdgeMarginMm`, `openingGapMm`) | DATA_MODEL §10 | Completat |
| 12 | `contingencyMinor: Minor` vs implementare `Totals` | DATA_MODEL §6.1 | `contingency: Totals` |
| 13 | Politica de licențe interzicea orice LGPL/MPL, dar instrumentele de build le includ | ARCHITECTURE §10.2 | Excepții explicite pentru unelte nedistribuite |
| 14 | Rândul despre Konva sugera config pentru `canvas` și `ssr:false` obligatoriu | ARCHITECTURE §9 | Corectat conform testelor |
| 15 | TVA 21% „de confirmat” | ARCHITECTURE §8.3, ADR-009 | Verificat în sursă oficială (§6) |

## 5. Ce NU am testat (limite)

- **Safari iOS/iPadOS real** și Safari macOS real. „WebKit” din Playwright pe Windows nu este Safari. Aici stau riscurile Safari ITP, limitele de WebGL pe iOS, comportamentul tactil.
- **Gazde reale** (Cloudflare Pages, GitHub Pages, Netlify, Vercel). Am emulat un server static strict; comportamentul real la `/editor` fără slash, la 404 și la compresie poate diferi.
- **Hardware real:** performanța 2D/3D a fost măsurată doar în Chromium headless cu randare software.
- Pierderea contextului WebGL, scurgeri de memorie la editări repetate, `dispose`.
- `navigator.locks` (Web Locks), `storage.persist()`, `QuotaExceededError`, mod privat.
- Texturi procedurale, `next/font`, Web Workers, export CSV/XLSX, editare pe tabletă/touch, accesibilitate.
- ESLint, `dependency-cruiser`, `license:check` ca poartă CI (am rulat doar scanarea de licențe, ca script).
- `Suspense` negativ (I3), nepotriviri de hidratare provocate (I6), parsare de fișiere foarte mari.
- Compatibilitatea `typescript-eslint` cu TypeScript 7.0.2 (Next și `tsc` merg; lint netestat).

## 6. Licențe și compatibilitate de versiuni

**Instalate și funcționale împreună:** Next 16.4.3 · React/ReactDOM 19.3.1 · konva 10.9.0 · react-konva 19.3.2 · three 0.186.1 · @react-three/fiber 9.8.2 · @react-three/drei 10.7.9 · dexie 4.4.7 · zustand 5.0.16 · immer 11.2.9 · zod 4.6.7 · tailwindcss/@tailwindcss/postcss 4.3.3 · typescript 7.0.2 · vitest 4.1.12 + vite 6.4.5 · fast-check 4.10.2 · fake-indexeddb 6.2.6 · @playwright/test 1.64.1. `npm install` a raportat 0 vulnerabilități cunoscute.

**Fereastră de versiuni de urmărit:** react-konva 19.3.2 cere `react ^19.3.0`; @react-three/fiber 9.8.2 cere `react >=19 <19.4`. Împreună: **React 19.3.x**. O actualizare la React 19.4 ar rupe R3F până la o versiune nouă a acestuia.

**Licențe (scanare cu `license-checker-rseidelsohn`, 218 pachete, 94 de producție):** MIT 160, ISC 22, Apache-2.0 19, BlueOak-1.0.0 4, BSD-3-Clause 3, MPL-2.0 2, BSD-2-Clause 1, CC0-1.0 1, 0BSD 1 și câteva compuse. Nicio GPL/AGPL/SSPL/necunoscută. Cazurile care ies din lista strictă, toate **unelte de build nedistribuite** (nu apar în `out/`):
- `@img/sharp-win32-x64` — Apache-2.0 AND **LGPL-3.0-or-later** (libvips; dependență opțională a Next.js pentru optimizarea imaginilor, neutilizată cu `images.unoptimized`); căutarea „libvips” în `out/` nu a găsit nimic.
- `lightningcss` (+ binar) — **MPL-2.0** (Tailwind 4).
- `caniuse-lite` — CC-BY-4.0; `spdx-exceptions`/`spdx-ranges` — CC-BY-3.0 (date pentru unelte).
- `webgl-constants` — raportat „MIT*”; fișierul `LICENSE` din pachet este MIT (verificat).
- Datele brute: `spikes/stage0/reports/licenses-prod.json`, `licenses-all.json`.

**TVA (sursă oficială, 2026-10-27):** portalul legislativ (legislatie.just.ro), Legea nr. 141/2025, art. II pct. 42: art. 291 alin. (1) Cod fiscal — „cota standard … nivelul acesteia este 21%”; art. VII alin. (1): intră în vigoare la **1 august 2025**. Cota redusă: 11% (alin. (2)). Am citit prima jumătate (100.000 din ~198.000 de caractere) a paginii; textul citat este în ea. Codul fiscal se modifică: 21% rămâne setare, nu constantă.

## 7. Riscuri rămase și schimbări arhitecturale necesare

Schimbări deja făcute în documente: cele din §4. Fără schimbare de direcție.

| Risc | Severitate | Acțiune |
|---|---|---|
| Safari iOS/ITP/WebGL netestate | Mare | Dispozitiv real sau serviciu de teste în Etapa 2 (persistență) și Etapa 7 (3D) |
| Geometria în cazuri complexe (X cu 4 pereți, unghiuri multiple, camere neconvexe, pereți aproape suprapuși) doar parțial acoperită | Mare | Teste suplimentare în Etapa 1b; regulile A.3 pentru nod cu ≥ 4 pereți sunt implementate dar puțin testate |
| Performanța pe hardware real | Medie | Măsurare pe laptop de referință în Etapa 3 |
| `<Link>` 404 (I9) — cauză neînțeleasă | Mică | Regula `<a>`; reverificare pe o gazdă reală |
| Lanț de unelte (Node ≥ 22.12, npm bug, fereastra React 19.3.x) | Medie | `.nvmrc`, `engines`, pnpm, fixare versiuni (Etapa 1a) |
| Editare de dimensiuni interioare pentru poligoane generale lipsește din MVP | Mică | Asumat |
| Web Locks, quota, mod privat netestate | Medie | Etapa 2 |
| Texturi procedurale + scară reală netestate | Medie | Etapa 5 |
| Proiecte cu multe obiecte: bugetul era O(obiecte × camere) | Rezolvat în prototip | De păstrat memoizarea în aplicație |

## 8. Recomandare: Next.js static sau Vite + React?

**Rămânem pe Next.js static.** Argumente, din ceea ce am rulat:
1. Toate funcționalitățile planificate au funcționat în build static real, în 3 motoare, cu și fără `basePath`; singurele constrângeri sunt reguli de cod (client-only pentru browser, `<a>` către editor, `asset()`).
2. Nu s-a folosit nicio funcție care ar exista doar în Next și nu în Vite; aplicația este practic un SPA cu o pagină de start. **Motivul real pentru Next este cerința ta**, nu un câștig tehnic. Dacă cerința s-ar relaxa, Vite ar fi puțin mai simplu (fără I9, fără întrebări de prerandare). Costul trecerii ulterioare este mic datorită stratului `domain/` independent.
3. Riscurile rămase (Safari iOS, gazde, hardware) sunt aceleași pe ambele variante, deci nu favorizează Vite.

Condiție de revizuire: dacă pe o gazdă reală `<a>` + trailing slash nu elimină 404-urile sau dacă Safari iOS are probleme specifice Next, reevaluăm.

## 9. Plan concret pentru Etapa 1 (neînceput)

**1a — Fundația și porțile (≈ primul pas)**
1. Fixare Node LTS ≥ 22.12 (`.nvmrc`, `engines`), instalare pnpm; inițializare Next în `D:\mobila\` (aplicația reală), cu versiunile din §6.
2. `next.config`: `output:'export'`, `trailingSlash:true`, `images.unoptimized`, `basePath` din variabilă de mediu.
3. TypeScript `strict` + `noUncheckedIndexedAccess`; ESLint + Prettier (verificare `typescript-eslint` cu TS 7); Tailwind.
4. `dependency-cruiser` cu regulile de straturi + test al porții (domain → React trebuie să eșueze).
5. `license:check` cu lista de permiși și excepțiile pentru unelte + test al porții (o dependență interzisă trebuie să eșueze) + `THIRD_PARTY_NOTICES.md`.
6. Pagini: `/` și `/editor/` (Suspense, `<a>`, `asset()`); CI: lint, tipuri, teste, licențe, build, e2e în 3 motoare, build cu și fără `basePath`.
- **Acceptare 1a:** cele din ROADMAP Etapa 1a.

**1b — Nucleul domeniului (fără UI)**
7. Mutarea codului din `spikes/stage0/src/domain` în `src/domain` cu structura din ARCHITECTURE §3 (schema, units, geometry, quantities, money, budget, scene, migrations, integrity), refăcut curat, nu copiat orbește.
8. Teste suplimentare: nod cu 4 pereți, camere neconvexe, unghiuri multiple, goluri lângă îmbinări, `{valoare, trace}` pentru fiecare calcul, fixture-uri înghețate de versiune.
9. Proiecte de referință cu calcul manual atașat (garsonieră, apartament 2 camere).
- **Acceptare 1b:** ROADMAP Etapa 1b (≥ 90% acoperire în `domain/`, proprietăți, golden tests).

Deciziile tale necesare înainte de 1a: **niciuna blocantă** (H1/H2 rămân deschise). Aș cere confirmarea a două lucruri minore: (a) fixarea Node ≥ 22.12 pe mașina de dezvoltare; (b) pnpm ca gestor de pachete (spike-ul a folosit npm).

## 10. Reproducere

```
cd spikes/stage0
npx vitest run                       # 70 teste unitare
npx tsc --noEmit
npx next build                       # → out/
npx playwright test                  # 3 motoare (server strict pornit automat)
NEXT_PUBLIC_BASE_PATH=/rc-test SPIKE_DIST=out-base npx next build
SPIKE_PREFIX=/rc-test SPIKE_DIR=out-base npx playwright test
```
Pe Git Bash (Windows) setează `MSYS_NO_PATHCONV=1` înainte de variabilele cu `/`. Dacă `npm install` pică cu `edgesOut`, folosește `npx npm@11 install`. Experimentele negative (I1, I2) sunt jurnalizate în `reports/negative-*.log`.
