# RoomCraft — Audit tehnic general (branch `main`)

> **Data:** 2026-10-30 · **Commit analizat:** `4e2467d` („Add unit tests for 3D viewer, materials handling, and scene geometry”) · **Tip:** analiză, fără modificări de cod.
>
> **Limită esențială a acestui audit:** mediul în care a fost făcut **nu a putut instala dependențele** (registry-ul npm nu se rezolvă din sandbox: `ENOTFOUND registry.npmjs.org`, nici direct, nici prin proxy). Prin urmare **nu am rulat nimic**: nici `pnpm verify`, nici testele, nici build-ul, nici e2e, nici `pnpm audit`. Toate constatările de mai jos provin din **citirea statică a codului și a documentației**. „Demonstrat” înseamnă aici *demonstrat prin cod* (se vede în sursă, se poate reproduce), **nu** reprodus în browser. Cifrele de performanță citate sunt din rapoartele proiectului (STAGE3B/3C), **nu** din măsurători proprii. Vezi §7.

## Legendă

| Etichetă | Sens |
|---|---|
| **[D] Demonstrat prin cod** | Comportamentul rezultă direct din sursa citată; nu depinde de o ipoteză despre mediu. Neexecutat. |
| **[R] Risc teoretic** | Plauzibil, dar depinde de un mediu/volum/comportament de browser pe care nu l-am putut verifica. |
| **[S] Sugestie** | Îmbunătățire fără defect observat. |

Efort: **mic** (≲ 1 zi), **mediu** (câteva zile), **mare** (> 1 săptămână). Probabilitate: **mică / medie / mare** (în utilizare reală, la starea actuală a produsului).

---

## 1. Rezumat executiv

Baza arhitecturală este **solidă și disciplinată**: domeniu pur și testabil, straturi impuse automat (`dependency-cruiser`), schemă `zod` strictă, import tratat ca date nesigure, persistență cu tranzacții atomice, concurență optimistă și blocare între taburi, tratarea erorilor de stocare fără pierderea sesiunii, export static fără nicio dependență de server. N-am găsit vulnerabilități XSS (niciun `dangerouslySetInnerHTML`/`innerHTML`/`eval`; șirurile din JSON se randează ca text; `sourceUrl` din catalog nu se randează ca link) și nicio încălcare a regulilor de straturi la citire.

Problemele care merită atenție înainte de MVP sunt concentrate în **trei zone**:

1. **Recuperarea și portabilitatea datelor** (cea mai gravă): fluxul „Restaurează o copie” **suprascrie ireversibil** un document aflat în stare „invalid / creat cu o versiune mai nouă”, fără să-l arhiveze (F-01); iar fișierele `.roomcraft.json` exportate ca backup **nu pot fi importate din interfață** — nu există UI de import (F-02). Politica de compatibilitate între versiuni (schemă strictă + modificări aditive în aceeași versiune) face ca un rollback sau un cache vechi pe hosting static să transforme proiecte valide în „invalide” (F-04).
2. **Performanță nemăsurată la scara țintă** (F-06) și un defect de proiectare demonstrabil în cod: fiecare autosave **schimbă identitatea documentului** (`updatedAt`), ceea ce invalidează toate rezultatele derivate memoizate (geometrie, scenă, buget) și reconstruiește geometriile pereților/podelelor în 3D fără nicio modificare reală (F-03, F-08). Geometria este analizată de cel puțin 2–3 ori per editare.
3. **Robustețe UI**: nicio graniță de erori în afara vizualizării 3D (F-05); accesibilitate și tactil neterminate (F-12, F-13 — în mare parte deja planificate pentru Etapa 3).

Numărul constatărilor: **1 × P0, 5 × P1, 11 × P2, 5 × P3** (vezi §4). Nicio constatare nu necesită server sau autentificare; toate se rezolvă local.

---

## 2. Starea actuală a arhitecturii

### 2.1 Module și responsabilități (cod real, 94 de fișiere în `src/`, ≈16,5k linii TS/TSX)

| Strat | Conținut | Observații |
|---|---|---|
| `domain/` | schema (zod), geometrie, edit, objects, placement, finishes, quantities, budget, money, scene, integrity, io (import/export + migrări), cascade | Pur: fără React/DOM/Three/Dexie (impus de `domain-este-pur`). Verificat prin grep: nicio importare în afara `domain/` + `zod`. |
| `persistence/` | Dexie (`db.ts`), `repository.ts`, `locks.ts`, `errors.ts`, `storage-info.ts`, `types.ts` | Fără UI. Tranzacții atomice meta+document. Un singur `version(1)` Dexie, trei magazii (`projects`, `documents`, `snapshots`). |
| `state/` | `session.ts` (document + undo/redo + autosave), `manager.ts`, `selectors.ts` (memoizare), `lifecycle.ts` | Independent de React; depinde doar de `persistence/types` și `errors` (regulă dedicată). |
| `catalog/`, `materials/` | 41 de itemi, 26 de rețete, 36 de materiale, texturi procedurale | Pure (grep: fără React/Three/Dexie). **Nu au reguli dedicate în dependency-cruiser** — puritatea nu e impusă automat (F-21). |
| `features/` | `projects`, `editor-shell`, `plan-editor` (SVG), `viewer-3d` (R3F), `catalog`, `materials` | Izolate între ele; compoziția se face în `app/editor/EditorClient.tsx`. |
| `lib/`, `ui/` | adaptor de runtime, hooks, helperi (`asset()`, download), componente generice | `ui/` și `lib/` nu importă `domain/state/features` (grep). Nu au reguli dedicate. |
| `app/` | `layout`, `page` (`/`), `editor/page` (`/editor/?p=`) | Subțire, fără import direct din `domain/`. Nu există `error.tsx`/`global-error.tsx`/`not-found.tsx` proprii (F-05). |

### 2.2 Ce funcționează bine (constatări pozitive, verificate în cod)

- **Separarea logicii de React:** operațiile de editare sunt funcții pure `domain/edit`, `objects`, `finishes` → `session.apply(label, op)` → validare completă în `commit` → un pas de undo → autosave. Componentele nu conțin persistență/validare/autosave.
- **Import tratat ca date nesigure** (`domain/io`): limită de mărime, `JSON.parse` în try/catch, plic strict, refuz pentru versiune mai nouă, migrare pe `unknown`, `findUnsafeStructure` (chei `__proto__`/`constructor`/`prototype`, adâncime ≤ 40), schemă `strictObject` (câmpuri necunoscute respinse), ID-uri cu regex și listă de rezervate, integritate referențială, remapare de ID la conflict, serializare canonică.
- **Persistență:** `RevisionConflictError` (concurență optimistă), blocare per proiect cu Web Locks (`ifAvailable` / `steal`, detectarea pierderii), clasificarea erorilor (`quota` / `unavailable` / `storage`), reîncercări cu backoff, modificările nu părăsesc memoria la eroare, `exportBackup` funcționează chiar cu stocarea plină.
- **Export static:** `output: 'export'`, `trailingSlash: true`, `images.unoptimized`, `basePath` prin `NEXT_PUBLIC_BASE_PATH`, helperul `asset()`/`editorHref()`, linkuri `<a href>` (nu `next/link`), nicio rută dinamică, nicio dependență de server. Dexie/WebGL se încarcă leneș, doar pe client.
- **Cache de resurse Three:** `MaterialCache` (prune/clear), `GeometryCache` pentru obiecte, `dispose()` sistematic, `frameloop="demand"`, `dpr` limitat.

### 2.3 Decalaje față de `ARCHITECTURE.md` (documentate de proiect sau observate aici)

`userCatalog`, `assets`, `rc:prefs`, `BroadcastChannel` ca rezervă pentru Web Locks, import în UI, export CSV/XLSX, `catalogSnapshot`-ul personalizat — **neimplementate** (unele declarate explicit amânate în rapoartele de etapă). Numele de module din documentul de arhitectură (`features/editor2d`, `features/io`, `features/budget`, `catalog-data/`, `domain/units`, `domain/migrations`) diferă de realitate (`plan-editor`, `domain/io`, `src/catalog`) — vezi F-21. Actualizarea incrementală pe `id`+`hash` (ARCH §6) este implementată doar pentru geometriile obiectelor, nu și pentru pereți/podele — vezi F-08.

---

## 3. Constatări detaliate

Format: **descriere · fișiere · impact · probabilitate · soluție · efort**. Clasa (P0–P3) e între paranteze.

### Persistență și integritatea datelor

#### F-01 — Restaurarea unei copii suprascrie ireversibil documentul „invalid / mai nou” (**P0**) [D]
- **Descriere.** `restoreSnapshot` arhivează documentul curent ca `pre-overwrite` doar dacă se încarcă valid. Dacă e `corrupt` (inclusiv `stage: 'version'` — „creat cu o versiune mai nouă”), se face `repo.save({...snapshot, id}, current.failure.revision)` **direct**, fără copie a datelor brute. Interfața spune doar „Versiunea curentă, *dacă e validă*, se arhivează întâi”. Printre acțiunile cardului unui proiect invalid („Restaurează o copie”, „Redenumește”, „Șterge”) nu există „Exportă datele brute”.
- **Fișiere.** `src/state/manager.ts` (≈336–347), `src/features/projects/RecoveryDialog.tsx` (descrierea modalului), `src/features/projects/ProjectCard.tsx` (acțiunile pentru `invalid`), `src/persistence/repository.ts` (`load` întoarce `corrupt` fără datele brute).
- **Impact.** Pierdere definitivă a ultimei stări a proiectului atunci când aplicația *nu mai poate citi* ce a scris o versiune mai nouă (rollback de deploy, cache vechi al browserului pe hosting static, alt domeniu/versiune) sau când un bug a produs un document invalid recuperabil manual. Utilizatorul nefamiliarizat va apăsa „Restaurează” pentru că e singura acțiune pozitivă.
- **Probabilitate.** Mică acum (există un singur `schemaVersion`, deși STAGE3C §8 recunoaște că „un document cu materiale noi nu se deschide în versiuni mai vechi”, adică același scenariu apare deja la extinderi de enum/catalog); **medie** după prima schimbare de schemă sau primul rollback.
- **Soluție.** (1) Înainte de orice suprascriere, salvează rândul brut ca snapshot `pre-overwrite` (nevalidat, `data` = brut). (2) Pentru `stage: 'version'` nu se oferă „Restaurează”, ci mesaj „actualizează aplicația” + „Exportă datele brute (.json)”. (3) Adaugă „Exportă datele brute” pe cardul `invalid`. (4) Test dedicat.
- **Efort.** Mic–mediu.
- **Stare (2026-10-31, branch `fix/f01-f07-safe-recovery`, necomis): REMEDIAT în cod, în așteptarea aprobării.** `restoreSnapshot` refuză cu eroarea tipată `incompatible` (zero scrieri) când documentul curent e `corrupt/version` sau `corrupt/migrate`, sau când copia nu poate fi citită; pentru orice alt document invalid, rândul brut se arhivează ca `pre-overwrite` în **aceeași tranzacție** cu suprascrierea (`repo.overwriteUnreadable`). `ProjectCard` nu mai oferă „Restaurează” pentru „mai nou”. **Export brut implementat:** butonul „Exportă datele brute” pe orice card invalid descarcă `<nume>-backup-raw.json` (rândul din IndexedDB serializat exact, fără validare/migrare/modificări; `repo.loadRaw` + `manager.exportRaw`), cu mesaje care explică că e un backup brut, nu un `.roomcraft.json`, și că versiunea curentă nu îl poate deschide neapărat. **Fără restaurare din datele brute** (în afara scopului). Detalii: `docs/REMEDIATION_BATCH_1.md`.

#### F-02 — Nu există import în interfață; backup-ul exportat nu poate fi restaurat (**P1**) [D]
- **Descriere.** `ProjectManager.importFile` există și e testat, dar nu e apelat nicăieri în `src/features` sau `src/app` (grep: niciun `importFile`, `<input type="file">`, `FileReader`, `.text()`). Editorul oferă „Exportă copie”, iar starea de eroare de salvare îndeamnă la exportul unei copii (în `PlanEditor`: „Poți continua sau exporta o copie”), dar fluxul de revenire nu există. Mutarea între domenii/dispozitive (ARCH §13, I8: „calea de migrare este export/import”) nu e utilizabilă.
- **Fișiere.** `src/features/projects/Dashboard.tsx`, `src/state/manager.ts` (`importFile`), `src/features/editor-shell/SessionBanners.tsx`.
- **Impact.** Utilizatorul crede că are o copie de siguranță, dar nu o poate folosi; blochează criteriile de acceptare ale Etapei 2 (export → import, fișiere respinse cu mesaj clar).
- **Probabilitate.** Mare (orice utilizator care exportă).
- **Soluție.** Buton „Importă” + drag & drop în Dashboard; verificare `file.size` înainte de citire; mesaje pe etape (`size/parse/envelope/version/migrate/schema/integrity/remap`) traduse în română; copie nouă la conflict de ID (deja implementat în `importProject`); vezi și F-10 pentru limite.
- **Efort.** Mediu.

#### F-04 — Politica de compatibilitate între versiuni e incoerentă cu schema strictă și cu hostingul static (**P1**) [D + R]
- **Descriere.** `ProjectDocumentSchema` este `strictObject` și ARCH §7.7 permite „adăugări opționale în aceeași versiune”. Împreună, o versiune nouă a aplicației care scrie un câmp/enum nou fără `schemaVersion++` produce documente pe care **versiunea veche** (rămasă în cache sau după rollback) le declară `corrupt` („Proiectul este invalid”), nu „mai nou”. Combinat cu F-01, mesajul și acțiunile sunt cele greșite. Hostingul static (fără control asupra cache-ului clientului) face scenariul realist.
- **Fișiere.** `src/domain/schema/index.ts` (`strictObject`, enum-uri `TEXTURE_PATTERNS`, `kind`…), `src/domain/io/index.ts` (`parseProjectDocument`), `docs/ARCHITECTURE.md` §7.7, `docs/STAGE3C_REPORT.md` §8.
- **Impact.** Proiecte valide apar „Invalide” după un deploy/rollback; risc de pierdere (cu F-01).
- **Probabilitate.** Medie după primul deploy care schimbă catalogul/schema.
- **Soluție.** Politică clară (vezi Anexa A): **orice** schimbare a formei persistate (inclusiv valori noi de enum) crește `schemaVersion` cu migrare pură; sau se citește tolerant (valori necunoscute → înlocuitor + avertisment, ca la rețete). Mesajul pentru „mai nou” trebuie obținut și când diferența e doar de enum.
- **Efort.** Mediu (decizie + câteva teste).

#### F-07 — Copia „pre-migration” este prima tăiată de plafonul de snapshot-uri (**P2**, latent) [D]
- **Descriere.** `parseRow` creează snapshot-ul `pre-migration` cu `createdAt = parsed.doc.updatedAt` (data veche a documentului). `addSnapshot` păstrează cele mai noi `SNAPSHOTS_KEPT = 5` după `createdAt` și șterge restul. Snapshot-urile automate apar la 10 min de editare → după ~5 snapshot-uri noi (≈50 min de editare) copia de dinaintea migrării este **cea mai veche și se șterge prima**.
- **Fișiere.** `src/persistence/repository.ts` (≈76–86, ≈162–177), `src/state/session.ts` (`maybeSnapshot`).
- **Impact.** Siguranța promisă la migrare dispare tocmai când e mai utilă. **Latent:** nu există încă nicio migrare reală (`MIGRATIONS = {}`).
- **Probabilitate.** Mică acum; mare la prima migrare.
- **Soluție.** Snapshot-urile `pre-migration` / `pre-overwrite` în afara plafonului (sau plafon separat, ex. păstrează ultimele 3 din fiecare motiv); `createdAt` = momentul copierii, nu `updatedAt`.
- **Efort.** Mic.
- **Stare (2026-10-31, branch `fix/f01-f07-safe-recovery`, necomis): REMEDIAT în cod, în așteptarea aprobării.** Copiile `pre-*` au plafon separat (`SAFETY_SNAPSHOTS_KEPT = 3` per motiv), în afara `SNAPSHOTS_KEPT = 5`; `createdAt` = momentul copierii; reîncărcarea aceleiași revizii nu rescrie copia. Fără migrări reale și fără modificarea `CURRENT_VERSION`. Detalii: `docs/REMEDIATION_BATCH_1.md`.

#### F-14 — Fără Web Locks nu există nicio excludere între taburi (**P2**) [R]
- **Descriere.** `createLockProvider` cade pe `NoLockProvider` dacă `navigator.locks` lipsește (context nesigur HTTP, browsere vechi). ARCH §7.4 promite rezervă `BroadcastChannel`; nu e implementată (confirmat de STAGE1c). Rămâne doar concurența optimistă pe `revision`, care detectează abia la salvare.
- **Fișiere.** `src/persistence/locks.ts`.
- **Impact.** Doi editori în paralel descoperă conflictul abia la salvare, cu dialog de rezolvare (nu pierdere silențioasă — mitigat). Testat în `e2e-storage` (caz „fără excludere între taburi”).
- **Probabilitate.** Mică.
- **Soluție.** Fie `BroadcastChannel` ca rezervă, fie mesaj explicit „acest browser nu protejează împotriva editării în două taburi”.
- **Efort.** Mic–mediu.

#### Alte observații de persistență (fără clasă separată)
- **Document întreg per salvare** (ARCH §7.3.7): acceptabil pentru MVP; combinat cu 5 snapshot-uri înseamnă până la ≈6 copii ale documentului în IndexedDB (relevant pentru cotă). Fără măsurători.
- **Pagehide:** `attachLifecycle` pornește `flush()` la `pagehide`/`visibilitychange`, dar o tranzacție IndexedDB început în `pagehide` nu are garanție de finalizare în toate motoarele — pierderea e limitată de fereastra de debounce (800 ms; max 5 s). Neverificat pe dispozitive reale (§7).
- **Undo/redo:** corect conceput (patch-uri Immer, 100 de pași, o tragere = un pas, istoric doar în memorie, golit la încărcare/import). `assignDifferences` (în `apply`) compară cu `JSON.stringify` fiecare intrare de tabel — cost O(dimensiunea documentului) per operație (vezi F-06).

### Performanță

#### F-03 — Fiecare autosave schimbă identitatea documentului; derivatele se recalculează degeaba; geometria se analizează de 2–3 ori per editare (**P1**) [D; magnitudine nemăsurată]
- **Descriere.**
  1. `runSaveLoop`: după salvare, `if (doc === toSave) doc = { ...doc, updatedAt: now }` creează un obiect nou; apoi `publish()`.
  2. `selectGeometry`/`selectScene`/`selectBudget` memoizează într-un `WeakMap` **pe identitatea** documentului → toate cele trei se recalculează după salvare, deși conținutul geometric e identic.
  3. `parseProjectDocument(next)` din `commit` apelează `checkIntegrity`, care rulează `analyzeGeometry` și **aruncă** rezultatul; apoi UI-ul cere `selectGeometry(newDoc)` și îl recalculează.
  4. Rezultat: per editare ≥ 2 analize (validare + randare) și încă una după salvare; plus rerender React al editorului (`state` se schimbă la `saving` → `saved`).
- **Fișiere.** `src/state/session.ts` (≈233, ≈319), `src/state/selectors.ts`, `src/domain/integrity/index.ts` (≈59), `src/domain/io/index.ts` (≈166).
- **Impact.** Muncă redundantă proporțională cu dimensiunea proiectului (geometrie O(pereți²) până la 3000) la fiecare editare + la fiecare salvare. Pe 20 de camere poate fi imperceptibil sau vizibil — **nemăsurat** (F-06).
- **Probabilitate.** Certă (se întâmplă mereu); impactul depinde de scară.
- **Soluție.** (a) La alinierea `updatedAt`, mută intrările de cache de la documentul vechi la cel nou (`adoptDerived(prev, next)`), sau (mai curat) scoate `updatedAt` din identitatea memoizată (cheie pe sub-obiecte: `nodes/walls/openings/rooms/objects/finishAssignments/settings`). (b) Fă `parseProjectDocument` să returneze geometria deja calculată și populează cache-ul din `commit`. (c) Ține `updatedAt` în metadate, nu în documentul memoizat.
- **Efort.** Mic (a, b); mediu (c).

#### F-06 — Performanța la scara țintă nu e măsurată în browser; tragerea recalculează geometria complet la fiecare `pointermove` (**P1**) [D pentru lipsa măsurătorii; R pentru efect]
- **Descriere.** Ținta (ROADMAP Etapa 3: ~60 fps cu 20 de camere; Etapa 7: ≥ 30 fps la 20 de camere/300 de obiecte; fără creștere de memorie în 30 min) nu a fost măsurată: rapoartele spun explicit „Nu s-a măsurat FPS în browser” (STAGE3B_REPORT, secțiunea de performanță; STAGE3C_REPORT §7) și „performanța la 20 de camere nu a fost măsurată” (ADR-037, STAGE2b). Cifrele existente (100 de obiecte: scenă 2 ms, 30 de reconstruiri 60 ms) sunt **timpi de pregătire a datelor în Node**, pe 2 camere. Proiectul `bigProject()` (20 camere, 300 obiecte) există în `tests/reference/big.ts`, dar e folosit într-un singur test (`scene.test.ts`). În 2D, `draftDoc` + `selectGeometry(draftDoc)` rulează la fiecare schimbare de stare de tragere (`PlanEditor.tsx` ≈168–178); `PlanCanvas` nu e memoizat pe elemente.
- **Impact.** Risc de neprevăzut la scara promisă; costul exact al `commit` (schemă + integritate + geometrie pe tot documentul) și al `assignDifferences` pe proiecte mari e necunoscut.
- **Probabilitate.** Medie.
- **Soluție.** Măsoară întâi: (1) benchmark Node pe `bigProject()` pentru `commit`, `apply`, `analyzeGeometry`, `buildScene`, `computeBudget`, save (fake-indexeddb); (2) scenariu Playwright pe Chromium cu `bigProject` (trace de performanță, `renderer.info`, heap după 200 de editări); (3) abia apoi optimizează (F-03, F-08, memoizare `PlanCanvas`, throttling pe `pointermove`).
- **Efort.** Mediu.

#### F-08 — 3D: pereții și podelele se reconstruiesc integral la orice schimbare a identității scenei (**P2**) [D]
- **Descriere.** `Viewer3D` calculează scena cu `useMemo([doc])`; `ViewerCanvas` apelează `buildSceneObjects(scene, cache)` cu `useMemo([scene, cache])`. În `buildSceneObjects` doar geometriile **obiectelor** trec prin `GeometryCache`; pentru fiecare prismă de perete se creează `prismGeometry` + `EdgesGeometry`, pentru fiecare podea `ShapeGeometry`, apoi toate sunt `dispose`-uite la schimbarea următoare. `scene.hash` există (și e expus în DOM) dar nu e folosit ca cheie de reutilizare. Împreună cu F-03, **fiecare autosave în modul 3D** (de ex. după o editare din panoul de materiale) reconstruiește toți pereții.
- **Fișiere.** `src/features/viewer-3d/Viewer3D.tsx` (≈104), `ViewerCanvas.tsx` (≈63–100), `sceneObjects.ts` (≈313–373), `src/domain/scene/index.ts`.
- **Impact.** Muncă CPU/GPU inutilă și presiune de GC la proiecte cu mulți pereți; diferă de ARCH §6 („nu se reconstruiește toată scena la fiecare modificare”).
- **Probabilitate.** Certă; severitatea depinde de scară (F-06).
- **Soluție.** Cheie de cache pe conținutul prismei/podelei (`stableHash` pe `polygon,y0,y1,left,right`), `GeometryCache` extins la pereți/podele; sau memoizare pe `scene.hash`.
- **Efort.** Mediu.

#### F-09 — Dashboard: verificarea sănătății parsează complet fiecare proiect (**P2**) [D cod; R impact]
- **Descriere.** Fiecare `ProjectCard` apelează `manager.inspect(id)` → `repo.load` → `parseProjectDocument` (zod strict + integritate + geometrie) pentru **toate** proiectele, în paralel, pe firul principal, la fiecare încărcare a paginii; `key={id:revision}` remontează cardul și repetă verificarea. `load` poate scrie și snapshot `pre-migration` într-o cale de citire.
- **Fișiere.** `src/features/projects/ProjectCard.tsx`, `Dashboard.tsx` (≈148), `src/state/manager.ts` (`inspect`), `src/persistence/repository.ts` (`load`/`parseRow`).
- **Impact.** Îngheț perceptibil al listei cu multe proiecte mari; scrieri neașteptate la citire când va exista migrare.
- **Probabilitate.** Mică–medie (depinde de numărul/dimensiunea proiectelor).
- **Soluție.** Verifică doar la deschidere sau lent/secvențial în `requestIdleCallback`; stochează în metadate un stamp de validare (`validatedAtRevision`).
- **Efort.** Mic–mediu.

#### F-17 — WebGL: nicio gestionare explicită a pierderii contextului; `preserveDrawingBuffer: true` (**P2**) [R]
- **Descriere.** Nu există `webglcontextlost/restored` în cod (grep). Se bazează pe comportamentul implicit al Three/R3F; cu `frameloop="demand"`, după restaurare s-ar putea să nu existe repictare până la o interacțiune (**neverificat**). `Canvas` are `preserveDrawingBuffer: true` (cost de memorie/performanță; aparent pentru teste de captură). `webglAvailable()` creează un context de test care nu e eliberat explicit (`WEBGL_lose_context`). ROADMAP Etapa 7 cere un test de pierdere simulată de context.
- **Fișiere.** `src/features/viewer-3d/ViewerCanvas.tsx` (≈244–256), `webgl.ts`, `Viewer3D.tsx` (`RenderBoundary`).
- **Impact.** 3D negru după pierderea contextului (mobil, GPU reset, multe tab-uri) până la „Încearcă din nou”/reîncărcare; datele nu sunt afectate.
- **Probabilitate.** Mică pe desktop, medie pe mobile.
- **Soluție.** Ascultă `webglcontextlost` (preventDefault + mesaj) și `webglcontextrestored` (`invalidate()`); `preserveDrawingBuffer` doar în build de test; eliberează contextul de test.
- **Efort.** Mic.

### Securitate și robustețe

#### F-05 — Nicio graniță de erori în afara vizualizării 3D (**P1**) [D pentru lipsă; R pentru impact]
- **Descriere.** Doar `Viewer3D` are `RenderBoundary`. `src/app/` nu conține `error.tsx`, `global-error.tsx` sau `not-found.tsx`. O excepție la randare în editorul 2D, în panouri sau în carcasa sesiunii demontează arborele React (ecranul implicit de eroare al Next). Cleanup-ul `useProjectSession` apelează `dispose()` (salvează ce se poate), deci datele sunt parțial protejate, dar utilizatorul rămâne fără explicație și fără „Exportă copie”.
- **Fișiere.** `src/app/**`, `src/features/editor-shell/SessionView.tsx`.
- **Impact.** Ecran alb sau mesaj tehnic la un defect de randare (ex. valori `NaN` în SVG, date neașteptate).
- **Probabilitate.** Mică, dar consecință mare pentru un nedezvoltator.
- **Soluție.** Graniță de erori în jurul `workspace` în `SessionView`, cu fallback care oferă `exportBackupFile(session)` + „Înapoi la proiecte”; plus `error.tsx`/`global-error.tsx` generice.
- **Efort.** Mic.

#### F-10 — Import: limite și blocarea firului principal (**P2**) [R] (de tratat împreună cu F-02)
- **Descriere.** `MAX_IMPORT_BYTES = 50 MB`; `MAX_ENTITIES_PER_TABLE = 10.000`, dar `catalogSnapshot.items/finishes`, `budget.overrides` și `params` sunt `z.record` **fără plafon**; geometria refuză peste `MAX_WALLS_FOR_VALIDATION = 3000` pereți (mesaj „prea mulți pereți”) — plafoane incoerente (10.000 vs 3000). Parsarea (JSON + `findUnsafeStructure` + zod strict + integritate + geometrie O(n²)) rulează pe firul principal; ARCH §9 amână Worker-ul „dacă se măsoară nevoia”. Fixture-ul real `studio.roomcraft.json` are ≈10 KB — un fișier de 50 MB e de ordine de mărime nerealist pentru produs.
- **Fișiere.** `src/domain/io/index.ts`, `src/domain/schema/index.ts`, `src/domain/geometry/model.ts`.
- **Impact.** Un fișier mare/rău intenționat poate îngheța fila (nu pierde date; nu depășește validarea).
- **Probabilitate.** Mică (utilizator propriu, fără server), dar devine reală odată cu F-02.
- **Soluție.** Plafon realist (ex. câțiva MB) și aliniat cu limitele de geometrie; plafoane pe records; măsoară parsarea unui fișier la limită; Worker numai dacă măsurătoarea o cere.
- **Efort.** Mic–mediu.

#### F-19 — `crypto.randomUUID` și `navigator.locks` cer context sigur (**P3**) [R]
- **Descriere.** `genId: () => crypto.randomUUID()` (`browser-runtime.ts`, `SessionBanners.tsx`, `PlanEditor.tsx`, `lib/ids.ts`) și Web Locks există doar în contexte sigure. Pe HTTPS (GitHub Pages) e în regulă; pe HTTP simplu (intranet/LAN) `create` ar arunca `TypeError` — apelul `deps.genId()` e **în afara** `try` în `manager.create`.
- **Impact/Probabilitate.** Mic/mică (GitHub Pages e HTTPS).
- **Soluție.** Detectare + mesaj; fallback `getRandomValues`; mută `genId()` în `try`.
- **Efort.** Mic.

#### Verificări de securitate fără constatări (negative)
- **XSS:** niciun sink periculos (`dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `eval`, `new Function`, `document.write`, `window.open`). Singurul `location.assign` e peste linkuri interne prin `editorHref()`. `provenance.sourceUrl` există în schemă (max 500) dar **nu se randează** ca `<a href>` (grep) — **dacă va fi randat ca link în viitor, trebuie permis doar `https:`** (altfel `javascript:` dintr-un fișier importat).
- **Culori** (`HexSchema` strict `#rrggbb`), **ID-uri** (regex + rezervate), **nume** (≤ 200) sunt validate; nume de fișier la export sanitizat (`safeFileStem`).
- **Prototype pollution:** `findUnsafeStructure` + `IdSchema` resping cheile periculoase.
- **Expunere de informații:** niciun `console.*` în afara `RenderBoundary`; nicio telemetrie, niciun apel de rețea (`fetch`/`Worker`/`import.meta.url` absente). Fișierul exportat conține `generator.version` și `exportedAt` (inofensiv).
- **Dependențe:** **neverificate** (§7). Versiuni exacte în `package.json`; `.npmrc` cu `save-exact`; `pnpm audit` este cerut de ROADMAP Etapa 8 și nu rulează în CI.

### UX și accesibilitate

#### F-11 — `beforeunload` cere confirmare la orice modificare nesalvată (**P2**) [D]
- **Descriere.** `onBeforeUnload` pornește `flush()` (asincron) și apoi verifică imediat `hasUnsavedChanges` — care e încă `true` — deci apelează `preventDefault()` și browserul afișează „Părăsești pagina?” oricând utilizatorul pleacă în fereastra de debounce (≈0,8–5 s) sau în timpul unei salvări normale. Comentariul din cod și ARCH spun că ar trebui doar la eroare/conflict.
- **Fișiere.** `src/state/lifecycle.ts` (≈32–37).
- **Impact.** Dialoguri false după editări rapide; utilizatorii învață să le ignore, deci le ignoră și pe cele reale. (Argument contrar: dialogul protejează efectiv când salvarea nu apucă să se termine — decizie de produs.)
- **Probabilitate.** Medie.
- **Soluție.** Cere confirmare doar dacă `status` ∈ {`error`, `conflict`} sau dacă salvarea durează > X ms; altfel se bazează pe `flush`.
- **Efort.** Mic.

#### F-12 — Tastatură și accesibilitate (**P2**) [D pentru cod; netestat cu cititor de ecran]
- **Descriere.** (1) Scurtături cu o singură tastă active global pe `window` (`w`, `v`, `r`, `0`, `+`, `-`, `Delete`/`Backspace`, săgeți) fără posibilitate de dezactivare/remapare (WCAG 2.1.4). (2) Săgețile fac `preventDefault` și panoramează planul când nimic nu e selectat — inclusiv când focalizarea e pe un buton/tab, ceea ce poate interfera cu navigarea; pe un nod/obiect selectat, săgețile îl mută chiar dacă focalizarea e în altă parte. (3) Tab-urile 2D/3D au `role="tab"` fără navigare cu săgeți și fără `tabindex` rulant (model ARIA incomplet). (4) SVG-ul planului are `role="img"` (copiii nu sunt accesibili); alternativa de la tastatură există — lista „Elemente din plan” din `<details>` — și e un punct pozitiv, dar selecția din canvas nu e anunțată (`aria-live`). (5) Niciun `prefers-reduced-motion`/`forced-colors`.
- **Fișiere.** `PlanEditor.tsx` (≈560–660, ≈870–914), `PlanCanvas.tsx` (≈311), `EditorClient.tsx` (≈89–108), `SessionView.tsx`.
- **Impact.** Utilizatori de tastatură/cititor de ecran au o experiență parțială; scurtăturile pot acționa nevăzut.
- **Probabilitate.** Medie.
- **Soluție.** Scurtături active doar când planul are focus (`tabIndex=0` pe container) sau cu comutator „Scurtături”; model ARIA complet pentru tab-uri; `aria-live` pentru selecție; audit axe (deja în ROADMAP Etapa 8).
- **Efort.** Mediu.

#### F-13 — Ecrane mici și tactil (**P2**) [D]
- **Descriere.** Canvasul are `touch-none`, iar panourile se stivuiesc sub `lg` (CSS), dar nu există pinch-zoom, nici layout pe trepte, nici modul „doar vizualizare” pe telefon (ROADMAP Etapa 3 le cere; Etapa 2b le listează la „Amânat”). Nu există `matchMedia`/`innerWidth` în cod. Pe telefon editorul 2D se afișează complet, dar practic nu poate fi folosit. Navigarea tactilă 3D e „nevalidată” (STAGE3A/3C).
- **Impact.** Utilizatori pe telefon/tabletă: unelte inutilizabile, fără explicație.
- **Probabilitate.** Mare dacă produsul e deschis de pe mobil.
- **Soluție.** Se tratează în Etapa 3 așa cum e planificat; minim acum: mesaj explicativ sub 768 px. Test pe dispozitive reale (§7).
- **Efort.** Mare (complet) / mic (mesajul).

#### Alte observații UX
- Fluxurile de creare/redenumire/ștergere au confirmări și mesaje în română; ștergerea unui perete cu camere cere confirmare și explică impactul; undo disponibil (Ctrl+Z). Ștergerea unui perete/gol/obiect fără dependențe se face direct (Delete/Backspace) — reversibilă prin undo.
- Starea 3D → 2D: editorul 2D se demontează în 3D (scurtăturile nu acționează nevăzut) — decizie bună; selecția de obiect/suprafață e comună.
- Navigarea 2D↔3D↔dashboard prin `<a href>` = reîncărcare completă; sesiunea se închide prin `pagehide`.

### Static export și distribuție

Rezultat: **compatibil**, fără constatări P0–P2 prin citire statică.
- `next.config.mjs`: `output:'export'`, `trailingSlash:true`, `images.unoptimized`, `basePath` condiționat, `distDir` alternativ pentru build-ul paralel; nu s-a modificat nimic.
- Rute: `/` și `/editor/?p=<id>` (un singur HTML; `useSearchParams` sub `Suspense`). La refresh: `editor/index.html` + query păstrat; `serve-static.mjs` emulează o gazdă strictă (308 director→director/, 404.html), iar `e2e/app.spec.ts` acoperă `page.reload()`, `./editor?p=` (fără slash), id inexistent, fără id (neexecutate aici).
- Resurse: nicio resursă externă; `asset()` folosit; fără `next/image`, `next/link`, fonturi externe, Worker-i.
- Riscuri reziduale: **F-19** (context sigur); `basePath` verificat doar cu `/rc-test` pe server emulat, nu pe GitHub Pages real; fără `THIRD_PARTY_NOTICES.md` comis (generat la cerere); ARCH §12 lasă hostingul nedecis (în regulă pentru etapa actuală).

### Testare și calitatea codului

#### F-15 — Lacune și fragilități ale testării (**P2**) [D]
- **Stare (numărătoare statică, nu rezultate):** ≈519 cazuri `it(`/`test(` în 32 de fișiere unitare (`tests/`), ≈23 e2e în 5 fișiere (`e2e/`), ≈7 e2e de stocare (`e2e-storage/`); STAGE3C raportează 547 de teste verzi, 96,41% instrucțiuni (nereprodus aici). CI (`ci.yml`) rulează format, lint, tipuri, depcruise, licențe, teste, build și e2e pe Chromium/Firefox/WebKit, cu și fără `basePath`.
- **Lacune:**
  1. `vitest.config.mts` include în coverage doar `domain/state/persistence/catalog/materials`; **fără praguri**, iar CI nu rulează `test:coverage` — criteriul „≥ 90% în `domain/`” (ROADMAP 1b) nu e impus.
  2. Scenarii lipsă: import prin UI (nu există), pierdere de context WebGL, două taburi cu autosave în timp ce celălalt e în 3D, **proiect mare (`bigProject`) în browser**, restaurare dintr-un document `corrupt`/„mai nou” (F-01), `beforeunload`, ieșire forțată în timpul salvării (doar simulare), cotă reală.
  3. Fragilitate: STAGE3C §9 raportează două teste e2e instabile în WebKit (clic pe categorie; orbitare cu mouse-ul) „făcute robuste” prin reîncercarea gestului — semn că gesturile reale sub încărcare sunt sensibile.
  4. **Simulare vs real:** testele de componente rulează în `jsdom`/`node` (fără layout, fără WebGL, fără `ResizeObserver` real); e2e folosesc Playwright cu mouse sintetic. WebKit-ul Playwright **nu** este Safari/iOS; nu există proiecte cu emulare tactilă/mobilă și nicio rulare pe dispozitive reale.
  5. Testele de performanță existente au praguri de ordin de secunde (`< 2000/3000/6000 ms`) — prind doar regresii catastrofale.
- **Soluție.** Praguri de coverage pentru `domain/` și `state/`; teste pentru F-01/F-02/F-05; un scenariu de performanță în browser; proiect Playwright cu `hasTouch`/viewport mic; listă de verificare manuală pe dispozitive (§7). Nu se adaugă teste doar pentru procent.
- **Efort.** Mediu.

#### F-16 — Componente-monolit în `features/plan-editor` și `materials` (**P2**) [S/R]
- **Descriere.** `PlanEditor.tsx` (929 linii, mașina de gesturi + tastatură + stare de unelte + notificări), `MaterialsPanel.tsx` (684), `PlanCanvas.tsx` (634), `PropertiesPanel.tsx` (534). Logica de decizie e bine delegată domeniului (`domain/edit`), dar gesturile și tastatura sunt amestecate cu React și greu de testat izolat. Etapa 3 adaugă poligon liber, snap la axe/unghiuri, măsurare, tactil — presiune mare pe acest fișier.
- **Soluție.** Extrage mașina de stări a gesturilor (select/perete/tragere/pan/pinch) și maparea tastelor în module pure în `plan-editor/`, testate fără DOM; memoizează straturile din `PlanCanvas`.
- **Efort.** Mediu.

#### Ținuta generală a codului
- TypeScript strict, ESLint, Prettier, 0 `TODO/FIXME` în `src`. Comentariile explică „de ce” și trimit la ADR-uri.
- **Duplicări mici (P3, F-20):** `freshId` apare în `domain/edit/index.ts` și `domain/objects/index.ts`; `defaultGenId` din `PlanEditor.tsx` ≡ `newId` din `lib/ids.ts`.

### Arhitectură — probleme care pot deveni scumpe

#### F-18 — Igienă de dependențe (**P3**) [D]
- Sunt urmărite în git **două lockfile-uri** (`package-lock.json` și `pnpm-lock.yaml`) deși `packageManager` este `pnpm@10.34.9` și `.npmrc` cere versiuni exacte → risc de derivă (nu am comparat conținutul).
- `konva` și `react-konva` sunt în `dependencies` dar **nu sunt importate** în `src/` (apar doar în `tests/domain-purity-gate.test.ts`); ADR-037 le descrie ca „instalate, nefolosite”. Suprafață de lanț de aprovizionare inutilă; nu intră în bundle.
- **Soluție.** Un singur lockfile; elimină Konva/react-konva când se confirmă că SVG-ul rămâne (decizie de produs — **nu modifică versiuni**, doar eliminare ulterioară, după aprobare).
- **Efort.** Mic.

#### F-21 — Reguli de straturi incomplete și deriva documentației (**P3**) [D]
- `.dependency-cruiser.cjs` impune `domain`, `persistence`, `state`, `features`, `app` și ciclurile, dar **nu** și: `catalog/` și `materials/` fără React/Three/DOM (promisiune din ARCH §4.8b/c, momentan respectată doar prin convenție), `ui/` și `lib/` fără import din `features`/`state`/`domain`, `viewer-3d` ca singurul modul care poate importa `three`/`@react-three`.
- `ARCHITECTURE.md` descrie module cu alte nume (vezi §2.3).
- **Soluție.** Reguli suplimentare (mici) + o rundă de actualizare a documentului de arhitectură (fără a rescrie documentele de etapă).
- **Efort.** Mic.

#### F-22 — Funcții planificate neimplementate (**P3**) [S]
`userCatalog`, `assets`, `rc:prefs` (localStorage), rezerva `BroadcastChannel`, export CSV/XLSX, memento periodic de export (ROADMAP Etapa 8), `navigator.storage.persist()` apelat doar la creare de proiect (există `StorageFooter`). Nu sunt defecte; sunt de urmărit pentru a nu fi uitate.

---

## 4. Clasificarea P0–P3

| ID | Titlu | Clasă | Tip | Probabilitate | Efort |
|---|---|---|---|---|---|
| F-01 | Restaurarea suprascrie ireversibil un document invalid/mai nou | **P0** | D | mică → medie | mic–mediu |
| F-02 | Nu există import în UI (backup nerestabilibil) | **P1** | D | mare | mediu |
| F-03 | Identitatea documentului se schimbă la fiecare salvare; geometrie analizată 2–3× | **P1** | D | certă | mic |
| F-04 | Politică de compatibilitate incoerentă (schemă strictă + hosting static) | **P1** | D+R | medie | mediu |
| F-05 | Fără graniță de erori în afara 3D | **P1** | D/R | mică | mic |
| F-06 | Performanța la scara țintă nemăsurată; recalcul complet la drag | **P1** | D/R | medie | mediu |
| F-07 | „pre-migration” e primul tăiat de plafon | P2 | D (latent) | mică → mare | mic |
| F-08 | 3D reconstruiește pereți/podele integral | P2 | D | certă | mediu |
| F-09 | Dashboard parsează toate proiectele la încărcare | P2 | D/R | mică–medie | mic–mediu |
| F-10 | Import: plafoane incoerente, fără Worker | P2 | R | mică | mic–mediu |
| F-11 | `beforeunload` prea agresiv | P2 | D | medie | mic |
| F-12 | Tastatură/accesibilitate | P2 | D | medie | mediu |
| F-13 | Ecrane mici/tactil | P2 | D | mare (dacă mobil) | mare/mic |
| F-14 | Fără Web Locks → fără excludere între taburi | P2 | R | mică | mic–mediu |
| F-15 | Lacune și fragilități de testare | P2 | D | — | mediu |
| F-16 | Componente-monolit (PlanEditor etc.) | P2 | S/R | — | mediu |
| F-17 | WebGL: context pierdut, `preserveDrawingBuffer` | P2 | R | mică–medie | mic |
| F-18 | Două lockfile-uri; Konva/react-konva nefolosite | P3 | D | — | mic |
| F-19 | Context sigur (`randomUUID`, `locks`) | P3 | R | mică | mic |
| F-20 | Duplicări mici (`freshId`, `newId`) | P3 | D | — | mic |
| F-21 | Reguli de straturi incomplete; documentație desincronizată | P3 | D | — | mic |
| F-22 | Funcții planificate lipsă | P3 | S | — | variabil |

*Observație asupra clasificării:* F-01 e P0 prin natura consecinței (pierdere de date, ireversibilă) și a soluției ieftine, **nu** pentru că se întâmplă frecvent azi. Dacă preferi să rezervi P0 pentru defecte care se manifestă deja în utilizarea curentă, F-01 poate fi coborât la P1; recomandarea rămâne să fie făcut primul.

---

## 5. Recomandări prioritizate

1. **Faceți recuperarea sigură** (F-01, F-07): arhivează brutul înainte de suprascriere; nu oferi „Restaurează” pentru documente „mai noi”; „Exportă datele brute”; scoate `pre-migration`/`pre-overwrite` de sub plafon.
2. **Închideți bucla backup → restaurare** (F-02, F-10): UI de import cu mesaje pe etape și plafoane realiste.
3. **Decideți politica de versiuni** (F-04, Anexa A) *înainte* de următoarea modificare a schemei sau a catalogului.
4. **Adăugați granițe de erori cu „Exportă copie”** (F-05).
5. **Măsurați, apoi optimizați** (F-06 → F-03, F-08, F-09): benchmark Node + scenariu Playwright pe `bigProject()`; F-03 se poate face imediat (mic, fără risc).
6. **Accesibilitate și tactil în Etapa 3** (F-12, F-13) — nu ca patch separat; plus mesaj minim sub 768 px.
7. **Consolidați testarea** (F-15) alături de remedierile de mai sus; lista manuală pe dispozitive (§7).
8. **Igienă** (F-17…F-22) în loturi mici.

### Propuneri pentru `ROADMAP.md` (nu au fost aplicate; necesită aprobare)
Nu am modificat `docs/ROADMAP.md`. Dacă aprobi, sugerez doar **adăugiri** la etape deja existente, fără a schimba etapele aprobate: în Etapa 2 (interfața de persistență) — „import în UI” și „recuperare sigură”; în Etapa 3 — „mesaj sub 768 px” și „măsurare reală la 20 de camere”; în Etapa 7 — „test de pierdere de context”; în Etapa 8 — „`pnpm audit` în CI” și „prag de coverage”.

---

## 6. Ordine propusă pentru remedierea problemelor

| Pas | Conținut | De ce în această ordine |
|---|---|---|
| 1 | F-01 + F-07 (recuperare sigură, plafoane snapshot) | Elimină singurul risc de pierdere ireversibilă; mic; independent. |
| 2 | F-05 (graniță de erori cu export) | Mic; adaugă o plasă de siguranță pentru tot ce urmează. |
| 3 | F-03 (cache derivat după salvare, geometrie din `commit`) | Mic, fără risc funcțional, îmbunătățește imediat orice măsurătoare ulterioară. |
| 4 | F-06 (măsurare: benchmark Node + Playwright pe `bigProject`) | Fundamentează deciziile pentru F-08/F-09/F-16; poate muta priorități. |
| 5 | F-02 + F-10 (import UI cu plafoane) | Închide bucla backup; se bazează pe pasul 1 (restaurare sigură) și pe testele noi. |
| 6 | F-04 (politică de versiuni) | Trebuie decisă înainte de a schimba schema/catalogul; poate rula în paralel cu 5. |
| 7 | F-08, F-09, F-16 (optimizări ghidate de cifrele din pasul 4) | Se face doar ce arată măsurătoarea. |
| 8 | F-11, F-12, F-13 (UX/a11y/tactil, odată cu Etapa 3) | Se integrează în planul Etapei 3. |
| 9 | F-14, F-15, F-17 (taburi, teste, WebGL) | Parte din criteriile Etapelor 7–8. |
| 10 | F-18…F-22 (igienă) | Fără urgență. |

Nu se începe nicio remediere fără aprobarea ta explicită.

---

## 7. Aspecte care nu au putut fi verificate

### 7.0 Verificat ulterior (2026-10-31, commit `4e2467d`, Windows 11)

Textul de mai jos (7.1) este cel original și rămâne neschimbat; această secțiune spune ce s-a verificat între timp. **Mediu:** Node 22.23.4 (arhivă ZIP oficială, SHA-256 verificat față de `SHASUMS256.txt`, doar în PATH-ul sesiunii), `pnpm 10.34.9` prin `npx`; nicio modificare de `package.json`, lockfile sau dependențe.

| Verificare | Rezultat |
|---|---|
| `pnpm install --frozen-lockfile` | OK (lockfile neschimbat) |
| `pnpm verify` | **Eșuează la `format:check`** (74 de fișiere), din cauza mediului: `core.autocrlf=true` ⇒ working tree CRLF, indexul git e LF (244/244 fișiere), Prettier cere LF. Cu `prettier --check --end-of-line auto .`: **curat**. Nu e o problemă de cod. |
| Restul `verify`, rulat pe pași | `lint` OK · `typecheck` OK · `depcruise` OK (104 module, 341 dependențe, 0 încălcări) · `license:check` OK (535 pachete, 0 încălcări) · `test` OK (**32 fișiere, 547 teste**) · `build` OK |
| `pnpm audit` | **2 vulnerabilități moderate**, ambele `minimatch <11.0.1` (DoS prin amplificare `globparts`, GHSA-g3hv-75wg-m249), tranzitive prin `eslint` și `eslint-config-next → typescript-eslint` (doar dev-time, nu intră în bundle). Neremediate (nu se schimbă versiuni). |
| `pnpm test:coverage` | **1 test pică, reproductibil (2 din 2 rulări):** `tests/materials/materials.test.ts` „generarea tuturor texturilor rămâne rapidă (< 2 s)” — 2888 ms și 3050 ms sub instrumentare, trece fără coverage. Confirmă F-15 pct. 5 (pragurile de timp sunt fragile). Cifra de coverage nu a fost obținută (rularea eșuează înainte de raport). |
| `pnpm e2e` (Chromium, Firefox, WebKit) | 66 trecute, **3 picate pe Firefox**, toate `page.reload` cu timeout 60 s, sub încărcare paralelă. Rulate singure (`--project=firefox --workers=1`): **19/19 trec** ⇒ instabilitate sub încărcare, nu defect reproductibil. Consistent cu F-15 pct. 3. |
| `pnpm e2e:storage` | **21/21 trec** (Firefox + WebKit, IndexedDB și Web Locks reale). |
| `pnpm e2e:base` | Nerulat (nu a fost cerut). |

**Constatări confirmate:**
- **F-01 — CONFIRMAT (cod + test).** `manager.ts:341-342`: ramura `corrupt` apelează `repo.save` direct, fără `addSnapshot`. Test de reproducere (temporar, nu este în repo): un document cu `schemaVersion: 99` + câmp nou ⇒ `inspect` dă `corrupt/stage:'version'`; după `restoreSnapshot` (întoarce `ok`), câmpul nou nu mai există nici în `documents`, nici în `snapshots`. Pierdere ireversibilă confirmată.
- **F-03 — CONFIRMAT, cu o nuanță.** `session.ts:319` creează un obiect nou după salvare. Test: după `flush`, `doc` are altă identitate, iar `selectGeometry(doc)` returnează un model nou (recalculat). Nuanță: sub-obiectele păstrează identitatea (`nodes` identic înainte/după), deci partajarea structurală funcționează; se pierde doar memoizarea din `selectors.ts`, care e pe identitatea documentului întreg. Apelul redundant `analyzeGeometry` din `checkIntegrity` (`integrity/index.ts:59`) confirmat prin cod; **numărul exact de analize per editare nu a fost măsurat** (rămâne F-06).
- **F-05 — CONFIRMAT prin cod.** `src/app/` conține doar `layout`, `page`, `editor/page`, `editor/EditorClient`, `globals.css`; niciun `error.tsx`/`global-error.tsx`/`not-found.tsx`. Singura graniță de erori din `src` este `RenderBoundary` din `Viewer3D.tsx`. **Impactul în browser (ecran alb) nu a fost reprodus** — doar absența graniței.
- **F-07 — confirmat prin cod** (citit în plus): `repository.ts:81` `createdAt: parsed.doc.updatedAt`, `:173-175` plafon de 5 după `createdAt` ⇒ copia `pre-migration` e prima tăiată. Netestat (nu există migrări reale).
- **F-18 (parțial):** `package-lock.json` și `pnpm-lock.yaml` sunt ambele urmărite (confirmat în `git archive`); conținutul nu a fost comparat.

**Rămân neverificate (neschimbat):** CI pe GitHub, FPS/memorie/performanță la 20 de camere, WebGL/pierdere de context, tactil, cititoare de ecran, Safari/iOS real, `pagehide` pe dispozitive, GitHub Pages real, `e2e:base`, corectitudinea formulelor de domeniu.

### 7.1 Starea inițială (text original, neschimbat)

**Mediul.** Dependențele nu s-au putut instala: `pnpm install --frozen-lockfile` a eșuat deoarece `registry.npmjs.org` nu se rezolvă din sandbox (nici direct, nici prin proxy). Consecințe:

- **Nu am rulat** `pnpm verify` (format, lint, typecheck, depcruise, license:check, vitest, build), `pnpm e2e`, `pnpm e2e:base`, `pnpm e2e:storage`, `pnpm test:coverage`. Afirmațiile din rapoartele proiectului (547 de teste, 96,41% coverage, e2e verzi) **nu au fost reproduse**.
- **Nu am verificat vulnerabilități cunoscute în dependențe** (`pnpm audit` / baze oficiale). Versiunile din `package.json` (Next 16.4.3, React 19.3.1, three 0.186.1, Dexie 4.4.7, zod 4.6.7, zustand 5.0.16, immer 11.2.9, konva 10.9.0 etc.) nu au fost comparate cu avize. Poarta de licențe (`license:check`) nu a rulat.
- **Nu am verificat** dacă CI-ul a rulat vreodată pe GitHub (ADR-033 spune că workflow-ul exista, dar nu rulase la data respectivă).
- **Nu am inspectat** efectiv `package-lock.json` vs `pnpm-lock.yaml` (F-18 e doar observația că ambele sunt urmărite).

**Fără browser sau dispozitive.** Nu am verificat: randarea reală a UI, WebGL/pierderea contextului (F-17), tactil/pinch (F-13), cititoare de ecran și contrast (F-12), comportamentul `beforeunload` și al tranzacțiilor IndexedDB la `pagehide` în Chromium/Firefox/WebKit, Safari/iOS real, ecrane HiDPI, Firefox `persist()`, `QuotaExceededError` real, memoria GPU după editări repetate, funcționarea pe GitHub Pages real (doar emulatorul `serve-static.mjs`, neexecutat).

**Fără măsurători proprii.** Toate cifrele de performanță (43 ms pentru 100 de obiecte; 2 ms/reconstruire; 30 de reconstruiri 60 ms; etc.) sunt din STAGE3B/3C, în Node, pe 2 camere. Costul real al `commit`, `assignDifferences`, `analyzeGeometry` la 20 de camere/300 de obiecte, FPS-ul 2D/3D și creșterea de memorie rămân necunoscute (F-06).

**Acoperirea lecturii.** Citite integral: `state/{session,manager,selectors,lifecycle}`, `persistence/*`, `domain/{schema,integrity,io,scene}`, `features/viewer-3d/*`, `features/projects/{Dashboard,ProjectCard,RecoveryDialog}`, `app/*`, `lib/{asset,download,ids,project-runtime/*}`, `.dependency-cruiser.cjs`, `next.config.mjs`, `package.json`, `vitest.config.mts`, `playwright.config.ts`, `ci.yml`, `docs/{ARCHITECTURE,ROADMAP}.md`. Citite parțial: `PlanEditor.tsx` (≈100–430, ≈560–929), `PlanCanvas.tsx` (căutări + antet), `SessionView/SessionBanners/EditorShell` (început), `domain/geometry/model.ts` (început), rapoartele STAGE3A–C și `DECISIONS.md` (căutări țintite). **Neparcurse în detaliu:** `domain/{budget,quantities,finishes,objects,placement,edit,cascade,money}`, `domain/geometry/{walls,polygon,rect,vec}`, `catalog/*` (rețete, itemi), `materials/*`, `MaterialsPanel`, `ObjectPanel`, `CatalogPanel/Browser`, `ui/*`, corpul testelor și al e2e (doar numărătoare și fragmente), `scripts/*` (doar antetul `serve-static.mjs`), `spikes/`. Corectitudinea formulelor de cantități/buget/geometrie **nu face obiectul acestui audit** și nu a fost evaluată.

---

## Anexa A — Strategie propusă pentru migrări viitoare (fără implementare acum)

Starea actuală: `CURRENT_VERSION = 1`, `MIGRATIONS = {}`; lanțul `migrateToLatest` și testele sintetice (v0→v1, lanț v0→v3) există; fixture înghețat `tests/fixtures/v1/studio.roomcraft.json`; două niveluri separate (schema Dexie vs schema documentului) — corect.

1. **Regula de versionare.** Orice schimbare a formei persistate — câmp nou/redenumit/eliminat, **valoare nouă de enum** (ex. un model de textură, un tip de cameră), schimbare de semantică — crește `schemaVersion` și vine cu o migrare pură `migrate_vN→vN+1(raw: unknown) → raw`. Motiv: schema e `strictObject`, deci „adăugare opțională în aceeași versiune” (ARCH §7.7) face ca versiunile vechi să vadă documente „invalide”, nu „mai noi” (F-04). Alternativa: citire tolerantă pentru valori necunoscute (înlocuitor + avertisment, ca la rețete) — de ales explicit, nu implicit.
2. **Migrarea rulează la încărcare și la import, pe date brute**, înaintea schemei (așa e deja). La încărcare: copie a brutului **înainte** să înlocuiască documentul, apoi `startDirty` ca rezultatul să se salveze (deja).
3. **Copiile de siguranță de migrare nu intră sub plafonul de 5** (F-07); `createdAt` = momentul copierii.
4. **Documente mai noi decât aplicația:** `corrupt/stage:'version'` → mesaj „actualizează aplicația”, **fără** „Restaurează/Șterge” și cu „Exportă datele brute” (F-01). Opțional: câmp `minReaderVersion` scris la salvare, pentru a distinge „mai nou” de „corupt” fără a încerca schema.
5. **Fixtures:** câte un fișier înghețat pe versiune (`tests/fixtures/vN/*.json`); testul rulează `migrateToLatest` pe toate și validează cu schema curentă + integritate; test de round-trip export→import→export pe fiecare versiune; migrările nu se modifică după lansare.
6. **Schema IndexedDB (Dexie)** se ridică (`version(2).stores(...).upgrade(...)`) **doar** când apar magazii/indici noi (`userCatalog`, `assets`). Când se întâmplă: tratează `versionchange`/`blocked` (închide conexiunea și cere reîncărcarea în celelalte taburi) — de proiectat atunci, nu acum.
7. **Catalog încorporat vs proiect:** rămâne principiul actual (snapshot în proiect, D11); modificările catalogului nu afectează proiectele existente (testat); extinderile de enum din catalog intră sub regula 1.
8. **Ce NU se face acum:** nicio migrare „de probă”, nicio versiune 2 livrată.

## Anexa B — Fișiere create sau modificate de acest audit

- **Creat:** `docs/TECHNICAL_AUDIT.md` (acest document).
- **Modificate:** niciunul. Nu s-a modificat cod, configurație, dependențe, teste sau alte documente; nu s-a făcut commit/push (repository-ul a fost clonat doar pentru citire).
