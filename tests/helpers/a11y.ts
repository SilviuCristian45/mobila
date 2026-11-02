// Verificator minimal de accesibilitate pentru teste (fără dependențe noi): prinde clasele de defecte cele mai frecvente și
// cele mai ieftin de evitat. Nu înlocuiește un audit cu cititor de ecran real.

const hidden = (el: Element): boolean =>
  el.closest('[hidden], [aria-hidden="true"]') !== null ||
  (el instanceof HTMLInputElement && el.type === 'hidden');

function textOfRefs(root: Document, ids: string | null): string {
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map((id) => root.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim();
}

/** Numele accesibil (simplificat): aria-labelledby, aria-label, conținut text, alt al imaginilor din interior, title. */
export function accessibleName(el: Element): string {
  const doc = el.ownerDocument;
  const byRef = textOfRefs(doc, el.getAttribute('aria-labelledby'));
  if (byRef) return byRef;
  const label = el.getAttribute('aria-label')?.trim();
  if (label) return label;
  const alts = Array.from(el.querySelectorAll('img[alt]')).map((i) =>
    i.getAttribute('alt')!.trim(),
  );
  const text = ((el.textContent ?? '').trim() + ' ' + alts.join(' ')).trim();
  if (text) return text;
  return el.getAttribute('title')?.trim() ?? '';
}

function fieldLabelled(el: HTMLElement): boolean {
  if (accessibleName(el)) return true;
  const doc = el.ownerDocument;
  if (
    el.id &&
    Array.from(doc.querySelectorAll('label[for]')).some((l) => l.getAttribute('for') === el.id)
  )
    return true;
  return el.closest('label') !== null;
}

/** Lista problemelor găsite (goală = nimic de raportat). */
export function a11yIssues(root: ParentNode, where = 'pagina'): string[] {
  const issues: string[] = [];
  const doc = (root as Element).ownerDocument ?? (root as Document);
  const q = <T extends Element>(sel: string) => Array.from(root.querySelectorAll<T>(sel));
  const id = (el: Element) =>
    `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}`;

  for (const el of q('button, a[href], [role="button"], [role="tab"], summary')) {
    if (hidden(el)) continue;
    if (!accessibleName(el)) issues.push(`${where}: control fără nume accesibil: ${id(el)}`);
  }
  for (const el of q<HTMLElement>('input, select, textarea')) {
    if (hidden(el)) continue;
    if (el instanceof HTMLInputElement && ['hidden', 'submit', 'button'].includes(el.type))
      continue;
    if (!fieldLabelled(el)) issues.push(`${where}: câmp fără etichetă: ${id(el)}`);
  }
  for (const el of q('img')) {
    if (hidden(el)) continue;
    if (!el.hasAttribute('alt') && el.getAttribute('role') !== 'presentation')
      issues.push(`${where}: imagine fără alt: ${id(el)}`);
  }
  for (const el of q('svg[role="img"]')) {
    if (!accessibleName(el)) issues.push(`${where}: svg role=img fără nume: ${id(el)}`);
  }
  for (const el of q('[role="dialog"], [role="alertdialog"]')) {
    if (!accessibleName(el)) issues.push(`${where}: dialog fără nume: ${id(el)}`);
  }
  // id-uri duplicate
  const seen = new Map<string, number>();
  for (const el of q('[id]')) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
  for (const [k, n] of seen) if (n > 1) issues.push(`${where}: id duplicat „${k}” (${n}×)`);
  // referințe ARIA către id-uri inexistente
  for (const el of q('[aria-labelledby], [aria-describedby], [aria-controls]')) {
    for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      for (const ref of v.split(/\s+/))
        if (!doc.getElementById(ref))
          issues.push(`${where}: ${attr}="${ref}" nu există (${id(el)})`);
    }
  }
  // tab-uri: în tablist, exact unul selectat
  for (const list of q('[role="tablist"]')) {
    const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
    if (tabs.length === 0) issues.push(`${where}: tablist fără tab-uri`);
    const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true').length;
    if (tabs.length > 0 && selected !== 1)
      issues.push(`${where}: tablist cu ${selected} tab-uri selectate`);
  }
  for (const tab of q('[role="tab"]'))
    if (!tab.closest('[role="tablist"]')) issues.push(`${where}: tab în afara unui tablist`);
  // ordinea de tab naturală: fără tabindex pozitiv
  for (const el of q<HTMLElement>('[tabindex]'))
    if (Number(el.getAttribute('tabindex')) > 0)
      issues.push(`${where}: tabindex pozitiv (${id(el)})`);
  return issues;
}
