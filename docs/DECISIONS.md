# RoomCraft — Registrul deciziilor

> Revizia 2. Format: ADR scurt. **Stare**: `Acceptat` (aprobat de tine) · `Acceptat condiționat` (cu poartă de verificare) · `Propus` (în direcția aprobată, dar fără decizie explicită; se aplică dacă nu obiectezi) · `Respins` · `Înlocuit`.
> „RoomCraft” este un nume **provizoriu** (D9).

## 0. Deciziile tale (D1–D11) și unde sunt integrate

| # | Decizia ta | Stare | ADR | Documente |
|---|---|---|---|---|
| D1 | Next.js cu export static, fără backend/autentificare, dacă arhitectura funcționează pentru toate funcționalitățile | **Acceptat condiționat** — auditul arată compatibil, cu condițiile I1–I8 de dovedit în Etapa 0 | ADR-001, ADR-002 | ARCHITECTURE §13, ROADMAP Etapa 0 |
| D2 | Un singur nivel; model pregătit pentru extindere | **Acceptat** | ADR-006 | DATA_MODEL §2.1 |
| D3 | Pereți drepți; fără curbi, mansarde, geometrii speciale | **Acceptat** | ADR-021 | PRODUCT_SPEC §4.2 |
| D4 | Model pe axe + introducere de dimensiuni interioare; reguli clare pentru grosime, colțuri, uși, ferestre | **Acceptat** | ADR-021 | DATA_MODEL §3.A |
| D5 | Desktop-first, responsive, tabletă; telefon = vizualizare/navigare | **Acceptat** | ADR-025 | PRODUCT_SPEC §2 |
| D6 | ~40 obiecte parametrice, dimensiuni configurabile (mobilier, sanitare, oglinzi, lustre, iluminat) | **Acceptat** | ADR-028 | PRODUCT_SPEC Anexa A, DATA_MODEL §5 |
| D7 | Gresie, faianță, parchet, vopsea; texturi repetabile; proprietăți configurabile; resurse proprii sau cu licență verificată | **Acceptat** | ADR-022 | DATA_MODEL §5, ARCHITECTURE §6 |
| D8 | Prețuri demonstrative vizibile ca atare și editabile; calcule verificabile | **Acceptat** | ADR-023 | ARCHITECTURE §8, DATA_MODEL §6 |
| D9 | Numele rămâne provizoriu | **Acceptat** | ADR-026 | DATA_MODEL §7 |
| D10 | Hostingul se evaluează separat; fără alegere/implementare acum | **Acceptat** | ADR-024 | ARCHITECTURE §12 |
| D11 | Export/import complet pentru reconstruirea 2D, 3D și bugetului | **Acceptat** | ADR-027 | DATA_MODEL §7 |

## 1. Decizii arhitecturale

### ADR-001 — Site static, fără server
**Stare:** Acceptat — validat în Etapa 0 (D1)
**Decizie:** Next.js App Router cu `output: 'export'`; zero rute API, zero server, zero autentificare.
**Validare (2026-10-27):** auditul din ARCHITECTURE §13 trece toate funcționalitățile planificate; incompatibilitățile reale (rute dinamice, antete/redirecționări, `next/image` implicit, prerandarea componentelor client) sunt evitate prin design.
**Validare Etapa 0:** I1–I8 testate cu un build static real servit fără rescrieri, în Chromium, Firefox și WebKit, cu și fără `basePath` (STAGE0_REPORT). S-au găsit două constatări noi (I9 `<Link>` → 404 RSC; I10 lanț de unelte), ambele cu soluții. Alternativa Vite rămâne neadoptată.
**Consecințe:** fără SSR/ISR/Route Handlers dinamice/Server Actions; Konva și Three doar pe client.

### ADR-002 — O singură rută de editor, cu ID în query
**Stare:** Acceptat (consecință a D1)
**Decizie:** `/editor?p=<projectId>` (cu `trailingSlash: true`), nu `/projects/[id]`.
**Motiv:** documentația Next.js confirmă că rutele dinamice cer `generateStaticParams`, iar ID-urile se creează în browser.

### ADR-003 — Konva (react-konva) pentru 2D, cu poartă de confirmare
**Stare:** Acceptat — confirmat tehnic în Etapa 0 („dacă analiza tehnică confirmă”)
**Decizie:** Konva, izolat în `features/editor2d`.
**Motiv:** scene graph, hit-testing, `Transformer`, MIT.
**Validare Etapa 0:** react-konva 19.3.2 + konva 10.9.0 + React 19.3.1 + Next 16.4.3 construiesc și rulează; desenare, tragere de noduri (un pas de undo) și pan/zoom testate în 3 motoare. Limite: performanța a fost măsurată doar indicativ (randare software) și Safari iOS nu a fost testat. SVG rămâne alternativa; costul schimbării e limitat de stratul `domain`.

### ADR-004 — Three.js + React Three Fiber, scenă ca date
**Stare:** Acceptat
**Decizie:** `domain/scene` produce `SceneDescription`; R3F doar o randează. Metri în 3D; transformarea 2D↔3D într-un singur fișier.

### ADR-005 — Unități: milimetri întregi, Y în jos
**Stare:** Acceptat
**Decizie:** lungimi persistente `int` mm; plan cu X dreapta / Y jos; rotație orară.

### ADR-006 — Tabele plate cu `levelId`; un nivel în MVP
**Stare:** Acceptat (D2)
**Decizie:** entități la nivelul documentului; `levelId` pe cele spațiale; validatorul de produs cere exact un `Level`, schema nu.
**Motiv:** extinderea la mai multe niveluri nu cere migrarea documentelor existente. Nu se adaugă câmpuri de rezervă fără utilizare.

### ADR-007 — Graf de pereți la nivel de proiect; camera = buclă de noduri
**Stare:** Acceptat
**Decizie:** pereții și nodurile sunt partajate; `Room.nodeLoop`; poligonul interior se derivă.

### ADR-008 — Valorile derivate nu se stochează
**Stare:** Acceptat

### ADR-009 — Bani în unități minore întregi; rotunjire o dată pe linie
**Stare:** Acceptat
**Verificare (2026-10-27, sursă oficială):** Legea nr. 141/2025, art. 291 alin. (1) Cod fiscal: cota standard 21%, în vigoare de la 1 august 2025 (portalul legislativ legislatie.just.ro; copie ANAF). Cota redusă: 11% (alin. (2)). Valoarea implicită 21% rămâne o **setare** editabilă per proiect și per linie, nu o constantă; se reverifică la lansare.

### ADR-010 — Buget = derivat + suprascrieri + linii manuale
**Stare:** Acceptat

### ADR-011 — Proiectul stochează instantanee ale itemilor din catalog
**Stare:** Acceptat (și baza D11)

### ADR-012 — Dexie pentru IndexedDB; document întreg per salvare
**Stare:** Acceptat (alegere tehnică în direcția aprobată; alternativa `idb` rămâne posibilă)

### ADR-013 — O versiune pentru format și schemă; migrări pure în lanț
**Stare:** Acceptat

### ADR-014 — Import ca date nesigure; copie nouă la conflict de ID
**Stare:** Acceptat

### ADR-015 — Zustand + Immer; undo/redo prin patch-uri inverse
**Stare:** Acceptat — validat în Etapa 0 (vezi ADR-029 pentru regulile rezultate)

### ADR-016 — Editare într-un singur tab pe proiect
**Stare:** Acceptat

### ADR-017 — Politica de licențe și resurse
**Stare:** Acceptat
**Decizie:** permise MIT/ISC/Apache-2.0/BSD/0BSD/CC0/OFL; interzise GPL/AGPL/SSPL/comerciale/necunoscute/NC/ND; CC-BY doar cu atribuire; verificare automată în CI. Resurse doar proprii sau cu licență verificată. SheetJS de pe npm evitat.

### ADR-018 — Export XLSX cu bibliotecă MIT, încărcată leneș
**Stare:** Acceptat (implementat în Etapa 6b cu `write-excel-file`, vezi ADR-042)

### ADR-019 — Modele 3D exclusiv parametrice în MVP
**Stare:** Acceptat (întărit de D6)
**Decizie:** fără glTF în MVP; obiectele sunt generate din rețete versionate.

### ADR-020 — Strategie de testare
**Stare:** Acceptat

### ADR-021 — Convenții geometrice: axe, grosime simetrică, miter/bevel, goluri
**Stare:** Acceptat (D3, D4)
**Decizie:** reguli normative în DATA_MODEL §3.A: axă de referință; grosime simetrică; miter cu limită `4 × t/2` apoi bevel; arii și cote la fața interioară; goluri definite prin centru, în porțiunea dreaptă a ambelor fețe, cu marjă; fără șpalet/prag în calcule; înălțimi uniforme (fără mansarde). Dimensiunile interioare sunt o **intrare de UI** (rectangular nou și editare ortogonală); în document rămân axele.
**Precizări din Etapa 0:** (1) grosimea peretelui este un număr **par** de mm — altfel axele cad la jumătăți de mm; presetări 80/100/150/250/300; (2) limita de miter este distanța nod→vârf > `2·t_max` (≈ 29°) și se aplică doar pe partea reflexă; (3) bevel = capete drepte la nod; (4) toleranța ariei interioare măsurată < 5·10⁻⁵ mm².
**Consecințe:** geometrie testabilă regulă cu regulă; formele generale nu au editare de dimensiuni interioare în MVP.

### ADR-022 — Texturi procedurale repetabile
**Stare:** Acceptat (D7)
**Decizie:** gresie, faianță, parchet, vopsea se redau cu texturi generate din parametri (dimensiune piesă, rost, culori, decalaj, variație, rugozitate, `seed`), la scară reală, în 2D și 3D. Se stochează parametri, nu pixeli.
**Motiv:** licență nulă, configurabil, reproductibil, fișiere mici, aceeași sursă pentru calcul și aspect (dimensiunea piesei).
**Compromis:** aspect mai simplu decât fotografiile; texturile-imagine (CC0 sau încărcate) rămân extensie post-MVP prin `Appearance.texture.type = 'image'`.

### ADR-023 — Prețuri demonstrative și calcule verificabile
**Stare:** Acceptat (D8)
**Decizie:** prețurile din catalog au `origin: 'demo'` și sunt arbitrare (fără mărci/magazine), afișate cu insignă și avertisment, exportate cu coloana „Sursă preț”; editarea le face `user`. Funcțiile de calcul întorc `{ valoare, trace }` din același cod; urma se afișează la cerere.
**Motiv:** onestitate față de utilizator și verificabilitate; urma nu poate diverge de rezultat.

### ADR-024 — Găzduire: evaluată, nealeasă; aplicație independentă de gazdă
**Stare:** Acceptat (D10)
**Decizie:** nu se alege și nu se configurează nicio gazdă. Aplicația nu depinde de antete/redirecționări/rescrieri ale gazdei. Decizia se ia înainte de Etapa 8, după recitirea termenilor și clarificarea caracterului proiectului.
**Constatări (2026-10-27):** Vercel Hobby = doar uz personal necomercial (orice câștig pentru oricine implicat, inclusiv programator plătit, reclame sau plăți = comercial); GitHub Pages nu este destinat business/e-commerce/SaaS comercial; Cloudflare Pages Free are limite generoase (500 build-uri/lună, 20.000 fișiere, 25 MiB/fișier) dar termenii comerciali nu au putut fi confirmați din paginile consultate; Netlify Free e pe credite, termenii comerciali neconfirmați.

### ADR-025 — Trei trepte responsive; telefon = vizualizare
**Stare:** Acceptat (D5)
**Decizie:** desktop ≥ 1280 px, tabletă 768–1279 px (editor complet, tactil), telefon < 768 px (fără unelte de desen, mesaj explicit; edit simplu de valori).

### ADR-026 — Nume provizoriu, identificatori tehnici stabili
**Stare:** Acceptat (D9)
**Decizie:** numele afișat se definește într-un singur loc (constantă de configurare). Identificatorii persistenți rămân neschimbați chiar dacă numele se schimbă: `format: "roomcraft"`, extensia `.roomcraft.json`, baza IndexedDB `roomcraft`, cheia `rc:prefs`. Importul poate accepta ulterior și extensii noi.
**Motiv:** redenumirea produsului nu trebuie să invalideze fișierele existente ale utilizatorilor.
**Poartă:** verificarea numelui/domeniului/mărcii înainte de lansarea publică (Etapa 8).

### ADR-027 — Export autonom
**Stare:** Acceptat (D11)
**Decizie:** fișierul conține `catalogSnapshot` complet (inclusiv rețete+versiuni, parametri, aspect cu `seed`, prețuri și origine), atribuiri, suprascrieri și setări. Test „catalog gol” obligatoriu. Singurul element extern este codul rețetelor, cu înlocuitor pentru rețete necunoscute.

### ADR-028 — Catalog inițial de 40 de obiecte parametrice
**Stare:** Acceptat (D6)
**Decizie:** 20 mobilier + 8 sanitare + 3 oglinzi + 9 iluminat (lista din PRODUCT_SPEC Anexa A). Fiecare cu `sizeLimits` și `paramSpecs`; test parametrizat pe toți itemii la min/implicit/max. Obiectele decorative (pernă, plantă, covor, tablou) sunt tranșa a doua.

### ADR-029 — Undo/redo și autosave: reguli rezultate din prototip
**Stare:** Acceptat (clarificarea 5 a ta; evaluat în Etapa 0)
**Impact asupra modelului de date:** nicio schimbare structurală; trei reguli de comportament.
**Reguli:** (1) istoricul este doar în memorie și se golește la încărcare/import/înlocuire; (2) `updatedAt` se scrie la salvare, nu produce patch-uri; (3) ștergerea unei surse și curățarea derivatelor dependente (suprascrieri de buget, atribuiri) sunt **o singură acțiune/patch** — altfel `undo` restaurează obiectul fără prețul editat; (4) `undo`/`redo` incrementează `editVersion` și declanșează autosave; (5) un proiect nou se salvează imediat; (6) tragerile sunt stare tranzitorie în afara documentului, comise la `pointerup` (un pas, o salvare); (7) salvarea e single-flight, ultimul câștigă, cu verificare de `revision` (conflict între taburi → oprire, fără suprascriere).
**Cost:** istoric de 100 de pași în memorie (patch-uri, nu copii ale documentului).

### ADR-030 — Bugetul agregă pe finisaj înainte de rotunjire
**Stare:** Acceptat (constatare Etapa 0; corectează DATA_MODEL anterior)
**Decizie:** o linie de buget per **finisaj**, nu per atribuire; ariile nete se însumează, se rotunjește o singură dată la ambalaj, costul se alocă pe camere proporțional cu aria (cea mai mare rămășiță). Cheia suprascrierii este `finish:<finishId>`.
**Motiv:** rotunjirea per atribuire dă 4 doze în loc de 3 pentru 4 pereți vopsiți (32,03 m²).
**Efect asupra ID-urilor:** cheile `object:<id>` se remapează la import ca copie; `finish:<finishId>` nu (id de catalog, stabil).

### ADR-031 — Navigarea către editor prin `<a>`, nu `<Link>`
**Stare:** Acceptat (constatare Etapa 0, I9)
**Decizie:** linkurile către `/editor/?p=…` sunt `<a href>`; navigarea programatică folosește `location.assign`.
**Motiv:** `<Link>` cere un payload RSC care dă 404 pe o gazdă statică strictă (apar erori în jurnale, tranziția revine la încărcare completă).

### ADR-032 — Catalog: categorii și numărători unificate
**Stare:** Acceptat (clarificare cerută în Etapa 0)
**Decizie:** 40 de itemi = 20 `furniture` + 8 `sanitary` + 3 `mirror` + 9 `lighting`. `CatalogItem.kind` = `furniture | sanitary | mirror | lighting | decor` (`decor` rezervat, 0 itemi în MVP; `appliance` eliminat). `BudgetCategory` include aceleași valori + `flooring | wall_finish | paint | labor | transport | other`. `Finish.kind` = `tile | wall_tile | parquet | paint` (`laminate` eliminat; parchetul/laminatul folosesc `plank`).

### ADR-033 — Unelte de fundație (Etapa 1a): abateri față de Etapa 0
**Stare:** Acceptat (constatări din implementarea 1a)
- **TypeScript 6.0.3**, nu 7.0.2: `typescript-eslint` cere `typescript <6.1.0`; Next 16.4.3 și `tsc` au mers cu 7.0.2 în spike, dar lintul tipizat nu ar fi suportat. Reevaluare când `typescript-eslint` suportă 7.
- **ESLint 9.39.5**, nu 10: ESLint 10 cere Node ^22.13, iar cerința aprobată este Node ≥ 22.12. (Pachetul este marcat „deprecated” de pnpm; de urmărit.)
- **Vitest 4.1.12 + Vite 6.4.5**: combinația validată în Etapa 0; Vitest 5 / Vite 8 rămân netestate.
- **Scanarea licențelor prin `pnpm licenses list --json`**: `license-checker-rseidelsohn` vedea doar 25 din 511 pachete în layout-ul pnpm (fals pozitiv „0 încălcări”), deci a fost înlocuit; dependența a fost eliminată. Versiunea 5.x cere Node ≥ 24.
- **Excepții de licență** (în `license-policy.json`, cu motiv și domeniu): `@img/sharp-*` (LGPL, libvips), `lightningcss*` și `axe-core` (MPL-2.0), `argparse` (Python-2.0), `caniuse-lite` (CC-BY-4.0). Toate sunt unelte de build/dezvoltare; „fără urme în `out/`” verificat prin căutare de text.
- **dependency-cruiser**: raportorul JSON întoarce mereu cod 0; poarta folosește raportorul implicit (cod 8 la 8 încălcări).
- **Dependențe instalate dar neutilizate încă** (blocare a combinației validate): konva, react-konva, three, @react-three/fiber, @react-three/drei, @types/three.
- Node local izolat pentru lucru: arhiva oficială 22.23.4 verificată cu SHA-256, extrasă în directorul temporar al sesiunii; nicio modificare a Node-ului global.

### ADR-034 — Nucleul domeniului (Etapa 1b): decizii de implementare
**Stare:** Acceptat (implementat și testat)
- **Domeniul nu citește ceasul, nu generează ID-uri și nu folosește API-uri de platformă.** `now` și generatorul de ID-uri vin din exterior; `TextEncoder`, `structuredClone`, `crypto`, `Date.now`, `Math.random` sunt interzise în `src/domain` prin ESLint (testat cu 19 probe), în plus față de regulile dependency-cruiser (care văd doar importurile).
- **Respingere controlată:** `analyzeGeometry` nu aruncă; întoarce probleme cu cod (DATA_MODEL §3.B). `computeBudget` și `buildScene` aruncă `InvalidDocumentError` pe documente invalide, în loc să calculeze „cumva”. Limite noi față de prototip: unghi minim 10°, pereți care se încrucișează, noduri pe pereți, camere consumate de grosimi, maximum 3000 de pereți validați.
- **Buget:** fiecare linie expune `computed` și `effective`, `overridden`, `priceSource`; suprascrierile sunt separate de valorile recalculate; alocarea pe camere cu cea mai mare rămășiță; liniile se sortează după cheie. `Unit` primește `doza`.
- **Catalog:** nu există catalog în domeniu. Nicio funcție nu citește altceva decât `doc.catalogSnapshot`. Itemii: 5 tipuri (`furniture`/`sanitary`/`mirror`/`lighting`/`decor`); finisajele: `tile`/`wall_tile`/`parquet`/`paint`; `tile` cere `piecesPerBox` sau `boxCoverageM2` când prețul e pe cutie.
- **Format:** `assets` trebuie să fie gol în v1; chei periculoase (`__proto__`, `constructor`, `prototype`) și structuri > 40 de niveluri sunt respinse înainte de migrare; registrul de migrări este gol (nu există o versiune anterioară publicată); un fișier `tests/fixtures/v1/studio.roomcraft.json` îngheață formatul — orice schimbare a lui cere versiune nouă și migrare.
- **Corecții găsite în timpul implementării (cu teste de regresie):** `ceilEps(0)` și `roundHalfAway(−0,2)` produceau `−0`; cheia `__proto__` într-un tabel trecea de schemă (zod nu o respinge) și a fost blocată printr-o scanare prealabilă; starea partajată între teste (constante modificate prin referință) a fost eliminată prin copii profunde.
- **Dependențe noi:** `zod` 4.6.7 (producție, validat în Etapa 0), `fast-check` 4.10.2 și `@vitest/coverage-v8` 4.1.12 (dezvoltare). Fără actualizări ale celorlalte.

### ADR-035 — Stare și persistență locală (Etapa 1c)
**Stare:** Acceptat (implementat și testat)
- **Prototipul Etapei 0 a fost reutilizat și întărit**, nu refăcut: Immer `produceWithPatches`/`applyPatches`, Zustand vanilla, Dexie cu concurență optimistă pe `revision`, autosave single-flight cu debounce 800 ms / maxWait 5 s. Regulile ADR-029 sunt respectate (istoric doar în memorie; `updatedAt` aliniat la salvare fără patch; ștergere + curățare în același patch prin `apply`; `undo`/`redo` declanșează salvare; proiect nou salvat imediat; salvare single-flight).
- **Validare strictă la fiecare modificare:** `commit` respinge orice modificare care ar produce un document invalid (schemă + integritate + geometrie), cu costul unei validări complete per acțiune (ordinul milisecundelor la 20 de camere). Consecință: interfața trebuie să construiască modificările atomic, fără stări intermediare invalide; tragerile rămân stare tranzitorie în afara documentului (ADR-029 §6).
- **Rezultatele derivate nu se stochează nicăieri** (document, istoric, IndexedDB): `selectors` le memoizează pe identitatea documentului; testat că rândul din IndexedDB conține doar câmpurile modelului.
- **Eroare de stocare ≠ pierdere:** `status = error`, modificările rămân în memorie, reîncercări automate cu întârzieri crescătoare, `retrySave`, `exportBackup` (funcționează fără stocare), `beforeunload` cere confirmare cât timp există modificări nesalvate.
- **Conflicte (revizie):** stare `conflict` cu trei rezolvări explicite — `reloadFromStorage` (aruncă local), `overwriteStored` (arhivează versiunea suprascrisă ca `pre-overwrite`), `saveAsCopy` (proiect nou). Autosave-ul se oprește cât timp există conflict.
- **Blocare între taburi:** Web Locks per proiect; al doilea tab deschide **doar-citire** (`readOnly && !lockLost`); `takeOver` preia controlul, iar deținătorul pierdut își salvează o ultimă dată și devine doar-citire (`lockLost`). Ștergerea unui proiect deschis în alt tab este refuzată. Fără Web Locks (`NoLockProvider`) rămâne concurența optimistă.
- **Limită cunoscută a preluării controlului:** dacă tabul pierdut își salvează ultima oară DUPĂ ce noul tab a încărcat proiectul, noul tab primește conflict la prima salvare (se rezolvă cu `reloadFromStorage`); nicio modificare nu se pierde.
- **Constatări prin teste în browsere reale:** `navigator.storage.persist()` poate rămâne în așteptare în Firefox (acum limitat la 3 s); bug din Etapa 1b corectat: `computeBudget(doc, model)` nu verifica problemele unui model de geometrie primit din exterior (acum le verifică).
- **Formatul de export/import nu s-a schimbat** (fixture-ul înghețat v1 trece neschimbat). Refactor intern: `parseProjectDocument` este conducta comună pentru import și pentru încărcarea din IndexedDB.
- **Dependențe noi (exacte):** `dexie` 4.4.7, `immer` 11.2.9, `zustand` 5.0.16 (producție); `fake-indexeddb` 6.2.6 (dezvoltare). Toate validate în Etapa 0.

### ADR-036 — Interfața de proiecte și integrarea sesiunii (Etapa 2a)
**Stare:** Acceptat (implementat și testat)
- **Compoziția:** adaptorul pentru browser stă în `src/lib/project-runtime/` (nu în `features/`, care nu poate importa `persistence/`), se inițializează numai pe client și este injectabil. Componentele nu duplică logica de stare; toate trec prin `ProjectManager`/`ProjectSession`.
- **Navigare:** `<a href>` cu `asset()` / `editorHref()` pentru toate trecerile între rute (ADR-031); `runtime.navigate` (`location.assign`) pentru navigarea programatică după creare. Un proiect se deschide din URL (`?p=<id>`), inclusiv la reîncărcare directă.
- **Corecții în stratul de stare găsite la integrare (cu teste):** (1) deschiderile simultane ale aceluiași proiect (StrictMode) primesc aceeași sesiune; (2) redeschiderea imediat după `dispose()` așteaptă eliberarea blocării, altfel ar fi fost doar-citire; (3) `dispose()` marchează sesiunea `closed` de la început, respinge modificări în timpul salvării finale și este idempotent.
- **Proiecte invalide:** `manager.inspect` le semnalează pe card; `listSnapshots` / `restoreSnapshot` permit restaurarea dintr-o copie de siguranță (documentul valid înlocuit se arhivează ca `pre-overwrite`); ștergerea rămâne posibilă. Nu se șterge nimic automat.
- **Persistență cerută la un gest al utilizatorului:** `navigator.storage.persist()` se apelează după crearea unui proiect, nu la încărcarea paginii (în Firefox poate afișa o cerere de permisiune).
- **Teste:** React Testing Library + jsdom pentru comportamentul componentelor, un test în mediu Node pentru prerandare (fără DOM, fără API-uri de browser), Playwright pe build-ul static real (rădăcină și `basePath`, 3 browsere).
- **Dependențe noi (exacte, dezvoltare):** `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.8, `jsdom` 27.4.0 (compatibil cu Node ≥ 22.12). Politica de licențe: **MIT-0** adăugată la licențele permise (strict mai permisivă decât MIT; vine prin `@csstools/*`, dependențe tranzitive ale jsdom).
- **Limite asumate:** fără import de fișiere în interfață (Etapa 2b), fără preferințe în `localStorage`, fără paginare/căutare a listei, sortare fixă după ultima modificare, verificarea documentelor invalide se face prin încărcarea fiecărui proiect la afișarea listei (acceptabil la zeci de proiecte).

---

## 2. Întrebări rămase deschise

Acestea sunt singurele care necesită clarificarea ta. Nu blochează începutul Etapei 0.

| # | Întrebare | De ce contează | Când trebuie răspuns | Recomandare |
|---|---|---|---|---|
| H1 | **Va avea proiectul vreo componentă comercială?** (reclame, abonamente, plată, activitate plătită, afiliere, uz într-o afacere) | Decide gazda (Vercel Hobby exclus; GitHub Pages riscant; celelalte necesită verificarea termenilor) și textele legale | Înainte de Etapa 8 (nu blochează Etapele 0–7) | Dacă nu știi încă, rămânem agnostici; la deploy alegem o gazdă cu termeni clari pentru ambele cazuri |
| H2 | **Domeniu propriu planificat?** | Evită `basePath` și riscul pierderii datelor locale la schimbarea originii (ARCHITECTURE I4, I8) | Înainte de Etapa 8 | Da, un domeniu stabil, chiar dacă numele produsului se schimbă |

## 3. Clarificări acceptate (răspunsul tău după Etapa 0)

Acceptate: interfață în română; RON implicit; TVA configurabil cu 21% implicit (verificat oficial, ADR-009); grosime implicită 100 mm; Dexie; undo/redo în MVP (evaluat, ADR-029); PWA după MVP; Next.js export static direcția preferată (validat, ADR-001). Componenta comercială și domeniul propriu (H1, H2) rămân nedecise și nu blochează.

| Subiect | Valoare implicită |
|---|---|
| Limba interfeței | Română, texte într-un dicționar (pregătit pentru i18n; fără limbă suplimentară în MVP) |
| Monedă / TVA | RON; prețuri cu TVA; cotă implicită 21% editabilă, reverificată la implementare |
| Grosimi de perete | **Acceptat:** implicit 100 mm, editabilă; **număr par de mm**; presetări 80 / 100 / 150 / 250 / 300 |
| Undo/redo | În MVP (din Etapa 2) |
| XLSX | Doar valori formatate; foi: Rezumat / Pe cameră / Linii / Cantități (+ urmă de calcul opțional) |
| PWA / offline instalabil | După MVP |
| Memento de backup | Discret, periodic |
| Biblioteca IndexedDB | Dexie |

## 4. Decizii amânate intenționat
- Scrieri incrementale pe entități în IndexedDB (doar dacă măsurăm probleme).
- Parsare import în Web Worker (doar dacă fișierele reale sunt mari).
- Biblioteca de operații pe poligoane (`polygon-clipping`/Clipper2) — doar dacă geometria proprie nu ajunge.
- Texturi-imagine, glTF, mai multe niveluri, pereți curbi, mansarde — post-MVP.
- Alegerea gazdei (H1, H2).

### ADR-037 — Editorul 2D (Etapa 2b): SVG, operații de editare în domeniu, gesturi pe document temporar
**Stare:** Acceptat (implementat și testat)
- **Suprafața de desen: SVG (React), nu Konva.** ARCHITECTURE §4.7 prevedea Konva; la implementare am ales **SVG** ca abordare principală, pentru că: (1) nu adaugă cod în bundle-ul editorului (Konva/react-konva rămân instalate, dar nu sunt importate de aplicație; se pot elimina sau reevalua), (2) elementele sunt noduri DOM — se testează în jsdom (Konva cere canvas) și se expun cu `data-testid`, roluri și etichete ARIA, (3) planul are zeci de elemente, nu mii (ținta MVP: 20 de camere), deci costul DOM nu contează, (4) coordonatele rămân în mm (`<g transform>` cu `scale(zoom)`), iar grosimile de linie, textul și mânerele au dimensiune constantă pe ecran (`vector-effect="non-scaling-stroke"`, `fontSize = px/zoom`). **Limita asumată:** la sute de camere sau desen liber, SVG-ul ar trebui înlocuit; deoarece `PlanCanvas` doar desenează (primește date, nu sesiunea), schimbarea rămâne locală în `features/plan-editor`. Performanța la 20 de camere nu a fost măsurată.
- **Operații de editare în `domain/edit`** (pure, `Result`, fără ceas/ID-uri proprii — `genId` vine din exterior): `moveNode`, `addWall`, `updateWall`, `removeWall` (+ `wallDeletionImpact`), `addRectRoom`, `updateRoom`, `removeRoom` (+ `roomDeletionImpact`), `addOpening`, `updateOpening`, `removeOpening`, `openingCenterRange`. Reutilizează geometria existentă (`rectAxesFromInterior`, `resizeRectInterior`, `withNodePositions`, `openingRange`); UI-ul nu calculează geometrie în afara proiecției pointer → axa peretelui (poziția golului) și a captării pe grilă/noduri.
- **Validarea rămâne la `ProjectSession.commit/apply`** (schemă + integritate + geometrie). Funcțiile din `domain/edit` verifică doar precondițiile cu mesaje clare (coordonate întregi, grosime pară, dublură, lipsă de loc pentru gol). Codurile de integritate se traduc în mesaje pentru utilizator în `lib/messages.ts` (`describeCommitFailure`).
- **Ștergerea e controlată:** un perete de cameră se șterge doar cu confirmare explicită (dispar camera, golurile și finisajele ei, în UN pas de undo); se **refuză** cu mesaj dacă ar rămâne referințe pe care nu le putem repara singuri (obiecte atașate peretelui, linii manuale de buget legate de cameră/atribuire). Nodurile rămase fără pereți și fără camere se elimină în același pas.
- **Gesturile lucrează pe un document temporar.** În timpul tragerii unui nod sau gol, `PlanEditor` construiește un document-ciornă (`moveNode`/`updateOpening` peste documentul real) și îl desenează; **nu apelează `session.apply` până la eliberare**. Poziția propusă se ține într-un `ref` citit sincron la eliberare, pentru că starea React poate rămâne în urmă după ultimul `pointermove` (bug găsit doar în browser real, nu în jsdom). La eliberare: un singur `apply`; dacă e respins, documentul rămâne neschimbat și utilizatorul vede motivul. În timpul tragerii, o poziție care ar invalida planul este semnalată vizual, fără a bloca gestul. `Escape` anulează gestul fără nicio scriere.
- **Compoziție:** `features/editor-shell` (sesiune, bannere) și `features/plan-editor` nu se importă între ele (regula `features-izolate`); `src/app/editor/EditorClient.tsx` le compune printr-un slot `workspace`.
- **Ergonomie fără drag-and-drop:** toate acțiunile au alternativă numerică sau cu butoane — câmpuri X/Y pentru noduri, formulare „cameră dreptunghiulară” și „perete din coordonate”, butoane ±1 pas pentru poziția golurilor, lista de elemente pentru selecție, butoane de zoom/potrivire. Tastatură: Delete/Backspace, Esc, săgeți (mută elementul selectat cu un pas de grilă, Shift = 10×; fără selecție deplasează planul), `+`/`−`/`0`, `V`/`W`. Comenzile se ignoră când focusul e într-un câmp de formular sau când un dialog este deschis.
- **Editarea e oprită** în `readonly`, `conflict` și `closed`; rămân posibile selecția, zoom-ul și deplasarea. În `error` (stocare) și `saving` editarea continuă, cu banda de stare vizibilă.
- **Limite asumate (amânate):** fără cameră poligonală/desen liber; fără împărțirea unui perete printr-un nod nou (un capăt de perete pe mijlocul altui perete este respins ca `node-on-wall`); fără mutarea unui gol pe ALT perete (doar de-a lungul aceluiași; pentru alt perete: ștergi și adaugi); fără ștergerea directă a unui nod; fără snap la axe/unghiuri; fără gesturi tactile cu două degete (există butoane de zoom); fără selecție multiplă; fără editarea lungimii unui perete ca câmp numeric (se editează coordonatele nodurilor).
- **Dependențe noi:** niciuna. Browserele Playwright se descarcă în cache-ul utilizatorului, nu în proiect.

### ADR-038 — Vizualizarea 3D (Etapa 3a): doar citire, canvas încărcat lazy pe client, fără extensii de domeniu
**Stare:** Acceptat (implementat și testat)
- **Sursa unică de geometrie:** `selectScene(doc)` (`domain/scene`). Componenta React nu recalculează nimic geometric; transformă prismele/podelele în geometrii Three într-un modul pur (`features/viewer-3d/sceneObjects.ts`). **Domeniul nu a fost modificat.** Încadrarea camerei (`sceneBounds`, `frameCamera`) e logică de prezentare, nu geometrie de proiect, deci rămâne în `features/`.
- **Încărcare pe client:** `React.lazy` + randare condiționată de verificarea WebGL (`useSyncExternalStore`, snapshot de server „checking”), nu `next/dynamic`: nu depinde de Next și e testabil în Node (`renderToString`). Respectă lecția N6 din Etapa 0 (import static R3F rupe prerandarea).
- **Nume modul:** `features/viewer-3d` (ARCHITECTURE folosea `viewer3d`; actualizat).
- **2D ↔ 3D:** tab-uri în `app/editor/EditorClient.tsx`; editorul 2D se demontează în 3D (altfel scurtăturile lui ar acționa nevăzut). Starea efemeră 2D (selecție, zoom, unealtă) se pierde la comutare; documentul, istoricul și autosave-ul nu.
- **Camera:** încadrare doar după ce canvas-ul are dimensiuni măsurate (altfel aspect greșit); `OrbitControls` fără amortizare (cea implicită din drei lasă rotație reziduală după reset); unghi polar limitat sub orizontală.
- **Erori controlate:** document invalid → alertă cu motivele; fără geometrie → mesaj; fără WebGL → avertisment; excepție la randare → `RenderBoundary` cu reîncercare.
- **Limite asumate:** fără mobilier/obiecte (`scene.boxes` nu se desenează încă), fără materiale configurabile (podeaua folosește culoarea din document/`#dddddd`, pereții o culoare neutră), fără geam în ferestre, fără tragere de obiecte, navigare tactilă nevalidată, fără test pe proiecte mari.
- **Dependențe noi:** niciuna.

### ADR-039 — Catalog de obiecte și mobilier parametric (Etapa 3b)
**Stare:** Acceptat (implementat și testat)
- **Fără schimbare de schemă.** Modelul v1 conținea deja obiectele, snapshot-ul de catalog, parametrii și limitele; `CURRENT_VERSION` = 1, nicio migrare. Adăugat: validare de parametri în `domain/objects` și în `checkIntegrity` (eroare pentru valori invalide, avertisment pentru chei necunoscute) și `params` în `BoxDesc` (scena le transmite rețetelor).
- **Catalogul = date pure în `src/catalog/`** (nu în `domain/`, care nu cunoaște catalogul aplicației — ADR-011/ARCHITECTURE §6). `domain/` primește itemul ca argument sau îl citește din `catalogSnapshot`.
- **Rețete → părți, nu Three.** O rețetă întoarce primitive (cutie/cilindru/elipsoid) în metri, cu cutia exactă `w×h×d`. Tesselarea e proprie (`mesh.ts`), așa că aceeași geometrie dă: un `BufferGeometry` cu culori pe vârf per obiect în 3D, miniaturile SVG (41 de miniaturi fără 41 de contexte WebGL) și teste în Node. Geometriile identice se partajează (`GeometryCache`); rotația/poziția sunt pe mesh.
- **Lista:** 41 de itemi în 7 categorii (cele cerute în 3b). Abateri față de ADR-032 (20/8/3/9): electrocasnicele sunt `kind: furniture` (categoria „electrocasnice”; `appliance` rămâne eliminat), planta și tabloul sunt `decor` (era rezervat); „ușa de interior” a fost omisă (ușile sunt deja goluri în pereți, `openings`) și înlocuită cu „Puf / taburet” plus variante (canapea 2/3 locuri/colț, dulap 2/3 uși, masă rotundă, lustră).
- **Cadrul obiectului:** origine = centrul amprentei la baza obiectului; fața spre +Y în plan la rotația 0; rotația e orară pe ecran (3D: `rotation.y = −θ`). Montaj podea/perete/tavan cu elevație din catalog (tavan: înălțimea tavanului − înălțimea obiectului, recalculată la schimbarea înălțimii).
- **Plasare:** primul loc liber din prima cameră (după id), pe grilă de 100 mm, în interiorul camerei; obiectele de perete se lipesc de latura cea mai lungă, cu fața spre interior. Mutarea liberă desprinde obiectul de `wallId`.
- **Poziționare în 2D:** tragere cu snap la grila proiectului (Alt = fără snap), un singur commit la final; taste: R / Shift+R rotește 90°, săgeți mută (Shift ×10), Ctrl+D duplică, Delete șterge. În 3D selecția se face prin clic; mutarea în 3D nu există.
- **Selecție comună** ținută în `app/editor/EditorClient.tsx` (features nu se importă între ele); `PlanEditor` și `Viewer3D` primesc selecția și un slot `sidePanel`.
- **Limite asumate:** fără redimensionare prin mânere, fără snap la pereți/obiecte, fără detecție de coliziuni, fără selecție multiplă, fără itemi definiți de utilizator, fără materiale/texturi; mutare doar în planul 2D (sau numeric).
- **Dependențe noi:** niciuna.

### ADR-040 — Materiale și finisaje (Etapa 3c): extinderea modelului existent, fără migrare
**Stare:** Acceptat (implementat și testat)
- **Un singur model.** `Finish` + `FinishAssignment` + `catalogSnapshot.finishes` + `finishAssignments` + bugetul pe finisaje existau din etapa 0/1; nu s-a creat un model paralel. Materialul („definiția”) rămâne în `catalogSnapshot.finishes` (copiat la prima utilizare, autonom — ADR-011/027); aplicarea e `FinishAssignment`; proprietățile specifice aplicării sunt `assignment.look`. Un material din catalog modificat sau eliminat ulterior nu schimbă proiectele (snapshot-ul decide; testat). Materialele nefolosite (preț `demo`) se elimină din snapshot odată cu ultima aplicare.
- **`CURRENT_VERSION` rămâne 1.** Toate schimbările sunt aditive (valori noi de enum, câmpuri opționale, o țintă nouă); documentele v1 se validează și se interpretează neschimbat, deci nu există ce să se migreze. Cost asumat: un fișier care folosește materialele noi nu se deschide în builduri mai vechi (eroare de validare, nu coruperea datelor). O versiune 2 ar fi fost doar formală.
- **Compatibilitate explicită** (`surfaces`) cu `kind` ca rezervă pentru documente vechi; aplicarea incompatibilă e respinsă în domeniu (nu doar ascunsă în UI), iar integritatea o raportează în documente importate.
- **Mobilier: zone, nu componente parametrice.** Rețetele rămân neschimbate; zonele finisabile (`body`, `front`, `top`, `metal`) se deduc din rolurile de culoare ale părților (`slotsOfParts`), deci niciun cod per rețetă. Finisajele de mobilier controlează culoare, rugozitate și metalicitate (nu textură pe obiecte — limită asumată).
- **Pereți individuali:** ținta e fața unui perete (`wallSide`), exact ca în buget; „toți pereții” aplică același material pe fețele camerei într-un singur pas. Benzile de înălțime existente (`fromHeightMm`/`coveredHeightMm`) taie prismele din scenă; UI-ul aplică momentan pe toată înălțimea.
- **Texturi: pixeli deterministi, nu Math.random și nu canvas.** `generateTexture` (RGBA 256×256, tileabil) rulează în Node și în browser; `DataTexture` în Three; miniaturile sunt BMP în data-URL (testabile în jsdom, fără contexte grafice). Scara/rotația se aplică în **UV în lume** (nu în textură), deci o textură de bază servește toate scările (`MaterialCache`). Pe parchet modulul are 2 scânduri pe rând × 10–20 de rânduri (tonuri independente).
- **Buget:** ariile vin din domeniu; o linie per material (ADR-030); finisajele de mobilier = o bucată per zonă, pe camera obiectului, ca **supliment** (prețul obiectului include finisajul standard); categoria liniei generice după suprafețele aplicate; manopera rămâne în linii manuale separate. O suprafață nu se taxează de două ori (o țintă = un material; înlocuirea nu adaugă linii; integritatea respinge suprapunerile).
- **Limite asumate:** fără texturi pe mobilier, fără materiale personalizate ale utilizatorului, fără benzi de înălțime în UI, fără normă de pierderi pe tipuri de ambalaj, fără randare fotorealistă (`MeshStandardMaterial` simplu, fără hărți normale sau reflexii).
- **Dependențe noi:** niciuna.

### ADR-041 — Bugetul în interfață (Etapa 6a): operații pure în domeniu, CSV generat în domeniu, moneda legată de catalog
**Stare:** Acceptat (implementat și testat)
- **Model neschimbat, fără migrare.** `budget.overrides` și `budget.manualLines` existau din etapa 1; `CURRENT_VERSION` rămâne 1, nicio dependență nouă. Interfața doar le editează; cantitățile, totalurile și urma de calcul nu se stochează (se recalculează prin `computeBudget`).
- **Operații pure** (`src/domain/budget/ops.ts`): `addManualLine`, `updateManualLine`, `removeManualLine`, `setBudgetSettings`, plus `setLineOverride` existent. Validează în română, nu modifică documentul primit și trec prin `session.apply` (un pas de undo, autosave).
- **Tab „Buget”** lângă „Plan 2D” și „Vizualizare 3D”, peste aceeași sesiune; are propria graniță de erori (ADR F-05). Valoarea egală cu cea calculată șterge suprascrierea. Cantitatea unei linii manuale legate de o arie e calculată și needitabilă.
- **CSV în domeniu** (`budgetToCsv`, funcție pură, testabilă în Node): BOM, separator `;`/`,`/tab cu virgulă sau punct zecimal, CRLF, protecție împotriva formulelor (apostrof pentru `= + - @` tab CR), coloana „Sursă preț” („Preț demonstrativ” / „Introdus de utilizator”) și avertisment la final. Exportat din `domain/index` separat de `budget/index`, ca să nu creeze ciclu de dependențe.
- **Moneda proiectului nu se poate schimba** dacă un obiect din proiect are preț de catalog în altă monedă: prețurile nu se convertesc, iar integritatea cere aceeași monedă (`currency-mismatch`). Operația refuză din start, cu explicație; în proiecte fără astfel de obiecte moneda se schimbă normal. Conversia valutară e în afara etapei.
- **Fără XLSX în 6a:** cere o bibliotecă nouă (încărcată leneș), deci o decizie separată despre dependențe (Etapa 6b).
- **Limite asumate:** manopera legată de „atribuire” nu se poate crea din formular (se păstrează dacă linia o are); fără ordonare sau filtrare a tabelului; fără paginare; testul manual în Excel RO / LibreOffice nu s-a făcut (CSV verificat prin parsare automată).

### ADR-042 — Export XLSX al bugetului (Etapa 6b): `write-excel-file`, foi construite în domeniu, scriere încărcată la cerere
**Stare:** Acceptat (implementat și testat)
- **Dependență nouă, aprobată explicit:** `write-excel-file` 4.1.1 (MIT; singura dependență proprie, `fflate`, MIT, era deja în arbore). Fixată exact în `package.json`; `license:check` verde (536 pachete). Alternative respinse: ExcelJS (mult mai mare), XLSX scris de mână (cod propriu de întreținut), SheetJS de pe npm (veche, vulnerabilități).
- **Foile sunt funcție pură în domeniu** (`budgetToSheets` în `src/domain/budget/xlsx.ts`, fără bibliotecă): **Rezumat** (setări, subtotal / rezervă / total, nr. de linii demonstrative, avertisment), **Pe cameră** (apoi pe categorie), **Linii** (aceleași coloane ca în CSV). Sumele sunt numere reale (`bani / 100`) cu format `#,##0.00`, nu text; cantitatea are format `#,##0.###`.
- **Scrierea** (`src/features/budget/xlsxExport.ts`) se importă dinamic la clic: biblioteca (≈ 87 KB) stă într-un chunk separat, neadresat de pagina de start sau de editor (verificat în `out/`).
- **Text de utilizator = mereu șir, niciodată formulă.** Nu e nevoie de apostroful din CSV; testul desface fișierul și verifică lipsa oricărui element `<f>`. `=HYPERLINK(...)` dintr-o notă apare ca text.
- **Abateri față de planul inițial:** fără foaia „Cantități” (cantitatea e o coloană în „Linii”) și fără urma de calcul în fișier (rămâne în interfață). Disponibil la cerere, fără schimbare de model.
- **Limite asumate:** fișierul nu s-a deschis în Excel (RO) sau LibreOffice (verificat doar structural: zip valid, foi, șiruri, lipsa formulelor); nu există alegere de separator/format (nu se aplică la XLSX).

### ADR-043 — Selecție multiplă de obiecte în planul 2D (Etapa 6c)
**Stare:** Acceptat (implementat și testat)
- **Domeniu:** `moveObjects`, `duplicateObjects` (`src/domain/objects`) și `removeObjects` (`src/domain/cascade`) aplică operația existentă pe fiecare obiect și sunt **atomice** (un obiect inexistent sau o poziție invalidă respinge tot; documentul primit rămâne neatins). Nicio schimbare de schemă sau de versiune.
- **Selecția:** obiectul principal rămâne `selectedObjectId` (comun cu 3D, catalog, panouri); obiectele adăugate sunt stare locală a `PlanEditor`, **legată de principalul pentru care au fost alese**, deci dacă principalul se schimbă din altă parte (panou, 3D) extrasele nu mai contează. Fără `setState` în efect.
- **Gesturi:** Shift / Ctrl / Cmd + clic adaugă sau scoate un obiect; clic simplu pe un obiect îl selectează doar pe el; clic pe un membru al unui grup îl păstrează și îl trage împreună; Ctrl+A selectează toate obiectele; clic pe fundal sau Escape golește. Tragerea e previzualizată pe un document temporar și scrisă **o singură dată** la final („Mută N obiecte”); săgețile, Ctrl+D și Delete acționează pe tot grupul, fiecare ca un pas de undo.
- **Limite asumate:** fără selecție prin dreptunghi (lasso); **R (rotire) e dezactivat pentru un grup** (rotirea în jurul centrului grupului nu e definită încă); panoul de proprietăți arată în continuare obiectul principal; selecția multiplă nu există în 3D; nu se verifică coliziunile între obiecte la mutare (ca la mutarea unui singur obiect).
- **Observație (preexistentă, nerezolvată):** după ce se adaugă un obiect din catalog, o selecție de cameră/perete rămâne activă, așa că prima apăsare pe Escape deselectează planul, iar abia a doua obiectul.

### ADR-044 — Camere prin drag & drop și layout fără derulare (Etapa 7a)
**Stare:** Acceptat (implementat și testat)
- **Paletă de camere** deasupra planului (Living, Dormitor, Bucătărie, Baie, Hol, Birou, Cameră liberă; dimensiuni interioare, editabile după plasare). Se **trage** pe plan (fantomă care urmărește cursorul, verde = încape, roșu = nu încape, cu dimensiuni și nume) sau se **apasă și apoi se apasă pe plan** (Esc anulează). Cu tastatura, Enter pe o cameră o plasează în centrul planului sau, dacă acolo e ocupat, alipită în dreapta construcției. Eliberarea în afara planului anulează. Tot ce se creează este UN pas de undo („Adaugă cameră”), cu numele și tipul presetului (a doua cameră de același tip primește număr).
- **Lipire** (`snapRoomAnchor`, domeniu, pură): întâi grila (colțul interior), apoi fețele EXTERIOARE ale camerei se alipesc sau se aliniază cu fețele existente, în limita a ~14 px. Candidații care ar urca camera peste un perete existent sunt refuzați (altfel s-ar lipi de fața interioară a vecinului). Validitatea finală se verifică cu aceleași funcții ca la commit (`addRectRoom` + `analyzeGeometry`), deci ce arată fantoma este ce se creează.
- **Mutarea unei camere** (`moveRoom`, domeniu): o cameră deja SELECTATĂ se trage întreagă (nodurile ei și obiectele din interior; golurile merg cu pereții), previzualizată pe document temporar și scrisă o singură dată („Mută camera”). Camera neselectată: prima apăsare doar o selectează, iar tragerea deplasează planul (camerele sunt mari, mutarea accidentală ar deranja). Camerele care împart noduri sau pereți cu alte elemente nu se mută întregi (mesaj explicativ); nodurile se mută separat.
- **Layout:** pe ecrane ≥ 1024 px, planul (sau vizualizarea 3D) și panoul lateral au înălțimea ecranului (`100dvh − 12rem`), rămân lipite sus la derulare, iar panoul lateral (catalog, materiale, proprietăți) se derulează **independent**. Textul-ajutor are înălțime minimă fixă, iar banner-ul „N obiecte selectate” e o suprapunere în plan: nimic din ele nu mai schimbă dimensiunea planului (care s-ar re-potrivi și ar „sări”).
- **Limite asumate:** camera din paletă e dreptunghiulară; fără rotirea camerei la plasare, fără camere poligonale; lipirea se face doar la fețe exterioare (nu partajează pereți: doi pereți vecini rămân doi pereți alăturați, ca la crearea din formular); fără ajutor tactil specific.

### ADR-045 — Lista camerelor și redimensionare din mânere (Etapa 7b)
**Stare:** Acceptat (implementat și testat)
- **Lista camerelor** (`RoomList`, în panoul lateral): nume, tip, suprafața utilă din geometrie (aceeași sursă ca în plan și în buget) și totalul. Un clic selectează camera și, dacă centrul ei e în afara ferestrei, centrează vederea fără să schimbe zoom-ul.
- **Mânere pe laturi** pentru camera dreptunghiulară selectată (4 noduri, laturi aliniate cu axele), peste `resizeRectInterior` existent (dimensiuni interioare, latura opusă fixă). `resizeRoomSide` adaugă dimensiunea minimă de 600 mm pe latură și mesajele în română. Tragerea e previzualizată pe document temporar (cotele se actualizează live) și scrisă o singură dată („Redimensionează camera”); dacă commit-ul o respinge, camera revine și se explică de ce.
- **Poziția mânerelor:** puțin în INTERIORUL camerei (12 px de la fața interioară), nu pe perete; altfel mânerul de la mijlocul peretelui ar intercepta clicul de selectare a peretelui.
- **Camere cu pereți comuni:** redimensionarea mută nodurile comune; vecinul se deformează sau, dacă planul devine invalid, commit-ul îl respinge. Fără regulă specială.
- **Limite asumate:** doar camere dreptunghiulare; fără mânere pe colțuri; obiectele din cameră nu se mută la redimensionare.

### ADR-046 — Pereți comuni între camere și rotirea camerelor (Etapa 8a)
**Stare:** Acceptat (implementat și testat)
- **Cameră cu pereți comuni** (`addRectRoomShared`, `src/domain/edit/shared.ts`): colțurile care coincid cu noduri existente le refolosesc; un colț aflat pe un perete existent îl **desparte** (joncțiune în T, `splitWall`); nodurile existente aflate pe o latură a camerei noi intră în bucla ei; între două noduri consecutive se refolosește peretele existent sau se creează unul nou. Fără nicio coincidență rezultatul e identic cu `addRectRoom` (formularul numeric rămâne pe acesta).
- **Ce se păstrează la despărțirea unui perete:** peretele își păstrează id-ul (primul segment), al doilea segment e nou și moștenește grosimea, înălțimea și cota; camerele care îl foloseau primesc nodul în buclă; **golurile** trec pe segmentul care le conține (cu decalaj relativ), iar dacă un nod ar **tăia** un gol operația e refuzată cu explicație; **finisajele** fețelor peretelui se dublează pe al doilea segment.
- **Fără camere suprapuse:** geometria prinde pereții care se taie, dar nu o cameră cuprinsă într-alta sau două camere cu un singur perete comun. `addRectRoomShared` refuză un colț în interiorul unei camere existente, un nod existent în interiorul camerei noi și duplicarea unei camere (aceleași noduri).
- **Lipire pe axe** (`snapRoomAnchor`): axa unui perete al camerei noi se aliniază cu axa unui nod existent (în limita a ~14 px), deci camerele vecine împart peretele, nu stau cu doi pereți alăturați (înlocuiește lipirea de fețe exterioare din ADR-044). Combinațiile (X, Y) se încearcă de la cele mai mici, întâi cele care aliniază ambele axe; fiecare e validată prin construcție și geometrie, iar dacă niciuna nu e validă rămâne poziția de pe grilă.
- **Camere cu 5+ noduri rămân „dreptunghiulare”:** `analyzeRect` recunoaște cele 4 colțuri și ignoră nodurile coliniare de pe laturi (grosimea unei laturi = a primului ei perete), deci panoul de dimensiuni și mânerele de redimensionare merg și după despărțire. Redimensionarea unei laturi comune **mută peretele pentru ambele camere** (vecinul se micșorează sau crește).
- **Rotirea** (`rotateRoom`): în pași de 90°, în jurul centrului camerei (rotunjit la mm); nodurile buclei și obiectele din interior (poziție și orientare) se rotesc, golurile și finisajele rămân legate de pereți. Tasta **R** (Shift + R în sens invers) sau butoanele din panou rotesc camera selectată; în timpul plasării **R** inversează lățimea și adâncimea camerei din paletă. Un pas de undo.
- **Limite asumate:** o cameră care împarte noduri sau pereți cu alta **nu se mută și nu se rotește întreagă** (mesaj explicativ; nodurile se mută separat sau camera se redimensionează din mânere); doar rotiri de 90°; camerele din paletă rămân dreptunghiulare; ștergerea unei camere cu perete comun lasă peretele (ca înainte: „pereții rămân”).
- **UX:** după plasare, dacă vederea nu a fost mișcată de utilizator și camera iese din cadru, planul se re-potrivește.

### ADR-047 — Mutarea camerelor cu pereți comuni (Etapa 8b)
**Stare:** Acceptat (implementat și testat)
- **Schimbare față de ADR-044 / ADR-046:** `moveRoom` nu mai refuză o cameră cu noduri sau pereți comuni. Mută nodurile buclei ei (inclusiv cele comune cu vecinii) și obiectele din interior; pereții vecinilor care pleacă din nodurile comune se întind, deci **vecinii se deformează**. Validitatea planului rezultat o verifică, ca la orice editare, geometria din commit (previzualizarea din timpul tragerii arată deja eventualele probleme: mesajul roșu și revenirea la eliberare).
- **Rotirea rămâne restricționată** la camerele cu noduri proprii (o rotire în jurul centrului ar deforma vecinii mult mai greu de anticipat); mesajul explică și trimite la mutarea / redimensionarea camerei.
- **Compromis asumat:** pe o cameră cu perete comun, o deplasare perpendiculară pe peretele comun deformează vecina (colțurile ei comune se mută, restul rămâne). Dacă utilizatorul vrea ca vecina să rămână dreptunghiulară, redimensionează din mânere (care mută peretele comun pentru ambele camere) în loc să mute camera.

### ADR-048 — Ștergerea camerelor cu pereți comuni (Etapa 8c)
**Stare:** Acceptat (implementat și testat)
- **Schimbare față de regula „o cameră ștearsă nu desface planul”:** `removeRoom` primește opțiunea `withWalls`. Cu ea se șterg pereții buclei camerei pe care nu-i folosește nicio altă cameră (`roomOwnWalls`), împreună cu golurile și finisajele lor, iar nodurile rămase fără pereți dispar (`pruneOrphanNodes`). Pereții comuni cu alte camere rămân; finisajele feței lor dinspre camera ștearsă dispar. Fără opțiune, comportamentul rămâne cel vechi (pereții rămân).
- **UI:** dialogul de ștergere a camerei are acțiunea implicită „Șterge camera și pereții” și una secundară „Doar camera” (`ConfirmDialog` acceptă `secondary`). Dacă toți pereții sunt comuni, dialogul e cel vechi. Un pas de undo.
- **Refuzuri:** ștergerea cu pereți e refuzată dacă pereții au obiecte atașate sau dacă o linie manuală de buget e legată de cameră sau de finisajele pereților (aceleași blocaje ca la ștergerea unui perete); utilizatorul poate alege „Doar camera”, care are propriile verificări.
- **Limite asumate:** joncțiunile în T create la despărțirea unui perete rămân (peretele vecinei rămâne în două segmente); pereții desenați liber nu sunt afectați.

### ADR-049 — Camere în formă de L și mânere pe laturile oricărei camere rectilinii (Etapa 9a)
**Stare:** Acceptat (implementat și testat)
- **Camere cu laturi aliniate la axe, de orice formă:** `addPolyRoomShared` construiește o cameră din poligonul ei INTERIOR (L, T, U…), cu aceleași reguli ca la dreptunghi: noduri și pereți comuni refolosiți, pereți existenți despărțiți în T unde colțurile cad pe ei, goluri și finisaje păstrate. `axesFromInteriorPolygon` calculează axele pereților (fiecare latură împinsă spre exterior cu T/2; la colțul reflex a L-ului peretele orizontal al crestăturii stă DEASUPRA interiorului). `addRectRoomShared` rămâne un caz particular. Nicio schimbare de schemă (rămâne `nodeLoop`).
- **Fără suprapuneri, pe poligon:** verificarea din ADR-046 nu mai folosește caseta (bbox) camerei, ci poligonul: un colț în interiorul unei camere existente, un nod existent strict în interiorul poligonului noii camere sau o cameră duplicată sunt refuzate. O cameră mai mică încape deci în „crestătura” unui L fără să fie considerată suprapusă, și poate împărți ambii pereți ai crestăturii.
- **Lipire cu forma** (`snapRoomAnchor` cu `shape`): toate axele distincte ale conturului se pot alinia cu axele nodurilor existente; fiecare combinație (X, Y) e validată prin construcție, ca la dreptunghi.
- **Mânere pe laturi, generale** (`roomEdges`, `moveRoomEdge`): pentru orice cameră cu laturi paralele cu axele. O latură e între doi colți (direcția se schimbă; nodurile coliniare dintre ei fac parte din latură); mutarea ei deplasează toate nodurile laturii pe normala exterioară, iar laturile vecine se întind sau se scurtează. Refuzată sub 600 mm pe o latură sau la inversarea sensului; nodurile comune cu vecinii se mută și ele (vecinii se deformează). Dreptunghiurile păstrează mânerele lor „de dimensiune interioară” (ADR-045); celelalte camere primesc câte un mâner pe fiecare latură (`room-edge-handle-*`), la 30% din lungimea laturii ca să nu acopere cotele.
- **Paletă:** două camere în L („Living în L” 600 × 500 cm cu colț tăiat 250 × 200 cm, „Cameră în L” 450 × 400 cm cu 180 × 150 cm). Fantoma e acum poligonală (banda pereților + interiorul) pentru toate presetările. **R** rotește în patru orientări (la dreptunghi, două); numele primește număr ca la celelalte camere.
- **Rotirea și mutarea** unei camere în L funcționează ca la dreptunghi (aceleași restricții pentru camere cu noduri comune la rotire).
- **Limite asumate:** presetări doar în L (T, U sau forme libere se pot obține din L-uri și dreptunghiuri vecine, dar nu au preset); dimensiunile numerice ale unei camere în L nu se editează în panou (doar prin mânere); notch-ul din preset nu se poate schimba înainte de plasare; obiectele nu se mută la redimensionarea unei laturi.

### ADR-050 — Obiectele rămân în camera lor când conturul camerei se schimbă (Etapa 9b)
**Stare:** Acceptat (implementat și testat)
- **Problema:** când o cameră vecină se deformează (perete comun mutat, cameră mutată cu noduri comune), când o latură se mută, o cameră se redimensionează sau un nod e tras, mobilierul rămânea în aer, în afara camerei.
- **Regula** (`keepObjectsInRooms(before, after)`, domeniu, pură): un obiect care era într-o cameră în `before` (după poziția lui inițială) și al cărui centru nu mai e în conturul acelei camere în `after` e adus înapoi: centrul trece pe cel mai apropiat punct al noului contur, împins spre interior (normala laturii) cu o marjă egală cu jumătate din latura mai mică a obiectului (50–600 mm). Obiectele neafectate (încă înăuntru sau fără cameră) rămân neatinse, iar legătura de perete a unui obiect adus înapoi se desface (ca la mutarea liberă).
- **Unde se aplică** (în aceeași operație, deci în același pas de undo): `moveNode`, `moveRoom`, `moveRoomEdge`, `resizeRoomSide`. Nu se aplică la rotirea unei camere (obiectele se rotesc cu ea) și nu la editările care nu schimbă conturul.
- **Limite asumate:** se corectează doar centrul obiectului, nu amprenta întreagă (un obiect mare poate depăși peretele cu o parte din el); nu se verifică ciocniri între obiectele aduse înapoi; geometria nevalidă nu se corectează (o respinge commit-ul); camera la care ajunge un obiect e cea din care făcea parte, nu vecina peste care a trecut peretele.

### ADR-051 — Vederi 3D, pereți tăiați, centrare pe selecție și context WebGL pierdut (Etapa 10a)
**Stare:** Acceptat (implementat și testat)
- **Vederi:** bara 3D are acum „Resetează vederea” (perspectivă din colț, ca până acum), **„De sus”** și **„Pereți tăiați”**. Camera de sus (`topCamera`, funcție pură, testată pe mai multe rapoarte de aspect) stă deasupra centrului planului, privește în jos, ușor decalată pe Z ca orientarea să nu fie nedeterminată, la o distanță la care tot planul încape. Vederea aleasă se aplică la fiecare apăsare (semnal nou de încadrare); editările din 2D nu mută camera, ca până acum.
- **Pereți tăiați:** comutator (`aria-pressed`) care desenează pereții la 30% din înălțime (scară pe axa de înălțime a grupului peretelui, deci și marginile se scalează), ca interiorul să se vadă din față sau de sus; nu schimbă datele sau scena derivată.
- **Centrează pe selecție:** activ doar cu un obiect selectat (selecția e comună cu planul 2D); ținta camerei trece pe centrul obiectului, iar camera se mută cu aceeași deplasare (distanța și direcția rămân).
- **Context WebGL pierdut:** canvas-ul ascultă `webglcontextlost` (cu `preventDefault`, ca browserul să-l poată reface) și `webglcontextrestored` (cu redesenare). Cât e pierdut, apare un mesaj cu butonul „Reîncarcă 3D” (remontează canvas-ul); la refacere mesajul dispare și scena se redesenează. Proiectul nu e afectat. Verificat în Chromium, Firefox și WebKit cu `WEBGL_lose_context`.
- **Observație WebKit:** la ștergerea resurselor GPU ale contextului pierdut, WebKit scrie în consolă „delete: object does not belong to this context” (avertisment al browserului, fără efect vizibil); testul E2E îl filtrează explicit doar pentru acest scenariu.
- **Nu s-a făcut:** vizualizare 2D + 3D alăturată; tavane (scena nu are tavane); măsurători de performanță sau de memorie (excluse de utilizator); navigare tactilă.

### ADR-052 — Politica de compatibilitate a documentului persistat și import din interfață (audit F-02, F-04, F-09, F-10, F-11, F-14)
**Stare:** Acceptat (implementat și testat)
- **Politica de versiuni (F-04):** schema documentului e strictă, deci orice schimbare a FORMEI persistate (câmp nou sau șters, tip schimbat, **valoare nouă de enum**) crește `CURRENT_VERSION` și adaugă o migrare pură în `domain/io`, cu fixture înghețat pentru versiunea veche. Așa o versiune veche a aplicației (cache de browser, rollback de deploy) spune „creat cu o versiune mai nouă” și nu „proiect invalid”. Aplicată automat: `tests/domain/schema-shape.test.ts` compară amprenta SHA-256 a schemei JSON cu `tests/fixtures/schema-shape.json` și pică, cu instrucțiuni, la orice schimbare nedeclarată; amprenta se actualizează explicit (`UPDATE_SCHEMA_SHAPE=1`) abia după bump-ul de versiune și migrare. Limitele de mărime (`.refine`) nu fac parte din formă.
- **Import din interfață (F-02):** buton + drag & drop în tablou, mai multe fișiere, rezultat persistent pe fișier (succes, copie nouă la conflict de ID, avertismente de coerență, sau cauza respingerii pe etape, în română). Nimic nu se scrie la un import respins. Un backup brut (`…-backup-raw.json`) nu se importă și e explicat.
- **Plafoane (F-10):** 10 MB pentru fișier (verificat înainte de citire); 2000 de intrări pentru dicționarele fără chei-ID. Fără Worker deocamdată.
- **Sănătatea cardurilor (F-09):** verificări secvențiale cu cedarea firului și memorate pe (manager, proiect, revizie).
- **Plecarea din pagină (F-11):** confirmare doar la eroare de stocare sau conflict.
- **Fără Web Locks (F-14):** avertisment explicit în editor; concurența optimistă rămâne a doua linie de apărare.
- **Limite asumate:** rezerva `BroadcastChannel` neimplementată; parsarea importului pe firul principal, nemăsurată; (b) din F-03 (geometria din `commit` reutilizată) nefăcută.

### ADR-053 — Accesibilitate de tastatură și de cititor de ecran pentru editorul desktop (audit F-12)
**Stare:** Acceptat (implementat și testat)
- **Scurtături controlabile (WCAG 2.1.4):** tastele imprimabile cu o singură apăsare (W, V, R, +, =, −, _, 0) se pot opri din comutatorul „Scurtături de tastă” din bara de unelte (memorat în `localStorage` sub `rc:shortcuts`, cu tolerare a lipsei stocării). Nu intră în această categorie și rămân active: Ctrl + A / Ctrl + D, Delete, Escape și săgețile.
- **Fără acțiuni „nevăzute”:** săgețile și scurtăturile cu o tastă nu acționează când focusul e pe un control care își folosește singur tastele (buton, link, tab, câmp, listă, rezumat) — `planKeyAllowed` / `isInteractiveTarget`. Excepție: în timpul plasării unei camere, R (rotire) acționează oricare ar fi focusul (utilizatorul lucrează cu fantoma, iar focusul rămâne adesea pe butonul apăsat înainte), dar tot supus comutatorului; există și un buton „Rotește camera”.
- **Zona planului:** `tabindex=0`, `role="group"`, nume „Zona planului”, descrisă de textul-ajutor, contur de focus vizibil. Alternativele la tastatură ale canvas-ului (lista camerelor, lista „Elemente din plan”, panoul de proprietăți, paleta cu Enter) rămân.
- **Anunțarea selecției:** regiune `role="status"` / `aria-live="polite"` vizuală ascunsă: „Cameră selectată: Living, 11,31 m².”, „Obiect selectat: …”, „N obiecte selectate.”, „Nimic selectat.”.
- **Tab-uri ARIA complete:** `role="tablist"`, roving `tabindex`, săgeți stânga/dreapta (circular), Home, End, activare automată la focus.
- **Preferințe de sistem:** `prefers-reduced-motion: reduce` anulează animațiile și tranzițiile; `forced-colors: active` marchează cu contur stările alese (`aria-pressed/selected/current`, `data-selected`).
- **Verificare automată în teste** (`tests/helpers/a11y.ts`, fără dependențe noi): nume accesibil pentru controale, etichete pentru câmpuri, `alt`, `svg role=img` cu nume, dialoguri cu nume, id-uri duplicate, referințe ARIA inexistente, tablist cu exact o selecție, fără `tabindex` pozitiv. Alternativa (axe-core) ar fi adus o dependență sub licență MPL-2.0, deci neevaluată aici.
- **Limite asumate:** netestat cu cititor de ecran real (NVDA, VoiceOver); contrastul culorilor nu e verificat automat; drag & drop (paleta, mutarea camerelor) rămâne pentru mouse (alternativele de tastatură: Enter pe paletă, lista camerelor, câmpurile numerice din panou, săgețile pentru mutare); `role="img"` al SVG-ului nu expune copiii (selecția se anunță prin regiunea live).

### ADR-054 — Împărțirea editorului 2D în module cu context explicit (audit F-16)
**Stare:** Acceptat (implementat și verificat)
- **Ce s-a făcut:** `PlanEditor.tsx` (1596 de linii) rămâne componenta care ține starea și compune; logica s-a mutat, verbatim, în module din `features/plan-editor/`: `useCanvasHandlers` (apăsare / mișcare / eliberare pe fundal, noduri, pereți, camere, obiecte, goluri, mânere), `usePlanKeyboard` (comenzi de tastatură), `usePlacement` (fantomă, validare, plasare din paletă, ascultători de ecran), `useSelectionActions` (ștergere cu confirmare, duplicare), `planStatus` (anunțul selecției, linia de stare; funcții pure), `editorSupport` (constante, tipurile gesturilor și confirmărilor, `buildRoom`) și componentele `PlanToolbar`, `PlanHint`, `ElementList`.
- **Convenție:** fiecare modul primește un obiect de context cu TIPURI EXPLICITE (nu `any`, nu acces la starea componentei); numele refurilor care se modifică în interior se termină în `Ref` (cerința regulii de lint `react-hooks/immutability`).
- **Regulă pentru viitor:** o funcție nouă de editare intră în modulul potrivit (sau într-unul nou), nu în `PlanEditor`; `PlanEditor` nu trebuie să depășească ~700 de linii.
- **Limite asumate:** contextele sunt late (20–30 de câmpuri) fiindcă gesturile, tastatura și plasarea împart mult din aceeași stare; o a doua etapă ar putea grupa starea în `useReducer` sau în câteva hook-uri de stare, dar nu s-a făcut (risc mai mare, câștig mic acum). `PlanCanvas` și `PropertiesPanel` rămân mari.

### ADR-055 — Memento periodic pentru copia de siguranță (ROADMAP Etapa 8, audit F-22)
**Stare:** Acceptat (implementat și testat)
- **De ce:** proiectele trăiesc doar în browser (IndexedDB); dacă datele site-ului se șterg, se pierd. Importul din interfață (ADR-052) închide bucla; mementoul o face folosită.
- **Regula** (`shouldRemind`, pură, `src/lib/backup-reminder.ts`): se afișează dacă proiectul are conținut (camere, pereți sau obiecte), a fost modificat de la ultima copie (sau de la creare) și au trecut cel puțin **7 zile** de la ea, iar utilizatorul nu a amânat („Mai târziu” = 3 zile) sau refuzat („Nu mai întreba pentru acest proiect”). Un proiect gol sau nemodificat nu declanșează nimic; date invalide nu produc excepții.
- **Stare:** per proiect, în `localStorage` (`rc:backup:<id>`: `lastExportAt`, `snoozedUntil`, `never`), tolerant la lipsa stocării; nu intră în documentul proiectului, în istoric sau în export. Orice export (butonul din antet, banner-ele, mementoul însuși) notează data (`exportBackupFile`).
- **Afișare:** bară informativă, nemodală, în editor, sub bannerele de stare; ascunsă în modul doar-citire. Citită cu `useSyncExternalStore` (ora rotunjită la oră, ca să nu se schimbe la fiecare citire).
- **Limite asumate:** nu apare în lista de proiecte; starea nu se sincronizează între domenii (importul ei nu face parte din fișierul exportat); la un proiect importat, perioada se numără de la crearea lui în fișier.

### ADR-056 — Pagina „Despre / Licențe / Confidențialitate” și notificările terțe (ROADMAP Etapa 8)
**Stare:** Acceptat (implementat și testat)
- **Ce:** pagină statică `/despre/` (componentă de server, fără stocare și fără cereri externe), cu trei secțiuni: despre aplicație (inclusiv avertismentul că estimările sunt orientative), confidențialitate (date doar local, `localStorage` pentru preferințe, fără cookie-uri/analitice/terți, copii de siguranță și mutarea între domenii) și licențe. Legată din subsolul listei de proiecte.
- **Sursa listei de licențe:** `scripts/license-check.mjs --json` generează `src/lib/third-party-licenses.json` (doar pachetele livrate, 68 la data scrierii), iar `THIRD_PARTY_NOTICES.md` împarte arborele de producție în „livrate” și „doar de build” (`BUILD_ONLY`, listă conservatoare). Ambele se regenerează cu `pnpm license:notices` la schimbarea dependențelor.
- **Limite asumate:** textul de confidențialitate descrie comportamentul aplicației, nu e consultanță juridică; nu acoperă jurnalele gazdei (neales încă). Licența codului propriu, găzduirea și domeniul rămân decizii ale proprietarului (`docs/RELEASE_CHECKLIST.md`).

### ADR-057 — Anteturi de securitate și CSP pentru Vercel (ROADMAP Etapa 8)
**Stare:** Acceptat (implementat; verificat local, neverificat pe gazda reală)
- **Context:** decizia proprietarului: găzduire pe Vercel, plan gratuit, domeniu `room-craft`. Site static, fără server propriu, deci anteturile se declară în `vercel.json`.
- **CSP:** `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`. `'unsafe-inline'` la scripturi e necesar fiindcă exportul static Next.js inserează scripturi inline de hidratare, iar nonce-urile cer un server; `worker-src blob:` e cerut de `fflate` (exportul XLSX), `img-src data: blob:` de texturile procedurale. Nu s-a pus `unsafe-eval`. Nicio cerere externă (`connect-src 'self'`).
- **Alte anteturi:** `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy` (fără camera/microfon/geolocație), `COOP: same-origin`, HSTS 2 ani, cache imutabil pentru `/_next/static/`.
- **Verificare:** `scripts/serve-static.mjs` aplică anteturile din `vercel.json` cu `RC_VERCEL_HEADERS=1`; `e2e/csp.spec.ts` (`pnpm e2e:csp`) parcurge proiect → 3D → buget + XLSX → Despre și cere zero încălcări și zero cereri externe. Testul a fost verificat și negativ (fără `blob:` la worker / fără `unsafe-inline` pică).
- **Limite asumate:** `unsafe-inline` slăbește protecția împotriva XSS (aplicația nu are conținut de la terți și nu randează HTML din date, dar rămâne o slăbiciune); `X-Frame-Options`/`frame-ancestors` blochează încorporarea în iframe-uri; testul rulează pe un server local, nu pe Vercel.

### ADR-058 — Temă luminoasă și întunecată
**Stare:** Acceptat (implementat și testat; verificat vizual în Chromium)
- **Alegere:** selector „Temă” (Sistem / Luminoasă / Întunecată) în lista de proiecte, în antetul editorului și în pagina Despre; implicit „Sistem”. Se păstrează local (`rc:theme`), tolerant la lipsa stocării.
- **Mecanism:** `data-theme` pe `<html>`, pus de un script inline din `<head>` (`src/lib/theme-script.ts`) înainte de prima afișare (fără clipire); `src/lib/theme.ts` ține starea (`useSyncExternalStore`) și urmărește preferința sistemului în modul „Sistem”. Scriptul inline e permis de CSP-ul existent (ADR-057).
- **Culori:** tema întunecată INVERSEAZĂ scalele Tailwind folosite (stone, teal, red, amber, emerald, sky: 50↔950 … 400↔600) prin variabilele CSS din `globals.css`, deci clasele existente rămân valide fără `dark:` pe fiecare element. Culori semantice care nu se inversează: `surface` (fostul `bg-white`), `primary`/`primary-hover` și `danger`/`danger-hover` (butoane pline cu text alb). Fundalul modalului e `bg-black/50`.
- **Canvas:** halourile textelor din plan folosesc `surface`; fundalul scenei 3D urmează tema (randare la cerere: `invalidate` la schimbare). Culorile materialelor și ale camerelor ale utilizatorului nu se schimbă.
- **Regulă pentru viitor:** culori noi se iau din scalele existente sau din cele semantice; nu `bg-white` / hex fix în interfață.
- **Limite asumate:** inversarea e mecanică, nu o paletă proiectată; contrastul nu e măsurat sistematic în tema întunecată (verificat doar vizual pe plan, 3D, buget, listă); fără captură automată de regresie vizuală; Firefox/WebKit verificate doar prin testul de tema, nu vizual.
