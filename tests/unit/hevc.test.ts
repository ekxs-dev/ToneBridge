import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeMp4HevcSamples, parseLengthPrefixedHevcSample } from '../../src/core/hevc';
import { parseMp4 } from '../../src/core/mp4';
import rpuReference from '../references/rpu_reference.json';

const fixture = path.resolve(__dirname, '../fixtures/dv_p5_short.mp4');

describe('HEVC sample parser', () => {
  it('parses length-prefixed NAL units from the first MP4 sample', () => {
    const bytes = new Uint8Array(fs.readFileSync(fixture));
    const track = parseMp4(bytes).tracks[0];
    const firstSample = track.samples[0];
    const analysis = parseLengthPrefixedHevcSample(
      bytes.subarray(firstSample.offset, firstSample.offset + firstSample.size),
      track.hevcConfig?.lengthSize ?? 4,
    );

    expect(analysis.nalUnits.length).toBeGreaterThan(0);
    expect(analysis.rpuNalUnits.length).toBeGreaterThan(0);
    expect(analysis.nalUnitCounts['62']).toBe(analysis.rpuNalUnits.length);
  });

  it('counts RPU NAL units across all MP4 samples', () => {
    const bytes = new Uint8Array(fs.readFileSync(fixture));
    const track = parseMp4(bytes).tracks[0];
    const analysis = analyzeMp4HevcSamples(bytes, track.samples, track.hevcConfig?.lengthSize ?? 4);

    expect(analysis.rpuNalUnits).toHaveLength(rpuReference.rpuCount);
    expect(analysis.nalUnitCounts['62']).toBe(rpuReference.rpuCount);
    expect(analysis.nalUnitCounts['35']).toBe(rpuReference.nalUnitCounts['35']);
  });
});
