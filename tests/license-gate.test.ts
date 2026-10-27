import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — modul .mjs fără tipuri
import { evaluatePackages, flattenPnpmLicenses, parseLicense } from '../scripts/license-check.mjs';

const policy = {
  allowed: ['MIT', 'ISC', 'Apache-2.0'],
  denied: ['GPL', 'AGPL', 'LGPL', 'UNKNOWN', 'UNLICENSED'],
  exceptions: [{ package: 'tool-*', licenses: ['MPL-2.0'], scope: 'build', reason: 'test' }],
};
const pkgs = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { licenses: v }]));
const names = (r: { violations: Array<{ pkg: string }> }) => r.violations.map((v) => v.pkg).sort();

describe('politica de licențe (funcția de evaluare)', () => {
  it('acceptă licențe permise, inclusiv expresii OR/AND permise', () => {
    const r = evaluatePackages(
      pkgs({ 'a@1.0.0': 'MIT', 'b@1.0.0': '(MIT OR GPL-3.0)', 'c@1.0.0': 'MIT AND ISC' }),
      policy,
    );
    expect(r.violations).toEqual([]);
  });
  it('respinge licențe interzise (GPL, AGPL, LGPL)', () => {
    const r = evaluatePackages(
      pkgs({ 'evil@1.0.0': 'GPL-3.0', 'worse@2.0.0': 'AGPL-3.0-only', 'lg@1.0.0': 'LGPL-2.1' }),
      policy,
    );
    expect(names(r)).toEqual(['evil@1.0.0', 'lg@1.0.0', 'worse@2.0.0']);
  });
  it('respinge licențe necunoscute, nelistate sau deduse (MIT*)', () => {
    const r = evaluatePackages(
      pkgs({ 'u@1.0.0': 'UNKNOWN', 'x@1.0.0': 'Some-Custom-1.0', 'g@1.0.0': 'MIT*' }),
      policy,
    );
    expect(r.violations).toHaveLength(3);
  });
  it('AND cere ca toate componentele să fie permise', () => {
    const r = evaluatePackages(pkgs({ 'm@1.0.0': 'Apache-2.0 AND LGPL-3.0-or-later' }), policy);
    expect(r.violations).toHaveLength(1);
  });
  it('excepția explicită trece doar cu numele și licența exacte', () => {
    expect(evaluatePackages(pkgs({ 'tool-x@1.0.0': 'MPL-2.0' }), policy).violations).toEqual([]);
    expect(evaluatePackages(pkgs({ 'tool-x@1.0.0': 'GPL-3.0' }), policy).violations).toHaveLength(
      1,
    );
    expect(evaluatePackages(pkgs({ 'other@1.0.0': 'MPL-2.0' }), policy).violations).toHaveLength(1);
  });
  it('parseLicense și flattenPnpmLicenses', () => {
    expect(parseLicense('(MIT AND CC-BY-3.0)')).toEqual([['MIT'], ['CC-BY-3.0']]);
    const flat = flattenPnpmLicenses({ MIT: [{ name: '@s/p', versions: ['1.0.0', '2.0.0'] }] });
    expect(Object.keys(flat).sort()).toEqual(['@s/p@1.0.0', '@s/p@2.0.0']);
  });
});

describe('CLI scripts/license-check.mjs', () => {
  const run = (json: unknown) => {
    const file = join(mkdtempSync(join(tmpdir(), 'rc-lic-')), 'licenses.json');
    writeFileSync(file, JSON.stringify(json));
    return spawnSync(process.execPath, ['scripts/license-check.mjs', '--from-json', file], {
      encoding: 'utf8',
    });
  };
  it('o dependență GPL → cod 1 și mesaj explicit cu pachetul', () => {
    const r = run({
      'GPL-3.0': [{ name: 'pachet-gpl', versions: ['1.2.3'] }],
      MIT: [{ name: 'ok', versions: ['1.0.0'] }],
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ÎNCĂLCARE: pachet-gpl@1.2.3');
  });
  it('doar licențe permise → cod 0', () => {
    expect(run({ MIT: [{ name: 'ok', versions: ['1.0.0'] }] }).status).toBe(0);
  });
});
