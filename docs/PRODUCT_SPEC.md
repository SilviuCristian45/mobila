# RoomCraft — Specificația produsului

> Stare: **Revizia 2** — direcția generală este aprobată, iar deciziile D1–D11 de mai jos sunt integrate. Nicio linie de cod de aplicație nu a fost scrisă; implementarea așteaptă aprobarea explicită a acestei revizii.
> Documente conexe: [ARCHITECTURE](ARCHITECTURE.md) · [DATA_MODEL](DATA_MODEL.md) · [ROADMAP](ROADMAP.md) · [DECISIONS](DECISIONS.md)

## 0. Decizii acceptate pentru MVP

| # | Decizie | Unde se aplică |
|---|---|---|
| D1 | Next.js cu export static, fără backend și autentificare — validat în Etapa 0 prin prototipuri rulate (compatibil, cu 8 condiții + 2 constatări noi; vezi STAGE0_REPORT) | ARCHITECTURE §13, ADR-001 |
| D2 | Un singur nivel; modelul de date pregătit pentru extindere | DATA_MODEL §2.1, ADR-006 |
| D3 | Doar pereți drepți; fără pereți curbi, mansarde sau geometrii speciale | §4.2, ADR-021 |
| D4 | Geometrie pe **axele pereților**; camera se poate crea din **dimensiuni interioare**; grosimi, colțuri, uși, ferestre definite normativ | DATA_MODEL §3.A, ADR-021 |
| D5 | Desktop-first, responsive, suport tabletă; telefon = vizualizare și navigare | §2, ADR-025 |
| D6 | ~40 de obiecte parametrice cu dimensiuni configurabile | Anexa A, ADR-028 |
| D7 | Materiale (gresie, faianță, parchet, vopsea) cu texturi repetabile **procedurale** și proprietăți configurabile | FR-06, ADR-022 |
| D8 | Prețuri demonstrative marcate vizibil, editabile; calcule verificabile (urmă de calcul) | FR-10, FR-17, ADR-023 |
| D9 | „RoomCraft” este nume provizoriu; identificatorii tehnici rămân stabili | ADR-026 |
| D10 | Găzduirea se evaluează separat; nu se alege și nu se configurează acum | ARCHITECTURE §12, ADR-024 |
| D11 | Export/import complet, **autonom**: fișierul singur reconstruiește 2D, 3D și buget | FR-14, DATA_MODEL §7, ADR-027 |

## 1. Viziune

RoomCraft este o aplicație web publică, gratuită și fără cont, în care un utilizator poate proiecta o locuință la dimensiuni reale, o poate mobila, îi poate alege finisajele și poate vedea imediat cât costă amenajarea. Totul rulează în browser; datele rămân pe dispozitivul utilizatorului.

Promisiunea centrală: **un singur model de date alimentează planul 2D, vizualizarea 3D și bugetul**. O modificare într-un loc apare automat în celelalte două.

## 2. Public țintă

| Persoană | Nevoie | Implicație pentru produs |
|---|---|---|
| Proprietar care renovează | Să afle repede „cât mă costă” și „încape canapeaua?” | Buget vizibil permanent, dimensiuni reale, introducere numerică precisă |
| Chiriaș / cumpărător de apartament nou | Să testeze aranjări de mobilier | Catalog rapid de folosit, drag & drop, 3D |
| Amenajor / meșter amator | Cantități de materiale și export pentru oferte | Calcul de suprafețe, rebut, export CSV/XLSX |

Platformă principală: **desktop/laptop** (mouse + tastatură), editare completă. Interfața este responsive pe trei trepte:

| Treaptă | Lățime | Comportament |
|---|---|---|
| Desktop | ≥ 1280 px | Editor complet, panouri laterale fixe |
| Tabletă | 768–1279 px | Editor complet cu panouri retractabile, ținte tactile ≥ 44 px, gesturi: pinch = zoom, două degete = pan, un deget acționează unealta activă (există și unealta „Mână” pentru pan) |
| Telefon | < 768 px | **Mod vizualizare/navigare**: listă proiecte, pan/zoom 2D, orbit 3D, consultare buget și export; uneltele de desen sunt ascunse, iar un mesaj explică că editarea completă necesită un ecran mai mare. Se pot edita doar valori simple (nume, prețuri, cantități) din panouri |

Nu promitem un editor complet pe telefon.

## 3. Principii de produs

1. **Dimensiuni reale peste aspect.** Orice element are valori numerice editabile (mm/cm); desenul liber nu are prioritate față de precizie.
2. **Datele aparțin utilizatorului.** Fără conturi, fără telemetrie obligatorie, export complet oricând.
3. **Estimare, nu ofertă.** Cantitățile și costurile sunt orientative; aplicația spune explicit acest lucru.
4. **Un singur adevăr.** Nicio valoare derivată (arie, cantitate, cost) nu este stocată dacă poate fi recalculată din model.
5. **Simplu întâi.** Funcțiile complexe (pereți curbi, mai multe niveluri, acoperiș) sunt amânate conștient.

## 4. Domeniul MVP

### 4.1 Inclus în MVP

| ID | Funcționalitate | Criteriu de acceptare (rezumat) |
|---|---|---|
| FR-01 | Proiecte: creare, listare, redenumire, duplicare, ștergere (cu confirmare) | Proiectele supraviețuiesc reîncărcării paginii și repornirii browserului |
| FR-02 | Mai multe camere într-un proiect | ≥ 20 camere fără degradare vizibilă a interacțiunii |
| FR-03 | Plan 2D: perete (segmente drepte), cameră poligonală, **cameră dreptunghiulară din dimensiuni interioare**, ușă, fereastră | Lungimi, grosimi, înălțimi editabile numeric; snap la grilă și la noduri; convențiile de grosime/colțuri/goluri din DATA_MODEL §3.A respectate |
| FR-04 | Dimensiuni reale: unități metrice, afișare mm/cm/m configurabilă | Valoarea introdusă = valoarea salvată; dimensiunile interioare introduse la crearea camerei apar identic în cotele feței interioare |
| FR-05 | Mobilier și obiecte: poziție, rotație, dimensiuni, elevație | Plasare din catalog, mutare, rotire, **dimensiuni configurabile în limitele itemului**, duplicare, ștergere |
| FR-06 | Finisaje pentru podea și pereți: gresie, faianță, parchet, vopsea, cu **texturi repetabile procedurale și proprietăți configurabile** (culoare, dimensiune piesă, rost, culoare rost, rugozitate, decalaj, variație de ton) | Atribuire pe cameră (podea) și pe fața unui perete; textura respectă dimensiunile reale ale pieselor în 2D și 3D; parametrii se salvează în proiect |
| FR-07 | Obiecte funcționale în catalog (MVP, cele 40 din Anexa A): mobilier, obiecte sanitare, oglinzi, lustre și corpuri de iluminat. Obiectele strict decorative (pernă, plantă, covor, tablou) sunt tranșa a doua | Categorii în catalog (`furniture`/`sanitary`/`mirror`/`lighting`; `decor` rezervat), montare pe podea / perete / tavan cu elevație implicită |
| FR-08 | Vizualizare 3D derivată din același model | Orbit + vedere de sus; pereți cu goluri pentru uși/ferestre; modificările din 2D apar în 3D fără reîncărcare |
| FR-09 | Calcul suprafețe și cantități | Arie podea, arie pereți (minus goluri), nr. plăci/cutii, litri vopsea, cu rebut configurabil |
| FR-10 | Buget pe cameră și general | Linii automate (din obiecte și finisaje) + linii manuale; manoperă; total cu/fără TVA; rezervă (%); **fiecare preț arată sursa: „demonstrativ” sau „introdus de utilizator”** |
| FR-11 | Buget editabil | Preț, cantitate, excludere, notă pe orice linie; modificările nu se pierd la recalcul; editarea unui preț demonstrativ îl marchează „introdus de utilizator” |
| FR-12 | Export buget CSV și XLSX | Fișierul se deschide corect în Excel/LibreOffice (diacritice, separatori) |
| FR-13 | Salvare automată | Indicator de stare; pierdere maximă la un crash ≈ ultimele secunde de lucru |
| FR-14 | Export / import proiect `.roomcraft.json` versionat, **autonom** | Export → import = proiect identic; fișierul singur (fără catalogul aplicației) reconstruiește același plan 2D, aceeași scenă 3D și același buget; fișiere mai vechi sunt migrate; fișiere invalide sunt respinse cu mesaj clar |
| FR-15 | Undo / redo | ≥ 100 de pași, o operațiune de tragere = un singur pas |
| FR-16 | Catalog încorporat de ~40 obiecte parametrice (Anexa A) și un set de finisaje; prețuri demonstrative, editabile | Itemii sunt copiați (snapshot) în proiect la utilizare; fiecare item respectă limitele min/max la configurare |
| FR-17 | Calcule verificabile | Fiecare cantitate și fiecare linie de buget oferă o **urmă de calcul** (valori de intrare, formulă, rezultat intermediar, rotunjire) afișabilă în interfață și inclusă opțional în export |
| FR-18 | Avertisment de estimare | Bugetul și exporturile conțin vizibil mențiunea că prețurile demonstrative nu sunt prețuri de magazin și că rezultatele sunt estimări |

### 4.2 Explicit în afara MVP

- Funcționalități AI de orice fel.
- Conturi, autentificare, sincronizare cloud, colaborare, partajare prin link.
- Backend propriu, API-uri obligatorii, baze de date cloud.
- Mai multe niveluri/etaje, scări, acoperiș.
- Pereți curbați sau înclinați, mansarde (înălțime variabilă a tavanului), camere circulare sau cu alte geometrii speciale.
- Alegerea sau configurarea unui serviciu de găzduire (se evaluează separat, ARCHITECTURE §12).
- Instalații (electrice, sanitare), detecție de coliziuni între obiecte.
- Încărcare de texturi/modele 3D proprii; import din alte formate (DXF, SKP, glTF).
- Randare fotorealistă, umbre avansate, plimbare first-person (candidat post-MVP).
- Export PDF / imagine / glTF (candidate post-MVP).
- Simularea modului de așezare a plăcilor (calcul doar pe arie + rebut).
- Multi-monedă (o monedă per proiect), multilingv complet (UI în română; structură pregătită pentru i18n).

## 5. Cerințe nefuncționale

| Zonă | Cerință (țintă de verificat prin măsurare) |
|---|---|
| Performanță 2D | Pan/zoom fluid (~60 fps) la 20 camere / 300 obiecte pe un laptop mediu |
| Performanță 3D | ≥ 30 fps la aceeași scenă pe GPU integrat; fără scurgeri de memorie la editări repetate |
| Încărcare | Pagina de start și lista de proiecte fără cod 3D/Konva; editorul și 3D încărcate la cerere (lazy) |
| Salvare | Autosave fără blocarea vizibilă a interfeței (< 50 ms pe firul principal pentru proiecte tipice) |
| Browsere | Ultimele 2 versiuni stabile: Chrome, Edge, Firefox, Safari (macOS și iOS/iPadOS) |
| Offline | Datele sunt locale; funcționare offline completă (PWA) este candidat post-MVP |
| Confidențialitate | Nicio dată de proiect nu părăsește dispozitivul; fără cookie-uri de urmărire |
| Securitate | Importul tratează fișierul ca date nesigure (validare, limite de mărime); export CSV protejat împotriva injecției de formule |
| Accesibilitate | Toate valorile sunt editabile și din panouri cu taste/câmpuri numerice, nu doar prin canvas; contrast WCAG AA; navigare cu tastatura în panouri |
| Fiabilitate | Un proiect corupt nu blochează aplicația; restaurare din instantaneele locale |

## 6. Fluxuri principale

1. **Proiect nou → cameră:** utilizatorul alege „Proiect nou”, desenează o cameră dreptunghiulară introducând lățimea și lungimea, apoi ajustează vârfurile.
2. **Goluri:** adaugă o ușă și o fereastră pe pereți; poziția și dimensiunile se editează numeric.
3. **Mobilare:** alege din catalog, trage în plan, rotește; panoul din dreapta arată dimensiuni, elevație, preț.
4. **Finisaje:** selectează podeaua/peretele, alege gresie/parchet/vopsea; vede imediat cantitatea necesară.
5. **3D:** comută pe 3D, se rotește în jurul camerei; revine în 2D pentru ajustări.
6. **Buget:** deschide bugetul, corectează prețuri, adaugă manoperă, exportă XLSX.
7. **Arhivare:** exportă `.roomcraft.json`; ulterior îl importă pe alt dispozitiv.

## 7. Simplificări asumate în MVP

| Subiect | Simplificare | Motiv |
|---|---|---|
| Geometrie pereți | Doar segmente drepte, unghi oricare; îmbinări prin noduri comune | Pereții curbi complică ofsetarea, golurile și 3D-ul |
| Niveluri | Un singur nivel (modelul are deja `levelId`) | Evită migrare ulterioară, fără costul UI |
| Obiecte 3D | Doar modele parametrice din primitive (cutii/cilindri/etc.), fără glTF | Fără bază de active, fără probleme de licență, dimensiuni exacte |
| Texturi | **Procedurale**, generate la rulare din parametri (gresie/faianță cu rost, parchet cu decalaj, vopsea uniformă); texturi-imagine doar post-MVP | Licență nulă, scară reală exactă, configurabile, stocate ca parametri (fișiere mici) |
| Plăci | Cantitate = arie × (1 + rebut) / aria pasului piesei (piesă + rost), însumată pe toate atribuirile aceluiași finisaj și abia apoi rotunjită în sus | Algoritm de tăiere/așezare = proiect separat |
| Glafuri/șpalet | Suprafața laterală a golurilor (grosimea peretelui) nu se finisează automat și nu intră în calcule | Documentat; poate fi adăugat ulterior |
| Telefon | Mod vizualizare/navigare, fără unelte de desen | Precizia cere pointer fin și ecran mare |
| Prețuri catalog | **Demonstrative**, arbitrare, fără mărci sau magazine, marcate vizibil ca atare; editabile | Fără backend; nu prezentăm valori fictive drept prețuri reale |
| Monedă | O monedă per proiect (implicit RON), sume în unități minore întregi | Corectitudine contabilă |

## 8. Măsuri de succes (după lansare, fără telemetrie obligatorie)

- Timp de la deschidere la prima cameră mobilată < 5 minute (test cu utilizatori).
- 0 incidente de pierdere de date în testele de rezistență (închidere forțată, tab dublu, cotă plină).
- Export → import → export produce fișiere echivalente (test automat).
- Totalurile de buget sunt reproductibile cu un calcul manual pe un proiect de referință.

## 9. Convenții geometrice (rezumat; normativ în DATA_MODEL §3.A)

- Camera se stochează pe **axele pereților**; la creare, utilizatorul poate introduce **dimensiunile interioare** (față interioară la față interioară), iar aplicația calculează axele ținând cont de grosimile pereților.
- Aria camerei și lungimile cotate sunt la **fața interioară**.
- Pereții se îmbină în colț prin **miter**, cu teșire (bevel) sub ≈ 29° pe partea reflexă; grosimea peretelui este un număr **par** de mm; la T-uri peretele traversat este împărțit în noduri.
- Ușile și ferestrele sunt goluri prin întreaga grosime a peretelui, poziționate prin centru pe axă, cu distanță minimă față de colțuri.

## 10. Glosar

- **Nod**: punct în plan (mm) la capătul unuia sau mai multor pereți.
- **Perete**: segment între două noduri, cu grosime și înălțime; axa peretelui = linia dintre noduri.
- **Cameră**: buclă închisă de noduri; suprafața utilă este poligonul interior (după scăderea semi-grosimilor).
- **Gol (opening)**: ușă sau fereastră dintr-un perete.
- **Finisaj**: material de acoperire (gresie, faianță, parchet, vopsea) cu proprietăți de calcul și preț.
- **Atribuire de finisaj**: legătura dintre un finisaj și o țintă (podeaua unei camere sau fața unui perete).
- **Unități minore**: cea mai mică unitate monetară (bani pentru RON), număr întreg.
- **Preț demonstrativ**: valoare arbitrară inclusă în catalog pentru a exemplifica bugetul; nu provine de la vreun magazin.
- **Urmă de calcul**: lista pașilor (intrări, formulă, rezultat, rotunjire) prin care s-a obținut o cantitate sau o sumă.

## Anexa A — Catalogul inițial de obiecte parametrice (40)

Fiecare item are dimensiuni implicite și limite min/max, plus parametri specifici (ex. număr de locuri, înălțimea spătarului, diametrul abajurului). Toate sunt generate din rețete parametrice proprii (licență: originale). Lista este punctul de pornire al Etapei 4 și poate fi ajustată cu aprobarea ta.

| Categorie | Nr. | Itemi |
|---|---|---|
| Mobilier | 20 | canapea 2 locuri · canapea 3 locuri · canapea de colț (L) · fotoliu · pat dublu · pat simplu · noptieră · șifonier · comodă · masă dining dreptunghiulară · masă dining rotundă · scaun · măsuță de cafea · comodă TV · bibliotecă · birou · scaun de birou · corp de bucătărie jos · corp de bucătărie suspendat · masă înaltă / insulă |
| Obiecte sanitare | 8 | vană · cabină de duș · lavoar suspendat · lavoar cu mobilier · vas WC · bideu · chiuvetă de bucătărie · mobilier de baie (coloană) |
| Oglinzi | 3 | oglindă dreptunghiulară de perete · oglindă rotundă · oglindă de podea |
| Iluminat | 9 | lustră clasică cu brațe · pendul cu abajur · pendul sferic · plafonieră rotundă · plafonieră/panou pătrat · spot încastrat · aplică de perete · veioză · lampadar |

Obiectele decorative suplimentare (pernă, plantă, covor, tablou) sunt candidați pentru o a doua tranșă, nu fac parte din cele 40.
