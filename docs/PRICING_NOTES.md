# Prețuri demonstrative (catalogul încorporat)

Toate prețurile din `src/catalog/items.ts` sunt **arbitrare și demonstrative** (`reference.origin: 'demo'`, monedă RON, TVA inclus). Nu provin de la magazine sau producători și nu sunt prețuri de piață. Bugetul le marchează ca „demonstrative” până când utilizatorul le editează (atunci devin „introduse de utilizator”). Valorile sunt rotunjite și servesc doar la a arăta fluxul de buget.

## Materiale și finisaje (Etapa 3c)

Prețurile din `src/materials/catalog.ts` sunt la fel de demonstrative (RON, TVA inclus). Convenții: pardoseli și suprafețe la **m²**; vopselele pe **doză de 10 L** (randament 10 m²/L, 2 straturi); finisajele de mobilier pe **zonă finisată** (preț = *supliment* față de prețul obiectului, care include finisajul standard). Estimarea din panou și din buget: ariile nete vin din geometria domeniului (podea = aria interioară a camerei; față de perete = lungime × înălțime − goluri), se adaugă rebutul, se însumează pe material înainte de rotunjirea la ambalaj, iar costul se alocă pe camere. **Nu include manoperă** (linii manuale separate), transport, cheltuieli de montaj sau pierderi specifice șantierului; nu e ofertă.
