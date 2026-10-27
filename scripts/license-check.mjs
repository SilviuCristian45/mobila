// Verificarea licențelor dependențelor (poartă CI). Utilizare:
//   node scripts/license-check.mjs [--start <dir>] [--policy <fișier>] [--production] [--notices <fișier>] [--from-json <fișier>]
// Cod de ieșire: 0 = conform politicii, 1 = încălcări, 2 = eroare de rulare.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const globToRegExp = (glob) =>
  new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

const nameOf = (key) => key.slice(0, key.lastIndexOf('@'));

/** Normalizează expresia de licență în listă de grupuri AND, fiecare cu alternative OR. */
export function parseLicense(raw) {
  const text = Array.isArray(raw) ? raw.join(' AND ') : String(raw ?? 'UNKNOWN');
  return text
    .replace(/[()]/g, ' ')
    .split(/\s+AND\s+/i)
    .map((group) =>
      group
        .split(/\s+OR\s+/i)
        .map((p) => p.trim())
        .filter(Boolean),
    );
}

function classifyPart(part, policy) {
  const upper = part.toUpperCase();
  if (policy.denied.some((d) => upper.startsWith(d.toUpperCase()))) return 'denied';
  if (part.endsWith('*')) return 'unknown'; // licență dedusă de unealtă, neconfirmată
  return policy.allowed.includes(part) ? 'allowed' : 'unknown';
}

/**
 * @returns {{violations: Array<{pkg:string, license:string, reason:string}>, usedExceptions:Set<number>, checked:number}}
 */
export function evaluatePackages(packages, policy) {
  const violations = [];
  const usedExceptions = new Set();
  const exceptionRes = (policy.exceptions ?? []).map((e) => ({
    ...e,
    re: globToRegExp(e.package),
  }));
  for (const [key, info] of Object.entries(packages)) {
    const license = Array.isArray(info.licenses)
      ? info.licenses.join(' AND ')
      : String(info.licenses ?? 'UNKNOWN');
    const groups = parseLicense(info.licenses);
    const verdicts = groups.map((alts) => alts.map((p) => classifyPart(p, policy)));
    const groupOk = verdicts.map((v) => v.includes('allowed'));
    if (groupOk.every(Boolean)) continue;
    const exIndex = exceptionRes.findIndex(
      (e) => e.re.test(nameOf(key)) && e.licenses.includes(license),
    );
    if (exIndex >= 0) {
      usedExceptions.add(exIndex);
      continue;
    }
    const denied = verdicts.flat().includes('denied');
    violations.push({
      pkg: key,
      license,
      reason: denied ? 'licență interzisă' : 'licență în afara listei de permiși (sau necunoscută)',
    });
  }
  return { violations, usedExceptions, checked: Object.keys(packages).length };
}

/** Aplatizează ieșirea `pnpm licenses list --json` ({licență: [{name, versions, homepage}]}) în {"nume@versiune": {licenses, repository}}. */
export function flattenPnpmLicenses(json) {
  const out = {};
  for (const [license, list] of Object.entries(json)) {
    for (const pkg of list) {
      for (const version of pkg.versions ?? ['0.0.0'])
        out[`${pkg.name}@${version}`] = { licenses: license, repository: pkg.homepage };
    }
  }
  return out;
}

/** pnpm citește tot arborele (inclusiv tranzitive din `.pnpm`); license-checker nu vede decât dependențele directe în layout-ul pnpm. */
function scan(start, production) {
  const args = ['licenses', 'list', '--json', ...(production ? ['--prod'] : [])];
  const r = spawnSync('pnpm', args, {
    cwd: start,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0)
    throw new Error(`pnpm ${args.join(' ')} a eșuat (cod ${r.status}): ${r.stderr || r.stdout}`);
  return flattenPnpmLicenses(JSON.parse(r.stdout));
}

function writeNotices(file, packages) {
  const rows = Object.entries(packages)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, i]) =>
        `- ${key} — ${Array.isArray(i.licenses) ? i.licenses.join(' AND ') : i.licenses}${i.repository ? ` — ${i.repository}` : ''}`,
    );
  const body = [
    '# Notificări terțe (generat automat, doar dependențe de producție)',
    '',
    'Generat de `pnpm license:notices`. Conține lista pachetelor și a licențelor; textele integrale ale licențelor',
    'și fișierele NOTICE (Apache-2.0) se adaugă înaintea lansării publice (Etapa 8).',
    '',
    ...rows,
    '',
  ].join('\n');
  writeFileSync(file, body, 'utf8');
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const start = arg('--start') ?? process.cwd();
  const policyFile = arg('--policy') ?? new URL('../license-policy.json', import.meta.url);
  const production = argv.includes('--production');
  const policy = JSON.parse(readFileSync(policyFile, 'utf8'));
  const fromJson = arg('--from-json'); // doar pentru teste: ieșire pnpm pre-generată
  const load = (prod) =>
    fromJson ? flattenPnpmLicenses(JSON.parse(readFileSync(fromJson, 'utf8'))) : scan(start, prod);
  const packages = load(production);
  const { violations, usedExceptions, checked } = evaluatePackages(packages, policy);
  const notices = arg('--notices');
  if (notices) {
    writeNotices(notices, load(true));
    console.log(`Scris ${notices}`);
  }
  console.log(`license:check — ${checked} pachete verificate, ${violations.length} încălcări.`);
  (policy.exceptions ?? []).forEach((e, i) => {
    if (!usedExceptions.has(i))
      console.warn(
        `AVERTISMENT: excepția „${e.package}” nu mai este folosită; elimin-o din license-policy.json.`,
      );
  });
  if (violations.length > 0) {
    for (const v of violations) console.error(`ÎNCĂLCARE: ${v.pkg} — ${v.license} — ${v.reason}`);
    console.error(
      'Politica: license-policy.json. O excepție se adaugă doar după revizuire manuală, cu motiv și domeniu.',
    );
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(e);
    process.exit(2);
  }
}
