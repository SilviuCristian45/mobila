# RoomCraft (nume provizoriu)

Aplicație web de amenajări interioare (planuri 2D, 3D, finisaje, buget), fără backend. **Starea: Etapa 2a — dashboard de proiecte și carcasa editorului (fără editor 2D/3D).** Etapa 1c — domeniu (`src/domain/`) + stare și persistență locală (`src/state/`, `src/persistence/`).** Există logică testată (model, geometrie, buget, scenă ca date, export/import, sesiune cu autosave/undo, Dexie, blocare între taburi); nu există încă interfață, editor, catalog final sau integrare 2D/3D; vezi `docs/ROADMAP.md`.

## Cerințe

- Node.js **≥ 22.12** (fixat la `22.23.4` în `.nvmrc`); `engine-strict` este activ.
- **pnpm** `10.34.9` (câmpul `packageManager`; `corepack enable` îl activează).

## Comenzi

| Comandă                             | Ce face                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`    | instalează exact versiunile din `pnpm-lock.yaml`                                                                    |
| `pnpm dev`                          | server de dezvoltare                                                                                                |
| `pnpm build`                        | export static în `out/`                                                                                             |
| `pnpm build:base`                   | export static cu `basePath=/rc-test` în `out-base/`                                                                 |
| `pnpm format:check` / `pnpm format` | Prettier                                                                                                            |
| `pnpm lint`                         | ESLint (config Next + TypeScript)                                                                                   |
| `pnpm typecheck`                    | `tsc --noEmit` (strict + `noUncheckedIndexedAccess`)                                                                |
| `pnpm depcruise`                    | poartă de arhitectură: regulile de straturi din `docs/ARCHITECTURE.md` §3                                           |
| `pnpm license:check`                | poartă de licențe: `license-policy.json`; eșuează la orice licență nepermisă/necunoscută                            |
| `pnpm test` / `pnpm test:coverage`  | teste unitare (inclusiv porțile care trebuie să eșueze la încălcări) / cu acoperire                                 |
| `pnpm e2e` / `pnpm e2e:base`        | Playwright (Chromium, Firefox, WebKit) pe `out/` / `out-base/`, servite fără rescrieri SPA                          |
| `pnpm e2e:storage`                  | construiește harness-ul și rulează testele de persistență în Chromium/Firefox/WebKit (IndexedDB și Web Locks reale) |
| `pnpm verify`                       | format + lint + tipuri + depcruise + licențe + teste + build                                                        |
| `pnpm verify:e2e`                   | build + E2E la rădăcină și cu `basePath`                                                                            |

La prima rulare E2E: `pnpm exec playwright install chromium firefox webkit`.

## Versiuni

Combinația React 19.3.1 + react-konva 19.3.2 + konva 10.9.0 + three 0.186.1 + @react-three/fiber 9.8.2 + @react-three/drei 10.7.9 este cea validată în Etapa 0 (`docs/STAGE0_REPORT.md`). Toate versiunile sunt **exacte** (fără `^`/`~`, `save-exact=true`); nu se fac actualizări automate. @react-three/fiber 9.8.2 cere `react >=19 <19.4`, react-konva 19.3.2 cere `react ^19.3.0` → rămânem pe React 19.3.x până la validarea unei alte combinații.

## Structură

- `src/domain` — nucleul pur (zod + TypeScript, fără React/DOM/platformă): `schema`, `geometry`, `money`, `quantities`, `budget`, `scene`, `integrity`, `cascade`, `io`.
- `src/persistence` — Dexie/IndexedDB, blocări Web Locks, erori de stocare; `src/state` — sesiune de proiect (undo/redo, autosave), gestionar de proiecte, selectori memoizați (independente de React).
- `src/lib/project-runtime` — adaptorul pentru browser (ProjectProvider, hook-uri React) peste `state/`; `src/features/projects` (dashboard) și `src/features/editor-shell` (ruta editorului); `src/features/plan-editor` (plan 2D, SVG) și `src/catalog` (catalogul încorporat de obiecte: date, rețete parametrice, previzualizări — pur) cu `src/features/catalog` (browser + proprietăți); `src/materials` (catalogul de materiale și texturile procedurale — pur) cu `src/features/materials` (panou); `src/features/viewer-3d` (vizualizare 3D, doar citire, R3F încărcat doar pe client); `src/ui` — componente generice.
- `src/app` — rute (doar compoziție); `src/features` — module de funcționalități; `src/lib` — utilitare (`asset()` pentru `basePath`).
- `spikes/stage0` — prototipurile Etapei 0 (păstrate; NU fac parte din aplicație, sunt excluse din lint/tipuri/teste/depcruise).
- `docs/` — specificații, arhitectură, model de date, decizii, rapoarte.
- `tests/fixtures/gates` — fixture-uri care încalcă intenționat regulile, folosite de testele porților.
