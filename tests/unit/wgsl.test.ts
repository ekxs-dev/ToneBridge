import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const shaderPath = path.resolve(__dirname, '../../src/gpu/dv-p5-to-sdr.wgsl');

describe('WGSL shader source', () => {
  it('does not use known Chrome WGSL reserved identifiers as local names', () => {
    const source = fs.readFileSync(shaderPath, 'utf8');

    expect(source).not.toMatch(/\b(?:let|var)\s+meta\b/);
  });
});
