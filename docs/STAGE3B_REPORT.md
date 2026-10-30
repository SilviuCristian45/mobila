# Etapa 3b — Catalog de obiecte 3D și mobilier parametric (raport)

Stare: implementat; **fără commit** (în așteptarea aprobării). Decizii: ADR-039 în [DECISIONS](DECISIONS.md); arhitectură: ARCHITECTURE §4.8b; model de date: DATA_MODEL §5.

## 1. Ce s-a livrat

- **Catalog încorporat, offline** (`src/catalog/`): 41 de obiecte parametrice în 7 categorii, fără modele externe, fără rețea. Fiecare are ID stabil, denumire în română, categorie, dimensiuni implicite, limite min/max, montaj (podea/perete/tavan) cu elevație, parametri specifici, culoare implicită, preț **demonstrativ** ([PRICING_NOTES](PRICING_NOTES.md)) și proveniență `original`.
- **Geometrie procedurală** prin 26 de rețete versionate (`recipes.ts`) care produc primitive (cutie/cilindru/elipsoid); tesselare proprie (`mesh.ts`), previzualizări SVG izometrice (`preview.ts`).
- **Domeniu** (`src/domain/objects`): validare parametri/dimensiuni, plasare propusă, `addObject` (snapshot în `catalogSnapshot` la prima utilizare), `updateObject`, `duplicateObject`; ștergere prin `removeObject` existent. Reguli noi de integritate pentru parametri.
- **UI**: buton „Catalog de obiecte” (panou lateral, la cerere): căutare fără diacritice, categorii, miniaturi, stare goală; panou de proprietăți (denumire, poziție, rotație, dimensiuni cu limite afișate, elevație, culoare, parametri); selecție în plan 2D și în 3D (contur turcoaz), comună; mutare cu mouse-ul în 2D (snap la grilă), rotire (R / butoane / câmp), duplicare (Ctrl+D / buton), ștergere (Delete / buton); toate prin `session.apply` ⇒ un pas de undo, autosave.
- **Scena 3D**: obiecte ca mesh-uri cu culori pe vârf, geometrii partajate (`GeometryCache`); rețetă necunoscută ⇒ cutie de înlocuire + avertisment.

## 2. Obiectele implementate și parametrii lor

Toate au și: dimensiuni (lățime/adâncime/înălțime) editabile în limitele din catalog (în codul din `src/catalog/items.ts`) și culoare. „Parametri” = cei specifici (interval și valoarea implicită în paranteze).

**Living**

| ID | Denumire | Implicit (L×A×Î mm) | Montaj | Parametri |
|---|---|---|---|---|
| `living.sofa-2` | Canapea 2 locuri | 1600×900×850 | podea | Număr de locuri 1–4 (2); Cotiere da/nu (da); Configurație: Dreaptă |
| `living.sofa-3` | Canapea 3 locuri | 2100×950×850 | podea | Număr de locuri 2–5 (3); Cotiere da/nu (da); Configurație: Dreaptă |
| `living.sofa-corner` | Canapea de colț | 2600×1700×850 | podea | Număr de locuri 2–5 (3); Cotiere da/nu (da); Configurație: Colț dreapta / Colț stânga |
| `living.armchair` | Fotoliu | 850×850×850 | podea | Cotiere da/nu (da) |
| `living.coffee-table` | Măsuță de cafea | 1000×600×420 | podea | Formă: Dreptunghiulară / Rotundă / Ovală; Picioare: Picioare / Picior central |
| `living.tv-unit` | Comodă TV | 1600×400×450 | podea | Număr de fronturi 1–6 (2); Tip fronturi: Uși / Sertare / Deschis (rafturi); Mânere da/nu (da); Bază: Picioare / Soclu / Fără |
| `living.bookcase` | Bibliotecă | 900×350×2000 | podea | Număr de rafturi 2–10 (5); Spate da/nu (da) |
| `living.wall-shelf` | Raft de perete | 800×220×350 | perete (1400 mm) | Număr de polițe 1–4 (2); Console da/nu (da) |

**Dormitor**

| ID | Denumire | Implicit (L×A×Î mm) | Montaj | Parametri |
|---|---|---|---|---|
| `bedroom.bed-single` | Pat single | 900×2000×800 | podea | Tip: Cu platformă / Cu cadru și picioare; Tăblie: Fără / Joasă / Înaltă |
| `bedroom.bed-double` | Pat matrimonial | 1600×2000×900 | podea | Tip: Cu platformă / Cu cadru și picioare; Tăblie: Fără / Joasă / Înaltă |
| `bedroom.nightstand` | Noptieră | 450×400×500 | podea | Număr de fronturi 1–3 (2); Tip fronturi: Uși / Sertare / Deschis (rafturi); Mânere da/nu (da); Bază: Picioare / Soclu / Fără |
| `bedroom.wardrobe` | Dulap 2 uși | 1000×600×2100 | podea | Număr de fronturi 1–4 (2); Tip fronturi: Uși / Sertare / Deschis (rafturi); Mânere da/nu (da); Bază: Soclu / Picioare / Fără |
| `bedroom.wardrobe-3` | Dulap 3 uși | 1500×600×2200 | podea | Număr de fronturi 2–6 (3); Tip fronturi: Uși / Sertare / Deschis (rafturi); Mânere da/nu (da); Bază: Soclu / Picioare / Fără |
| `bedroom.dresser` | Comodă | 1000×450×850 | podea | Număr de fronturi 2–6 (4); Tip fronturi: Uși / Sertare / Deschis (rafturi); Mânere da/nu (da); Bază: Picioare / Soclu / Fără |

**Bucătărie**

| ID | Denumire | Implicit (L×A×Î mm) | Montaj | Parametri |
|---|---|---|---|---|
| `kitchen.worktop` | Blat | 2000×600×40 | perete (860 mm) | Formă blat: Dreaptă / Colț stânga / Colț dreapta |
| `kitchen.base-cabinet` | Corp inferior | 600×600×900 | podea | Număr de fronturi 1–4 (1); Tip fronturi: Uși / Sertare / Deschis (rafturi); Mânere da/nu (da); Bază: Soclu / Picioare / Fără; Blat da/nu (da); Chiuvetă integrată da/nu (nu) |
| `kitchen.wall-cabinet` | Corp superior | 600×350×700 | perete (1400 mm) | Număr de fronturi 1–4 (1); Tip fronturi: Uși / Sertare / Deschis (rafturi); Mânere da/nu (da); Bază: Fără |
| `kitchen.island` | Insulă | 1600×900×900 | podea | Număr de fronturi 2–6 (4); Tip fronturi: Uși / Sertare / Deschis (rafturi); Mânere da/nu (da); Bază: Soclu / Picioare / Fără; Blat da/nu (da); Prelungire blat în față (mm) 0–400 (300) |
| `kitchen.dining-table` | Masă | 1400×800×750 | podea | Formă: Dreptunghiulară / Rotundă / Ovală; Picioare: Picioare / Picior central |
| `kitchen.round-table` | Masă rotundă | 900×900×750 | podea | Formă: Rotundă / Ovală; Picioare: Picior central / Picioare |
| `kitchen.chair` | Scaun | 450×480×900 | podea | Spătar da/nu (da); Tapițat da/nu (nu) |

**Baie**

| ID | Denumire | Implicit (L×A×Î mm) | Montaj | Parametri |
|---|---|---|---|---|
| `bath.toilet` | WC | 380×680×780 | podea | Rezervor: Cu rezervor / Încastrat |
| `bath.basin` | Lavoar | 550×450×850 | podea | Montaj: Picior central |
| `bath.vanity` | Mobilier baie | 800×460×850 | podea | Număr de fronturi 1–4 (2); Tip fronturi: Uși / Sertare / Deschis (rafturi); Mânere da/nu (da); Bază: Picioare / Soclu / Fără; Blat da/nu (da); Chiuvetă integrată da/nu (da) |
| `bath.bathtub` | Cadă | 1700×750×600 | podea | Tip: Încastrată / Independentă |
| `bath.shower` | Cabină de duș | 900×900×2000 | podea | Partea ușii: Dreapta / Stânga; Închidere: Colț / Walk-in |

**Electrocasnice**

| ID | Denumire | Implicit (L×A×Î mm) | Montaj | Parametri |
|---|---|---|---|---|
| `appliance.fridge` | Frigider | 600×650×1850 | podea | Congelator: Jos / Sus / Fără; Mânere da/nu (da) |
| `appliance.oven` | Cuptor încorporabil | 600×550×600 | perete (700 mm) | Butoane da/nu (da) |
| `appliance.cooktop` | Plită | 600×520×50 | perete (900 mm) | Număr de ochiuri 2–5 (4) |
| `appliance.washer` | Mașină de spălat | 600×600×850 | podea | Încărcare pe sus da/nu (nu) |
| `appliance.hood` | Hotă | 600×500×800 | perete (1500 mm) | Stil: Coș / Plată |

**Iluminat și decorațiuni**

| ID | Denumire | Implicit (L×A×Î mm) | Montaj | Parametri |
|---|---|---|---|---|
| `decor.floor-lamp` | Lampă de podea | 400×400×1600 | podea | Abajur: Con / Cilindru / Sferă |
| `decor.ceiling-light` | Plafonieră | 400×400×100 | tavan | Stil: Disc / Pătrată |
| `decor.pendant` | Lustră | 500×500×700 | tavan | Stil: Pendul |
| `decor.mirror` | Oglindă | 600×30×900 | perete (1000 mm) | Formă: Dreptunghiulară / Ovală; Ramă da/nu (da) |
| `decor.picture` | Tablou | 600×30×800 | perete (1300 mm) | Ramă: Subțire / Groasă; Passe-partout da/nu (da) |
| `decor.plant` | Plantă | 450×450×1200 | podea | Specie: Ficus / Palmier / Cactus |

**Diverse**

| ID | Denumire | Implicit (L×A×Î mm) | Montaj | Parametri |
|---|---|---|---|---|
| `misc.desk` | Birou | 1400×700×750 | podea | Sertare: Dreapta / Stânga / Fără; Picioare: Picioare / Panouri |
| `misc.office-chair` | Scaun de birou | 600×600×1000 | podea | Cotiere da/nu (da) |
| `misc.storage` | Corp de depozitare | 800×400×1800 | podea | Număr de fronturi 1–4 (2); Tip fronturi: Uși / Sertare / Deschis (rafturi); Mânere da/nu (da); Bază: Soclu / Picioare / Fără |
| `misc.stool` | Puf / taburet | 400×400×450 | podea | Formă: Rotundă / Pătrată |

## 3. Modificări ale modelului de date și migrări

- **Schema nu s-a modificat** (`CURRENT_VERSION` = 1): `objects`, `catalogSnapshot.items`, `params`, `size`, `paramSpecs`, `sizeLimits`, `recipe` existau deja. **Nicio migrare** necesară; formatul `.roomcraft.json` e neschimbat; documentele existente rămân valide (testat).
- Documentul stochează doar JSON: ID, `catalogItemId`, poziție/rotație/elevație/dimensiuni (mm), `params`, `colorHex`, `name`; nimic din Three și nicio geometrie generată (testat: fișierul exportat nu conține `BufferGeometry`/`Float32Array`).
- Adăugat în domeniu: reguli de integritate `object-param-invalid` (eroare) și `object-param-unknown` (avertisment); `BoxDesc.params` în `SceneDescription` (hash-ul scenei include acum parametrii — hash-urile docurilor cu obiecte se schimbă, niciun test de referință nu depindea de valori fixe).
- Snapshot: itemul se copiază în `catalogSnapshot` la prima utilizare; o versiune nouă în catalogul aplicației **nu** schimbă proiectul existent (testat).

## 4. Teste și rezultate (Node 22.23.4)

- `pnpm verify`: **verde** — format, lint, typecheck, depcruise (92 module, 0 încălcări), licențe (535 pachete, 0 încălcări), **469 teste** în 27 de fișiere, build static.
- `pnpm verify:e2e`: **verde** — 63 la rădăcină (Chromium/Firefox/WebKit), 63 sub `basePath=/rc-test`, 21 de stocare; `catalog.spec.ts` rulează în ambele medii.
- Teste noi: `tests/catalog/catalog.test.ts` (schema fiecărui item, licență/preț demo, limite, etichete RO, **toți itemii × {min, implicit, max} × toate variantele de parametri: >600 de cazuri**, cutia părților = dimensiunile cerute, fără NaN, plasă deterministă, căutare), `tests/domain/objects.test.ts` (parametri și dimensiuni pentru fiecare item, adăugare/mutare/rotire/duplicare/ștergere, limite, ID-uri, elevații podea/perete/tavan, plasare automată fără suprapuneri, integritate, v2 de catalog, export/import, compatibilitate, scenă), `tests/state/objects-session.test.ts` (undo/redo pe 8 pași cu etichete, autosave, restaurare după redeschidere, undo declanșează autosave), `tests/ui/catalog.test.tsx` (browser, panou, plan 2D cu mouse/tastatură, doar-citire, 2D↔3D, selecție comună), `tests/ui/viewer-3d-furniture.test.ts` (obiecte → geometrii Three, cache, bounds, performanță), `tests/ui/prerender.test.tsx` (catalogul se prerandează fără DOM/WebGL/Three), `e2e/catalog.spec.ts`.
- **Acoperire** (`vitest --coverage`, acum incluzând `src/catalog`): total 95,98% instrucțiuni / 90,15% ramuri; `catalog` 99,45% / 94,44%; `domain/objects` 95,67% / 92,59%. Componentele React nu intră în raport (sunt acoperite prin teste UI și e2e).
- **Performanță, 100 de obiecte** (Node, măsurat în test): adăugarea a 100 de obiecte 43 ms; scenă 1 ms; geometrii 11 ms; reconstruire după mutarea unui obiect 2 ms; 11.576 de triunghiuri, 41 de geometrii distincte (geometriile identice se partajează). Pragurile din test sunt largi (secunde), nu fixe pe aceste valori. **Nu s-a măsurat FPS în browser** (doar timpii de pregătire a datelor).
- Verificare vizuală (capturi, nu automatizate): miniaturile arată recognoscibil (canapele, fotolii, mese, lustră etc.); în 3D, obiectele stau pe podea/perete, selecția are contur turcoaz.
- Prima mea ciornă a plasării automate împrăștia obiectele în afara camerei când erau multe; descoperit la captura de ecran, corectat (căutare pe grilă în interior) și acoperit de test.

## 5. Limite și funcționalități amânate

- Selecția **prin clic în 3D** e testată doar cu un stub de canvas (jsdom nu are WebGL) și manual pe captură; **nu există test e2e cu raycast real**. Mutarea în 3D nu există (doar în planul 2D sau numeric).
- Fără redimensionare prin mânere, fără snap la pereți/obiecte (doar la grila proiectului), fără detecție de coliziuni, fără selecție multiplă, fără itemi definiți de utilizator, fără materiale/texturi configurabile (doar culoare), fără iluminare avansată.
- Obiectele de perete se așază lipit de un perete doar la adăugare; ulterior mutarea e liberă (fără lipire).
- Ușa de interior din lista cerută **nu e obiect de catalog**: ușile sunt goluri în pereți (`openings`), deja suportate din 2D. A fost înlocuită cu variante utile (vezi ADR-039); total 41.
- Electrocasnicele sunt `kind: furniture` (categorie „electrocasnice”), planta/tabloul `decor`; nu s-a adăugat un `kind` nou ca să nu se schimbe schema.
- Navigarea tactilă a planului/3D rămâne nevalidată; ordinea alfabetică/relevanța căutării nu e ponderată.
- Prețurile sunt demonstrative.

## 6. Fișiere

Modificate: `README.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md`, `src/app/editor/EditorClient.tsx`, `src/domain/index.ts`, `src/domain/integrity/index.ts`, `src/domain/scene/index.ts`, `src/features/plan-editor/{PlanCanvas,PlanEditor,types}.ts(x)`, `tests/ui/prerender.test.tsx`, `vitest.config.mts` (acoperirea include `src/catalog`).

Noi (față de etapa 3a, care era încă necomisă, apar și fișierele ei): `docs/PRICING_NOTES.md`, `docs/STAGE3A_REPORT.md`, `docs/STAGE3B_REPORT.md`, `e2e/catalog.spec.ts`, `e2e/viewer-3d.spec.ts`, `src/catalog/*`, `src/domain/objects/index.ts`, `src/features/catalog/*`, `src/features/viewer-3d/*`, `src/lib/ids.ts`, `tests/catalog/catalog.test.ts`, `tests/domain/objects.test.ts`, `tests/state/objects-session.test.ts`, `tests/ui/catalog.test.tsx`, `tests/ui/viewer-3d*.test.ts(x)`.

Neatinse și necreate de mine (apar necomise în `git status`): `docs/PlanRoomCraft.md`, `docs/Planul RoomCraft.html`.

Dependențe: niciuna adăugată; versiunile Node/pnpm/pachete neschimbate; niciun script de build suplimentar aprobat.
