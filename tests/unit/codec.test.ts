import { describe, expect, it } from 'vitest';
import { buildHevcCodecString, inferCodecFamily, requireHevc } from '../../src/core/codec';

describe('codec helpers', () => {
  it('builds an HEVC WebCodecs codec string', () => {
    expect(buildHevcCodecString({
      brand: 'hev1',
      profileIdc: 2,
      profileCompatibilityFlags: 0x20000000,
      levelIdc: 153,
      constraintIndicatorFlags: 0,
    })).toBe('hev1.2.4.L153.B0');
  });

  it('normalizes hvcC compatibility bit flags into codec-string bit order', () => {
    expect(buildHevcCodecString({
      brand: 'hev1',
      profileIdc: 2,
      profileCompatibilityFlags: 0x60000000,
      levelIdc: 150,
      constraintIndicatorFlags: 0,
    })).toBe('hev1.2.6.L150.B0');
  });

  it('classifies codec families', () => {
    expect(inferCodecFamily('hev1.2.4.L153.B0')).toBe('hevc');
    expect(inferCodecFamily('avc1.640028')).toBe('h264');
    expect(inferCodecFamily('vp09')).toBe('unknown');
  });

  it('rejects the bad-codec fixture path', () => {
    expect(() => requireHevc('avc1.640028')).toThrow(/Unsupported codec/);
  });
});
