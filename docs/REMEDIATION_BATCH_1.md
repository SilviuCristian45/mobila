# Lot de remediere 1 — F-01 + F-07 (recuperare sigură, retenția copiilor)

> **Data:** 2026-10-31 · **Branch:** `fix/f01-f07-safe-recovery` (din `main`, commit `4e2467d`) · **Stare:** modificări necomise, fără push, în așteptarea aprobării.
> Sursa constatărilor: `docs/TECHNICAL_AUDIT.md` (F-01, F-07).

## 1. Ce s-a schimbat și de ce

### F-01 — restaurarea nu mai distruge date
Problema: `restoreSnapshot` suprascria direct un document invalid/„mai nou”, fără nicio copie a datelor brute (confirmat prin test în Pasul 1).

- `src/state/manager.ts` — `restoreSnapshot`:
  - document curent `corrupt` cu `stage: 'version'` (mai nou) sau `'migrate'` (versiune fără drum de migrare) → **refuz** cu `{ kind: 'incompatible', message }`, **zero scrieri**; documentul, meta și snapshot-urile rămân identice.
  - copie (snapshot) ilizibilă (mai nouă / invalidă) → același refuz explicit, în loc de „nu mai există”.
  - orice alt document invalid (`schema`, `integrity`) → se arhivează **rândul brut** ca `pre-overwrite`, apoi se restaurează copia.
  - tipul `MutationFailure` primește varianta `incompatible`; mesajele din `src/lib/messages.ts` o afișează ca atare.
- `src/persistence/repository.ts` + `types.ts` — metodă nouă `overwriteUnreadable(doc, expectedRevision, now)`: într-o singură tranzacție (`projects` + `documents` + `snapshots`) verifică revizia, arhivează `row.data` **neatins** (cu orice câmpuri necunoscute; nu trece prin schemă) și scrie documentul. Dacă arhivarea eșuează, nu se scrie nimic. `schemaVersion`-ul copiei e cel din rândul brut (0 dacă lipsește/e invalid).
- UI: `ProjectCard` nu mai oferă „Restaurează” pentru proiect „mai nou/neconvertibil” și spune că datele nu au fost modificate; `RecoveryDialog` nu mai promite arhivare „doar dacă e valid”.

**Completare — export brut din dashboard** (cerută după prima versiune a lotului):
- `ProjectRepository.loadRaw(id)` — citește rândul din `documents` exact cum e stocat (`documents.get`), **fără** `load`/`parseRow`: nu validează, nu migrează, nu creează copia `pre-migration`, nu modifică revizia.
- `ProjectManager.exportRaw(id)` — `JSON.stringify(raw, null, 2)` al datelor brute; nu ia blocare (doar citire; merge și cât proiectul e deschis în alt tab); `not-found` / eroare de stocare tipate.
- `rawBackupFileName(name)` (`src/lib/download.ts`) — `<nume-sigur>-backup-raw.json` (de ex. `din-viitor-backup-raw.json`; fallback `proiect-backup-raw.json`), distinct de `.roomcraft.json`. Numele vine din metadatele proiectului, nu din documentul brut.
- UI: butonul „Exportă datele brute” apare pe **orice card invalid** (mai nou, neconvertibil, invalid), nu și pe cele valide. Cardul explică în `raw-export-hint` că e un backup brut, nu un `.roomcraft.json`, și că versiunea curentă nu îl poate deschide neapărat. După descărcare, o notificare (rămâne vizibilă, nu dispare după 6 s) repetă asta, numește fișierul și precizează că proiectul nu a fost modificat; la eroare, mesaj explicit și niciun fișier.
- **Nu** există restaurare din datele brute (în afara scopului).

Nu se deserializează și re-salvează documentul curent: câmpurile necunoscute nu trec prin `zod` strict înainte de arhivare.

### F-07 — retenția copiilor de siguranță
Problema: `pre-migration` primea `createdAt` = `updatedAt` vechi al documentului și intra în plafonul de 5, deci era prima tăiată.

Regula definită (în `repository.ts`):
- **Copii obișnuite** (`auto`, `manual`): plafon `SNAPSHOTS_KEPT = 5`, cele mai noi, ca înainte.
- **Copii de siguranță** (orice motiv `pre-*`: `pre-migration`, `pre-overwrite`, `pre-import`): în afara plafonului de 5; plafon propriu `SAFETY_SNAPSHOTS_KEPT = 3` **per motiv**, cele mai noi.
- `createdAt` al copiei `pre-migration` = momentul copierii (ceas injectabil, `now`, al treilea parametru opțional al constructorului; implicit `new Date()`).
- Copia `pre-migration` se scrie într-o tranzacție cu retenția; dacă există deja cea pentru aceeași revizie, nu se rescrie (reîncărcările repetate nu o mută).
- Retenția e într-o singură metodă privată `prune`, folosită de `addSnapshot`, de copia de migrare și de `overwriteUnreadable`.

Neschimbat: `CURRENT_VERSION = 1`, `MIGRATIONS = {}`, nicio migrare reală, schema documentului, dependențele, lockfile-ul.

## 2. Teste noi (permanente)

`tests/state/restore-protection.test.ts` (F-01, 9 teste)
- „mai nou” cu câmp necunoscut: `incompatible`; `documents` (inclusiv câmpul), `projects` și `snapshots` **identice** înainte/după; fără `pre-overwrite` nou; blocarea eliberată. *Reproduce exact scenariul F-01.*
- `stage: 'migrate'`: refuz, nimic modificat.
- copii ilizibile (mai nouă / invalidă): refuz explicit, proiect și copie neatinse.
- invalid (`schema`) cu câmp necunoscut: `pre-overwrite` conține rândul brut **identic**; copia originală păstrată; document și meta la revizia 2.
- invalid fără `schemaVersion`: brutul arhivat cu `schemaVersion` 0.
- atomicitate: `snapshots.put` eșuează (cotă) ⇒ documentul rămâne neschimbat.
- conflict de revizie între citire și suprascriere ⇒ nu se scrie nimic.
- regresii (cazuri normale): document valid → arhivat + restaurat; proiect șters → recreat din copie.

`tests/persistence/retention.test.ts` (F-07, 8 teste)
- 5 copii obișnuite existente înainte de migrare ⇒ rămân 5 + 1 `pre-migration`.
- după 15 copii automate ulterioare, copia de migrare (brută, `schemaVersion` 0) încă există.
- `createdAt` = momentul copierii, nu `updatedAt` vechi.
- reîncărcări repetate ale aceleiași revizii: o singură copie, neatinsă.
- plafon propriu pentru `pre-migration` (3, cele mai noi) fără a afecta cele 5 obișnuite.
- plafon pentru `pre-overwrite`; tăierea copiilor obișnuite neschimbată; izolare între proiecte.

`tests/state/export-raw.test.ts` (export brut, 7 teste)
- „mai nou” cu câmpuri necunoscute și imbricate (diacritice, liste, `null`): textul exportat e **exact** `JSON.stringify` al datelor stocate; `JSON.parse(text)` egal cu rândul din IndexedDB; revizia raportată e cea stocată.
- document invalid (inclusiv `schemaVersion` de tip greșit): se exportă brutul.
- **nu modifică nimic:** `documents`, `projects`, `snapshots` (toate rândurile) identice înainte/după, la două exporturi consecutive; blocarea neatinsă.
- document migrabil (registru injectat, v0): exportul îl dă **nemigrat** și **nu** creează copia `pre-migration` (dovedește că nu trece prin `load`).
- funcționează cât proiectul e deschis (doar citire; blocarea sesiunii rămâne a ei).
- `not-found` și bază indisponibilă ⇒ eroare tipată, fără excepții; `repo.loadRaw` întoarce rândul exact / `null`.

`tests/ui/dashboard.test.tsx` (+4)
- card „mai nou” fără „Restaurează”/„Deschide”, cu mesaj, cu „Șterge”, date neatinse.
- „Exportă datele brute” pe „mai nou”: fișierul `din-viitor-backup-raw.json` conține datele stocate exact; notificarea spune „backup brut”, „nu îl poate deschide neapărat”, „Proiectul nu a fost modificat”; IndexedDB identic înainte/după.
- „Exportă datele brute” pe invalid exportă brutul; pe card valid butonul nu există.
- eroare la citire: mesaj „Nu am putut exporta”, niciun fișier descărcat.

Testele existente nu au fost eliminate sau relaxate. Migrările din teste folosesc registrul injectat (ca testul existent), nu `CURRENT_VERSION`.

## 3. Rezultate verificări (Node 22.23.4 din ZIP oficial, doar în PATH-ul sesiunii; pnpm 10.34.9 prin `npx`)

| Verificare | Rezultat |
|---|---|
| Teste țintite (`tests/state`, `tests/persistence`, dashboard) | 146/146 |
| `pnpm test` | **575/575** (35 fișiere; era 547/32 la început) |
| `lint`, `typecheck`, `depcruise`, `license:check`, `build` | OK |
| `prettier --check --end-of-line auto .` | OK |
| `pnpm verify` (script) | **Eșuează la `format:check`, problemă de mediu** (CRLF din `core.autocrlf=true`, ca în Pasul 1); toți ceilalți pași rulați individual trec |
| `pnpm verify:e2e` (după completarea cu exportul brut) | **Prima rulare a scriptului a eșuat în `e2e:base`** (1 test WebKit, „Test timeout … while setting up page”; durata raportată 1,2 h ⇒ mașina a fost suspendată/blocată), iar lanțul s-a oprit înainte de `e2e:storage`. Pașii s-au rulat apoi separat: root **69/69** (rularea scriptului), `e2e:storage` **21/21**, `e2e:base`: a doua rulare 1 eșec WebKit diferit (`catalog.spec.ts:36`, `catalog-item-*` 0 elemente în 5 s), iar rularea a treia **69/69**. |
| Test WebKit izolat | `catalog.spec.ts` + `app.spec.ts` pe WebKit cu basePath, `--repeat-each=3`, 1 worker: **48/48** |

**Interpretare:** cele două eșecuri `e2e:base` au fost în teste diferite, nu se reproduc izolat sau la o rulare ulterioară completă și nu ating codul modificat (primul e „setting up page”, al doilea e un clic pe categorie în catalog); coincid cu instabilitatea WebKit documentată în STAGE3C §9 și în F-15 pct. 3. Nu le-am atribuit lotului, dar nici nu le-am eliminat: `verify:e2e` **nu a trecut dintr-o singură rulare a scriptului** în această sesiune; fiecare componentă are cel puțin o rulare completă verde pe codul final. Nu sunt regresii funcționale cunoscute introduse de lot.

## 4. Fișiere

Modificate: `src/persistence/repository.ts`, `src/persistence/types.ts`, `src/state/manager.ts`, `src/lib/messages.ts`, `src/lib/download.ts`, `src/features/projects/ProjectCard.tsx`, `src/features/projects/Dashboard.tsx`, `src/features/projects/RecoveryDialog.tsx`, `tests/ui/dashboard.test.tsx`, `docs/TECHNICAL_AUDIT.md` (§7.0 din Pasul 1 păstrat; adăugat doar câte o linie „Stare” la F-01 și F-07).
Noi: `tests/state/restore-protection.test.ts`, `tests/persistence/retention.test.ts`, `tests/state/export-raw.test.ts`, `docs/REMEDIATION_BATCH_1.md`.
Neatinse: `package.json`, `pnpm-lock.yaml`, `materials.test.ts`, configurația git, `.gitattributes` (inexistent).

## 5. Limitări rămase

- `pnpm test:coverage` nerulat în acest lot; testul de timp din `materials.test.ts` încă pică sub coverage (neatins, cum s-a cerut).
- Exportul brut e doar din dashboard și doar pentru documentul curent. Datele brute arhivate ca `pre-overwrite` (după un restore peste un document invalid) nu se pot exporta din UI; rămân în IndexedDB. Nu există restaurare din date brute și nici import (F-02).
- Fișierul de backup brut e JSON „as-is” fără plic (fără versiunea aplicației sau data exportului), pentru a păstra exact datele; identificarea se face după numele fișierului.
- Exportul brut nu e testat într-un browser real (descărcarea e simulată în teste prin `downloadTextFile`); `Blob` + `<a download>` e codul existent, folosit și de exportul normal.
- Documentele `schema`-invalid dintr-o versiune mai nouă care nu schimbă `schemaVersion` (F-04) se tratează ca invalide: brutul se arhivează înainte de suprascriere, deci nu se pierde, dar restaurarea rămâne posibilă. Politica de versiuni e F-04, netratat aici.
- Copia `pre-overwrite` a unui document invalid nu poate fi restaurată din UI (nu trece de schemă); datele sunt păstrate în IndexedDB, nu recuperabile prin interfață.
- Cele două ramuri ale `restoreSnapshot` pe document valid (`addSnapshot` apoi `save`) rămân două tranzacții separate; neschimbat, în afara scopului.
- Verificat doar pe Windows; fără dispozitive reale.
