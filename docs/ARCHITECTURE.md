# RoomCraft — Arhitectura tehnică

> Stare: **Revizia 2** (decizii D1–D11 integrate; vezi [DECISIONS](DECISIONS.md)). Auditul de compatibilitate cu exportul static este în §13; evaluarea găzduirii în §12. Versiunile bibliotecilor și licențele sunt din cunoștințele autorului acestui document și **trebuie reconfirmate la adopție** (poarta de licențe din Etapa 0, vezi §10 și [ROADMAP](ROADMAP.md)). Etapa 0 (validare tehnică) a fost executată în `spikes/stage0/`; rezultatele sunt în [STAGE0_REPORT](STAGE0_REPORT.md), iar marcajele † de mai jos au fost rezolvate acolo.

## 1. Principii arhitecturale

1. **Domeniul este pur.** Modelul, geometria, calculele, scena 3D (ca date), migrările și validarea sunt TypeScript fără React, fără DOM, fără IndexedDB. Se testează rapid, fără browser.
2. **Un document, mai multe proiecții.** Starea persistentă este un singur `ProjectDocument`. Planul 2D, scena 3D, cantitățile și bugetul sunt funcții pure peste el.
3. **Derivatele nu se stochează.** Arii, poligoane interioare, cantități, totaluri și scena 3D se calculează (memoizat).
4. **Straturi cu dependențe într-o singură direcție** (impusă de lint, vezi §3).
5. **Cod greu și ocazional, încărcat leneș:** Konva, Three/R3F, biblioteca XLSX nu intră în bundle-ul inițial.
6. **Rezultatul este un site static** (`output: 'export'`): fără server, găzduire gratuită.

## 2. Vedere de ansamblu

```
┌─────────────────────────── Browser ───────────────────────────┐
│  UI (Next.js App Router, React, Tailwind)                       │
│   ├─ features/projects   features/editor2d (React Konva)        │
│   ├─ features/viewer3d (R3F)   features/catalog   features/budget│
│   └─ features/io (import/export)                                │
│                │ comenzi (acțiuni validate)       ▲ selectori    │
│                ▼                                  │ memoizați    │
│  state/  ── document store (Zustand + Immer, undo/redo) ──      │
│            └ ui store (selecție, unealtă, viewport) – efemer    │
│                │                                  ▲              │
│                ▼                                  │              │
│  domain/ (pur TS): schema+tipuri · units · geometry · finishes   │
│          quantities · money · budget · scene · migrations        │
│                │                                                 │
│                ▼                                                 │
│  persistence/  Dexie/IndexedDB (proiecte, instantanee, catalog   │
│                utilizator) · autosave · lock între taburi        │
│  prefs/        localStorage (doar preferințe mici)               │
└─────────────────────────────────────────────────────────────────┘
```

Nu există server. Catalogul încorporat este JSON static livrat odată cu aplicația.

## 3. Structura codului și limitele modulelor

```
src/
  app/                    rute Next.js (subțiri: doar compoziție, fără logică)
  domain/                 NU importă nimic din afara domain/ (și zod)
    schema/               zod + tipuri inferate, versiuni de schemă
    units/                conversii mm/cm/m, formatare
    geometry/             vectori, poligoane, ofset, îmbinări de pereți, goluri, snap
    finishes/             reguli de calcul pentru finisaje
    quantities/           arii și cantități
    money/                sume întregi, TVA, rotunjire
    budget/               linii derivate + suprascrieri → totaluri
    scene/                buildScene(doc) → SceneDescription (date; DOAR din document, fără catalog global)
    migrations/           v1→v2…, migrateToLatest
    integrity/            verificări referențiale
  persistence/            Dexie, repository, autosave, instantanee, lock
  state/                  document store, ui store, istoric undo/redo
  features/
    projects/  editor2d/  viewer3d/  catalog/  budget/  io/
  ui/                     componente generice (butoane, dialoguri, câmpuri numerice)
  catalog-data/           catalog încorporat (JSON + schema)
tests/ (unit) · e2e/ (Playwright) · fixtures/ (documente, per versiune)
```

**Reguli de dependență** (verificate automat, ex. `dependency-cruiser` sau `eslint-plugin-boundaries`):

| Modul | Poate importa | Nu poate importa |
|---|---|---|
| `domain` | doar `domain`, `zod` | React, DOM, Konva, Three, Dexie, orice din `features`/`state` |
| `persistence` | `domain`, `dexie` | React, `features` |
| `state` | `domain`, `persistence` (doar prin interfață) | `features` |
| `features/*` | `domain`, `state`, `ui`, biblioteca proprie | alt `features/*` (comunicare prin `state`/`domain`) |
| `app` | `features`, `ui` | `domain` direct pentru logică de business |

Asta limitează costul înlocuirii Konva (doar `features/editor2d`) sau a Three (doar `features/viewer3d`).

## 4. Module — responsabilități

### 4.1 `domain/geometry`
- Tipuri `Point`, `Segment`, `Polygon` în **mm întregi** (vezi §5).
- Arie semnată (formula șireturilor, exactă în întregi), orientare, punct-în-poligon, intersecție segmente, validare poligon simplu (fără autointersecții).
- **Convenții normative** (axă, grosime simetrică, miter/bevel, fețe, goluri, intrare de dimensiuni interioare): DATA_MODEL §3.A. Codul le implementează literal, iar testele citează numărul regulii (A.1…A.7).
- **Din graful de pereți în poligoane:** la fiecare nod, pereții incidenți se sortează după unghi; fețele stânga/dreapta ale pereților adiacenți se intersectează (îmbinare „miter”) cu limită de unghi minim (sub prag → teșire/bevel). Rezultă poligonul de amprentă al fiecărui perete și lungimile reale ale fețelor.
- **Poligon interior al camerei** din bucla de noduri, ofsetat cu jumătate din grosimea fiecărui perete adiacent.
- Goluri: validare că `[offset − w/2, offset + w/2]` încape în fața peretelui și nu se suprapune cu alt gol.
- Snap: la grilă, la noduri, pe axa pereților, la unghiuri multiple de 15°.

### 4.2 `domain/quantities` și `finishes`
Formulele sunt în §8 și sunt funcții pure, testate cu valori calculate manual.

### 4.3 `domain/money` și `budget`
Sume întregi în unități minore, TVA în puncte-bază, politici de rotunjire fixe (§8.3). Bugetul = **linii derivate** (din obiecte și finisaje) **+ suprascrieri utilizator** (după cheie sursă) **+ linii manuale**.

### 4.4 `domain/scene`
`buildScene(doc)` produce `SceneDescription` (citește exclusiv `doc.catalogSnapshot`, niciodată catalogul încorporat — condiție a exportului autonom, verificată în Etapa 0): listă de descriptori (pereți cu profil și goluri, podele, obiecte, lumini), fiecare cu `id`, `hash` de conținut și transformare în metri. Fără obiecte Three. Se testează prin comparare de date.

### 4.5 `state`
- **Document store** (Zustand + Immer): singura cale de modificare sunt *acțiuni* (`addWall`, `moveNode`, `setObjectSize`…) care validează cu domeniul și produc patch-uri Immer. Patch-urile inverse alimentează undo/redo (limită 100).
- **Tragerile** (mutare nod/obiect) modifică o stare tranzitorie în `ui store`; la `pointerup` se comite **o singură acțiune** în document → un pas de undo, o singură declanșare de autosave.
- **UI store** (efemer, nepersistat în document): unealta activă, selecția, viewport 2D, cameră 3D, panouri.
- Selectori memoizați: `selectGeometry`, `selectQuantities`, `selectBudget`, `selectScene` – recalculează doar ce s-a schimbat (chei pe entități/hash).

### 4.6 `persistence`
Vezi §7.

### 4.7 `features/editor2d` (React Konva)
Straturi Konva: grilă (fără ascultare evenimente) · umpleri camere · pereți · goluri · obiecte · cote/dimensiuni · selecție/Transformer · ghidaje de snap. Uneltele sunt mașini de stări mici (select, perete, cameră, gol, obiect, măsurare, pan). Toată logica de decizie (snap, validare) este delegată `domain/geometry`; componentele doar desenează și traduc evenimente de pointer în coordonate lume.

### 4.8 `features/viewer3d` (R3F)
Primește `SceneDescription`, nu documentul. Vezi §6.

### 4.9 `features/io`
Export/import `.roomcraft.json`, export CSV/XLSX; vezi §7.

## 5. Coordonate reale și conversia către coordonate vizuale

### 5.1 Spațiul lume (sursa adevărului)
- **Unitate:** milimetri, **numere întregi** pentru noduri, grosimi, înălțimi, lățimi de goluri. Pozițiile obiectelor sunt rotunjite la 1 mm la comitere.
- **Axe plan:** X spre dreapta, **Y în jos** (ca ecranul și Konva; vedere de sus). Origine arbitrară; documentul poate conține coordonate negative.
- **Rotație:** grade, **în sens orar** pe ecran (consecință a Y în jos), normalizată la `[0, 360)`.
- **Elevație (Z):** mm deasupra pardoselii nivelului; nu apare în planul 2D.
- De ce întregi în mm: arii exacte în mm² (< 2⁵³ pentru orice locuință), egalități fără epsilon, JSON stabil, snap predictibil. Float este permis doar în *derivate* (arie în m², unghiuri).

### 5.2 Spațiul ecran (2D)
```
ecran = lume × zoom + pan        (zoom = px/mm, pan = px)
lume  = (ecran − pan) / zoom
```
Implementare: `Stage` Konva cu `scale = zoom` și `position = pan`; entitățile sunt desenate direct în **coordonate lume (mm)**, iar Konva aplică transformarea. Reguli:
- Grosimi de linie, text și mânere cu dimensiune constantă pe ecran (`strokeScaleEnabled={false}`, scalare inversă pentru text/mânere).
- Pointerul se convertește în lume o singură dată, apoi se aplică snap **în mm**, nu în pixeli.
- Zoom spre cursor: `pan' = cursor − (cursor − pan) × (zoom'/zoom)`.
- Limite zoom (ex. 0,02–2 px/mm) pentru a evita valori degenerate.
- „Scara reală 1:1” pe ecran nu e garantată (DPI necunoscut); se afișează o riglă/scară grafică, nu se promite 1:1.
- Unitatea de **afișare** (mm/cm/m) este doar formatare; nu afectează stocarea.

### 5.3 Spațiul 3D
- Unitate: **metri** (precizie numerică și plan de tăiere camerei rezonabile).
- Mapare: `(x, y)` plan → `(X = x/1000, Z = y/1000)`; `Y` este în sus: `Y = elevație/1000`.
  Vedere de sus cu camera având `up = (0,0,−1)` păstrează orientarea planului (fără oglindire).
- Rotație: rotația din plan θ (orar) ↔ `rotation.y = −θ` (în radiani).
- Conversia este concentrată într-un singur fișier (`domain/scene/transform.ts`) cu teste de tip „dus-întors”.

## 6. Generarea scenei 3D din modelul comun

Flux: `ProjectDocument` → `buildScene` → `SceneDescription` (date) → componente R3F.

| Element | Strategie |
|---|---|
| Perete | Profil 2D în coordonate locale (lungime × înălțime) cu **găuri dreptunghiulare** pentru goluri → `ExtrudeGeometry` pe grosime. Capetele urmează poligonul de amprentă (miter) calculat în `domain/geometry`. |
| Ușă/fereastră | Gaura din perete + obiect decorativ simplu (toc, canat/geam) din primitive. |
| Podea | `ShapeGeometry` din poligonul interior al camerei (triangulare internă Three); material din finisajul atribuit. |
| Fețe de perete cu finisaj | Material pe fața stângă/dreaptă (grupuri de material); înălțimea acoperită (ex. faianță până la 1,2 m) prin împărțirea feței în două benzi. |
| Obiect | Rețetă parametrică versionată (`sofa`, `bed`, `table`, `pendant`…) alimentată de `size` + `params` ale instanței; doar primitive Three în MVP (fără glTF). Rețetă necunoscută → cutie de înlocuire + avertisment. |
| Materiale și texturi | Texturi **procedurale**: un `CanvasTexture` generat din `Finish.tile` + `Appearance` (rost, decalaj, variație, `seed`), modul de 2×2…4×4 piese, `RepeatWrapping`. Repetiția se calculează din dimensiunile reale ale suprafeței (UV în metri). Aceeași funcție de generare alimentează umplerea 2D (pattern Konva) și 3D. Cache pe `hash(finish)`, dimensiune ≤ 1024 px, `dispose()` la eliminare. Determinist: același seed → aceeași textură. |
| Tavan | Opțional, comutabil (ascuns implicit la vedere de sus). |
| Lumini | Ambientală + hemisferică + o direcțională; umbre dezactivate implicit (opțiune „calitate”). |

**Actualizare incrementală:** fiecare descriptor are `id` + `hash`. Componentele React sunt cheiate pe `id`; geometria se memoizează pe `hash`; la dispariția unui descriptor se apelează `dispose()` pe geometrie/material/textură. Nu se reconstruiește toată scena la fiecare modificare.

**Practic:** `dynamic(() => import(...), { ssr: false })`, `frameloop="demand"` (randare doar la schimbări/interacțiune), `dpr` limitat (ex. `[1, 2]`), tratarea `webglcontextlost`, texturi ≤ 1024 px, material comun partajat per finisaj.

## 7. Persistență, autosave, import/export, migrare

### 7.1 Magazii IndexedDB (bază `roomcraft`, prin Dexie)

| Magazie | Cheie | Conținut |
|---|---|---|
| `projects` | `id` | Metadate pentru listă: nume, `createdAt`, `updatedAt`, `schemaVersion`, `revision`, contoare, miniatură (opțional) |
| `documents` | `projectId` | `ProjectDocument` complet (un document per proiect) + `revision` |
| `snapshots` | `id` (index `projectId`) | Copii de siguranță: ultimele N (implicit 5) pe proiect; create înainte de migrare, înainte de suprascriere la import și periodic (ex. la 10 min de editare) |
| `userCatalog` | `id` | Itemi/finisaje create de utilizator (globale, reutilizabile) |
| `assets` | `id` | Rezervat (blob-uri) – gol în MVP |

Proiectul stochează **instantanee (snapshots) ale itemilor folosiți** din catalog, deci este autonom (exportabil, stabil dacă catalogul încorporat se schimbă).

### 7.2 localStorage
Doar preferințe mici, sub cheia `rc:prefs` cu versiune: temă, limbă, unitate de afișare, grilă/snap implicit, ultimul proiect deschis, aranjarea panourilor. Orice citire/scriere în `try/catch`; aplicația funcționează fără el.

### 7.3 Autosave
1. Orice acțiune ce modifică documentul (inclusiv `undo`/`redo`) incrementează `editVersion` (în memorie) și marchează `dirty`. `revision` din IndexedDB crește doar la o salvare reușită. Un proiect **nou** se salvează imediat la creare (altfel primul autosave nu ar avea ce compara). Istoricul undo/redo este **doar în memorie**: se golește la încărcare, import și înlocuire. `updatedAt` se scrie la salvare, nu intră în istoric.
2. Scriere **debounced** (trailing ~800 ms, `maxWait` ~5 s) a documentului întreg + metadatelor într-o **singură tranzacție** Dexie.
3. Flush imediat la `visibilitychange → hidden`, `pagehide` și la navigarea în aplicație.
4. Indicator: „Salvat” / „Se salvează…” / „Nesalvat – eroare”.
5. **Eroare/cotă depășită** (`QuotaExceededError`): starea rămâne în memorie, bandă persistentă „Exportă acum”, fără pierderea sesiunii.
6. Se solicită `navigator.storage.persist()` și se afișează `storage.estimate()` în setări.
7. Document întreg per salvare este suficient pentru MVP (proiecte tipice sub ~1 MB JSON); dacă se măsoară probleme, se trece la scrieri pe entități (decizie ulterioară).

### 7.4 Mai multe taburi
- Un proiect se editează într-un singur tab: `navigator.locks` (Web Locks, cu rezervă `BroadcastChannel`) per `projectId`. Al doilea tab deschide proiectul **în mod doar-citire** cu opțiune „preia controlul”.
- Concurență optimistă: la salvare se compară `revision` stocat cu cel încărcat; la nepotrivire → dialog (nu se suprascrie tăcut).

### 7.5 Export `.roomcraft.json`
```json
{
  "format": "roomcraft",
  "formatVersion": 1,
  "exportedAt": "2026-10-27T12:00:00.000Z",
  "generator": { "app": "RoomCraft", "version": "0.1.0" },
  "project": { "schemaVersion": 1, "...": "ProjectDocument complet" },
  "assets": []
}
```
- `formatVersion` = `project.schemaVersion` (un singur număr de versiune).
- Serializare deterministă (chei în ordine stabilă) pentru diferențe curate și teste.
- **Autonomie (D11):** fișierul conține `catalogSnapshot` complet pentru itemii și finisajele folosite, plus toate atribuirile, suprascrierile de buget și setările; reguli și test „catalog gol” în DATA_MODEL §7. Reconstruirea 2D/3D/buget nu depinde de versiunea catalogului încorporat.
- Descărcare prin `Blob` + `<a download>`; nume de fișier sanitizat.
- *Nu* se exportă date efemere (selecție, viewport).

### 7.6 Import
Pași, în ordine, oprire la prima eroare cu mesaj explicit:
1. Limită de mărime (ex. 50 MB) și `JSON.parse` în `try/catch`.
2. Verificare plic: `format === "roomcraft"`, `formatVersion` întreg.
3. `formatVersion` > versiunea aplicației → **refuz** („creat cu o versiune mai nouă”).
4. **Migrare în lanț** `v → v+1 → … → current` pe date brute (`unknown`).
5. Validare **zod** cu schema curentă (strictă: câmpurile necunoscute sunt **respinse**; verificat în Etapa 0).
6. **Integritate referențială** (`domain/integrity`): toate ID-urile referite există, bucle de noduri valide, goluri în limitele peretelui etc. Defecte recuperabile (ex. ID orfan) → raport + reparare opțională; nerecuperabile → refuz.
7. Conflict de `id` cu un proiect existent → import ca **proiect nou** (ID-uri regenerate) sau „înlocuiește” cu instantaneu de siguranță prealabil; implicit: copie nouă.
8. Scriere atomică în IndexedDB; abia apoi se afișează în listă.

Nimic din fișier nu este evaluat ca cod; șirurile se randează ca text (React escapează), iar numele de fișier/proiect se sanitizează la export.

### 7.6.1 Implementarea din Etapa 1c (stare + persistență) — ce s-a construit și testat

- **`src/persistence/`** (Dexie): `RoomcraftDb` (`projects`, `documents`, `snapshots`), `DexieProjectRepository` (list/load/create/save/rename/remove/snapshots; tranzacții atomice meta+document; erori `RevisionConflictError` și `StorageError` clasificate în `quota` / `unavailable` / `storage`), `WebLockProvider` / `NoLockProvider`, `requestPersistentStorage` / `getStorageInfo` (limitate în timp: în Firefox `persist()` poate rămâne în așteptare).
- **`src/state/`** (independent de React): `createProjectSession` (document + istoric Immer + autosave + stare), `createProjectManager` (listare, creare, deschidere cu blocare, redenumire, ștergere, import), `selectors` (geometrie/buget/scenă memoizate pe identitatea documentului — NU în document, istoric sau stocare), `attachLifecycle` (salvare la `visibilitychange`/`pagehide`, confirmare la `beforeunload` cu modificări nesalvate).
- **Contractele** `ProjectRepository` / `ProjectLockProvider` stau în `persistence/types.ts`; `state/` importă DOAR `persistence/types` și `persistence/errors` (regula dependency-cruiser `state-persistence-doar-interfata`), deci nu depinde de Dexie.
- **Stările de salvare** (`SessionState.status`): `saved` · `dirty` · `saving` · `error` (cotă / indisponibil / altă eroare, cu `attempts` și `since`) · `conflict` (`changed` / `deleted`) · `readonly` · `closed`.
- **Fiecare modificare** trece prin `commit` (sau `apply` pentru operațiile de domeniu care întorc un document nou, transformate în patch-uri fine) și este **validată integral** (`parseProjectDocument`: schemă + integritate + geometrie) înainte de a intra în stare; o modificare invalidă este respinsă fără efect.
- **Reîncercări** după o eroare de stocare: automat la 2 s, 5 s, 15 s, 30 s, 60 s (apoi 60 s) și manual (`retrySave`); modificările nu părăsesc memoria și pot fi exportate oricând (`exportBackup`).
- **Teste în browsere reale** (Chromium, Firefox, WebKit): `pnpm e2e:storage` construiește un harness (`e2e-storage/harness`, NU face parte din aplicație) cu gestionarul real peste IndexedDB și Web Locks.

### 7.6.2 Integrarea în interfață (Etapa 2a)

- **Adaptorul pentru browser** — `src/lib/project-runtime/`: `createBrowserRuntime()` construiește `DexieProjectRepository`, `createLockProvider(navigator)` și `createProjectManager`, cu `crypto.randomUUID` ca generator de ID-uri. **Se apelează numai într-un efect React (client)**: la import și la prerandare nu atinge `window`, `navigator`, IndexedDB sau Web Locks (Dexie și restul stocării sunt încărcate leneș prin `import()`; ~31 KB gzip pentru Dexie și chunk-ul zod nu sunt în JS-ul inițial).
- **`ProjectProvider`** ține starea runtime-ului (`initializing` → `ready` | `unavailable`) și o expune prin context; fabrica de runtime este injectabilă (testele folosesc fake-indexeddb). **Hook-uri:** `useSessionState(session)` (peste `useSyncExternalStore`, cu `getServerSnapshot = null`), `useProjectList(manager)`, `useProjectSession(manager, id)` (deschide, atașează `attachLifecycle`, închide la demontare; numără utilizatorii ca montarea dublă din StrictMode să nu închidă sesiunea).
- **Nicio logică de persistență, validare, autosave sau undo/redo nu este în componente**: acestea apelează doar metodele `ProjectManager` / `ProjectSession`.
- **Straturi:** `features/*` importă `domain`, `state`, `lib`, `ui`; tipurile de persistență ajung la ele prin `state/types.ts` (re-export), deoarece `features/` nu are voie să importe `persistence/`. `ui/` conține doar componente generice (Button, Modal, NameDialog, ConfirmDialog, Alert, Badge, Spinner).
- **Rute:** `/` = `Dashboard`; `/editor/?p=<id>` = `EditorShell` → `SessionView`. Toate linkurile între rute sunt `<a href>` prin `asset()` / `editorHref()` (ADR-031) și, deci, navigări complete: sesiunea se închide prin `pagehide`/demontare, iar blocarea se eliberează.
- **Dashboard:** listare, creare, deschidere, redenumire, ștergere cu confirmare; stări: inițializare, încărcare, listă goală, eroare de stocare (cu „Reîncearcă”), stocare indisponibilă, proiecte invalide (verificate cu `manager.inspect`, cu restaurare din copii de siguranță).
- **Editor (carcasă):** bara cu starea de salvare, undo/redo (butoane și Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y), redenumire, export de copie de siguranță; bannere pentru doar-citire („Preia controlul”), controlul pierdut, conflict (trei rezolvări) și eroare de stocare (reîncercare + export); înlocuitor pentru suprafața de lucru cu rezumatul documentului.

### 7.7 Migrări
- Două niveluri independente:
  - **Schema IndexedDB** (Dexie `version()`): doar magazii/indici.
  - **Schema documentului** (`schemaVersion`): migrări pure `migrate_vN_to_vN+1(raw) → raw`.
- Migrările de document rulează **la încărcare** (și la import), după un instantaneu automat; rezultatul se salvează.
- Fiecare versiune are **fixture înghețat** în `tests/fixtures/vN/*.json`; testul rulează `migrateToLatest` pe toate și validează cu schema curentă + integritate.
- Reguli: migrările nu se modifică după lansare; schimbările incompatibile cresc versiunea; adăugările opționale pot rămâne în aceeași versiune doar dacă schema le tratează ca opționale.

## 8. Calculul suprafețelor, cantităților și costurilor

### 8.1 Suprafețe (în mm² întregi, conversie în m² doar la final)
- **Podea cameră** = aria poligonului interior (nu a axelor).
- **Față de perete (per parte)** = lungime reală a feței (din amprenta cu îmbinări) × înălțimea acoperită − Σ goluri intersectate:
  `aria_gol = lățime_gol × (min(sill + h_gol, h_acoperită) − max(sill, 0))⁺`
  (pentru faianță parțială, golurile se taie la înălțimea acoperită).
- **Tavan** (dacă e cerut) = aria poligonului interior.
- Obiectele sanitare/mobilierul **nu** scad aria de podea în MVP (regulă documentată; opțional „exclude suprafața acoperită” post-MVP).

### 8.2 Cantități de materiale
Toate rotunjirile *în sus* folosesc toleranță `ε = 1e-9` pentru a evita `4,0000000001 → 5`.

| Material | Formulă |
|---|---|
| Gresie / faianță / parchet pe arie | `arie_netă = arie × (1 + rebut%)` |
| Plăci (buc) | `ceil(arie_netă / ((lățime + rost) × (înălțime + rost)))` — pasul piesei, dimensiuni nominale + rost |
| Cutii | `ceil(plăci / plăci_per_cutie)` sau `ceil(arie_netă / m²_per_cutie)` |
| Vopsea | `litri = arie × straturi / randament_m²_per_l`; cutii = `ceil(litri / volum_cutie)` |
| Rebut implicit | Gresie/faianță dreaptă 10%, diagonală 15%, parchet 7%, vopsea 5% (editabile, valori de pornire) |

**Agregare înainte de rotunjire:** ariile nete (cu rebutul fiecărei atribuiri) ale tuturor atribuirilor aceluiași finisaj se însumează și abia apoi se rotunjește la bucăți/cutii/doze (vopsea pe 4 pereți: 3 doze, nu 4). Costul se alocă pe camere proporțional cu aria netă, cu metoda celei mai mari rămășițe.

Fiecare rezultat păstrează separat **cantitatea calculată** (fracționară) și **cantitatea de achiziție** (rotunjită la ambalaj); costul se calculează pe cantitatea de achiziție.

**Verificabilitate (D8):** funcțiile de calcul întorc `{ valoare, trace }`; `trace` conține pașii (intrări, formulă, rezultat, rotunjire) produși de **același cod** care calculează valoarea, deci nu poate diverge. Interfața afișează urma la cerere („De unde vine cifra?”), iar exportul o poate include într-o foaie/coloană separată. Testele de tip „golden” compară atât valoarea, cât și pașii urmei pe proiectele de referință calculate manual.

### 8.3 Costuri
- Preț unitar și totaluri: **întregi în unități minore** (bani). Cantitățile pot fi zecimale (rotunjite intern la 1e-3).
- `total_linie = round_half_away_from_zero(cantitate × preț_unitar)` — **o singură rotunjire per linie**.
- Total cameră / general = **suma liniilor rotunjite** (nu se rotunjește din nou).
- TVA: moduri `prețuri cu TVA` sau `fără TVA`, cotă în puncte-bază per linie (implicit 21% pentru RON, configurabil per proiect și per linie; **verificat la 2026-10-27 în textul oficial** — Legea nr. 141/2025, art. 291 alin. (1) Cod fiscal, în vigoare de la 1 august 2025, portal legislativ legislatie.just.ro — cota standard este 21%, iar cota redusă 11% (alin. (2)). Legislația se poate schimba: valoarea rămâne o setare, nu o constantă). Defalcarea TVA se calculează per linie, apoi se însumează.
- Rezervă (contingency) % aplicată la totalul general ca linie separată.
- Manoperă: linii manuale cu `tarif × cantitate`, cu opțiune de **legare** la o arie (`roomFloorArea`, `assignmentArea`) ca să urmărească modelul.
- Linii derivate vs. editări: utilizatorul poate suprascrie preț/cantitate/excludere/notă pe linia derivată; suprascrierea se stochează sub **cheia sursei** (`object:<objectId>`, `finish:<finishId>`) și supraviețuiește recalculărilor; dispare doar când sursa este ștearsă, **în aceeași acțiune** cu ștergerea (altfel `undo` o pierde).
- **Sursa prețului (D8):** fiecare linie poartă `priceSource` (`demo` | `user`). `demo` apare cu insignă „Preț demonstrativ” și avertisment la nivelul bugetului; devine `user` când prețul este editat, la linii manuale și la itemi creați de utilizator. Exporturile includ coloana „Sursă preț” și mențiunea de estimare (FR-18). Prețurile din catalog sunt valori arbitrare, fără mărci/magazine, documentate în `catalog-data/PRICING_NOTES.md`.
- Afișare: formatare locală (`Intl.NumberFormat('ro-RO')`) **doar pe client** (nu în prerandare, vezi §13); în CSV/XLSX se exportă numere reale, nu text formatat.

### 8.4 Export buget
- **CSV:** UTF-8 cu BOM; separator `;` și zecimală `,` (implicit pentru Excel RO) cu opțiune `,`/`.`; **neutralizarea injecției de formule** (celule care încep cu `= + - @` primesc prefix `'`); sfârșit de linie `\r\n`.
- **XLSX:** foi „Rezumat”, „Pe cameră”, „Linii”, „Cantități”; valori numerice cu format de monedă; generat la cerere cu bibliotecă încărcată leneș (§10).

## 9. Limite ale browserului și riscuri tehnice

| Risc / limită | Efect | Măsură |
|---|---|---|
| IndexedDB poate fi golit (Safari ITP ~7 zile fără interacțiune pentru site-uri fără PWA instalat; „Șterge date site”; mod privat) | Pierdere de proiecte | `storage.persist()`, memento periodic de export, indicator de spațiu, mesaj în mod privat |
| Cotă de stocare | Salvare eșuată | Gestionare `QuotaExceededError`, banner de export |
| WebGL: pierdere context, limite de texturi (mai ales iOS) | 3D negru/crash | Listener `webglcontextlost/restored`, texturi mici, `dpr` limitat, mesaj de rezervă fără 3D |
| Memorie GPU | Scurgeri la editări repetate | `dispose()` sistematic, teste manuale de rezistență, `frameloop="demand"` |
| Precizie float în 3D | Z-fighting, tremur | Metri, origine apropiată, `polygonOffset` pentru podele/finisaje, `near/far` rezonabile |
| Geometrie pereți (îmbinări, unghiuri ascuțite, T-uri, goluri la colț) | Poligoane greșite | Teste bazate pe proprietăți, limită miter/bevel, constrângeri în MVP (gol departe de colț cu ≥ x mm) |
| Konva + Next.js (SSR, pachetul `canvas`) | Erori de build | **Testat în Etapa 0:** import static de `react-konva` și de R3F se prerandează fără eroare cu Next 16.4; `dynamic(..., { ssr:false })` rămâne recomandat pentru împărțirea codului (Konva/Three nu intră în pagina de start), nu pentru a evita un eșec de build. Nu a fost nevoie de configurare pentru `canvas` |
| Compatibilitate versiuni (Next/React/R3F/react-konva) | Conflicte la instalare | Alegere de versiuni compatibile verificată într-un spike Etapa 0; blocare prin lockfile |
| Rute dinamice în export static | `/projects/[id]` nu se poate pre-genera (confirmat în documentația Next.js) | Rută unică `/editor?p=<id>` (client-side); alte compatibilități în §13 |
| Atingere/tabletă | Gesturi 2D imprecise | MVP: pointer events unificate; telefon doar vizualizare |
| Fișiere de import mari/malițioase | Blocare UI | Limită de mărime, validare, parsare în Worker (dacă se măsoară nevoia) |
| Estimări percepute drept oferte | Risc legal/încredere | Disclaimer vizibil; prețuri marcate „demonstrative” până la editare (FR-18) |

## 10. Dependențe recomandate

> Licențele din tabel sunt cele **cunoscute**; la adopție se rulează verificarea automată (§10.2) și se citește fișierul `LICENSE` din pachetul instalat. Versiunile exacte se aleg în Etapa 0 (cele mai recente stabile compatibile între ele).

### 10.1 Tabel

| Rol | Alegere | Licență | Alternative (și de ce nu) |
|---|---|---|---|
| Framework | Next.js (App Router, `output: 'export'`) | MIT | Vite+React Router: mai simplu, dar cerința impune Next |
| UI | React | MIT | — |
| Limbaj | TypeScript (`strict`) | Apache-2.0 | — |
| Stiluri | Tailwind CSS | MIT | CSS Modules |
| Primitive UI | Radix UI (și/sau componente copiate stil shadcn/ui) | MIT | React Aria (Apache-2.0) – la fel de bun, mai verbos |
| Iconițe | lucide-react | ISC | Heroicons (MIT) |
| Editor 2D | Konva + react-konva | MIT | **SVG în React**: viabil la sute de elemente, mai accesibil/testabil, dar fără Transformer/hit-testing gata; PixiJS (MIT): prea mult pentru scara asta; **tldraw**: licență specială (cerințe comerciale/watermark) – evitat; Fabric.js (MIT): API imperativ |
| 3D | three + @react-three/fiber (+ selectiv @react-three/drei) | MIT | three „simplu” în hook-uri: mai puțin cod magic, mai mult boilerplate |
| Stare | Zustand + Immer | MIT | Redux Toolkit (MIT): mai greu; Jotai: potrivit pentru stare atomică, mai puțin pentru undo pe document |
| Validare | zod | MIT | valibot (MIT): mai mic; zod are ecosistem mai larg |
| IndexedDB | Dexie | Apache-2.0 | `idb` (ISC): mai subțire, migrări manuale |
| ID-uri | `crypto.randomUUID()` | — (platformă) | nanoid (MIT) |
| XLSX | `write-excel-file` (doar scriere) sau ExcelJS | MIT / MIT | **SheetJS CE**: Apache-2.0, dar versiunea de pe npm este veche cu vulnerabilități cunoscute; distribuție oficială doar prin CDN propriu – evitat |
| CSV | implementare proprie (≈40 linii, testată) | — | papaparse (MIT) dacă apare import CSV |
| Triangulare | inclusă în three (earcut, ISC) | ISC | — |
| Operații pe poligoane | proprii pentru MVP; `polygon-clipping` (MIT) dacă e nevoie | MIT | Clipper2 (Boost): WASM, greu pentru MVP |
| Teste unitare | Vitest | MIT | Jest (MIT) |
| Teste proprietăți | fast-check | MIT | — |
| Teste componente | @testing-library/react | MIT | — |
| IndexedDB în teste | fake-indexeddb | Apache-2.0 | — |
| Teste E2E | Playwright | Apache-2.0 | Cypress (MIT, runner mai greu) |
| Lint/format | ESLint, Prettier | MIT | Biome (MIT) |
| Limite arhitecturale | dependency-cruiser | MIT | eslint-plugin-boundaries (MIT) |
| Gestor pachete | pnpm | MIT | npm (în Etapa 0 s-a folosit npm 11 prin `npx`: npm 10.9.0 are un bug de rezolvare a dependențelor peer — vezi STAGE0_REPORT §6) |
| Fonturi | `next/font` cu font open (ex. Inter) sau fonturi de sistem | OFL | — |

### 10.2 Politica de licențe
- **Permise:** MIT, ISC, Apache-2.0, BSD-2/3-Clause, 0BSD, CC0, Unlicense; fonturi OFL.
- **Interzise în ce se distribuie (`out/`):** GPL/AGPL/LGPL, SSPL, „source-available”/comerciale, necunoscute/fără licență, CC-NC/ND.
- **Permise doar ca instrumente de build, nedistribuite în `out/`** (listă explicită de excepții, revizuită manual): MPL-2.0 (ex. `lightningcss`, din Tailwind), LGPL-3.0 (ex. `@img/sharp-*`, dependență opțională a Next.js pentru optimizarea de imagini, neutilizată cu `images.unoptimized`), CC-BY-3.0/4.0 pentru date de build (`caniuse-lite`, `spdx-*`). Verificarea din Etapa 0: aceste pachete nu apar în `out/`.
- **Condiționate:** Apache-2.0 (păstrare `NOTICE`), CC-BY (atribuire în `ATTRIBUTIONS.md` și în aplicație).
- **Automat:** script `license:check` (ex. `license-checker-rseidelsohn`, sau `pnpm licenses list`) în CI cu listă de permiși; eșuează la licență nouă/necunoscută. Fișier generat `THIRD_PARTY_NOTICES.md`.
- **Resurse (modele, texturi):** doar CC0 (ex. Kenney, Poly Haven, ambientCG, Quaternius) sau create de proiect; fiecare resursă înregistrată în catalog cu `license`, `author`, `sourceUrl`; verificare manuală înainte de includere.
- Verificarea acoperă și dependențele tranzitive.

## 11. Strategie de testare

### 11.1 Automată
| Nivel | Ce acoperă | Instrumente |
|---|---|---|
| Unitar (domeniu) | Geometrie (arie, ofset, îmbinări, goluri), conversii de unități, formule de cantități, bani/TVA/rotunjire, buget (derivate+suprascrieri), `buildScene`, integritate | Vitest |
| Bazat pe proprietăți | Aria poligonului invariantă la translație/rotație; ofset interior ≤ aria originală; `Σ linii = total`; export→import identitate; transform 2D↔3D dus-întors | fast-check |
| Contract/schemă | Fiecare fixture de versiune se migrează și validează | Vitest + fixtures înghețate |
| Persistență | Repository, autosave (timere false), conflict de revizie, instantanee, cotă plină simulată | Vitest + fake-indexeddb |
| Componente | Câmpuri numerice, panou proprietăți, tabel buget | Testing Library |
| E2E | Desenează cameră → adaugă obiect → reîncarcă → persistă; export→import; export CSV conține valorile așteptate; 3D: canvas nenul, fără erori în consolă | Playwright (Chromium, Firefox, WebKit) |
| Arhitectură | Reguli de dependență, licențe | dependency-cruiser, license:check |
| Tipuri/lint | `tsc --noEmit` strict, ESLint | CI |

Scenele 3D se testează ca **date** (snapshot al `SceneDescription`), nu pixeli. Proiectele de referință (ex. garsonieră, apartament 3 camere) cu valori de buget calculate manual servesc drept „golden tests”.

### 11.2 Manuală (listă de verificare, repetată la fiecare etapă majoră)
- Chrome, Edge, Firefox, Safari macOS, Safari iOS/iPadOS; ecran HiDPI; tabletă tactilă.
- Închidere forțată a tabului în timpul tragerii; două taburi pe același proiect; spațiu de stocare aproape plin; mod privat.
- Proiect mare (50 camere / 500 obiecte): fluiditate 2D, 3D, timp de salvare.
- Import de fișiere: corupt, trunchiat, versiune viitoare, versiune veche, foarte mare, cu câmpuri suplimentare.
- Deschiderea CSV/XLSX în Excel (RO) și LibreOffice: diacritice, zecimale, formule neutralizate.
- Calcul manual pe hârtie vs. buget pentru proiectul de referință.
- Navigare cu tastatura în panouri; contrast; zoom browser 200%.

## 12. Găzduire statică — evaluare (fără alegere, fără configurare)

**Stare:** nu se alege și nu se configurează niciun serviciu (D10, ADR-024). Aplicația este proiectată **independent de gazdă**: rezultatul `out/` poate fi servit de orice server de fișiere statice. Evaluarea de mai jos informează decizia ulterioară (înainte de Etapa 8).

Surse consultate la 2026-10-27 (paginile oficiale ale furnizorilor). Condițiile se schimbă; **se recitesc înainte de decizie**.

| Gazdă / plan | Limite verificate | Uz comercial / restricții | Observații pentru RoomCraft |
|---|---|---|---|
| **Cloudflare Pages** (Free) | 500 build-uri/lună; 20.000 fișiere/site; 25 MiB/fișier; 100 domenii/proiect; build max 20 min; 100 reguli `_headers` | **Neconfirmat:** pagina de limite și termenii serviciului consultați nu spun nimic despre uz comercial vs. necomercial. Lățimea de bandă nu apare pe pagina de limite. Se verifică Termenii generali și pagina de planuri | Permite `_headers` (antete de securitate: CSP, etc.); `out/` ar încăpea cu mult sub limite |
| **GitHub Pages** | Site publicat max 1 GB; bandwidth „soft” 100 GB/lună; deploy max 10 min | Documentația spune că **nu este destinat** găzduirii unui business, e-commerce sau SaaS comercial; fără tranzacții sensibile | Potrivit pentru un instrument gratuit, necomercial; **ambiguu** dacă se adaugă monetizare. Fără antete personalizate (din cunoștințe, de confirmat) → CSP doar prin `<meta>` |
| **Vercel Hobby** | 100 GB transfer rapid/lună (ghid, nu drept contractual); funcții/imagini nefolosite de noi | **Doar uz personal necomercial.** „Comercial” = orice deployment cu câștig financiar pentru *oricine* implicat în producție (inclusiv programator plătit), reclame, cerere de plată, linkuri afiliate ca scop principal. Donațiile *nu* sunt comerciale | Nepotrivit dacă proiectul are orice componentă comercială; altfel plan Pro (cu plată) |
| **Netlify** (Free) | Model pe credite: 300 credite; bandwidth 20 credite/GB; deploy de producție 15 credite | **Neconfirmat** pe pagina de prețuri (plan listat pentru „Individual”); se citesc Termenii | Limita pe credite poate opri site-ul la trafic mare — de modelat înainte |
| **Server propriu / orice CDN static** | — | Depinde de furnizor | Ex. `nginx` cu `try_files $uri $uri.html $uri/ =404` (din documentația Next.js) |

**Concluzii:**
1. Din punct de vedere tehnic, toate variantele sunt compatibile (§13). Diferența o fac **termenii de utilizare**, nu tehnologia.
2. Criteriul decisiv este **caracterul proiectului**: necomercial/personal sau cu orice element comercial (reclame, plată, activitate plătită, afiliere). Dacă e comercial: Vercel Hobby este exclus; GitHub Pages este riscant; Cloudflare Pages și Netlify necesită verificarea termenilor, iar planurile plătite sunt opțiunea sigură.
3. Aplicația **nu depinde** de antete, redirecționări sau rescrieri ale gazdei. Antetele de securitate (CSP etc.) sunt „bonus” unde gazda le permite.
4. Domeniul propriu este recomandat (evită `basePath`, §13-I4).

CI gratuit (GitHub Actions): lint, tipuri, teste, licențe, build, e2e. Fără variabile secrete, fără mediu de rulare pe server.

## 13. Audit: compatibilitatea arhitecturii cu `output: 'export'`

Sursa pentru limitările Next.js: documentul „Static Exports” (nextjs.org/docs/app/guides/static-exports, actualizat 2026-08-09, consultat 2026-10-27). Rezultatele Etapei 0 sunt în [STAGE0_REPORT](STAGE0_REPORT.md) §2, cu separarea între ce a fost testat efectiv și ce doar analizat. Rândurile marcate ❔ nu au fost testate.

### 13.1 Verdict pe funcționalități

| Funcționalitate planificată | Verdict | Condiții |
|---|---|---|
| Rute și pagini (start, editor, setări, despre) | ✅ | Doar rute statice; editorul pe `/editor?p=<id>` |
| IndexedDB / Dexie, localStorage, Web Locks, BroadcastChannel | ✅ | Doar în efecte/handlere client; inițializare lazy (nu la import de modul) |
| React Konva (2D) | ✅ **testat** | Componentă client; `dynamic(..., { ssr: false })` dintr-un Client Component pentru împărțirea codului (import static se și compilează; `ssr:false` direct într-un Server Component dă eroare de build — confirmat) |
| Three / R3F (3D) | ✅ cu condiții | La fel; `<Canvas>` doar pe client |
| Texturi procedurale pe canvas | ✅ | Generare în browser (nu la build) |
| Export JSON/CSV/XLSX, import fișiere | ✅ | `Blob` + `<a download>` și `<input type=file>`; biblioteca XLSX încărcată leneș |
| Web Worker (import mare, opțional) | ❔ **netestat** | `new Worker(new URL(...), import.meta.url)` suportat de bundler; verificat în spike dacă se adoptă |
| Fonturi | ❔ **netestat** | `next/font` le auto-găzduiește la build |
| Imagini | ✅ cu condiții | `next/image` cu încărcătorul implicit **nu** e suportat; folosim `images.unoptimized` sau `<img>`; texturile nu trec prin `next/image` |
| Calcule, buget, migrări | ✅ | Cod pur în client |
| Autentificare, API, server actions, middleware | — | Nu sunt în plan (și nu sunt suportate în export) |

### 13.2 Incompatibilități și riscuri identificate (rezultatele testării din Etapa 0: [STAGE0_REPORT](STAGE0_REPORT.md) §2)

| # | Problemă | Impact | Rezolvare |
|---|---|---|---|
| I1 | Rute dinamice cer `generateStaticParams`; ID-urile apar la runtime (confirmat în docs) | `/projects/[id]` imposibil | `/editor?p=<id>` (ADR-002). Un singur fișier HTML, fără fallback SPA necesar pe gazdă |
| I2 | Client Components sunt **prerandate** la build; `window`, `navigator`, `indexedDB`, `localStorage` nu există (confirmat în docs) | Eroare de build sau nepotrivire de hidratare | Acces numai în `useEffect`/handlere; module `persistence` fără efecte la import; Konva/Three doar sub `ssr:false` |
| I3 | `useSearchParams` într-o pagină statică cere graniță `Suspense` (testat: cu `Suspense` funcționează; varianta fără nu a fost testată) | Build eșuat/avertisment, ecran gol | Pagina `/editor` învelită în `Suspense` cu stare de încărcare; testat în Etapa 0 |
| I4 | `basePath` pentru GitHub Pages „de proiect” (`/nume-repo/`) (testat cu `/rc-test` pe server local) | Căi greșite pentru catalog JSON, texturi, workeri | Toate URL-urile de resurse trec printr-un helper `asset(path)`; test de build cu `basePath` setat; domeniu propriu evită problema |
| I5 | Antete/redirecționări/rescrieri **nu sunt suportate** de Next în export (confirmat în docs) | Fără CSP/COOP/COEP din aplicație; fără redirecționări | Nu depindem de ele (nu avem SharedArrayBuffer). CSP/antete se pun, dacă gazda permite, în configurarea gazdei; altfel `<meta>` CSP parțial. Documentat ca limită |
| I6 | Formatare locală (`Intl`, date, `toLocaleString`) diferă între build (Node) și browser | Nepotriviri de hidratare | Numerele/datele formatate se randează doar pe client (după montare) sau cu o funcție deterministă proprie |
| I7 | Comportamentul căilor (`/editor` vs `/editor/`) diferă între gazde (testat doar pe un server emulat) | 404 la reîncărcare sau linkuri în afara aplicației | `trailingSlash: true` în config, ca să rezulte `editor/index.html`; test de fum pe `npx serve out` și pe un server fără rescrieri |
| I8 | Aplicația stă pe date locale: dacă utilizatorul schimbă domeniul sau gazda, **IndexedDB nu se mută** (origine diferită) | „Pierderea” proiectelor la migrarea domeniului | Domeniu stabil; funcția de export/import (D11) este calea de migrare; mesaj explicit în „Despre” |
| I9 | **(nou, Etapa 0)** `<Link>` către `/editor/?p=…` declanșează o cerere RSC (`__next.editor.__PAGE__.txt?p=…`) care dă **404** pe o gazdă statică strictă; navigarea revine la încărcare completă, dar apar 404-uri în consolă/jurnale | Zgomot în jurnale, tranziție SPA pierdută | Linkurile către editor sunt `<a href>` simplu (cu `basePath` prin `asset()`); navigare programatică prin `location.assign`. Testat: cu `<a>` nu mai apar 404-uri |
| I10 | **(nou, Etapa 0)** Lanț de unelte: Vitest 5 / Vite 8 cer Node ≥ 22.12; mediul are 22.10.0; npm 10.9.0 eșuează la rezolvarea dependențelor peer (eroare `edgesOut`) | Instalare/CI imposibile sau instabile | Fixare Node LTS ≥ 22.12 (`.nvmrc` + `engines`); pnpm; detalii în STAGE0_REPORT §6 |

### 13.3 Concluzie
Arhitectura propusă **este compatibilă** cu `output: 'export'` pentru toate funcționalitățile planificate. Nu există nicio funcționalitate MVP care să necesite server, API sau rute dinamice nepregenerabile. Condițiile I1–I8 sunt constrângeri de implementare, nu motive de schimbare a direcției. Etapa 0 le-a **testat** printr-un build static real servit de un server strict (fără rescrieri), sub `basePath` și fără acesta, în Chromium, Firefox și WebKit (Playwright). Limite ale testării (gazde reale, Safari iOS) sunt în STAGE0_REPORT.

**Condiție de revizuire a D1 (neîndeplinită în Etapa 0):** dacă I2/I3 ar fi arătat că nu pot fi rezolvate curat, alternativa era un SPA Vite + React Router (aceeași structură `domain/`/`features/`), cu costul de a ieși din cerința Next.js — decizie care ți-ar reveni.
