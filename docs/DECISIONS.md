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
**Stare:** Propus

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
