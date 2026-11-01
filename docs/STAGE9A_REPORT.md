# Etapa 9a — Camere în formă de L (raport)

Stare: implementat și comis. Branch: `feat/etapa-6a-buget`. Decizii: ADR-049 în [DECISIONS](DECISIONS.md). Aplicația rămâne doar pentru desktop.

## 1. Ce s-a livrat

- **Camere în L din paletă** („Living în L”, „Cameră în L”): se trag pe plan ca restul camerelor, cu fantomă poligonală (banda pereților + interiorul, verde / roșu), lipire la grilă și la pereții existenți (pereți comuni) și un singur pas de undo. **R** rotește L-ul în 4 orientări.
- **Pereți comuni și validare pe formă:** un L împarte pereți cu vecinii, iar o cameră mai mică încape în „crestătura” lui și poate împărți ambii pereți ai crestăturii. Suprapunerile se refuză pe poligon (nu pe caseta camerei).
- **Mânere pe laturi pentru orice cameră rectilinie:** o cameră în L selectată are câte un mâner pe fiecare latură (6); tragerea unuia mută latura pe normala ei, cu snap la grilă, previzualizare cu cote live, un commit, undo. Latura crestăturii (colțul reflex) se mută la fel. Sub 600 mm pe o latură operația e refuzată. Mânerele sunt la 30% din latură ca să nu acopere cotele (și la dreptunghi).
- **Rotire și mutare** ale camerelor în L: ca la dreptunghi.
- **Domeniu:** `addPolyRoomShared`, `axesFromInteriorPolygon`, `roomEdges`, `moveRoomEdge`; `snapRoomAnchor` acceptă o formă.

## 2. Teste

- **Domeniu** (`tests/domain/l-rooms.test.ts`, 16): axe din poligon (dreptunghi identic cu cel existent, colț reflex, sens invers, refuzuri), L singur (6 noduri / 6 pereți, arie), cameră în crestătură cu doi pereți comuni, cameră în crestătură fără contact, refuzul suprapunerii și al camerei care o cuprinde, L lângă dreptunghi, laturi (normale, mutare cu aria așteptată, latura reflex, refuzuri, latură comună cu vecinul), rotire / mutare, lipire cu formă.
- **Interfață** (`tests/ui/room-dnd.test.tsx`, +4): L din paletă (fantomă cu 6 colțuri, arie, 6 noduri, undo), R în 4 orientări distincte, 6 mânere și tragerea unuia (fără scriere în timpul gestului, un `apply`, undo), L lângă alt L și refuzul peste el.
- **E2E** (`e2e/room-dnd.spec.ts`, +1 × 3 browsere): mouse real, L din paletă, R, 6 mânere, mutarea unui mâner, un pas de istoric, undo.

## 3. Rezultate (Node 22.10.0, vezi nota de mediu din STAGE6B_REPORT)

| Verificare | Rezultat |
|---|---|
| `vitest run` | **713/713** (47 fișiere; era 693) |
| prettier, lint (0 avertismente), typecheck, depcruise (123 module), `next build` | OK |
| `playwright test` (toată suita, `--workers=1`, 3 browsere) | **114/114** (era 111) |

**Neexecutat:** `e2e:base` (basePath), `e2e:storage`.

## 4. Limite

- Doar două presetări în L; T, U sau forme libere nu au preset (se pot compune din L-uri și dreptunghiuri vecine).
- Dimensiunile numerice ale unei camere în L nu se editează în panou (doar prin mânere); panoul arată aria.
- Mutarea unei laturi nu mută obiectele din cameră.
- Mutarea unei laturi comune cu un vecin deformează vecinul (nodurile comune se mută).

## 5. Fișiere

**Noi:** `src/domain/edit/roomEdges.ts`, `tests/domain/l-rooms.test.ts`, `docs/STAGE9A_REPORT.md`.
**Modificate:** `src/domain/edit/{shared,index}.ts`, `src/features/plan-editor/{PlanEditor,PlanCanvas,types,roomPresets}.ts(x)`, `tests/ui/room-dnd.test.tsx`, `e2e/room-dnd.spec.ts`, `docs/DECISIONS.md`, `docs/ROADMAP.md`.
