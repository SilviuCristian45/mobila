// Descărcare de fișiere în browser (Blob + <a download>). Doar pe client.

/** Nume de fișier sigur: fără diacritice, litere/cifre/cratime, cu fallback. */
export function safeFileStem(name: string, fallback = 'proiect'): string {
  const stem = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return stem || fallback;
}

export const backupFileName = (projectName: string): string =>
  `${safeFileStem(projectName)}.roomcraft.json`;

export function downloadTextFile(fileName: string, text: string, mime = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
