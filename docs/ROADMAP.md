# RoomCraft — Plan de implementare

> Stare: **Revizia 2** (decizii D1–D11 integrate; [DECISIONS](DECISIONS.md)). Nimic nu se implementează până la aprobarea explicită. Fiecare etapă se încheie cu o **poartă**: criteriile de acceptare trebuie îndeplinite și demonstrate înainte de etapa următoare. Estimările sunt omise intenționat (depind de disponibilitate); ordinea și dependențele sunt cele care contează.

## Principii de ordonare

1. **Întâi domeniul, apoi interfața.** Geometria, banii și migrările se pot demonstra corecte fără UI.
2. **Persistența devreme.** Salvarea, exportul și importul se stabilizează înainte să existe mult conținut.
3. **Riscul mare devreme.** Îmbinările de pereți și integrarea Konva/Next sunt dovedite prin spike-uri cu criterii de oprire.
4. **3D validează modelul.** Un spike 3D minimal apare imediat după desenarea pereților, ca să descoperim devreme dacă modelul comun este suficient.
5. **Fiecare etapă livrează ceva utilizabil și testat.**

## Vedere de ansamblu

| # | Etapă | Rezultat | Risc |
|---|---|---|---|
| 0 | Validare tehnică (executată) | Prototipuri + raport; decizii confirmate | — |
| 1 | 1a Fundația aplicației și porți; 1b Nucleul domeniului | Schelet Next, CI, porți de licență/arhitectură; tipuri, scheme, geometrie, bani, cantități (fără UI) | Mediu |
| 2 | Persistență, export/import | Proiecte salvate, autosave, `.roomcraft.json`, migrări | Mediu |
| 3 | Editor 2D: pereți, camere, goluri (+ spike 3D) | Se pot desena camere reale | **Mare** |
| 4 | Catalog și obiecte | Mobilier plasabil, editabil | Mediu |
| 5 | Finisaje și cantități | Podele/pereți finisate, cantități | Mediu |
| 6 | Buget | Buget editabil, CSV/XLSX | Mediu |
| 7 | Vizualizare 3D completă | 3D din același model | Mediu |
| 8 | Finisare și lansare | A11y, performanță, cross-browser, deploy | Mediu |

(Undo/redo se construiește în Etapa 2/3 în `state/`, nu la sfârșit — adăugarea ulterioară este scumpă.)

---

## Etapa 0 — Validare tehnică (EXECUTATĂ)

**Natura etapei (după clarificarea ta):** prototipuri aruncabile în `spikes/stage0/`, separate de aplicația finală; nu s-a inițializat aplicația. Rezultatele sunt în [STAGE0_REPORT](STAGE0_REPORT.md).

**Ce s-a validat (testat efectiv):** condițiile I1–I8 ale exportului static; React Konva, R3F și persistența locală în Chromium, Firefox și WebKit; geometria pereților cu goluri; export/import cu catalog gol; undo/redo cu autosave; licențe și compatibilitate de versiuni.

**Ce NU s-a făcut și rămâne în Etapa 1a:** scheletul real al aplicației, ESLint/Prettier, `dependency-cruiser`, poarta `license:check` în CI, CI în sine, texturi procedurale, `next/font`, Web Workers.

---

## Etapa 1 — Fundația aplicației și nucleul domeniului (fără UI)

### 1a. Fundația aplicației și porțile — EXECUTATĂ

> Rezultate și abateri față de plan: ADR-033 în [DECISIONS](DECISIONS.md) și raportul de final al etapei. Abateri față de lista de mai jos: TypeScript 6.0.3 (nu 7.0.2) și ESLint 9.39.5 din motive de compatibilitate cu `typescript-eslint` și cu Node ≥ 22.12; scanarea licențelor prin `pnpm licenses` (nu `license-checker`); `THIRD_PARTY_NOTICES.md` se generează la cerere (`pnpm license:notices`), nu e încă comis. Workflow-ul CI există, dar nu a rulat pe GitHub.

**Conținut**
- Inițializare Next.js (App Router, `output: 'export'`, `trailingSlash: true`, `images.unoptimized`), TypeScript `strict` + `noUncheckedIndexedAccess`, Tailwind, ESLint, Prettier, **pnpm**, `.nvmrc` și `engines` (Node ≥ 22.12 LTS) — vezi I10.
- Versiunile validate în Etapa 0 (fixate în lockfile): Next 16.4.3, React 19.3.1, react-konva 19.3.2 + konva 10.9.0, three 0.186.1, @react-three/fiber 9.8.2, @react-three/drei 10.7.9, Dexie 4.4.7, Zustand 5.0.16, Immer 11.2.9, Zod 4.6.7, Tailwind 4.3.3, Vitest (4.1 cu Vite 6 pe Node 22.10; 5.x pe Node ≥ 22.12), Playwright 1.64.
- `dependency-cruiser` cu regulile de straturi (ARCHITECTURE §3).
- Script `license:check` cu listă de permiși **și excepții explicite pentru unelte de build** (ARCHITECTURE §10.2) + `THIRD_PARTY_NOTICES.md`.
- CI (lint, tipuri, teste, licențe, build, e2e pe 3 browsere, build static cu și fără `basePath`).
- Rute: `/` și `/editor/?p=<id>`; linkurile către editor ca `<a>` (I9); helper `asset()`.
- Fără alegerea sau configurarea vreunei gazde (D10).

**Acceptare**
- `pnpm build` produce site static care se deschide fără server; același build funcționează sub `basePath` și fără (test automat).
- `license:check` trece și **eșuează** când se adaugă intenționat o dependență cu licență interzisă (test al porții).
- Regula de dependență eșuează dacă `domain/` importă React (test al porții).
- Dependențe cu licențe verificate, versiuni fixate în lockfile.

### 1b. Nucleul domeniului — EXECUTATĂ

> Rezultate, limite și abateri: ADR-034 în [DECISIONS](DECISIONS.md) și DATA_MODEL §3.B. Sunt implementate în `src/domain/`: schema zod, geometrie (îmbinări, goluri, interior, dimensiuni interioare), validare/integritate cu respingere controlată, bani, cantități, buget cu urmă de calcul și suprascrieri separate, scenă 3D ca date, export/import autonom cu migrări. NU sunt implementate (rămân pentru etapele următoare): persistență, store/undo, UI, catalog real, texturi, export CSV/XLSX.

**Conținut**
- Scheme zod + tipuri (`ProjectDocument` v1), valori implicite, fabrici (`createEmptyProject`).
- `units`, `money` (rotunjire, TVA, formatare), `geometry` (arie, orientare, punct-în-poligon, validare poligon simplu, snap).
- Graf de pereți → amprente cu îmbinări miter/bevel, fețe, lungimi, poligon interior.
- Goluri pe perete, intersecții cu fețe.
- `quantities` (podea, pereți, goluri, plăci, vopsea), `budget` (linii derivate + suprascrieri + manuale + totaluri).
- `integrity` (invarianții din DATA_MODEL §3.1).
- `scene/transform` (2D↔3D) și `buildScene` minimal (pereți + podea).
- Implementarea literală a convențiilor DATA_MODEL §3.A (A.1–A.7), inclusiv calculul axelor din dimensiuni interioare.
- Funcții de calcul care întorc `{ valoare, trace }` (urma de calcul).
- Schema `zod` impune: grosime de perete **pară**, dimensiuni întregi, câmpuri necunoscute respinse.
- Bugetul agregă pe finisaj înainte de rotunjire și alocă pe camere cu cea mai mare rămășiță.
- Acțiunile de ștergere includ curățarea derivatelor dependente în același patch.
- Memoizarea poligoanelor interioare ale camerelor (fără recalculare per obiect).

**Acceptare**
- Cameră creată din dimensiuni interioare `W × D` (cu grosimi egale și diferite) are cote interioare **exact** `W` și `D` și aria `W × D`; verificat pe un set de cazuri și prin teste pe proprietăți.
- Teste dedicate per regulă: miter la 90°/60°/120°, bevel sub ≈ 29°, T cu grosimi diferite (treaptă), gol cu marjă, gol respins în zona îmbinării, gol cu prag/buiandrugă la limite, perete mutat cu gol atașat.
- Urma de calcul reproduce pas cu pas calculul manual al proiectului de referință.
- Acoperire de teste pentru `domain/` ≥ 90% linii, cu focus pe ramuri de margine.
- Proiectul de referință „garsonieră” (cu calcul manual pe hârtie atașat) produce **exact** aria, cantitățile și totalurile așteptate.
- Teste pe proprietăți: arie invariantă la translație/rotație; `Σ linii = total`; ofset interior nu crește aria; transform 2D→3D→2D identitate.
- Cazuri geometrice acoperite: dreptunghi, formă în L, formă în T, nod cu 3–4 pereți, unghi ascuțit (< 30°) cu bevel, perete cu două goluri, gol lipit de capăt (respins/limitat), cameră degenerată (respinsă).
- Nicio dependență de React/DOM în `domain/` (verificat de lint).
- Reproduc în aplicație testele din Etapa 0 (70 de teste unitare din `spikes/stage0/tests`) ca punct de pornire, adaptate la structura finală.

---

## Etapa 1c — Starea editorului și persistența locală — EXECUTATĂ

> Detalii: ADR-035 în [DECISIONS](DECISIONS.md) și ARCHITECTURE §7.6.1. Implementat în `src/persistence/` și `src/state/` (fără UI): depozit Dexie (creare, listare, încărcare, redenumire, ștergere, copii de siguranță), sesiune cu autosave și stări de salvare, undo/redo (100 de pași, doar patch-uri ale documentului), conflicte de revizie și blocare între taburi, erori de stocare/cotă fără pierdere, restaurare după reîncărcare, documente invalide. **Netestat/neimplementat:** interfață (lista de proiecte, indicatori vizuali), import/export prin UI, preferințe în `localStorage`, BroadcastChannel ca rezervă pentru Web Locks, `QuotaExceededError` real (doar simulat), Safari iOS real.

---

## Etapa 2a — Dashboard și integrarea sesiunii — EXECUTATĂ

> Detalii: ADR-036 în [DECISIONS](DECISIONS.md) și ARCHITECTURE §7.6.2. Implementat: `ProjectProvider` + hook-uri peste `ProjectManager`/`ProjectSession`; dashboard (listare, creare, deschidere, redenumire, ștergere cu confirmare, stări de încărcare/goală/eroare/indisponibil/invalid, restaurare din copii de siguranță); ruta editorului `/editor/?p=<id>` cu stări vizibile, bară de sesiune (salvare, undo/redo, export copie, redenumire), bannere pentru doar-citire/conflict/eroare de stocare. **Neimplementat:** editorul 2D/3D, import de fișiere în UI, preferințe, căutare/paginare. **Netestat:** Safari/iOS real, dispozitive tactile, cititoare de ecran reale (doar roluri/etichete ARIA verificate automat).

---

## Etapa 2b — Editorul 2D: pereți, camere, uși și ferestre — EXECUTATĂ

> Detalii: ADR-037 în [DECISIONS](DECISIONS.md) și ARCHITECTURE §4.7 / §7.6.3. Implementat în `src/features/plan-editor/` (SVG) și `src/domain/edit/` (operații pure).
>
> **Livrat:** plan SVG cu scară coerentă, grilă, zoom (butoane, rotiță, taste) și deplasare, potrivire în fereastră · selecție (nod / perete / cameră / gol) cu panou de proprietăți · cote (laturi interioare, suprafață, axa și grosimea peretelui selectat, lungimi în timpul tragerii) în unitatea proiectului · tragerea nodurilor cu un singur commit la final și revenire clară la respingere · unealta „Perete nou” (lanț de pereți, captare pe noduri existente) și formular din coordonate · cameră dreptunghiulară din dimensiuni interioare · ștergere de perete / cameră / gol cu confirmare și tratarea referințelor · editare de grosime și înălțime perete, nume / tip / înălțime tavan / dimensiuni interioare cameră · uși și ferestre: adăugare, repoziționare (tragere, butoane, câmp), dimensiuni, prag, sensul ușii, ștergere · tastatură · stări vizibile pentru doar-citire, conflict, eroare de salvare, salvare în curs, plan invalid.
>
> **Amânat:** cameră poligonală / desen liber · divizarea unui perete printr-un nod nou · mutarea unui gol pe alt perete · ștergere directă de nod · lungimea peretelui ca câmp numeric · snap la axe / unghiuri · riglă grafică · pinch / două degete · layout pe trei trepte și mod doar-vizualizare pe telefon · selecție multiplă · lista camerelor cu arii ca panou separat · spike 3D · măsurarea performanței la 20 de camere.
>
> **Netestat:** dispozitive tactile reale, cititoare de ecran, Safari / iOS real, performanța la 20 de camere (vezi raportul etapei pentru ce browsere au rulat efectiv).

---

## Etapa 2 — Persistență, autosave, export/import, migrări

> Notă: mecanismele de persistență, autosave, undo și blocare au fost livrate în Etapa 1c; în Etapa 2 rămân **interfața** lor (lista de proiecte, indicatori, dialoguri de conflict/eroare, import/export prin fișiere, `rc:prefs`) și integrarea în aplicație.

**Conținut**
- Dexie: magazii `projects`, `documents`, `snapshots`, `userCatalog`.
- Repository (CRUD proiecte, duplicare, ștergere), instantanee, plafon N.
- Document store + undo/redo (patch-uri Immer), actiuni cu validare.
- Autosave (debounce/maxWait/flush la `pagehide`), indicator de stare, gestionare erori și cotă, `storage.persist()`.
- Lock între taburi (`navigator.locks` + rezervă), mod doar-citire.
- Export/import `.roomcraft.json`, lanț de migrare, validare, integritate, politica de ID duplicat.
- `rc:prefs` în localStorage.
- Pagina de start: listă proiecte, creare, redenumire, duplicare, ștergere cu confirmare, import prin selecție de fișier / drag & drop, export.
- Mecanism de migrare cu un exercițiu real: introducem artificial v2 într-un test pentru a dovedi lanțul (fără a livra v2).

**Acceptare**
- Reîncărcare / repornire browser: proiectul rămâne identic (E2E).
- Export → import → export produce fișiere **echivalente** (test automat, inclusiv cu fixture mare).
- Test de autonomie (D11): un fișier importat într-o aplicație cu **catalog încorporat gol** produce același `SceneDescription` (hash) și același buget ca originalul.
- Închidere forțată a tabului în mijlocul editării pierde cel mult ultima fereastră de debounce (test manual + test automat cu timere false).
- Fișiere respinse cu mesaj clar: JSON invalid, plic greșit, versiune viitoare, câmp lipsă, ID orfan, mărime peste limită. Niciun caz nu lasă date parțiale în IndexedDB.
- Cotă simulată plină: aplicația rămâne utilizabilă, banner „Exportă acum”.
- Două taburi pe același proiect: al doilea este doar-citire; fără suprascriere tăcută.
- Fixtures de versiune înghețate rulează prin `migrateToLatest`.
- Undo/redo: ≥ 100 pași; o tragere = un pas; `undo`/`redo` declanșează autosave; un proiect nou se salvează imediat; istoricul se golește la încărcare/import; ștergerea unei surse + curățarea suprascrierilor sunt un singur pas de undo (toate verificate în prototip, de reluat în aplicație).
- Blocarea per proiect cu `navigator.locks` (netestată în Etapa 0; detectarea conflictelor prin `revision` a fost testată, inclusiv în browser cu două taburi).

---

## Etapa 3 — Editor 2D: pereți, camere, goluri (+ spike 3D)

> **Notă după Etapa 2b:** o parte din conținutul de mai jos a fost livrată deja în 2b, cu **SVG în loc de Konva** (ADR-037): pan/zoom, grilă, tastatură, selecție, pereți, cameră dreptunghiulară cu dimensiuni interioare, uși și ferestre, panou de proprietăți, cote. Rămân pentru Etapa 3: cameră poligonală, măsurare, snap la axe / unghiuri, riglă, gesturi tactile și layout responsive pe trepte, lista camerelor cu arii, spike 3D și măsurarea performanței (20 de camere).

**Conținut**
- Canvas Konva cu pan/zoom (conversie lume↔ecran din ARCHITECTURE §5), grilă, riglă/scară grafică, tastatură (săgeți, Del, Esc, Ctrl+Z/Y).
- Unelte: selectare, **cameră dreptunghiulară cu introducere numerică**, cameră poligonală, perete, ușă, fereastră, măsurare.
- Snap la grilă/noduri/axe/unghiuri; reutilizare noduri; cote afișate pe laturi.
- Panou de proprietăți cu câmpuri numerice (alternativă accesibilă la canvas).
- Lista camerelor cu arii (derivate).
- **Spike 3D** (cod real minimal, ascuns în spatele unui comutator): pereți + podea din `buildScene`, orbit.
- Layout responsive pe trei trepte (desktop ≥ 1280, tabletă 768–1279, telefon < 768); pe telefon mod vizualizare fără unelte de desen; gesturi tactile (pinch, două degete, unealta „Mână”), `touch-action: none` pe canvas.

**Acceptare**
- Se poate reproduce planul unui apartament real cu 3+ camere, cu pereți comuni, ±1 mm față de valorile introduse.
- Cota afișată = lungimea reală a fețelor; aria camerei = aria interioară (verificare cu proiectul de referință).
- Perete mutat → toate camerele atașate și golurile se actualizează consistent; fără goluri „plutitoare”.
- Pan/zoom ~60 fps cu 20 camere pe laptop de referință (măsurat și notat).
- Spike 3D: pereții cu goluri și podeaua apar corect pentru formele L și T; **dacă modelul comun nu este suficient, se corectează acum**, înainte de Etapa 4 (poartă explicită).
- Toate acțiunile din editor sunt undo/redo și autosalvate.
- Funcționează cu mouse și cu tabletă (pointer events); pe < 768 px se poate naviga (pan/zoom) dar nu desena, cu mesaj explicativ.
- Dimensiunile interioare introduse la crearea camerei se regăsesc exact în cotele afișate (A.4).

---

## Etapa 4 — Catalog și obiecte

**Conținut**
- Catalog încorporat de **40 de obiecte parametrice** (PRODUCT_SPEC Anexa A: 20 mobilier, 8 sanitare, 3 oglinzi, 9 iluminat) — fiecare cu `defaultSize`, `sizeLimits`, `paramSpecs`, montare, elevație implicită, preț **demonstrativ** (`origin: 'demo'`), proveniență/licență `original`.
- Rețete parametrice versionate (un număr limitat de rețete reutilizate de mai mulți itemi), cu înlocuitor pentru rețete necunoscute.
- Panou de configurare a dimensiunilor și parametrilor în limitele itemului.
- Browser de catalog (căutare, categorii), plasare (click/drag), rotire, mutare, redimensionare numerică + prin mânere, duplicare, ștergere.
- Snapshot în `catalogSnapshot` la prima utilizare.
- Itemi definiți de utilizator (nume, dimensiuni, preț) în `userCatalog`.
- Randare 2D a obiectelor (formă simplă + etichetă + indicator de orientare).

**Acceptare**
- Fiecare item din catalog are `provenance.license` completat și validat în CI; toate prețurile au `origin: 'demo'`, iar `PRICING_NOTES.md` declară că sunt arbitrare.
- Test parametrizat pe **toți cei 40 de itemi × {min, implicit, max}**: rețeta produce geometrie validă (fără NaN, dimensiuni egale cu cele cerute), fișa 2D se desenează, `buildScene` nu aruncă excepții.
- Un document cu rețetă necunoscută se deschide cu înlocuitor și avertisment, fără pierdere de date.
- Obiectul păstrează poziția, rotația și dimensiunile exacte după salvare/reîncărcare/export/import.
- Un item modificat în catalogul încorporat (v2) **nu** schimbă proiectele existente (test).
- Selecție multiplă, mutare în grup, undo/redo funcționează.
- Obiectele cu montare perete/tavan primesc elevația implicită corectă.

---

## Etapa 5 — Finisaje și cantități

**Conținut**
- Catalog de finisaje (gresie, faianță, parchet, vopsea) cu parametri de calcul și prețuri demonstrative (`priceOrigin: 'demo'`).
- Atribuire pe podeaua camerei și pe fața unui perete, înălțime acoperită, rebut, mod de așezare.
- Afișare cantități: arii, bucăți, cutii, litri — cu vizualizarea valorii calculate vs. de achiziție.
- Generator de **texturi procedurale** repetabile (gresie/faianță cu rost, parchet/laminat cu decalaj, vopsea uniformă) cu parametri configurabili: culoare, dimensiune piesă, rost, culoare rost, decalaj, variație de ton, rugozitate, `seed`.
- Umplere 2D cu textura la scară reală; aceeași funcție va alimenta 3D.
- Finisajele de bază ale catalogului (set mic, create de proiect, prețuri demonstrative).

**Acceptare**
- Valorile coincid cu calculul manual din documentul de referință pentru: cameră dreptunghiulară, formă în L, perete cu ușă și fereastră, faianță parțială + vopsea deasupra.
- Modificarea unui perete/gol/dimensiuni actualizează imediat cantitățile (fără desincronizare).
- Rotunjirile în sus nu produc salturi false (test cu valori la limită).
- Finisajul unei fețe nu afectează fața opusă a aceluiași perete.
- Textura: aceeași `seed` și parametri → aceeași imagine (test de hash); dimensiunea pieselor desenate corespunde dimensiunii reale (verificare pe canvas la scară cunoscută).
- Fiecare cantitate afișată are urmă de calcul („De unde vine cifra?”) care coincide cu calculul manual.

---

## Etapa 6 — Buget

**Conținut**
- Tabel de buget: linii derivate (obiecte, finisaje) + manuale + manoperă (cu legare la arii).
- Editare preț/cantitate/TVA/excludere/notă; suprascrieri persistente; indicator „modificat”.
- Totaluri pe cameră, pe categorie, general; TVA, rezervă; mod prețuri cu/fără TVA.
- Export CSV (BOM, separator configurabil, protecție formule) și XLSX (încărcat leneș).
- Disclaimer „estimare orientativă”; insignă „Preț demonstrativ” pe liniile cu `priceSource: 'demo'`; coloană „Sursă preț” în CSV/XLSX.
- Panou de urmă de calcul per linie.

**Acceptare**
- Totalurile proiectului de referință = calcul manual, la bani.
- `Σ linii` = total, pentru orice combinație de suprascrieri (test pe proprietăți).
- Ștergerea unui obiect/atribuiri elimină linia și suprascrierea asociată.
- CSV și XLSX se deschid corect în Excel (RO) și LibreOffice; celula `=HYPERLINK(...)` introdusă într-o notă apare ca text.
- Schimbarea monedei/modului TVA recalculează corect și este reversibilă (undo).
- Nicio valoare demonstrativă nu apare fără marcaj în UI sau în exporturi (test E2E care scanează tabelul și fișierele exportate).
- Urma de calcul a fiecărei linii reproduce suma afișată (test automat: recalculare independentă din urmă = total).

---

## Etapa 7 — Vizualizare 3D completă

**Conținut**
- `SceneDescription` completă: pereți cu goluri, uși/ferestre, podele cu finisaje, fețe de perete cu benzi, obiecte, lumini.
- R3F: orbit, vedere de sus, comutare tavan, selectare obiect → sincronizare cu 2D.
- Actualizare incrementală (hash), `dispose`, `frameloop="demand"`, tratarea pierderii contextului WebGL.
- Texturile procedurale din Etapa 5 aplicate pe podele și fețe de perete, UV în metri (scară reală), cache și `dispose`; calitate „simplă/bună”.

**Acceptare**
- O modificare în 2D (mutare perete, schimbare finisaj, redimensionare obiect) apare în 3D fără reîncărcare și fără reconstruirea întregii scene (măsurat: număr de geometrii recreate).
- ≥ 30 fps la 20 camere / 300 obiecte pe GPU integrat; 30 de minute de editări repetate fără creștere nelimitată a memoriei (profil heap + `renderer.info`).
- Pierdere de context WebGL simulată: aplicația se recuperează sau afișează mesaj; datele nu se pierd.
- Aceleași rezultate vizuale în Chrome, Firefox, Safari (verificare manuală documentată).
- Încărcarea 3D nu mărește bundle-ul paginii de start (verificat în raportul de bundle).

---

## Etapa 8 — Finisare și lansare

**Conținut**
- Accesibilitate (tastatură, etichete, contrast, focus), mesaje de eroare și stări goale, onboarding minimal (proiect de exemplu).
- Performanță (profilare, optimizări măsurate), dimensiune bundle, imagini/miniaturi.
- Teste cross-browser și pe dispozitive, listă de verificare manuală completă.
- Pagină „Despre / Licențe / Confidențialitate” (cu nota despre datele locale și migrarea între domenii), `ATTRIBUTIONS.md`, `THIRD_PARTY_NOTICES.md`.
- **Decizia de găzduire**, luată după recitirea termenilor și după clarificarea caracterului (comercial/necomercial) al proiectului (ARCHITECTURE §12); abia apoi deploy și CI de release.
- Verificarea numelui/domeniului înaintea lansării publice (numele „RoomCraft” este provizoriu).
- Memento periodic „Exportă o copie de siguranță”.

**Acceptare**
- Lista de verificare manuală (ARCHITECTURE §11.2) parcursă integral, fără defecte blocante.
- Audit de accesibilitate automat (ex. axe) fără erori critice; flux principal utilizabil doar de la tastatură în panouri.
- Toate porțile de CI verzi pe `main`; `license:check` verde; fără avertismente de securitate cunoscute în dependențe (`pnpm audit`).
- Un utilizator nou finalizează „cameră → mobilier → finisaj → buget → export” fără ajutor (test cu 3–5 persoane).

---

## După MVP (candidați, neangajați)
PWA/offline instalabil · export PDF/imagine · export glTF · mai multe niveluri · plimbare first-person · umbre/iluminare mai bună · pereți curbi · sincronizare opțională (alegere explicită a utilizatorului) · import catalog din CSV · i18n completă.

## Dependențe între etape
`0 → 1 → 2 → 3 → 4 → 5 → 6`; `7` depinde de `3` (spike), `4`, `5`; `8` la final. Etapele 6 și 7 pot rula în paralel dacă există mai mulți dezvoltatori, deoarece depind doar de domeniu și de `state`.
