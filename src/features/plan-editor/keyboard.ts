// Reguli de tastatură ale editorului 2D (accesibilitate, F-12). Pure: primesc elementul-țintă și tasta, nu ating DOM-ul global.

/**
 * Scurtăturile cu o singură tastă imprimabilă. WCAG 2.1.4: trebuie să poată fi oprite sau să acționeze doar cu focus pe
 * zona lor; aici pot fi oprite din bara de unelte („Scurtături de tastă”), iar tastele cu modificatori (Ctrl + A, Ctrl + D),
 * Delete, Escape și săgețile nu intră în această categorie.
 */
export const PRINTABLE_SHORTCUTS: ReadonlySet<string> = new Set([
  'w',
  'W',
  'v',
  'V',
  'r',
  'R',
  '0',
  '+',
  '=',
  '-',
  '_',
]);

export const isArrowKey = (key: string): boolean =>
  key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';

const INTERACTIVE =
  'button, a[href], summary, select, input, textarea, [role="tab"], [role="menuitem"], [role="option"], [role="slider"], [role="spinbutton"], [contenteditable="true"], [contenteditable=""]';

/**
 * Ținta evenimentului e un control care își folosește singur tastele (buton, tab, câmp, listă…)? Atunci săgețile și
 * scurtăturile cu o tastă ale planului nu trebuie să acționeze „nevăzut” în spatele lui.
 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as { closest?: (selector: string) => Element | null } | null;
  return typeof el?.closest === 'function' && el.closest(INTERACTIVE) !== null;
}

/**
 * Poate acționa tasta `key` asupra planului, dat fiind focusul curent și starea comutatorului de scurtături?
 * - scurtăturile cu o tastă imprimabilă: doar dacă sunt activate și focusul nu e pe un control;
 * - săgețile: doar dacă focusul nu e pe un control (tab-uri, butoane, liste le folosesc pentru navigare);
 * - în timpul plasării unei camere (`placing`), R (rotire) acționează oricare ar fi focusul: utilizatorul lucrează cu fantoma,
 *   iar focusul a rămas adesea pe butonul apăsat înainte (rămâne controlat de comutator și are și un buton);
 * - restul (Delete, Escape, tastele cu modificatori): ca până acum.
 */
export function planKeyAllowed(
  key: string,
  target: EventTarget | null,
  shortcutsEnabled: boolean,
  options: { placing?: boolean } = {},
): boolean {
  if (PRINTABLE_SHORTCUTS.has(key)) {
    if (!shortcutsEnabled) return false;
    if (options.placing && (key === 'r' || key === 'R')) return true;
    return !isInteractiveTarget(target);
  }
  if (isArrowKey(key)) return !isInteractiveTarget(target);
  return true;
}
