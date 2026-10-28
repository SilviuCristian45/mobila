// Mesaje în limba română pentru erorile stratului de stare/persistență (tipuri importate doar ca tipuri).
import type { MutationFailure, OpenFailure } from '@/state/manager';
import type { StorageFailure } from '@/persistence/types';

export function describeStorageFailure(f: StorageFailure): { title: string; detail: string } {
  switch (f.kind) {
    case 'quota':
      return {
        title: 'Spațiul de stocare este plin',
        detail:
          'Browserul nu mai are loc pentru date. Modificările rămân în memorie: exportă o copie de siguranță și eliberează spațiu.',
      };
    case 'unavailable':
      return {
        title: 'Stocarea locală nu este disponibilă',
        detail:
          'Browserul blochează sau nu oferă IndexedDB (de ex. mod privat sau date de site blocate). Proiectele nu pot fi salvate sau citite.',
      };
    default:
      return { title: 'Eroare de stocare', detail: f.message };
  }
}

export function describeOpenFailure(f: OpenFailure): { title: string; detail: string } {
  switch (f.kind) {
    case 'not-found':
      return {
        title: 'Proiectul nu există',
        detail:
          'Nu am găsit niciun proiect cu acest identificator pe acest dispozitiv. Poate a fost șters sau aparține altui browser.',
      };
    case 'corrupt':
      return {
        title:
          f.stage === 'version' ? 'Proiect creat cu o versiune mai nouă' : 'Proiectul este invalid',
        detail:
          f.stage === 'version'
            ? 'Proiectul a fost salvat de o versiune mai nouă a aplicației și nu poate fi deschis aici.'
            : `Datele salvate nu respectă formatul așteptat (${f.errors[0] ?? f.stage}). Nu s-a șters nimic.`,
      };
    default:
      return describeStorageFailure(f.error);
  }
}

export function describeMutationFailure(f: MutationFailure): string {
  switch (f.kind) {
    case 'invalid-name':
    case 'conflict':
    case 'open-elsewhere':
      return f.message;
    case 'not-found':
      return 'Proiectul nu mai există.';
    default:
      return describeStorageFailure(f.error).detail;
  }
}

const GEOMETRY_MESSAGES: Record<string, string> = {
  'wall-crossing': 'Un perete s-ar încrucișa cu altul fără un nod comun.',
  'node-on-wall': 'Un nod ar ajunge pe un perete fără să-l împartă.',
  'nodes-coincide': 'Două noduri ar ajunge în același punct.',
  'wall-degenerate': 'Un perete ar avea lungime zero.',
  'wall-duplicate': 'Ar exista doi pereți între aceleași două noduri.',
  'wall-angle-too-sharp': 'Unghiul dintre doi pereți ar fi prea ascuțit (sub 10°).',
  'wall-too-short-for-joins': 'Un perete ar fi prea scurt pentru îmbinările lui.',
  'room-not-simple': 'Conturul unei camere s-ar autointersecta.',
  'room-collapsed': 'Grosimea pereților ar consuma o cameră.',
  'room-loop-invalid': 'O cameră ar deveni invalidă.',
  'room-wall-missing': 'O cameră și-ar pierde un perete.',
  'room-wall-reused': 'O cameră ar folosi același perete de două ori.',
  'opening-out-of-range':
    'Un gol ar ieși din porțiunea dreaptă a peretelui sau ar fi prea aproape de capăt.',
  'opening-overlap': 'Un gol s-ar suprapune cu alt gol sau ar fi prea aproape de el.',
  'opening-too-tall': 'Un gol ar depăși înălțimea peretelui.',
  'too-many-walls': 'Planul are prea mulți pereți pentru validare.',
};

/** Mesaj pentru utilizator după o modificare respinsă de `ProjectSession` (erorile de integritate se termină cu `[cod]`). */
export function describeCommitFailure(f: { message: string; errors?: string[] }): string {
  const known = new Set<string>();
  for (const e of f.errors ?? []) {
    const code = /\[([a-z-]+)\]$/.exec(e)?.[1];
    const text = code ? GEOMETRY_MESSAGES[code] : undefined;
    if (text) known.add(text);
  }
  return known.size > 0 ? `Modificare respinsă. ${[...known].join(' ')}` : f.message;
}
