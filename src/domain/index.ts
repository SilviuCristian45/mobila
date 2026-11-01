// Nucleul domeniului: TypeScript pur, fără React, DOM sau API-uri de platformă. Importă doar `zod`.
export * from './schema';
export * from './factory';
export * from './errors';
export * from './result';
export * from './trace';
export * from './money';
export * from './geometry';
export * from './quantities';
export * from './budget';
export * from './budget/csv'; // separat de `budget/index` ca să nu creeze ciclu (csv importă tipurile bugetului)
export * from './budget/xlsx'; // la fel ca csv
export * from './scene';
export * from './integrity';
export * from './cascade';
export * from './edit';
export * from './objects';
export * from './finishes';
export * from './placement';
export { stableHash } from './hash';
export * from './io';
