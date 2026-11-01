# Etapa 7a — UX: camere prin drag & drop, layout fără derulare (raport)

Stare: implementat; **fără commit** (în așteptarea aprobării). Branch: `feat/etapa-6a-buget`. Decizii: ADR-044 în [DECISIONS](DECISIONS.md). Pornește de la două probleme: instrumentele cereau derulare prea mare, iar adăugarea unei camere cerea coordonate ghicite.

## 1. Ce s-a livrat

- **Paletă de camere** deasupra planului (Living, Dormitor, Bucătărie, Baie, Hol, Birou, Cameră liberă). **Trage** pe plan: fantoma urmărește cursorul (verde = încape, roșu = nu încape, cu nume și dimensiuni), la eliberare se creează camera cu tipul și numele ei. Alternativ: apasă o cameră, apoi apasă pe plan (Esc anulează). Cu tastatura, Enter o plasează într-un loc liber. Un pas de undo.
- **Lipire inteligentă:** grila + alipire/aliniere la fețele exterioare ale camerelor existente (fără suprapunere de pereți); fantoma roșie arată exact ce ar respinge validarea.
- **Mutarea unei camere întregi** (selectată, apoi trasă): nodurile ei și obiectele din interior; previzualizare fără scriere, un singur commit, undo. Camerele cu pereți comuni nu se mută întregi (mesaj).
- **Layout:** pe laptop planul / vizualizarea 3D și panoul lateral au înălțimea ecranului și rămân vizibile; catalogul, materialele și proprietățile se derulează în panoul lateral, nu pagina. Banner-ul de selecție multiplă și textul-ajutor nu mai schimbă dimensiunea planului (anterior ar fi făcut planul să „sară”).

## 2. Teste

- **Domeniu** (`tests/domain/room-placement.test.ts`, 8): lipire la grilă / la fața exterioară / aliniere, refuzul feței interioare, rezultat valid geometric; `moveRoom` (arie neschimbată, obiecte din interior mutate și din afară nu, deplasări invalide, noduri comune refuzate).
- **Interfață** (`tests/ui/room-dnd.test.tsx`, 6): tragere din paletă (fantomă, nimic scris în timpul gestului, nume / tip / arie, un pas de undo), anulare în afara planului, loc ocupat (roșu + mesaj), mod armat + Esc + numerotare, lipire, plasare cu Enter, mutarea unei camere.
- **E2E** (`e2e/room-dnd.spec.ts`, 2 × 3 browsere): mouse real, Living + Bucătărie alipite, plan valid, mutare cu undo, planul și paleta în ecran la 1280 × 720, anulare. Verificat și cu 5 repetări.

## 3. Rezultate (Node 22.10.0, vezi nota de mediu din STAGE6B_REPORT)

| Verificare | Rezultat |
|---|---|
| `vitest run` | **664/664** (44 fișiere; era 650) |
| prettier, lint (0 avertismente), typecheck, depcruise (119 module), `next build` | OK |
| `playwright test` (toată suita, `--workers=1`, 3 browsere) | **102/102** (era 96) |

**Neexecutat:** `e2e:base` (basePath), `e2e:storage`.

## 4. Descoperiri

- **Defect prins de o captură de ecran:** prima versiune a lipirii se alipea de fața INTERIOARĂ a peretelui vecin și suprapunea peretele; corectat (candidații care ar suprapune un perete sunt refuzați) și acoperit de test.
- **Planul se re-potrivește la orice schimbare de dimensiune** (comportament existent). Odată ce caseta planului a devenit flexibilă în înălțime, banner-ul „N obiecte selectate” o micșora și vederea „sărea” (a prins testul E2E de multi-selecție în WebKit). Rezolvat prin suprapunere / înălțime fixă; regula rămâne valabilă: nimic nu trebuie să schimbe înălțimea casetei planului.
- Un test UI mai vechi (`plan-editor`, „săgețile fără selecție”) a picat o dată sub încărcare și trece izolat și la reluare (instabilitate de timp, nelegată de aceste modificări).
- În WebKit, apăsarea exact pe eticheta din centrul camerei a nimerit uneori fundalul; testul E2E apasă în afara etichetei. Eticheta are `pointer-events: none`, deci cauza nu e clară în aplicație; neconfirmat pe Safari real.

## 5. Limite și amânat

- Camerele din paletă sunt dreptunghiulare; fără rotire la plasare, fără camere poligonale.
- Lipirea nu partajează pereți (doi pereți vecini rămân alăturați).
- Netestat pe tactil: fără hover, fantoma apare doar în timpul tragerii sau după atingerea paletei; neverificat pe dispozitiv real.
- Sub 1024 px panoul lateral rămâne sub plan (derulare pe pagină), ca înainte.
- Panoul „Adaugă” numeric din dreapta rămâne pentru camere cu dimensiuni exacte.

## 6. Fișiere

**Noi:** `src/features/plan-editor/{RoomPalette.tsx,roomPresets.ts}`, `tests/domain/room-placement.test.ts`, `tests/ui/room-dnd.test.tsx`, `e2e/room-dnd.spec.ts`, `docs/STAGE7A_REPORT.md`.
**Modificate:** `src/domain/edit/index.ts` (`moveRoom`, `snapRoomAnchor`), `src/features/plan-editor/{PlanEditor,PlanCanvas,types}.ts(x)`, `src/features/viewer-3d/Viewer3D.tsx`, `docs/DECISIONS.md`, `docs/ROADMAP.md`.
