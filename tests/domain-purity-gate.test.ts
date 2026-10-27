import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Poarta de puritate a domeniului (ESLint): API-uri de browser/platformă, ceas, aleatoriu, React și Node sunt interzise în src/domain/.
const eslint = new ESLint({ cwd: process.cwd() });
const lint = async (code: string, filePath = 'src/domain/__probe__.ts') =>
  (await eslint.lintText(code, { filePath }))[0]!.messages;

describe('src/domain/ este TypeScript pur (ESLint)', () => {
  it('cod pur → fără mesaje', async () => {
    expect(await lint('export const f = (a: number): number => a + 1;\n')).toEqual([]);
  });
  const forbidden: Array<[string, string, string]> = [
    ['window', 'export const w = window.innerWidth;\n', 'no-restricted-globals'],
    ['document', 'export const t = document.title;\n', 'no-restricted-globals'],
    ['localStorage', 'export const v = localStorage.getItem("x");\n', 'no-restricted-globals'],
    ['indexedDB', 'export const db = indexedDB;\n', 'no-restricted-globals'],
    ['fetch', 'export const f = () => fetch("/x");\n', 'no-restricted-globals'],
    ['TextEncoder', 'export const e = new TextEncoder();\n', 'no-restricted-globals'],
    [
      'structuredClone',
      'export const c = (x: object) => structuredClone(x);\n',
      'no-restricted-globals',
    ],
    ['crypto', 'export const id = () => crypto.randomUUID();\n', 'no-restricted-globals'],
    ['process', 'export const p = process.env.X;\n', 'no-restricted-globals'],
    ['Date.now', 'export const n = () => Date.now();\n', 'no-restricted-properties'],
    ['Math.random', 'export const r = () => Math.random();\n', 'no-restricted-properties'],
    ['new Date', 'export const d = () => new Date();\n', 'no-restricted-syntax'],
    [
      'import react',
      'import React from "react";\nexport const x = React;\n',
      'no-restricted-imports',
    ],
    [
      'import next/link',
      'import Link from "next/link";\nexport const x = Link;\n',
      'no-restricted-imports',
    ],
    [
      'import konva',
      'import Konva from "konva";\nexport const x = Konva;\n',
      'no-restricted-imports',
    ],
    ['import three', 'import * as T from "three";\nexport const x = T;\n', 'no-restricted-imports'],
    [
      'import dexie',
      'import Dexie from "dexie";\nexport const x = Dexie;\n',
      'no-restricted-imports',
    ],
    [
      'import node:fs',
      'import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n',
      'no-restricted-imports',
    ],
    [
      'import @/features',
      'import { a } from "@/features/x";\nexport const x = a;\n',
      'no-restricted-imports',
    ],
  ];
  for (const [name, code, rule] of forbidden) {
    it(`respinge: ${name}`, async () => {
      const msgs = await lint(code);
      expect(msgs.map((m) => m.ruleId)).toContain(rule);
      expect(msgs.some((m) => m.severity === 2)).toBe(true);
    });
  }
  it('aceleași construcții sunt permise în afara domeniului (regula e specifică domeniului)', async () => {
    const msgs = await lint('export const w = window.innerWidth;\n', 'src/lib/__probe__.ts');
    expect(msgs.map((m) => m.ruleId)).not.toContain('no-restricted-globals');
  });
});
