# Etapa 3c — Sistem de materiale și finisaje (raport)

Stare: implementat; **fără commit** (în așteptarea aprobării). Decizii: ADR-040 în [DECISIONS](DECISIONS.md); arhitectură: ARCHITECTURE §4.8c; model de date: DATA_MODEL §5; prețuri: [PRICING_NOTES](PRICING_NOTES.md).

## 1. Ce s-a livrat

- **36 de materiale** încorporate, offline (`src/materials/catalog.ts`), în 4 categorii: pardoseli (9), pereți (11), alte suprafețe (9), mobilier (7).
- **Texturi procedurale** deterministe și tileabile, generate local (`src/materials/texture.ts`), reutilizate între suprafețe (`MaterialCache`).
- **Aplicare** pe podeaua unei camere, pe toți pereții unei camere (un pas), pe **fața unui perete individual**, și pe **zone de mobilier** (corp, fronturi/accente, blat/lemn/cadru, elemente metalice), cu verificarea compatibilității în domeniu.
- **Panoul „Materiale și finisaje”** în editor (2D și 3D): țintă, listă filtrată după compatibilitate, căutare, categorii, miniaturi, parametri relevanți, eliminare, estimare de buget.
- **3D**: materiale pe fețele pereților (stânga/dreapta independent), podele texturate cu scară reală, mobilier cu rugozitate/metalicitate pe zone; clic pe podea sau față de perete în 3D o alege ca țintă, cu contur.
- **2D**: culoarea podelei pe cameră și o bandă colorată pe fața peretelui finisat (reprezentare simplă, fără texturi).
- **Buget**: contribuția materialelor din suprafețele domeniului (vezi §6).

## 2. Materialele și proprietățile lor

Coloane: `kind` (familia de calcul), suprafețe compatibile, model de textură (sau uniform), proprietăți vizuale, preț demonstrativ (RON). Prețuri **demonstrative**, nu de piață.

**Pardoseli**

| ID | Denumire | kind · suprafețe | Aspect | Preț |
|---|---|---|---|---|
| `mat.parquet.oak-light` | Parchet stejar deschis | parquet · podea | scânduri 140×1200, decalaj 33%, rugozitate 0,55 | 145/m² |
| `mat.parquet.oak-natural` | Parchet stejar natur | parquet · podea | scânduri, 0,55 | 165/m² |
| `mat.parquet.dark` | Parchet închis | parquet · podea | scânduri, decalaj 50%, 0,50 | 185/m² |
| `mat.laminate.grey` | Laminat gri | parquet · podea | scânduri 192×1285, 0,62 | 65/m² |
| `mat.tile.white` | Gresie albă | tile · podea, perete | plăci 600×600, rost 2 mm, 0,30 | 70/m² |
| `mat.tile.grey` | Gresie gri | tile · podea, perete | plăci, ton variabil, 0,40 | 75/m² |
| `mat.tile.marble` | Gresie cu aspect de marmură | tile · podea, perete | plăci cu vene, 0,20 | 120/m² |
| `mat.concrete.polished` | Beton șlefuit | surface · podea, perete | granulație fină, 0,45 | 130/m² |
| `mat.stone.natural` | Piatră naturală | surface · podea, perete | lespezi neregulate, rosturi, 0,70 | 190/m² |

**Pereți**

| ID | Denumire | kind · suprafețe | Aspect | Preț |
|---|---|---|---|---|
| `mat.paint.white-matt` | Alb mat | paint · perete | uniform `#f4f4f2`, 0,95 | 220/doză 10 L |
| `mat.paint.white-warm` | Alb cald | paint · perete | uniform | 230/doză |
| `mat.paint.grey-light` | Gri deschis | paint · perete | uniform | 240/doză |
| `mat.paint.anthracite` | Gri antracit | paint · perete | uniform | 280/doză |
| `mat.paint.beige` | Bej | paint · perete | uniform | 240/doză |
| `mat.paint.sage` | Verde salvie | paint · perete | uniform | 260/doză |
| `mat.paint.blue` | Albastru | paint · perete | uniform | 260/doză |
| `mat.paint.terracotta` | Teracotă | paint · perete | uniform | 270/doză |
| `mat.paint.decorative` | Vopsea decorativă | paint · perete | granulație discretă, 0,80 | 420/doză |
| `mat.concrete.exposed` | Beton aparent | surface · perete | granulație accentuată, 0,85 | 110/m² |
| `mat.wallpaper.discreet` | Tapet cu model discret | surface · perete | motiv romb+punct, contrast mic | 75/m² |

**Alte suprafețe**

| ID | Denumire | kind · suprafețe | Aspect | Preț |
|---|---|---|---|---|
| `mat.wtile.white` | Faianță albă | wall_tile · perete | plăci 300×600, rost 2 mm, 0,15 | 85/m² |
| `mat.wtile.metro` | Faianță tip metro | wall_tile · perete | plăci 75×150, decalaj 50%, 0,10 | 95/m² |
| `mat.wtile.marble` | Faianță marmură | wall_tile · perete | plăci cu vene | 140/m² |
| `mat.wtile.decorative` | Faianță decorativă | wall_tile · perete | plăci 200×200 turcoaz, ton foarte variabil | 130/m² |
| `mat.wood.natural` | Lemn natur | surface · perete, podea | lamele (fibre), decalaj 50% | 160/m² |
| `mat.wood.dark` | Lemn închis | surface · perete, podea | lamele | 175/m² |
| `mat.metal.black` | Metal negru | surface · perete | uniform, metalicitate 0,85, 0,45 | 240/m² |
| `mat.metal.chrome` | Metal cromat | surface · perete | uniform, metalicitate 1, rugozitate 0,12 | 320/m² |
| `mat.glass.clear` | Sticlă | surface · perete | transparență 0,35, rugozitate 0,05 | 280/m² |

**Mobilier** (kind `furniture`, suprafață: obiect, preț = supliment pe zonă finisată)

| ID | Denumire | Aspect | Preț |
|---|---|---|---|
| `mat.furn.mdf-white` | MDF alb mat | uniform, 0,90 | 60/zonă |
| `mat.furn.mdf-grey` | MDF gri | uniform, 0,85 | 60/zonă |
| `mat.furn.wood-natural` | Lemn natur | culoare lemn, 0,60 (miniatură cu fibre) | 220/zonă |
| `mat.furn.wood-dark` | Lemn închis | culoare lemn închis, 0,55 | 250/zonă |
| `mat.furn.gloss-white` | Finisaj lucios alb | uniform, rugozitate 0,12 | 180/zonă |
| `mat.furn.matte-black` | Finisaj negru mat | uniform, 0,90 | 150/zonă |
| `mat.furn.metallic` | Finisaj metalic | metalicitate 0,9, 0,30 | 300/zonă |

**Proprietățile aplicării** (afișate doar când au sens, `finishParamRules`): *culoare* — vopsele, finisaje de mobilier (nu texturi, nu sticlă); *scara texturii* (25–400%) și *rotația* (0–359°) — materiale texturate (nu mobilier); *rugozitate* — materiale uniforme și mobilier; *rebut* — materiale cu cantitate în m²/doze (nu mobilier).

## 3. Arhitectura definițiilor și aplicărilor

- **Definiția** = `Finish` în `catalogSnapshot.finishes` (copiat la prima utilizare; un material deja prezent rămâne cel din proiect). Referit prin `finishId` din oricâte aplicări: același parchet în trei camere = o definiție, trei atribuiri.
- **Aplicarea** = `FinishAssignment { id, target, finishId, wastePct, look? }`; ținte: `roomFloor`, `wallSide` (față de perete, cu benzi de înălțime opționale), `objectSlot { objectId, slot }` (nou).
- **Proprietățile aplicării** = `assignment.look` (culoare, scară, rotație, rugozitate) — separat de definiție; schimbarea lor nu duplică materialul.
- **Aspectul rezolvat** (`resolveLook`) = definiție + aplicare → JSON cu cheie după conținut; scena (`SceneDescription.looks`) conține câte un aspect pe cheie, deci același material pe 8 suprafețe apare o singură dată.
- Documentul nu conține nimic din Three: doar JSON (testat: export fără `MeshStandardMaterial`/`DataTexture`).
- Straturi: `domain/finishes` (pur) → `domain/scene` → `features/viewer-3d` (`MaterialCache`, geometrie) și `features/materials` (panou) compuse în `app/editor`; `src/materials` pur (texturi, miniaturi), importat de features, nu de domeniu.

## 4. Modificări ale modelului de date și migrări

- **`CURRENT_VERSION` rămâne 1, nicio migrare** (justificare în ADR-040): schimbări aditive — `kind` + `surface`/`furniture`; câmpuri opționale `category`, `surfaces`, `appearance.metalness/opacity`; 7 modele de textură; `look?` pe atribuire; ținta `objectSlot`. Documentele v1 se validează și funcționează identic (testat prin export→import al documentului de referință, egalitate exactă).
- Cost asumat: un fișier care folosește câmpurile noi nu se deschide în versiuni mai vechi ale aplicației (validare eșuată). Un salt de versiune ar fi fost doar formal.
- Integritate nouă: `finish-incompatible`, `assignment-object-missing`, `object-slot-assigned-twice` (erori), `finish-look-unused` (avertisment). `removeObject` șterge zonele finisate ale obiectului și materialele rămase nefolosite; `duplicateObject` le copiază; `remapIds` rescrie ținta `objectSlot`.
- `SceneDescription`: `looks`, `Prism.left/right`, `FloorDesc.look`, `BoxDesc.slots`; prismele se taie la marginile benzilor de înălțime (testul vechi „L: 4 prisme” a devenit 6 cu benzile din documentul de referință, 4 fără finisaje).

## 5. Texturi

Generate de `generateTexture` (RGBA 256×256, 256 KB, tileabil, `DataTexture` în Three): `tile_grid`, `marble_tile` (vene deformate, per placă), `plank` (rânduri × 2 scânduri, tonuri independente, fibre anizotrope, rosturi), `speckle`, `flagstone` (Voronoi periodic), `wallpaper`, `brushed`. Determinism: fără `Math.random` (hash întreg); scara/rotația sunt în UV (lumea reală), deci aceeași textură servește toate scările. Măsurat: 20 de texturi în 241 ms (12 ms/buc) și 36 de miniaturi în 218 ms în Node.

## 6. Integrare cu bugetul și ipoteze

Se reutilizează calculul existent (`computeBudget`), nu o aproximare în UI: panoul afișează liniile `finish:*` din `selectBudget`.
- **Suprafețe**: podea = aria interioară a camerei; față de perete = lungime × înălțime (bandă) − goluri; rebut (implicit 10% / 5% vopsea); aria netă se însumează pe material **înainte** de rotunjirea la ambalaj (ADR-030): m² (rotunjit la 0,01), doze întregi de 10 L (randament 10 m²/L, 2 straturi), piese/cutii pentru plăci; costul se alocă pe camere (cea mai mare rămășiță).
- **Fără costuri duplicate**: o țintă = un material (aplicarea nouă înlocuiește); aceeași suprafață nu produce două linii; același material în mai multe camere = o linie; integritatea respinge suprapunerile de benzi; o linie manuală legată de atribuire (`assignmentArea`) este manoperă separată (categoria `labor`), nu dublează materialul.
- **Mobilier**: finisajul = o bucată per zonă, ca **supliment** față de prețul obiectului (care include finisajul standard); camera = cea a obiectului; linia apare ca „… (finisaj mobilier, supliment)”, categorie `furniture`.
- **Categorii**: paint → `paint`; mobilier → `furniture`; plăci/suprafețe doar pe pereți → `wall_finish`, altfel `flooring`.
- **Limite**: prețurile sunt demonstrative; manopera, transportul, montajul și pierderile de șantier nu sunt incluse; nu e ofertă. Panoul și bugetul spun explicit acest lucru.

## 7. Teste, acoperire, performanță

Mediu: Node 22.23.4 (arhiva verificată, doar în `PATH` pentru comenzi), pnpm 10.34.9.
- `pnpm verify`: vezi „Rezultate finale” mai jos.
- Teste noi: `tests/domain/finishes.test.ts` (schemă, compatibilitate, aplicare/înlocuire/modificare/eliminare, reutilizare, pereți individuali, zone de mobilier, duplicare/ștergere, integritate și documente invalide, parametri relevanți, buget fără costuri duplicate, scenă cu benzi și aspecte, import/export, remapIds, v2 de catalog, compatibilitatea documentelor vechi), `tests/materials/materials.test.ts` (cele 36 de definiții și lista cerută, schemă, proprietăți vizuale, căutare, texturi: validitate, **determinism**, cheia independentă de scară, tileabilitate, variație, UV, miniaturi BMP), `tests/ui/viewer-materials.test.ts` (prismă cu grupe și UV continuu, contur, **MaterialCache: reutilizare, fără scurgeri la 20 de înlocuiri** — materialul și textura veche primesc `dispose`, mobilier pe grupe, **performanță**), `tests/state/finishes-session.test.ts` (undo/redo pe 5 pași, autosave, restaurare după reîncărcare, copie de siguranță), `tests/ui/materials.test.tsx` (panou, filtrare, aplicare pe podea/pereți/față/obiect, parametri, 2D, 3D prin stub, doar-citire, erori), `tests/ui/prerender.test.tsx` (materialele rulează în Node), `e2e/materials.spec.ts` (Chromium/Firefox/WebKit, inclusiv clic real pe suprafață în 3D, buget, reîncărcare).
- **Acoperire** (`vitest --coverage`): total 96,41% instrucțiuni / 91,42% ramuri; `src/materials` 100% / 95,55%; `domain/finishes` 97,48% / 96,87%; `src/catalog` 99,09% / 94,06%. Componentele React nu intră în raport (acoperite de teste UI/e2e).
- **Performanță** (scenă cu 100 de obiecte, 2 camere, 5 materiale de pereți/podea cu 4 texturi, 40 de zone de mobilier finisate, același material reutilizat): scenă 2 ms; geometrii + materiale 64 ms; 30 de reconstruiri 60 ms (2 ms/buc); 34.728 de vârfuri; 16 materiale Three, 4 texturi (create o singură dată, **0 create la reconstruiri**), 12 aspecte, 81 de geometrii distincte. Nu s-a măsurat FPS în browser.
- **Scurgeri de resurse Three**: testat că 20 de înlocuiri succesive nu cresc numărul de resurse vii (`≤ 8` materiale, `≤ 1` textură) și că evenimentele `dispose` se emit pentru materialul și textura înlocuite; `clear()` la demontare golește cache-ul.

## 8. Limite și funcționalități amânate

- Mobilierul se finisează pe zone (culoare/rugozitate/metalicitate); **fără textură pe obiecte** și fără finisaj per componentă parametrică individuală.
- Benzile de înălțime pe pereți există în model și în scenă/buget, dar **UI-ul aplică pe toată înălțimea** (ex. faianță jos + vopsea sus nu se poate încă face din interfață).
- Fără materiale definite de utilizator și fără import de texturi; fără hărți normale, reflexii sau randare fotorealistă.
- Plafonul nu are material; toată bugetarea e pe pardoseli, pereți și mobilier.
- Selecția în 3D alege fețele pereților și podeaua; capetele/sus-jos ale pereților nu sunt finisabile. Navigarea tactilă rămâne nevalidată.
- Prețurile sunt demonstrative; estimarea nu include manoperă, transport sau pierderi de șantier.
- Materialele de pardoseală (gresie, piatră, beton) se pot pune și pe pereți; calitatea vizuală a texturii pe pereți mari (scară) depinde de parametrul de scară ales de utilizator.
- Un document cu materiale noi nu se deschide în versiuni mai vechi ale aplicației.

## 9. Rezultate finale (Node 22.23.4)

- `pnpm verify`: **verde** — format, lint, typecheck, depcruise (103 module, 0 încălcări), licențe (535 pachete, 0 încălcări), **547 teste** în 32 de fișiere, build static.
- `pnpm verify:e2e`: **verde** — 69 la rădăcină, 69 sub `basePath=/rc-test`, 21 de stocare (Chromium, Firefox, WebKit).
- Primele două rulări e2e au avut câte un eșec **instabil, în WebKit, în teste din etapele anterioare** (clic pe categorie în `catalog.spec.ts`; orbitare cu mouse-ul în `viewer-3d.spec.ts`: gestul pierdut sub încărcare, 3 browsere în paralel). Nu era o regresie de produs; cele două teste au fost făcute robuste (reîncercare a gestului), iar a treia rulare completă a fost verde.
