import type { Metadata } from 'next';
import licenses from '@/lib/third-party-licenses.json';
import { APP_NAME, APP_NAME_NOTE, APP_VERSION } from '@/lib/app-info';
import { dashboardHref } from '@/lib/asset';
import { ThemeToggle } from '@/ui/ThemeToggle';

export const metadata: Metadata = {
  title: `Despre, licențe și confidențialitate — ${APP_NAME}`,
  description: 'Ce face aplicația, ce se întâmplă cu datele tale și ce biblioteci folosește.',
};

interface Pkg {
  name: string;
  version: string;
  license: string;
}
const PACKAGES = licenses as Pkg[];
const byLicense = (): Array<[string, number]> => {
  const counts = new Map<string, number>();
  for (const p of PACKAGES) counts.set(p.license, (counts.get(p.license) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
};

const H2 = 'mt-10 text-2xl font-semibold tracking-tight text-stone-900';
const P = 'mt-3 max-w-3xl text-stone-700';

/** Pagina statică „Despre / Licențe / Confidențialitate” (ROADMAP Etapa 8): fără stocare, fără cereri către terți. */
export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6" data-testid="about-page">
      <div className="flex items-center justify-between gap-4">
        <a className="text-teal-800 underline" href={dashboardHref()} data-testid="about-back">
          ← Înapoi la proiecte
        </a>
        <ThemeToggle />
      </div>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">
        Despre, licențe și confidențialitate
      </h1>

      <section aria-labelledby="despre">
        <h2 id="despre" className={H2}>
          Despre {APP_NAME}
        </h2>
        <p className={P}>
          {APP_NAME} ({APP_NAME_NOTE}) este o aplicație web pentru amenajări interioare: desenezi
          camere la dimensiuni reale, plasezi mobilier, aplici finisaje și estimezi costul. Rulează
          în browser, fără cont și fără instalare. Versiune:{' '}
          <span data-testid="about-version">{APP_VERSION}</span>.
        </p>
        <p className={P}>
          Estimările de cost sunt <strong>orientative</strong>, nu ofertă. Prețurile din catalog
          sunt demonstrative (arbitrare, nu prețuri de piață) și sunt marcate ca atare în aplicație
          și în fișierele exportate. Aplicația nu înlocuiește un proiect de specialitate.
        </p>
      </section>

      <section aria-labelledby="confidentialitate">
        <h2 id="confidentialitate" className={H2}>
          Confidențialitate: datele tale rămân la tine
        </h2>
        <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-6 text-stone-700">
          <li>
            <strong>Proiectele se salvează doar pe acest dispozitiv</strong>, în baza de date a
            browserului (IndexedDB). Aplicația nu are cont, nu are server de date și nu trimite
            proiectele, desenele sau prețurile tale nicăieri.
          </li>
          <li>
            <strong>Preferințe mici</strong>, tot local (<code>localStorage</code>): dacă
            scurtăturile de tastă sunt active (<code>rc:shortcuts</code>) și data ultimei copii de
            siguranță a fiecărui proiect (<code>rc:backup:…</code>).
          </li>
          <li>
            <strong>Fără cookie-uri, fără analitice, fără reclame</strong> și fără fonturi sau
            scripturi încărcate de la terți: aplicația nu face cereri către alte site-uri.
          </li>
          <li>
            <strong>Găzduire:</strong> pagina este livrată de un server static; ca orice server web,
            acesta poate păstra jurnale tehnice (adresa IP și ora cererii). Aplicația nu adaugă
            nimic peste asta.
          </li>
          <li>
            <strong>Controlul tău:</strong> ștergi un proiect din lista de proiecte (se șterg și
            copiile lui de siguranță locale) sau ștergi toate datele site-ului din setările
            browserului. În fereastra privată a browserului, datele se pierd la închidere.
          </li>
        </ul>
        <h3 className="mt-6 text-lg font-semibold text-stone-900">
          Copii de siguranță și mutarea între dispozitive
        </h3>
        <p className={P}>
          Datele sunt legate de <strong>adresa site-ului</strong> și de browser: alt dispozitiv, alt
          browser sau alt domeniu înseamnă un spațiu de stocare gol. Dacă datele site-ului se șterg
          (sau browserul eliberează spațiu), proiectele se pierd. De aceea:
        </p>
        <ol className="mt-2 max-w-3xl list-decimal space-y-1 pl-6 text-stone-700">
          <li>
            În editor, folosește <em>Exportă copie</em> — descarcă un fișier{' '}
            <code>.roomcraft.json</code>.
          </li>
          <li>
            Pe celălalt dispozitiv (sau pe noul domeniu), în lista de proiecte, folosește{' '}
            <em>Importă proiect</em>.
          </li>
        </ol>
        <p className={P}>
          Fișierul exportat conține întregul proiect, necriptat: păstrează-l ca pe orice document
          personal. Aplicația îți amintește discret să exporți o copie atunci când trec peste 7 zile
          de la ultima.
        </p>
      </section>

      <section aria-labelledby="licente">
        <h2 id="licente" className={H2}>
          Licențe și atribuiri
        </h2>
        <p className={P}>
          {APP_NAME} este construit cu biblioteci open-source (React, Next.js, Three.js, Dexie, Zod,
          Zustand, Immer și altele). Mai jos sunt dependențele din arborele de producție, fără
          uneltele de build; unele pot să nu ajungă în pachetul final, în funcție de ce se folosește
          efectiv. Textele integrale ale licențelor se află în pachetele respective, iar lista
          completă (inclusiv uneltele de build) este în fișierul <code>THIRD_PARTY_NOTICES.md</code>{' '}
          din codul sursă.
        </p>
        <p className={P} data-testid="about-license-summary">
          {PACKAGES.length} pachete:{' '}
          {byLicense()
            .map(([license, n]) => `${n} × ${license}`)
            .join(', ')}
          .
        </p>
        <details
          className="mt-3 max-w-3xl rounded-xl border border-stone-200 bg-surface p-4"
          data-testid="about-packages"
        >
          <summary className="cursor-pointer text-sm font-semibold text-stone-900">
            Lista pachetelor și a licențelor
          </summary>
          <ul className="mt-3 columns-1 gap-6 text-sm text-stone-700 sm:columns-2">
            {PACKAGES.map((p) => (
              <li key={`${p.name}@${p.version}`} className="break-inside-avoid">
                {p.name} <span className="text-stone-500">{p.version}</span> — {p.license}
              </li>
            ))}
          </ul>
        </details>
        <p className={P}>
          Obiectele din catalog, finisajele și texturile procedurale au fost create pentru acest
          proiect; nu provin din surse terțe și nu folosesc imagini, fonturi sau modele 3D externe.
        </p>
      </section>

      <p className="mt-12 text-sm text-stone-500">
        <a className="text-teal-800 underline" href={dashboardHref()}>
          ← Înapoi la proiecte
        </a>
      </p>
    </main>
  );
}
