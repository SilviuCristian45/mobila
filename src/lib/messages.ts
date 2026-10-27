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
