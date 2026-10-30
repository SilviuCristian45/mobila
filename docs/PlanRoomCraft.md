Roadmap de dezvoltare

# Planul RoomCraft

După ce aprobăm definitiv Etapa 2b, continuăm în etape mici, ca să obții o aplicație utilizabilă cât mai repede, fără să construim 2D, 3D, mobilier și buget toate deodată.

[0–2a](#etapa-0-2a) [2b](#etapa-2b) [3](#etapa-3) [4](#etapa-4) [5](#etapa-5) [6](#etapa-6) [7](#etapa-7) [8](#etapa-8)

Implementat În curs de aprobare Planificat

## Roadmap-ul propus

1. Etapele 0–2aImplementat

   ### Fundația și dashboard-ul

   Arhitectură, model de date, persistență, autosave, undo/redo, proiecte și carcasa editorului.
2. Etapa 2bÎn curs de aprobare

   ### Editor 2D

   Pereți, camere, dimensiuni, uși și ferestre, cu editare și validare geometrică.
3. Etapa 3Planificat

   ### Vizualizare 3D

   **Obiectiv:** să vezi camera construită în 2D în trei dimensiuni.
   - Pereți, podea și goluri pentru uși și ferestre.
   - Cameră orbitabilă, zoom și vedere din interior.
   - Sincronizare cu documentul proiectului.
   - Fără mobilier complex încă.
4. Etapa 4Planificat

   ### Catalog de mobilier și obiecte
   - Pat, canapea, dulap, masă, scaune, birou și alte obiecte.
   - Dimensiuni editabile, poziționare și rotație.
   - Bibliotecă de obiecte parametrice, fără modele 3D externe obligatorii.
   - Aceeași poziție în planul 2D și în scena 3D.
5. Etapa 5Planificat

   ### Materiale și finisaje
   - Culori pentru pereți și tavane.
   - Parchet, gresie și faianță.
   - Texturi procedurale și scară configurabilă.
   - Aplicarea finisajelor pe camere sau suprafețe compatibile.
6. Etapa 6Planificat

   ### Bugetul renovării
   - Calculul suprafețelor și cantităților.
   - Costuri editabile pentru materiale și manoperă.
   - TVA configurabil și pierderi estimate pentru materiale.
   - Prețuri manuale care nu se pierd la recalculare.
   - Totaluri pe camere, categorii și întregul proiect.
7. Etapa 7Planificat

   ### Import, export și prezentare
   - Export și import complet `.roomcraft.json`.
   - Export CSV pentru buget și materiale.
   - Export de plan 2D și capturi ale scenei 3D.
   - Rezumat de proiect și listă de cumpărături.
8. Etapa 8Planificat

   ### Stabilizare și lansare
   - Testare în browsere și pe dispozitive reale.
   - Verificări de accesibilitate, performanță și proiecte mari.
   - CI funcțional și build reproductibil.
   - Testarea restaurării copiilor de siguranță.
   - Pregătirea exportului static pentru hosting.

## Cum împărțim etapele mari

Nu i-aș cere lui Claude să facă întreaga etapă 3 într-un singur prompt. De exemplu:

### Etapa 33D

- **3a**pereți și podea
- **3b**uși și ferestre
- **3c**navigare și sincronizare
- **3d**teste de geometrie și performanță

### Etapa 4Mobilier

- **4a**catalog și obiecte parametrice
- **4b**adăugare și poziționare
- **4c**rotație și proprietăți
- **4d**sincronizare 2D/3D

### Etapa 5Finisaje

- **5a**culori și materiale simple
- **5b**texturi și scară
- **5c**calculul suprafețelor finisate

### Etapa 6Buget

- **6a**cantități
- **6b**prețuri și TVA
- **6c**interfață, modificări manuale și export

## Ce prioritizăm

Ordinea importantă este 3 → 4 → 5 → 6, cu o condiție.

**3**3D → **4**Mobilier → **5**Finisaje → **6**Buget

Condiție înainte de 3D

Înainte de a începe 3D-ul, trebuie verificat că geometria 2D este stabilă și că modelul canonic conține toate informațiile necesare.

### Trei reguli pe tot parcursul dezvoltării

1. REGULA 1

   #### Un singur model de proiect

   2D, 3D și bugetul trebuie să derive din același `ProjectDocument`, nu să întrețină copii independente.
2. REGULA 2

   #### Fiecare etapă trece verificările existente

   Nu acceptăm un editor nou care strică persistența, importul sau exportul.
3. REGULA 3

   #### Funcționalitate înainte de detalii vizuale

   Mai întâi pereți corecți și mobilier poziționat corect; după aceea texturi realiste, iluminare și finisaje vizuale.

## Ținta practică

După etapa 4

Poți desena un apartament, să-l vezi în 3D și să-l mobilezi.

După etapele 5 și 6

Aplicația poate deveni un instrument real pentru planificarea unei renovări, nu doar un editor vizual.