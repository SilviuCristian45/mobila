// Citirea unui fișier ales de utilizator (import): cu verificarea mărimii ÎNAINTE de citire, ca un fișier uriaș să nu intre în memorie.

export type ReadResult = { ok: true; text: string } | { ok: false; reason: 'size' | 'read' };

/** Citește fișierul ca text UTF-8; refuză (fără să-l citească) un fișier mai mare de `maxBytes`. */
export async function readTextFile(file: File, maxBytes: number): Promise<ReadResult> {
  if (file.size > maxBytes) return { ok: false, reason: 'size' };
  try {
    if (typeof file.text === 'function') return { ok: true, text: await file.text() };
    // rezervă pentru medii fără `Blob.text` (ex. jsdom)
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
    return { ok: true, text };
  } catch {
    return { ok: false, reason: 'read' };
  }
}
