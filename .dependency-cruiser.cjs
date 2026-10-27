/**
 * Reguli de straturi din docs/ARCHITECTURE.md §3. Orice încălcare => `pnpm depcruise` iese cu cod ≠ 0.
 * Căile folosesc `(?:^|/)src/...` ca să poată fi verificate și pe fixture-urile din tests/fixtures/gates.
 */
const UI_LIBS =
  '(^|/)node_modules/(react|react-dom|next|konva|react-konva|three|@react-three|dexie)(/|$)';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-este-pur',
      comment:
        'domain/ poate importa doar din domain/ și zod (fără React, DOM, Konva, Three, Dexie, Node).',
      severity: 'error',
      from: { path: '(?:^|/)src/domain/' },
      to: { pathNot: ['(?:^|/)src/domain/', '(^|/)node_modules/zod(/|$)'] },
    },
    {
      name: 'persistence-fara-ui',
      comment: 'persistence/ nu importă React/UI și nu depinde de features/app/state/ui.',
      severity: 'error',
      from: { path: '(?:^|/)src/persistence/' },
      to: {
        path: ['(?:^|/)src/(features|app|state|ui)/', UI_LIBS],
        pathNot: '(^|/)node_modules/dexie(/|$)',
      },
    },
    {
      name: 'state-fara-features',
      comment: 'state/ nu depinde de features/ sau app/.',
      severity: 'error',
      from: { path: '(?:^|/)src/state/' },
      to: { path: '(?:^|/)src/(features|app)/' },
    },
    {
      name: 'state-persistence-doar-interfata',
      comment:
        'state/ depinde de persistence/ doar prin contracte (types) și erori (errors), niciodată de implementarea Dexie.',
      severity: 'error',
      from: { path: '(?:^|/)src/state/' },
      to: {
        path: '(?:^|/)src/persistence/',
        pathNot: '(?:^|/)src/persistence/(types|errors)\.ts$',
      },
    },
    {
      name: 'features-izolate',
      comment:
        'Un modul din features/ nu importă alt modul din features/ (comunicare prin state/ și domain/).',
      severity: 'error',
      from: { path: '(?:^|/)src/features/([^/]+)/' },
      to: { path: '(?:^|/)src/features/([^/]+)/', pathNot: '(?:^|/)src/features/$1/' },
    },
    {
      name: 'features-fara-persistence',
      comment: 'features/ nu importă persistence/ direct (prin state/).',
      severity: 'error',
      from: { path: '(?:^|/)src/features/' },
      to: { path: '(?:^|/)src/persistence/' },
    },
    {
      name: 'app-fara-domain',
      comment: 'app/ conține doar compoziție; logica de business nu se importă direct din domain/.',
      severity: 'error',
      from: { path: '(?:^|/)src/app/' },
      to: { path: '(?:^|/)src/domain/' },
    },
    {
      name: 'fara-dependente-circulare',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: '(^|/)(spikes|out|out-base|\\.next)(/|$)' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
