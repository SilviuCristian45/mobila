# Lot de remediere 2 — F-05 (granițe de erori și recuperare)

> **Data:** 2026-10-31 · **Branch:** `fix/f05-error-recovery`, creat din `fix/f01-f07-safe-recovery` (commit `96eb7a2`, working tree curat la start) · **Stare:** modificări necomise, fără push, în așteptarea aprobării.
> Sursa constatării: `docs/TECHNICAL_AUDIT.md` (F-05). Lotul 1 (`docs/REMEDIATION_BATCH_1.md`) nu a fost modificat.

## 1. Probleme identificate (analiză înainte de modificări)

**Ce exista deja și funcționa** (verificat în cod și în teste): stocare indisponibilă / proiect inexistent / invalid / mai nou la deschidere → mesaj + „← Înapoi la proiecte” (`EditorShell`); eroare de salvare → banner cu „Reîncearcă” și „Exportă copie”, modificările rămân în memorie (`SessionBanners`); WebGL absent sau scenă invalidă → mesaje controlate (`Viewer3D`).

**Goluri reale:**
1. `src/app/` nu avea `error.tsx` / `global-error.tsx`: o excepție la randare în `PlanEditor`, într-un panou sau în carcasă demonta tot arborele React (ecran alb / ecranul implicit Next), inclusiv „← Proiecte” și „Exportă copie”.
2. `RenderBoundary` acoperea doar `<Canvas>` și afișa utilizatorului `error.message` brut (tehnic, adesea neinteligibil).
3. Panourile laterale, zona de lucru și cardurile din dashboard nu erau izolate: un singur card care aruncă scotea din funcțiune toată lista; un panou care aruncă strica planul.
4. Nicio zonă nu avea „Încearcă din nou” local.

Nu s-a găsit nicio problemă în F-01/F-07 sau în mecanismul de persistență (nu s-a modificat nimic acolo).

## 2. Soluția implementată

Strategie pe straturi (cel mai local prinde primul). Interfața e în română; **mesajul și stack trace-ul excepției nu apar niciodată în interfață** (merg doar în consola dezvoltatorului, cu numele zonei).

| Strat | Fișier | Ce se întâmplă la eroare |
|---|---|---|
| Componentă comună | `src/ui/ErrorBoundary.tsx` (nou) | `fallback({ reset })` primește doar `reset`, nu eroarea; `resetKey` șterge singură eroarea; `onReset` |
| Vizualizare 3D | `Viewer3D.tsx` (`RenderBoundary`) | Refăcut peste `ErrorBoundary` (fără dublare); nu mai arată `error.message`; „Încearcă din nou” remontează canvas-ul |
| Zona de lucru (plan 2D / 3D) | `SessionView.tsx` | Fallback în loc de zonă; **antetul rămâne** (Anulează, Exportă copie, redenumire, „← Proiecte”), sesiunea și autosave-ul rămân active; „Încearcă din nou”, „Exportă copie”, „← Înapoi la proiecte” |
| Panouri laterale | `app/editor/EditorClient.tsx` | Doar panoul e înlocuit; planul rămâne; „Încearcă din nou”; `resetKey` = panoul deschis |
| Carduri dashboard | `Dashboard.tsx` | Cardul stricat arată „Acest proiect nu a putut fi afișat”, restul listei funcționează |
| Rută | `src/app/error.tsx` (nou) | Mesaj, „Încearcă din nou” (`reset`), link către dashboard cu `basePath` |
| Layout | `src/app/global-error.tsx` (nou) | Definește `<html lang="ro">`; aceleași acțiuni |

**Recuperarea datelor.** Granițele nu ating persistența: documentul, sesiunea, undo și autosave trăiesc în afara arborelui React. „Încearcă din nou” doar remontează componente — **nu creează nicio operație de scriere** (verificat prin teste: stocarea e identică înainte/după retry). Mesajele de eroare de stocare / încărcare / WebGL existente au fost verificate și nu au necesitat modificări (acoperite de teste noi la nivel de interfață).

**Compatibilitate cu export static.** `error.tsx` și `global-error.tsx` sunt componente client; `pnpm build` produce aceleași rute (`/`, `/editor`, `/_not-found`); testate pe `/`, `/editor/?p=<id>` și cu `basePath=/rc-test`.

**Un test existent a fost modificat intenționat:** `tests/ui/viewer-3d.test.tsx` („eroare de randare în canvas”) cerea ca mesajul brut al excepției („Context WebGL pierdut”) să apară în interfață. Aserția a fost inversată (mesajul brut **nu** apare; apare explicația în română), restul scenariului (retry, canvas revenit) e neschimbat. Nu s-a eliminat niciun test.

## 3. Teste adăugate

**Unitare / interfață** (`tests/ui/error-recovery.test.tsx`, 13 teste; `tests/ui/error-side-panel.test.tsx`, 1 test). Granițele sunt testate efectiv (o componentă chiar aruncă):
- `ErrorBoundary`: fallback + restul paginii rămâne + mesajul excepției absent din DOM; `onReset`; `resetKey`.
- `error.tsx`: mesaj fără detaliile excepției, `reset` apelat, link `/` și `/rc-test/` (basePath); `global-error.tsx`: `<html lang="ro">`, fără detalii.
- Zona de lucru: antet / link dashboard / undo rămân; **sesiunea e vie** (o redenumire se salvează exact o dată, revizie +1, undo funcționează); retry (și cât eroarea persistă) nu schimbă stocarea (`documents`, `projects`, `snapshots` identice); „Exportă copie” din fallback produce fișier valid fără să modifice stocarea.
- Persistență: eșec la autosave cu zona intactă (documentul rămâne în memorie, stocarea identică, retry scrie exact o dată, fără snapshot-uri noi); eroare de încărcare din IndexedDB la deschidere (mesaj + link înapoi, nicio blocare rămasă, datele neatinse).
- Dashboard: card care aruncă izolat, retry îl readuce, stocarea neatinsă.
- Panou lateral: planul rămâne, retry readuce panoul, stocarea neatinsă.
- **Verificare că testele nu trec în gol:** cu `ErrorBoundary` dezactivat temporar (mutație, apoi restaurat), 10 teste pică.

**E2E** (`e2e/error-recovery.spec.ts`, 6 teste × Chromium / Firefox / WebKit = 18, **toate verzi**). Erorile sunt reale, în build-ul static, fără cod de test în aplicație (formatterele `Intl` primesc prin `addInitScript` un comutator care le face să arunce; WebGL se simulează prin `getContext`):
1. eroare în carcasa editorului → `error.tsx`, fără detalii; modificarea salvată înainte supraviețuiește (citită direct din IndexedDB); retry redeschide proiectul editabil (blocarea s-a eliberat);
2. eroare în planul 2D → zona izolată, export (descărcare reală), retry cât eroarea persistă și după; stocarea neschimbată;
3. eroare în panou lateral → doar panoul înlocuit; retry;
4. WebGL indisponibil → mesaj, 2D funcționează;
5. canvas 3D care nu se poate crea după proba WebGL → `RenderBoundary`, 2D și dashboard rămân;
6. document invalid → editorul explică și oferă înapoi; documentul invalid rămâne neatins; dashboard-ul oferă exportul brut (lotul 1).

## 4. Rezultate verificări (Node 22.23.4 din ZIP oficial, doar în PATH-ul sesiunii; pnpm 10.34.9 prin `npx`)

| Verificare | Rezultat |
|---|---|
| `pnpm test` | **589/589** (37 fișiere; era 575/35 la finalul lotului 1) |
| `lint`, `typecheck`, `depcruise` (107 module, 0 încălcări), `license:check`, `build` | OK |
| Prettier cu `--end-of-line auto` | OK |
| `pnpm verify` (script) | **Pică exclusiv la `format:check`** (97 de fișiere): working tree-ul e CRLF din `core.autocrlf=true`, iar indexul git are 0 fișiere CRLF. Problemă de mediu, ca în loturile anterioare; configurația nu a fost schimbată. Ceilalți pași rulați individual trec. |
| E2E nou (`error-recovery.spec.ts`) | 18/18 (Chromium 6, Firefox 6, WebKit 6) |
| `e2e` root, 3 browsere, workers implicite | **Nu a trecut curat într-o singură rulare a scriptului:** prima rulare 85/87 (Firefox: `app.spec` creare→editor și `viewer-3d.spec` comparația de cadre), a doua 86/87 (Firefox: `catalog.spec`). Chromium și WebKit: 0 eșecuri în ambele rulări. |
| Cele 2 teste din prima rulare, izolate | `--project=firefox --workers=1 --repeat-each=3`: **6/6** |
| `e2e` root, toate testele Firefox, 1 worker | **29/29** |
| **`e2e` root, suita întreagă, `--workers=1`, Chromium + Firefox + WebKit** (rulare finală de confirmare, pe codul din acest lot, fără nicio modificare de teste/configurații/timeout-uri) | **87/87 trecute** (29 teste × 3 browsere), 3,1 min, 0 eșecuri, 0 instabile. Node v22.23.4, pnpm 10.34.9. |
| `e2e:base` (basePath `/rc-test`, build nou) | **87/87** |
| `e2e:storage` | **21/21** |
| `pnpm verify:e2e` (script) | **A eșuat în `e2e` root în ambele rulări** (vezi mai sus), deci lanțul s-a oprit înainte de `build:base` / `e2e:base` / `e2e:storage`; acestea au fost rulate separat și sunt verzi. |

**Interpretare (fără a ascunde eșecurile):** în fiecare rulare a picat un singur test sau două, **altele de fiecare dată**, doar pe Firefox și doar sub încărcare paralelă; fiecare trece izolat, iar Firefox complet cu 1 worker trece 29/29. Același tipar a apărut pe `main` nemodificat în Pasul 1 (3 eșecuri Firefox la `page.reload`, 19/19 cu 1 worker) și e consemnat în audit (F-15 pct. 3, STAGE3C §9). Rularea finală de confirmare, **suita întreagă pe cele 3 browsere cu un singur worker, a trecut 87/87**, ceea ce susține că eșecurile țin de încărcarea paralelă și nu de cod. Rămâne de menționat că nu pot garanta că spec-ul nou (18 teste) nu adaugă încărcare la rularea paralelă implicită, unde instabilitatea Firefox poate reapărea. Nu s-a relaxat și nu s-a eliminat niciun test.

## 5. Fișiere

**Noi:** `src/ui/ErrorBoundary.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, `tests/ui/error-recovery.test.tsx`, `tests/ui/error-side-panel.test.tsx`, `e2e/error-recovery.spec.ts`, `docs/REMEDIATION_BATCH_2.md`.
**Modificate:** `src/features/viewer-3d/Viewer3D.tsx`, `src/features/editor-shell/SessionView.tsx`, `src/app/editor/EditorClient.tsx`, `src/features/projects/Dashboard.tsx`, `tests/ui/viewer-3d.test.tsx` (o aserție, vezi §2), `docs/TECHNICAL_AUDIT.md` (doar linia „Stare” la F-05).
**Neatinse:** `package.json`, `pnpm-lock.yaml`, `tests/materials/materials.test.ts`, configurația git, F-01/F-07 (`repository`, `manager`, `ProjectCard`, `RecoveryDialog`).

## 6. Limitări rămase

- **Erorile din afara randării React nu sunt prinse de granițe:** handlere de evenimente, cod asincron și bucla de randare R3F (`useFrame`) ajung la `window.onerror`, nu la `ErrorBoundary`. **Pierderea contextului WebGL după ce canvas-ul a pornit nu e tratată** (rămâne F-17, neatins în acest lot).
- **`global-error.tsx` nu e exercitat într-un browser real:** presupune ca layout-ul rădăcină să arunce, ceea ce nu se poate provoca fără cod de test în aplicație. Testat prin randare statică (conținut, `<html lang="ro">`, fără detalii) și prin faptul că build-ul static îl acceptă; butonul „Încearcă din nou” de acolo nu are test de click.
- **Eroare la randarea carcasei sesiunii (antet, bannere, rezumat) ajunge la `error.tsx`** și demontează sesiunea: la demontare se salvează ce se poate, dar dacă salvarea eșuează în același timp (de ex. cotă plină), modificările nesalvate din memorie se pierd. Scenariul e puțin probabil (cod simplu, în afara zonei de lucru) și testat doar cu salvare reușită (E2E 1). Zona de lucru, unde stă complexitatea, e izolată tocmai ca să evite asta.
- Dacă eroarea la randare e **cauzată de documentul însuși** (de ex. o stare invalidă deja încărcată), „Încearcă din nou” va eșua din nou; utilizatorul are „Exportă copie”, „← Proiecte”, iar „Anulează” doar dacă eroarea a apărut după o modificare din sesiune.
- „Încearcă din nou” pe zona de lucru remontează planul/3D: selecția, modul 2D/3D și panoul deschis revin la valorile implicite (documentul nu).
- Nu s-a adăugat `not-found.tsx` (în afara cerinței; F-05 din audit îl menționa doar ca opțiune).
- Detaliile excepțiilor se scriu în consolă (`console.error`); nu există raportare externă (conform cerinței).
- E2E-ul de eroare folosește `Intl` / `getContext` ca declanșatori: dacă aplicația va înlocui aceste formatări, declanșatorii trebuie ajustați (testele vor eșua zgomotos, nu vor trece în gol, fiindcă așteaptă elemente care există doar dacă boundary-ul a prins eroarea).
- Instabilitatea Firefox sub încărcare paralelă (§4) rămâne nerezolvată și în afara acestui lot (F-15).
- Verificat doar pe Windows; fără dispozitive reale.
