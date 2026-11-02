# Listă de lansare (Etapa 8)

Stare la pregătirea lansării. Punctele din „Decizii ale proprietarului” NU au fost decise de asistent; sunt doar documentate.

## Livrat în cod

- [x] Pagină statică „Despre, licențe și confidențialitate” (`/despre/`, link în subsolul listei de proiecte); lista pachetelor vine din `src/lib/third-party-licenses.json`, generat de `pnpm license:notices`.
- [x] `THIRD_PARTY_NOTICES.md` (livrate vs. unelte de build) și `ATTRIBUTIONS.md`.
- [x] `license:check` fără încălcări (532 de pachete).
- [x] Memento periodic pentru copia de siguranță (ADR-055); import din interfață (ADR-052).
- [x] Accesibilitate de tastatură / cititor de ecran (ADR-053), verificată automat.

## Decizii ale proprietarului (neluate)

- [x] **Licența codului propriu** — decis de proprietar: deocamdată fără licență (nu se adaugă fișier LICENSE; implicit, toate drepturile rezervate). Se poate relua oricând.
- [x] **Găzduire** — decis de proprietar: Vercel (site static, `output: 'export'`). Rămâne de făcut de proprietar: recitirea termenilor planului ales (în special dacă proiectul devine comercial; planul gratuit are restricții de utilizare necomercială — de verificat în termenii actuali) și configurarea proiectului/domeniului.
- [x] **Domeniu** — decis de proprietar: `room-craft` pe Vercel (plan gratuit; proiectul e gratuit, deci fără restricția de uz comercial). Rămâne verificarea numelui/disponibilității `room-craft.vercel.app` la crearea proiectului. Verificarea numelui
 „RoomCraft” (provizoriu) înainte de lansarea publică. Datele locale sunt legate de origine: schimbarea domeniului cere export/import (explicat în pagina Despre).
- [x] **Anteturi de securitate / CSP** — `vercel.json` (ADR-057), verificat cu `pnpm e2e:csp` în 3 browsere. De verificat după primul deploy: anteturile apar în răspunsul real (`curl -I`).

## De verificat înainte de lansare

- [x] `pnpm audit --prod` — rulat de proprietar (2026-11-02, lockfile-ul de pe `main`, `99205f2`): „No known vulnerabilities found”. Se repetă înaintea fiecărei lansări noi; fără `pnpm` instalat: `npx --yes pnpm@10.34.9 audit --prod`.
- [ ] Suita e2e completă în cele 3 browsere, `e2e:base` și `e2e:storage` în Firefox/WebKit (rulate parțial, pe grupuri, din cauza resurselor laptopului).
- [ ] Lista manuală din `docs/ARCHITECTURE.md` §11.2.
- [ ] Test cu cititor de ecran real (NVDA/VoiceOver); verificările automate nu îl înlocuiesc.
- [ ] Test de utilizare cu 3–5 persoane: „cameră → mobilier → finisaj → buget → export”.
