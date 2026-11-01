# Etapa 6a — Buget în interfață (raport)

Stare: implementat; **fără commit** (în așteptarea aprobării). Branch: `feat/etapa-6a-buget` (din `fix/f05-error-recovery`). Decizii: ADR-041 în [DECISIONS](DECISIONS.md).

## 1. Ce s-a livrat

- **Tab „Buget”** în editor, lângă „Plan 2D” și „Vizualizare 3D”, peste aceeași sesiune, cu propria graniță de erori. Fără modificări de schemă, de `CURRENT_VERSION` sau de dependențe.
- **Tabel editabil** (`src/features/budget/BudgetPanel.tsx`): descriere, categorie, camere, inclusă în total, cantitate, UM, preț unitar, TVA %, total brut, notă. Insigne „Preț demonstrativ” (preț din catalog, needitat), „Modificat”, „Manuală”, „Exclusă din total”. „Revino” readuce valorile calculate; o valoare egală cu cea calculată șterge suprascrierea.
- **Linii manuale** (adăugare, editare, ștergere cu confirmare): categorie, unitate, cantitate, preț, TVA, cameră, notă. Cantitatea poate fi **legată de aria podelei sau a pereților** unei camere (calculată din model, needitabilă, se actualizează cu planul).
- **Totaluri:** pe categorii, pe camere, subtotal, rezervă, total (net, TVA, brut).
- **Setări:** moneda, modul prețurilor (cu / fără TVA), TVA implicit, rezerva.
- **Urmă de calcul** („De unde vine cifra?”): pașii fiecărei linii, din aceleași funcții care calculează valoarea.
- **Export CSV:** BOM, separator `;` / `,` / tab (virgulă sau punct zecimal), CRLF, protecție formule, coloana „Sursă preț”, rânduri de subtotal / rezervă / total și avertisment. Fișier: `<proiect>-buget.csv`.
- **Domeniu** (`src/domain/budget/`): `ops.ts` (operații pure: `addManualLine`, `updateManualLine`, `removeManualLine`, `setBudgetSettings`), `csv.ts` (`budgetToCsv`), `labels.ts` (etichete în română).
- Toate modificările trec prin `session.apply`: un pas de undo, autosave, interfață dezactivată în doar-citire / conflict.

## 2. Teste

- **Domeniu** (`tests/domain/budget-ops.test.ts`, 20 de teste): validări și mesaje pentru liniile manuale (fără efect la respingere, documentul primit neatins), setări, **proprietate (150 de rulări) „Σ liniilor incluse = subtotal; pe categorii = pe camere = subtotal; total = subtotal + rezervă; alocarea pe camere a fiecărei linii = totalul liniei”** pentru orice combinație de suprascrieri, linii manuale, mod TVA și rezervă; CSV: BOM, antet, CRLF, format numeric calculat manual (2,5 × 1234,50, TVA 19%), totaluri = sumar, protecție formule (`=HYPERLINK`, `+`, `-`, `@`, tab, CR), ghilimele / separator / rând nou, marcarea prețurilor demonstrative, linie exclusă.
- **Interfață** (`tests/ui/budget.test.tsx`, 23 de teste, jsdom): afișare = domeniu; marcaje; editare de preț / cantitate / TVA cu așteptări calculate manual; valori invalide; „Revino”, excludere, undo; notă; linii manuale (adăugare, validare, editare, ștergere, cantitate legată = 11,31 m²); setări (moneda, mod TVA 2.200 → 2.662 RON, rezervă); **urma: „Total brut linie” = totalul afișat pentru fiecare linie**; export CSV (BOM, nume, separator, identic cu `budgetToCsv`, notă cu formulă); doar-citire; plan invalid; proiect gol.
- **E2E** (`e2e/budget.spec.ts`, 2 teste × 3 browsere): două canapele → buget; marcaj demonstrativ; editare de preț (1.999,99); linie manuală legată de aria camerei (12 m² × 50 = 600,00); persistență după reîncărcare; export CSV citit din fișierul descărcat: **numărul de linii „Preț demonstrativ” din fișier = numărul de insigne din tabel**, totalul din fișier = totalul din tabel; setări + undo + excludere.

## 3. Rezultate (Node 22.23.4, pnpm 10.34.9)

| Verificare | Rezultat |
|---|---|
| `pnpm test` | **632/632** (39 fișiere; era 589) |
| lint, typecheck, depcruise (114 module, 0 încălcări), `license:check`, build | OK |
| Prettier cu `--end-of-line auto` | OK (`pnpm verify` ca script pică doar la `format:check` din cauza CRLF local, ca în loturile anterioare) |
| `e2e` root, 3 browsere, `--workers=1` | **93/93** |
| `e2e:base` (`basePath=/rc-test`), `--workers=1` | **93/93** |
| `e2e:storage` | **21/21** |

## 4. Descoperiri

- **Moneda nu se poate schimba într-un proiect cu obiecte din catalog** (prețuri în RON): integritatea cere aceeași monedă (`currency-mismatch`), iar prețurile nu se convertesc. Schimbarea moneda ar fi falsificat sumele. Operația refuză cu explicație; în proiecte fără astfel de obiecte merge și e reversibilă. Criteriul „schimbarea monedei e reversibilă” din ROADMAP e deci îndeplinit doar în acel caz; conversia valutară nu s-a făcut.
- Proiectul de referință conținea deja o linie manuală (`mLabor`), ceea ce a corectat două ipoteze din testele mele (nu din cod).

## 5. Limite și amânat

- **XLSX (6b)** neimplementat: cere o bibliotecă nouă; nu s-a adăugat nicio dependență.
- Fișierul CSV a fost verificat prin parsare automată; **nu s-a deschis în Excel (RO) sau LibreOffice**.
- Linia manuală legată de o *atribuire* de finisaj nu se poate crea din formular (se păstrează dacă există).
- Manopera nu se generează automat din arii; se adaugă manual, cu legare de arie.
- Tabelul nu se poate ordona, filtra sau pagina; pe ecrane înguste are derulare orizontală.
- Fără validare pe cititoare de ecran; câmpurile au etichete ARIA, dar neverificate cu un cititor real.
- Rezerva se aplică la subtotal (net și TVA, fiecare rotunjit), conform domeniului existent.

## 6. Fișiere

**Noi:** `src/domain/budget/{ops,csv,labels}.ts`, `src/features/budget/{BudgetPanel,InlineFields,ManualLineDialog,TraceDialog}.tsx`, `tests/domain/budget-ops.test.ts`, `tests/ui/budget.test.tsx`, `e2e/budget.spec.ts`, `docs/STAGE6A_REPORT.md`.
**Modificate:** `src/domain/budget/index.ts` (exporturi), `src/domain/index.ts` (export `csv` separat, fără ciclu), `src/app/editor/EditorClient.tsx` (tab-ul), `src/lib/download.ts` (`budgetFileName`), `docs/DECISIONS.md` (ADR-041), `docs/ROADMAP.md` (note la Etapele 4 și 6).
**Neatinse:** `package.json`, `pnpm-lock.yaml`, `tests/materials/materials.test.ts`, configurația git, schema documentului.
