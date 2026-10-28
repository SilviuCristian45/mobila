# RoomCraft — Modelul de date

> Stare: **Revizia 2** (decizii D1–D11 integrate; vezi [DECISIONS](DECISIONS.md)). Tipurile sunt ilustrative (TypeScript); implementarea reală le va deriva din scheme **zod** (`z.infer`) pentru a avea o singură definiție pentru tip, validare și migrare. Contextul arhitectural: [ARCHITECTURE](ARCHITECTURE.md).

## 1. Convenții

| Convenție | Regulă |
|---|---|
| ID-uri | `string`, UUID v4 (`crypto.randomUUID()`), unice în proiect |
| Lungimi | `Mm` = număr **întreg** de milimetri |
| Bani | `Minor` = număr **întreg** de unități minore (bani pentru RON) |
| Procente | `Bp` = puncte-bază întregi (21% = `2100`) |
| Unghiuri | grade, `[0, 360)`, sens orar pe ecran (Y în jos) |
| Date | șiruri ISO 8601 UTC |
| Tabele | entitățile sunt în `Record<Id, T>` (acces O(1), referințe prin ID, fără obiecte imbricate duplicate) |
| Derivate | **nu** se stochează: arii, poligoane interioare, cantități, totaluri, scena 3D |
| Text utilizator | nume/note: max lungime impusă de schemă, randate doar ca text |

```ts
type Id = string;
type Mm = number;      // întreg
type Minor = number;   // întreg
type Bp = number;      // întreg
interface Point { x: Mm; y: Mm }
```

## 2. Documentul de proiect

```ts
interface ProjectDocument {
  schemaVersion: 1;                 // = formatVersion din export
  id: Id;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;

  levels: Record<Id, Level>;        // MVP: exact unul
  nodes: Record<Id, PlanNode>;
  walls: Record<Id, Wall>;
  openings: Record<Id, Opening>;
  rooms: Record<Id, Room>;
  objects: Record<Id, PlacedObject>;
  finishAssignments: Record<Id, FinishAssignment>;

  catalogSnapshot: {                // itemi folosiți, copiați la momentul utilizării
    items: Record<string, CatalogItem>;     // cheie = catalogItemId
    finishes: Record<string, Finish>;       // cheie = finishId
  };

  budget: BudgetState;
}

interface ProjectSettings {
  currency: 'RON' | 'EUR' | string;         // ISO 4217; una per proiect
  pricesIncludeVat: boolean;
  defaultVatBp: Bp;                         // valoare de pornire pentru linii noi
  contingencyBp: Bp;                        // rezervă pe total
  defaultWallHeightMm: Mm;                  // 2600
  defaultWallThicknessMm: Mm;               // 100
  gridMm: Mm;                               // 100 (snap implicit)
  openingEdgeMarginMm: Mm;                  // 50 – distanța minimă a golului față de îmbinări (A.5)
  openingGapMm: Mm;                         // 50 – distanța minimă între goluri
  displayUnit: 'mm' | 'cm' | 'm';           // doar formatare
}

interface Level {
  id: Id;
  name: string;                             // „Parter”
  elevationMm: Mm;                          // 0 în MVP
  ceilingHeightMm: Mm;                      // înălțime liberă implicită
}
```

### 2.1 Pregătirea pentru mai multe niveluri (fără a le implementa)
- Schema permite oricâte `Level`; **validatorul de produs** (nu schema) cere exact unul în MVP.
- Toate entitățile spațiale au deja `levelId`; `Level.elevationMm` este definit.
- La extindere ar urma: UI pentru niveluri, filtrare pe nivel în 2D/3D, scări (entitate nouă), goluri verticale în podea. **Documentele MVP rămân valide fără migrare**, deoarece nu se schimbă forma datelor existente.
- Nu se adaugă acum entități sau câmpuri „de rezervă” fără utilizare (în afară de `levelId`).

**Decizie:** tabele „plate” la nivel de proiect, cu `levelId` pe entitățile spațiale, în loc de entități imbricate în `Level`. Motiv: referințe simple, migrări mai ușoare, bugetul traversează tabele fără a depinde de nivel; multi-nivel devine doar UI + filtru. (Alternativa imbricată e în [DECISIONS](DECISIONS.md), ADR-006.)

## 3. Geometrie

```ts
interface PlanNode {
  id: Id;
  levelId: Id;
  x: Mm;
  y: Mm;
}

interface Wall {
  id: Id;
  levelId: Id;
  startNodeId: Id;
  endNodeId: Id;                    // startNodeId ≠ endNodeId
  thicknessMm: Mm;                  // > 0 și PAR (axele din dimensiuni interioare rămân în mm întregi; A.1)
  heightMm: Mm;                     // > 0
  baseOffsetMm: Mm;                 // 0 în MVP (față de elevația nivelului)
  // Axa peretelui este segmentul start→end (linie de referință = axa).
  // Fața „left”/„right” se definește relativ la direcția start→end,
  // în sistemul Y-în-jos: „left” = fața din stânga unui privitor care merge de la start la end.
}

interface Opening {
  id: Id;
  wallId: Id;
  type: 'door' | 'window';
  offsetMm: Mm;                     // distanța de la nodul de start la CENTRUL golului, pe axă
  widthMm: Mm;
  heightMm: Mm;
  sillHeightMm: Mm;                 // 0 pentru uși
  swing?: { hinge: 'start' | 'end'; side: 'left' | 'right' };   // doar uși
  catalogItemId?: string;           // aspect/preț, opțional
}

type RoomType =
  | 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'hall'
  | 'office' | 'storage' | 'other';

interface Room {
  id: Id;
  levelId: Id;
  name: string;
  type: RoomType;
  nodeLoop: Id[];                   // ≥ 3 noduri, ordonate, bucla închisă implicit (ultimul→primul)
  ceilingHeightMm?: Mm;             // suprascrie nivelul; dacă lipsește, se folosește Level
  // Pentru fiecare pereche consecutivă (nodeLoop[i], nodeLoop[i+1]) TREBUIE să existe un perete.
}
```

### 3.1 Invarianți geometrici (verificați de `domain/integrity`)
1. Orice `Wall.startNodeId`/`endNodeId` există și sunt diferite; lungimea axei > 0.
2. Nu există doi pereți cu aceeași pereche de noduri (neordonată).
3. `Opening.wallId` există; golul respectă regulile A.5 (în porțiunea dreaptă a ambelor fețe, cu marjă); goluri neîntrepătrunse pe același perete; `sill + height ≤ wall.heightMm`.
4. `Room.nodeLoop`: noduri existente, fără repetiții, poligon **simplu** (fără autointersecție), perete existent pentru fiecare muchie.
5. Poligonul interior al camerei este nevid (grosimile nu consumă camera).
6. Un nod orfan (fără pereți) este permis temporar în editor, dar eliminat la comitere.

### 3.2 Pereți comuni între camere
Pereții sunt **la nivelul graficului**, nu ai camerelor. Doi vecini folosesc același `Wall` (și aceleași noduri); fiecare cameră își vede propria față (stânga/dreapta decisă de poziția sa față de direcția peretelui). La desenarea unei camere noi, nodurile/pereții existenți sunt reutilizați prin snap.

## 3.A Convenții geometrice (normative)

Această secțiune definește fără ambiguitate cum se tratează grosimea pereților, colțurile, ușile și ferestrele. Implementarea (`domain/geometry`) și testele o urmează literal.

### A.1 Linia de referință și grosimea
- Un perete este definit de **axa** sa (segmentul `start → end`) și de `thicknessMm`. Amprenta lui este dreptunghiul obținut prin translarea axei cu `±thickness/2` perpendicular pe ea. Grosimea este **simetrică** față de axă.
- Fața „stânga” = fața aflată la stânga unui privitor care merge de la `start` la `end` (convenție Y în jos: stânga se obține rotind direcția cu −90° pe ecran). Fața „dreapta” este cealaltă.
- Pereții cu grosimi diferite se pot îmbina; fiecare își păstrează grosimea.
- **Grosimea este un număr PAR de mm** (validat de schemă). Motiv, demonstrat în Etapa 0: la o grosime impară (ex. 75), axele calculate din dimensiuni interioare cad la jumătăți de mm și încalcă regula „mm întregi”. Presetări: 80 / 100 / 150 / 250 / 300.

### A.2 Camera și suprafața utilă
- `Room.nodeLoop` se parcurge pe axe. Poligonul **interior** al camerei este delimitat de fețele interioare ale pereților buclei. Se obține decalând fiecare muchie a buclei spre interior cu `thickness_i / 2` și intersectând muchiile decalate consecutive (în nodurile cu miter, vezi A.3).
- **Aria utilă, cotele afișate și toate calculele de finisaje folosesc poligonul interior**, nu axele.
- Orientarea buclei nu contează la stocare; `domain` o normalizează. Ce față a unui perete privește camera se determină prin test punct-în-poligon, nu se stochează.
- Muchie în care doi pereți colineari cu grosimi diferite se succed (după un nod de tip T) → fața interioară are o **treaptă** perpendiculară pe axă exact în nod.

### A.3 Colțuri și îmbinări
- În fiecare nod se sortează pereții incidenți după unghi. Fețele adiacente (stânga unuia cu dreapta următorului) se intersectează → **miter**; punctul de intersecție devine vârf al amprentelor ambilor pereți.
- **Limită de miter:** dacă distanța de la nod la vârful miterului depășește `2 × t_max` (= `4 × t/2`; corespunde unui unghi între pereți sub ≈ 29°) **pe partea reflexă** a îmbinării (spațiul dintre pereți > 180°), îmbinarea devine **teșire (bevel)**: fiecare perete își păstrează capătul drept, perpendicular pe axă, în nod, fără prelungire. Pe partea îngustă (pana dintre pereți) punctul de intersecție este interior și rămâne neschimbat. *(Verificat în Etapa 0: bevel la 20° și 28°, miter la 31° și 60°.)*
- Nod cu 2 pereți colineari (180°): fără îmbinare, continuitate dreaptă.
- Nod cu un singur perete (capăt liber): capăt drept, perpendicular pe axă.
- Nod cu ≥ 3 pereți (T, X, stea): miter între fiecare pereche adiacentă; peretele „traversat” trebuie **împărțit** de nod (nu există T „peste” un perete fără nod).
- **Lungimea feței** = distanța, măsurată de-a lungul axei, între punctele de îmbinare ale acelei fețe; diferă de lungimea axei și între cele două fețe. Cotele afișate și cantitățile folosesc lungimea feței.
- **Pereți suprapuși** (colineari, intersectare parțială) sunt invalizi; editorul îi împarte sau refuză operația.

### A.4 Introducerea dimensiunilor interioare
Intrarea este o **comoditate de UI**; în document rămân doar nodurile (axele).
- **Cameră dreptunghiulară nouă:** utilizatorul dă `W × D` interior și grosimea fiecărui perete (implicit una). Axele rezultate au lățimea `W + tW/2 + tE/2` și adâncimea `D + tN/2 + tS/2` (întregi, deoarece grosimile sunt pare; A.1). Ancora (colțul fix) este aleasă de utilizator; implicit colțul stânga-sus al feței interioare.
- **Editarea ulterioară a unei dimensiuni interioare** (cameră dreptunghiulară ortogonală): se alege latura care se mută; nodurile ei se translatează astfel încât distanța între fețele interioare opuse să devină valoarea dorită. Latura opusă rămâne fixă.
- **Poligoane generale:** cotele fețelor interioare sunt afișate (doar citire); se editează lungimea axei sau coordonatele nodurilor. Introducerea de dimensiuni interioare pentru forme arbitrare este în afara MVP.
- Dacă modificarea ar face un poligon invalid (autointersecție, interior vid), operația este refuzată cu mesaj.

### A.5 Uși și ferestre (goluri)
- Un gol este definit prin **centrul** pe axă (`offsetMm` de la nodul `start`), `widthMm`, `heightMm`, `sillHeightMm`. Taie **întreaga grosime** a peretelui și apare pe ambele fețe.
- Intervalul gol `[offset − w/2, offset + w/2]` trebuie să fie în porțiunea dreaptă a **ambelor** fețe: între maximul punctelor de îmbinare de la `start` și minimul celor de la `end`, plus o margine minimă (`openingEdgeMarginMm`, implicit 50 mm).
- Goluri pe același perete: distanță liberă minimă între ele 50 mm (configurabilă); fără suprapunere.
- `sillHeightMm + heightMm ≤ wall.heightMm` (nicio buiandrugă minimă impusă în MVP). Uși: `sillHeightMm = 0`.
- Mutarea sau scurtarea unui perete care ar scoate un gol din intervalul valid: golul este **repoziționat la limită** sau operația este refuzată (regulă aleasă la implementare și testată; nu se șterge tăcut).
- **Calcul de suprafețe:** aria unui gol se scade de pe **fiecare** față, în limitele benzii de finisaj (A.6). Glaful/șpaletul (suprafața laterală a golului) și pragul ușii **nu** se calculează în MVP.
- Sensul de deschidere al ușilor este informativ (desen 2D, arc); nu afectează calculele.

### A.6 Înălțimi
- `Wall.heightMm` este uniformă pe perete; camera folosește `ceilingHeightMm` (cameră sau nivel), uniformă. Nu există înălțimi variabile (fără mansarde).
- Banda de finisaj pe o față: `[fromHeightMm, fromHeightMm + coveredHeightMm]` (implicit întreg peretele). Aria benzii = lungimea feței × înălțimea benzii − Σ intersecțiile golurilor cu banda.

### A.7 Toleranțe
- Datele stocate sunt întregi (mm). Punctele derivate (intersecții de miter, poligon interior) **nu se stochează** și se calculează în virgulă mobilă; la afișare se rotunjesc, iar pentru hash-ul scenei se rotunjesc la 0,001 mm.
- Toleranță măsurată în Etapa 0 (test pe proprietăți, 300 de cazuri, W,D ≤ 9 m, grosimi pare 60–300 mm): aria interioară coincide cu `W × D` cu eroare < 5·10⁻⁵ mm². Pragul de acceptare în teste: 10⁻³ mm².

## 3.B Limite geometrice ale MVP (implementate și testate în Etapa 1b)

Datele care depășesc aceste limite sunt **respinse** de `analyzeGeometry` / `checkIntegrity` cu cod explicit (`GeometryIssueCode`); calculele din aval (`computeBudget`, `buildScene`) aruncă `InvalidDocumentError` în loc să producă rezultate false.

| Limită | Valoare / comportament | Cod |
|---|---|---|
| Unghi minim între doi pereți la același nod | 10° (sub el: respins). Între 10° și ≈ 29° se aplică bevel doar pe partea reflexă | `wall-angle-too-sharp` |
| Pereți care se încrucișează fără nod comun | respins | `wall-crossing` |
| Nod așezat pe un perete fără să-l împartă (T fără nod); pereți colineari suprapuși | respins | `node-on-wall` |
| Doi pereți între aceleași noduri; perete de lungime 0; noduri în același punct | respins | `wall-duplicate`, `wall-degenerate`, `nodes-coincide` |
| Perete prea scurt pentru grosimile îmbinărilor (față de lungime ≤ 0) | respins | `wall-too-short-for-joins` |
| Număr de pereți pentru validare geometrică | ≤ 3000 (validarea pe perechi este O(n²)) | `too-many-walls` |
| Intrări per tabel / noduri per cameră / nume | ≤ 10 000 / ≤ 500 / ≤ 200 caractere | schemă |
| Cameră: buclă cu noduri repetate, 180° (întoarcere), arie zero, perete lipsă pe o muchie, perete folosit de două ori | respinsă | `room-loop-invalid`, `room-wall-missing`, `room-wall-reused` |
| Cameră cu axele autointersectate sau cu interior autointersectat | respinsă | `room-not-simple` |
| Cameră „consumată” de grosimi (latură interioară ≤ 0, orientare inversată) | respinsă | `room-collapsed` |
| Goluri: în afara porțiunii drepte comune (cu marjă), suprapuse, mai înalte decât peretele | respinse | `opening-out-of-range`, `opening-overlap`, `opening-too-tall` |
| Niveluri | exact unul | `level-count` |
| Grosime de perete | întreg **par** pozitiv | schemă |
| Valori ne-întregi în mm, ID-uri cu caractere nepermise sau rezervate (`__proto__`, `constructor`, `prototype`), structură JSON > 40 de niveluri | respinse | schemă / `findUnsafeStructure` |

**Limitări rămase (documentate, nu rezolvate în MVP):**
- **Camere cu goluri/insule**: o cameră în interiorul altei camere nu scade din aria celei exterioare (nu există „găuri” în poligon). Un obiect aparține primei camere (în ordinea ID-urilor) al cărei interior îi conține centrul.
- **Mai multe camere pe același perimetru** (suprapuse) nu sunt detectate dacă nu produc încrucișări de pereți.
- **Editarea dimensiunilor interioare** (`resizeRectInterior`) funcționează doar pentru dreptunghiuri aliniate cu axele, cu 4 noduri; la alte forme se editează nodurile direct.
- Nodurile partajate: redimensionarea unei camere mută nodurile comune cu vecinii; apelantul revalidează întotdeauna (`analyzeGeometry`).
- **Șpaletul și pragul** golurilor nu intră în arii; **înălțimea camerei** (`ceilingHeightMm`) este stocată dar neutilizată în calcule (nu există tavan încă).
- Obiectele nu se verifică pentru coliziuni și pot sta în afara oricărei camere (linie în „fără cameră”).
- Punctele derivate (îmbinări, poligon interior) sunt în virgulă mobilă; aria interioară este exactă până la ~10⁻³ mm² în testele de proprietăți. Nodurile și toate valorile stocate sunt întregi.
- Un finisaj de pereți se aplică pe o **față** a unui perete; fețele aparțin camerei care le înconjoară; pentru o față fără cameră costul intră în „fără cameră”.

### 3.B.1 Operații de editare (Etapa 2b, `src/domain/edit`)

Toate întorc un document nou sau o eroare în română și sunt validate apoi integral de `ProjectSession`. Reguli pe care le impun (peste cele din 3.B):
- **`addWall`**: capetele sunt noduri existente sau puncte (un punct deja ocupat de un nod îl reutilizează); grosime pară, înălțime și coordonate întregi; refuză perete de lungime zero sau dublură între aceleași noduri.
- **`removeWall`**: șterge golurile peretelui și atribuirile de finisaj ale fețelor lui; dacă peretele face parte din camere, cere `removeRooms: true` (camera și finisajele ei dispar); refuză dacă obiecte sunt atașate peretelui (`wallId`) sau dacă linii manuale de buget sunt legate de camera / atribuirea ștearsă; elimină suprascrierile de buget rămase fără sursă și nodurile orfane.
- **`removeRoom`**: pereții și nodurile rămân; aceleași refuzuri legate de buget.
- **`addOpening`**: dimensiuni implicite de editor (ușă 900 × 2100 mm, prag 0; fereastră 1200 × 1200 mm, prag 900 mm; înălțimea se limitează la peretele ales) și cel mai apropiat de mijloc loc liber care respectă `openingEdgeMarginMm` și `openingGapMm`; ușa primește `swing: { hinge: 'start', side: 'left' }`.
- **`updateOpening`**: repoziționare / redimensionare pe ACELAȘI perete; `swing` doar la uși. Un gol nu poate fi mutat pe alt perete (se șterge și se adaugă).
- **`addRectRoom`**: 4 noduri, 4 pereți și camera, din dimensiuni interioare (A.4); numele implicit „Cameră N”.

## 4. Obiecte plasate

```ts
type Mounting = 'floor' | 'wall' | 'ceiling';

interface PlacedObject {
  id: Id;
  levelId: Id;
  catalogItemId: string;            // cheie în catalogSnapshot.items
  name?: string;                    // suprascriere de afișare
  position: Point;                  // centrul în plan, mm (rotunjit la 1 mm)
  elevationMm: Mm;                  // baza obiectului față de podea (z)
  rotationDeg: number;              // în jurul centrului
  mirrored?: boolean;
  size: { widthMm: Mm; depthMm: Mm; heightMm: Mm };   // instanța; în limitele itemului
  params: Record<string, number | string | boolean>;  // valori ale parametrilor specifici (vezi CatalogItem.paramSpecs)
  colorHex?: string;                // suprascriere de culoare
  wallId?: Id;                      // opțional, pentru obiecte montate pe perete (post-MVP: snap)
  note?: string;
}
```
- `roomId` **nu** se stochează: se deduce prin punct-în-poligon al centrului (bugetul pe cameră folosește rezultatul; obiectul din afara oricărei camere = „Fără cameră”). Opțional, utilizatorul poate fixa manual `roomOverrideId` (adăugat doar dacă testele cu utilizatori o cer).
- Unitatea de catalog „perete” (`mounting: 'wall'`) are elevație implicită din catalog (ex. oglindă 1000 mm, aplică 1700 mm); „tavan”: `elevation = înălțime_tavan − height` (lustră).

## 5. Catalog și finisaje

```ts
interface CatalogItem {
  id: string;                       // stabil, ex. "furn.sofa.3seat.basic"
  version: number;                  // incrementat la schimbări care afectează instanțele
  kind: 'furniture' | 'sanitary' | 'mirror' | 'lighting' | 'decor';   // MVP: 20/8/3/9 itemi; 'decor' rezervat (0 itemi în MVP)
  category: string;                 // „canapele”, „lustre”, „chiuvete”…
  name: LocalizedText;              // { ro: string; en?: string }
  defaultSize: { widthMm: Mm; depthMm: Mm; heightMm: Mm };
  sizeLimits: { widthMm: Range; depthMm: Range; heightMm: Range };   // Range = { min: Mm; max: Mm }
  mounting: Mounting;
  defaultElevationMm: Mm;
  recipe: { id: string; version: number };   // generator parametric (cod); unicul tip de model în MVP
  paramSpecs: Record<string, ParamSpec>;     // parametri suplimentari configurabili (nr. locuri, spătar, abajur…)
  defaultColorHex?: string;
  reference?: { priceMinor: Minor; currency: string; vatIncluded: boolean;
                origin: 'demo' | 'user' };   // 'demo' = valoare demonstrativă arbitrară, NU preț de magazin
  tags?: string[];
  provenance: { origin: 'original' | 'external'; license: string; author?: string; sourceUrl?: string };
}

type ParamSpec =
  | { type: 'number'; min: number; max: number; step: number; default: number; unit: 'mm' | 'deg' | 'count' }
  | { type: 'enum'; options: string[]; default: string }
  | { type: 'bool'; default: boolean };

type FinishKind = 'tile' | 'wall_tile' | 'parquet' | 'paint';   // gresie | faianță | parchet | vopsea
type PriceUnit = 'm2' | 'box' | 'piece' | 'liter' | 'can';

interface Finish {
  id: string;
  version: number;
  kind: FinishKind;
  name: LocalizedText;
  appearance: Appearance;           // cum arată în 2D și 3D (vezi mai jos)
  priceUnit: PriceUnit;
  unitPriceMinor: Minor;            // pe `priceUnit`
  priceOrigin: 'demo' | 'user';     // 'demo' = demonstrativ, NU preț de magazin
  vatBp?: Bp;
  // Câmpurile specifice sunt discriminate după `kind`:
  tile?: {                          // tile, wall_tile, parquet (bucăți); dimensiuni NOMINALE
    pieceWidthMm: Mm; pieceHeightMm: Mm; groutMm: Mm;
    piecesPerBox?: number; boxCoverageM2?: number;
  };
  paint?: { coverageM2PerLiter: number; coats: number; canVolumeLiters: number };
  defaultWastePct: number;          // 0–100, valoare de pornire
  provenance: { origin: 'original' | 'external'; license: string; author?: string; sourceUrl?: string };
}

interface Appearance {
  baseColorHex: string;
  roughness: number;                // 0–1
  texture:                          // repetabilă, în scară reală
    | { type: 'solid' }                                   // vopsea
    | { type: 'procedural';
        pattern: 'tile_grid' | 'plank';                   // gresie/faianță | parchet/laminat
        groutColorHex: string;                            // culoarea rostului / a îmbinării
        offsetPct: 0 | 33 | 50;                           // decalaj între rânduri
        toneVariation: number;                            // 0–1, variație de ton între piese
        seed: number;                                     // determinism: același seed → aceeași textură
      }
    | { type: 'image'; assetId: string; repeatMm: { w: Mm; h: Mm } };   // post-MVP (CC0 sau încărcat)
}
```
Dimensiunile pieselor și rostul se citesc din `Finish.tile` (o singură sursă pentru aspect și calcul). **Regula de calcul:** pasul piesei = `(lățime + rost) × (înălțime + rost)`; cantitatea de plăci folosește aria pasului, nu a piesei nominale. Textura procedurală este **determinată complet de parametri**: nu se stochează pixeli, deci proiectul și exportul rămân mici și reproductibile. Scara este lumea reală: modulul texturii acoperă un număr întreg de piese, iar repetiția pe suprafață se calculează din dimensiunile reale în mm.

Rețetele de obiecte sunt cod versionat (`recipe.version`). Un document care folosește o rețetă necunoscută sau mai nouă este deschis cu un **înlocuitor** (cutie la dimensiunile instanței) și un avertisment; datele (dimensiuni, parametri, preț) nu se pierd.

În implementare, `Finish` va fi o **uniune discriminată** (`kind`) cu câmpurile specifice obligatorii, nu opționale.

### 5.1 Atribuirea finisajelor

```ts
type FinishTarget =
  | { kind: 'roomFloor'; roomId: Id }
  | { kind: 'wallSide'; wallId: Id; side: 'left' | 'right' };
  // post-MVP: roomCeiling

interface FinishAssignment {
  id: Id;
  target: FinishTarget;
  finishId: string;                 // cheie în catalogSnapshot.finishes
  wastePct: number;                 // suprascrie implicitul
  coveredHeightMm?: Mm;             // doar wallSide; implicit = înălțimea peretelui
  fromHeightMm?: Mm;                // implicit 0 (ex. vopsea deasupra faianței: 1200→tavan)
  layout?: 'straight' | 'diagonal'; // influențează rebutul implicit
}
```
- O țintă poate avea **mai multe** atribuiri doar dacă intervalele de înălțime (`fromHeightMm`–`fromHeightMm + coveredHeightMm`) nu se suprapun (ex. faianță 0–1200 + vopsea 1200–2600). Pentru podea: exact o atribuire pe cameră.
- Peretele este *partajat*, dar finisajul pe fiecare **față** este independent.

## 6. Buget

Bugetul stochează **doar** ceea ce nu se poate deriva: suprascrieri, linii manuale, setări.

```ts
interface BudgetState {
  overrides: Record<string, LineOverride>;     // cheie = sourceKey: "object:<objectId>" | "finish:<finishId>" (finisajul din catalogSnapshot, nu atribuirea)
  manualLines: Record<Id, ManualLine>;
}

interface LineOverride {
  unitPriceMinor?: Minor;
  quantity?: number;                // suprascrie cantitatea de achiziție calculată
  vatBp?: Bp;
  excluded?: boolean;
  note?: string;
}

type QuantityBinding =
  | { kind: 'roomFloorArea'; roomId: Id }
  | { kind: 'assignmentArea'; assignmentId: Id }
  | { kind: 'roomWallArea'; roomId: Id };       // suma fețelor interioare ale camerei

type BudgetCategory =
  | 'furniture' | 'sanitary' | 'mirror' | 'lighting' | 'decor'   // = CatalogItem.kind (identitate)
  | 'flooring' | 'wall_finish' | 'paint'                        // din Finish.kind: tile/parquet→flooring, wall_tile→wall_finish, paint→paint
  | 'labor' | 'transport' | 'other';

type Unit = 'buc' | 'm2' | 'ml' | 'l' | 'cutie' | 'doza' | 'h' | 'zi' | 'lot';

interface ManualLine {
  id: Id;
  category: BudgetCategory;
  description: string;
  roomId?: Id | null;
  unit: Unit;
  quantity: number;                 // folosit când binding lipsește
  binding?: QuantityBinding;        // dacă există, cantitatea urmărește modelul
  unitPriceMinor: Minor;
  vatBp: Bp;
  excluded?: boolean;
  note?: string;
}
```

### 6.1 Linia calculată (nestocată) — așa cum este implementată în `src/domain/budget`

```ts
interface LineValues { quantity: number; unitPriceMinor: Minor; vatBp: Bp }

interface BudgetLine {
  key: string;                      // "object:<objectId>" | "finish:<finishId>" | "manual:<lineId>"
  origin: 'derived' | 'manual';
  category: BudgetCategory;
  description: string;
  unit: Unit;
  computed: LineValues;             // produs de model/catalog; se recalculează la orice modificare a modelului
  effective: LineValues;            // folosit efectiv = computed + suprascrierile utilizatorului
  overridden: { quantity: boolean; unitPriceMinor: boolean; vatBp: boolean };
  priceSource: 'demo' | 'user';     // 'user' dacă prețul a fost suprascris, e linie manuală sau item fără preț de catalog
  excluded: boolean;
  note?: string;
  totals: Totals;                   // net / TVA / brut, în bani întregi
  byRoom: Record<string, Totals>;   // alocare pe camere ('none' = fără cameră); Σ = totals, exact
  trace: TraceStep[];               // urma de calcul (verificabilitate)
}

interface TraceStep { label: string; formula: string; inputs: Record<string, number | string>;
                      result: number | string; rounding: 'ceil' | 'round' | 'none' }
// Urma se produce de aceleași funcții pure care calculează valoarea (nu o reconstruiește separat),
// deci nu poate diverge de rezultat. Nu se stochează în document; se calculează la cerere.

interface Totals { netMinor: Minor; vatMinor: Minor; grossMinor: Minor }

interface BudgetSummary {
  lines: BudgetLine[];              // sortate după `key` (rezultatul nu depinde de ordinea cheilor din JSON)
  perRoom: Record<string, Totals>;  // doar liniile incluse
  perCategory: Partial<Record<BudgetCategory, Totals>>;
  subtotal: Totals;
  contingency: Totals;              // rezerva, calculată separat pe net și pe TVA
  total: Totals;
  trace: TraceStep[];               // Subtotal → Rezervă → Total
}
```

**Separarea editărilor de valorile recalculate:** documentul stochează doar `budget.overrides` (câmpuri opționale, pe cheia sursei) și `budget.manualLines`. `computed` se recalculează întotdeauna din model; `effective` îl suprapune cu suprascrierile. Ștergerea unei suprascrieri readuce `effective = computed`. Funcțiile `setLineOverride` / `clearLineOverride` (`src/domain/cascade`) întorc documente noi și nu ating cantitățile calculate.

### 6.2 Reguli
- Linii derivate: câte una per `PlacedObject` și câte una per **finisaj** (`finishId`), nu per atribuire. Motiv (demonstrat în Etapa 0): cantitatea de achiziție se rotunjește la ambalaj; dacă ar fi rotunjită per atribuire, 4 pereți vopsiți ar da 4 doze în loc de 3 pentru aceeași arie totală (32,03 m²). Regula: **se însumează ariile nete ale tuturor atribuirilor aceluiași finisaj, apoi se rotunjește o singură dată**. Costul se împarte pe camere proporțional cu aria netă a fiecărei camere, prin metoda celei mai mari rămășițe (suma părților = totalul exact, la bani).
- Liniile se sortează după `key`, astfel încât bugetul să nu depindă de ordinea cheilor din JSON.
- Preț implicit: `Finish.unitPriceMinor` / `CatalogItem.reference.priceMinor`, copiat din `catalogSnapshot` (stabil în timp).
- Suprascrierile sunt eliminate când sursa dispare. **Curățarea se face în aceeași acțiune (același patch) cu ștergerea sursei**, nu într-o acțiune ulterioară: altfel `undo` ar restaura obiectul fără prețul editat (demonstrat în Etapa 0). Același lucru pentru orice derivat dependent (atribuiri, linii legate).
- `updatedAt` nu face parte din istoricul undo: se scrie la salvare (§8) și nu produce patch-uri.
- `excluded = true` scoate linia din totaluri dar o păstrează vizibilă (tăiată).

## 7. Plicul de export și autonomia fișierului

Fișierul `.roomcraft.json` conține **tot ce e necesar** pentru a reconstrui planul 2D, scena 3D și bugetul, fără a consulta catalogul aplicației:

| Necesar pentru | Conținut în fișier |
|---|---|
| Plan 2D | `levels`, `nodes`, `walls`, `openings`, `rooms`, `objects` (poziții, rotații, dimensiuni, `params`) |
| Scenă 3D | Aceleași + `catalogSnapshot.items` (inclusiv `recipe.id/version`, `paramSpecs`, `sizeLimits`) și `catalogSnapshot.finishes` (inclusiv `appearance` cu parametri și `seed`) + `finishAssignments` + înălțimi |
| Buget | `settings` (monedă, TVA, rezervă), `catalogSnapshot` (prețuri și `priceOrigin`), `budget.overrides`, `budget.manualLines`, `finishAssignments` |

**Reguli de autonomie (verificate de teste):**
1. Fiecare `catalogItemId` și `finishId` referit există în `catalogSnapshot`, altfel documentul e invalid.
2. Test „catalog gol”: un document importat într-o aplicație al cărei catalog încorporat este înlocuit cu unul gol produce același `SceneDescription` (hash) și același `BudgetSummary` ca la export.
3. Texturile procedurale sunt reconstruite din parametri; imaginile (post-MVP) se includ în `assets`.
4. Singurele elemente externe sunt **rețetele** (cod): dacă lipsesc, se aplică înlocuitorul descris la §5.
5. Nu se exportă stare efemeră (selecție, viewport, cameră 3D); aceasta nu influențează reconstruirea scenei sau a bugetului.

Identificatori tehnici stabili, independenți de numele provizoriu al produsului: `format: "roomcraft"`, extensia `.roomcraft.json`, baza IndexedDB `roomcraft` (ADR-026).

```ts
interface RoomcraftFile {
  format: 'roomcraft';
  formatVersion: number;            // = project.schemaVersion
  exportedAt: string;
  generator: { app: 'RoomCraft'; version: string };
  project: ProjectDocument;
  assets: Array<{ id: string; mime: string; dataBase64: string }>;   // gol în MVP
}
```
Extensia fișierului: `.roomcraft.json`. Tip MIME: `application/json`.

## 8. Metadate în IndexedDB (în afara documentului)

```ts
interface ProjectMeta {             // magazia `projects`
  id: Id; name: string;
  createdAt: string; updatedAt: string;
  schemaVersion: number;
  revision: number;                 // incrementat la fiecare salvare
  counts: { rooms: number; objects: number };
  thumbnailDataUrl?: string;        // mică, opțională
}

interface StoredDocument {          // magazia `documents`
  projectId: Id;
  revision: number;
  data: ProjectDocument;
}

interface Snapshot {                // magazia `snapshots`
  id: Id; projectId: Id; createdAt: string;
  reason: 'auto' | 'pre-migration' | 'pre-import' | 'pre-overwrite' | 'manual';   // pre-overwrite: versiunea suprascrisă la rezolvarea unui conflict
  schemaVersion: number;
  data: ProjectDocument;
}
```

## 9. Ce NU este în model (intenționat)
- Selecție, unealtă, viewport, cameră 3D – stare UI efemeră (viewport per proiect poate fi pus în `rc:prefs`).
- Arii, cantități, totaluri, poligoane interioare, scena 3D – derivate.
- Texturi încărcate de utilizator, istoricul undo.

## 10. Exemplu minimal (o cameră 4×3 m, pereți de 100 mm)

```json
{
  "schemaVersion": 1,
  "id": "3b1f…", "name": "Garsonieră",
  "settings": { "currency": "RON", "pricesIncludeVat": true, "defaultVatBp": 2100,
                "contingencyBp": 500, "defaultWallHeightMm": 2600,
                "defaultWallThicknessMm": 100, "gridMm": 100, "openingEdgeMarginMm": 50,
                "openingGapMm": 50, "displayUnit": "cm" },
  "levels": { "L1": { "id": "L1", "name": "Parter", "elevationMm": 0, "ceilingHeightMm": 2600 } },
  "nodes": {
    "n1": { "id": "n1", "levelId": "L1", "x": 0,    "y": 0 },
    "n2": { "id": "n2", "levelId": "L1", "x": 4000, "y": 0 },
    "n3": { "id": "n3", "levelId": "L1", "x": 4000, "y": 3000 },
    "n4": { "id": "n4", "levelId": "L1", "x": 0,    "y": 3000 }
  },
  "walls": { "w1": { "id": "w1", "levelId": "L1", "startNodeId": "n1", "endNodeId": "n2",
                     "thicknessMm": 100, "heightMm": 2600, "baseOffsetMm": 0 } },
  "rooms": { "r1": { "id": "r1", "levelId": "L1", "name": "Living", "type": "living",
                     "nodeLoop": ["n1", "n2", "n3", "n4"] } }
}
```
(Pereții `w2…w4` omiși pentru concizie.) Aria utilă calculată: (4000−100)×(3000−100) = 11,31 m² — nu 12 m² — deoarece suprafața se măsoară la fața interioară.
