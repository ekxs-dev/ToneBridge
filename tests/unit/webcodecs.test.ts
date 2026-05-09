import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildVideoDecoderConfig, planEncodedChunk, sampleDurationUs, sampleTimestampUs } from '../../src/core/webcodecs';
import { parseMp4 } from '../../src/core/mp4';

const fixture = path.resolve(__dirname, '../fixtures/dv_p5_short.mp4');

describe('WebCodecs planning', () => {
  it('converts MP4 sample timing to microseconds', () => {
    const track = parseMp4(new Uint8Array(fs.readFileSync(fixture))).tracks[0];
    const first = track.samples[0];

    expect(sampleTimestampUs(first, track.timescale)).toBe(160_000);
    expect(sampleDurationUs(first, track.timescale)).toBe(40_000);
  });

  it('plans EncodedVideoChunk init values from the MP4 sample table', () => {
    const track = parseMp4(new Uint8Array(fs.readFileSync(fixture))).tracks[0];
    const plan = planEncodedChunk(track.samples[0], track);

    expect(plan.type).toBe('key');
    expect(plan.timestamp).toBe(160_000);
    expect(plan.duration).toBe(40_000);
    expect(plan.byteLength).toBe(track.samples[0].size);
  });

  it('builds a VideoDecoderConfig with hvcC description bytes', () => {
    const track = parseMp4(new Uint8Array(fs.readFileSync(fixture))).tracks[0];
    const config = buildVideoDecoderConfig(track);

    expect(config.codec).toMatch(/^hev1\.2\./);
    expect(config.codedWidth).toBe(3840);
    expect(config.codedHeight).toBe(1608);
    expect(config.description).toBeInstanceOf(Uint8Array);
    expect((config.description as Uint8Array).byteLength).toBeGreaterThan(20);
  });
});
