import {
  bt2020ToBt709,
  bt1886Oetf,
  doviIptToLms,
  doviLmsToBt2020,
  libplaceboSoftclipRgb,
  normalizeYuv10Sample,
  bt2390ToneMap,
  pqEotf,
  yuvBt2020ToRgb,
} from './color';

export type YuvRange = 'full' | 'limited';

export interface I420P10Frame {
  width: number;
  height: number;
  yStride: number;
  uvStride: number;
  yOffset: number;
  uOffset: number;
  vOffset: number;
  range: YuvRange;
  data: Uint8Array;
}

export interface SdrPreviewImage {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
  stats: {
    averageRgb: [number, number, number];
    nonBlackPixels: number;
  };
}

export type RawPreviewMode = 'sdr-approx' | 'raw-luma' | 'dv-p5-base';

export interface RawPlaneStats {
  min: number;
  max: number;
  average: number;
  nonZeroSamples: number;
  sampledSamples: number;
  firstSamples: number[];
}

export interface RawFrameStats {
  y: RawPlaneStats;
  u: RawPlaneStats;
  v: RawPlaneStats;
}

export function expectedI420P10ByteLength(width: number, height: number): number {
  const chromaWidth = Math.ceil(width / 2);
  const chromaHeight = Math.ceil(height / 2);
  return (width * height + chromaWidth * chromaHeight * 2) * 2;
}

export function createI420P10Frame(data: Uint8Array, width: number, height: number, range: YuvRange = 'full'): I420P10Frame {
  const expectedBytes = expectedI420P10ByteLength(width, height);
  if (data.byteLength < expectedBytes) {
    throw new Error(`I420P10 frame is too small: expected ${expectedBytes} bytes, got ${data.byteLength}.`);
  }

  const ySamples = width * height;
  const uvStride = Math.ceil(width / 2);
  const uvSamples = uvStride * Math.ceil(height / 2);
  return {
    width,
    height,
    yStride: width,
    uvStride,
    yOffset: 0,
    uOffset: ySamples,
    vOffset: ySamples + uvSamples,
    range,
    data,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function readU16LE(data: Uint8Array, sampleIndex: number): number {
  const byteOffset = sampleIndex * 2;
  return data[byteOffset] | (data[byteOffset + 1] << 8);
}

function inspectPlane(
  frame: I420P10Frame,
  sourceOffset: number,
  stride: number,
  width: number,
  height: number,
  maxSamples = 200_000,
): RawPlaneStats {
  const totalSamples = width * height;
  const step = Math.max(1, Math.floor(totalSamples / maxSamples));
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let nonZeroSamples = 0;
  let sampledSamples = 0;
  const firstSamples: number[] = [];

  for (let sample = 0; sample < totalSamples; sample += step) {
    const y = Math.floor(sample / width);
    const x = sample - y * width;
    const value = readU16LE(frame.data, sourceOffset + y * stride + x) & 0x03ff;
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    if (value !== 0) nonZeroSamples += 1;
    if (firstSamples.length < 12) firstSamples.push(value);
    sampledSamples += 1;
  }

  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
    average: sampledSamples > 0 ? sum / sampledSamples : 0,
    nonZeroSamples,
    sampledSamples,
    firstSamples,
  };
}

export function inspectI420P10Frame(frame: I420P10Frame): RawFrameStats {
  const chromaWidth = Math.ceil(frame.width / 2);
  const chromaHeight = Math.ceil(frame.height / 2);
  return {
    y: inspectPlane(frame, frame.yOffset, frame.yStride, frame.width, frame.height),
    u: inspectPlane(frame, frame.uOffset, frame.uvStride, chromaWidth, chromaHeight),
    v: inspectPlane(frame, frame.vOffset, frame.uvStride, chromaWidth, chromaHeight),
  };
}

function srgbEncode(linear: number): number {
  const value = clamp01(linear);
  if (value <= 0.0031308) return value * 12.92;
  return 1.055 * value ** (1 / 2.4) - 0.055;
}

export function convertI420P10ToSdrPreview(frame: I420P10Frame, maxWidth = 960): SdrPreviewImage {
  const width = Math.max(1, Math.min(frame.width, maxWidth));
  const height = Math.max(1, Math.round((width / frame.width) * frame.height));
  const pixels = new Uint8ClampedArray(width * height * 4);
  const scaleX = frame.width / width;
  const scaleY = frame.height / height;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let nonBlackPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(frame.height - 1, Math.floor(y * scaleY));
    const chromaY = Math.floor(sourceY / 2);
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(frame.width - 1, Math.floor(x * scaleX));
      const chromaX = Math.floor(sourceX / 2);
      const ySample = readU16LE(frame.data, frame.yOffset + sourceY * frame.yStride + sourceX) & 0x03ff;
      const uSample = readU16LE(frame.data, frame.uOffset + chromaY * frame.uvStride + chromaX) & 0x03ff;
      const vSample = readU16LE(frame.data, frame.vOffset + chromaY * frame.uvStride + chromaX) & 0x03ff;

      const yCode = normalizeYuv10Sample(ySample, frame.range, 'y');
      const uCode = normalizeYuv10Sample(uSample, frame.range, 'uv');
      const vCode = normalizeYuv10Sample(vSample, frame.range, 'uv');
      const rgb2020Code = yuvBt2020ToRgb(yCode, uCode, vCode).map(clamp01) as [number, number, number];
      const rgb2020Nits: [number, number, number] = [
        pqEotf(rgb2020Code[0]),
        pqEotf(rgb2020Code[1]),
        pqEotf(rgb2020Code[2]),
      ];
      const rgb709Nits = bt2020ToBt709(rgb2020Nits).map((value) => Math.max(0, value)) as [number, number, number];
      const rgbMapped = libplaceboSoftclipRgb([
        bt2390ToneMap(rgb709Nits[0]),
        bt2390ToneMap(rgb709Nits[1]),
        bt2390ToneMap(rgb709Nits[2]),
      ]);
      const rgbSdr: [number, number, number] = rgbMapped.map((value) => bt1886Oetf(value)) as [number, number, number];
      const offset = (y * width + x) * 4;
      const r = Math.round(rgbSdr[0] * 255);
      const g = Math.round(rgbSdr[1] * 255);
      const b = Math.round(rgbSdr[2] * 255);
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = 255;
      totalR += r;
      totalG += g;
      totalB += b;
      if (r > 2 || g > 2 || b > 2) nonBlackPixels += 1;
    }
  }

  const count = width * height;
  return {
    width,
    height,
    data: pixels,
    stats: {
      averageRgb: [totalR / count, totalG / count, totalB / count],
      nonBlackPixels,
    },
  };
}

export function convertI420P10ToDoviP5BasePreview(frame: I420P10Frame, maxWidth = 960): SdrPreviewImage {
  const width = Math.max(1, Math.min(frame.width, maxWidth));
  const height = Math.max(1, Math.round((width / frame.width) * frame.height));
  const pixels = new Uint8ClampedArray(width * height * 4);
  const scaleX = frame.width / width;
  const scaleY = frame.height / height;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let nonBlackPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(frame.height - 1, Math.floor(y * scaleY));
    const chromaY = Math.floor(sourceY / 2);
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(frame.width - 1, Math.floor(x * scaleX));
      const chromaX = Math.floor(sourceX / 2);
      const ySample = readU16LE(frame.data, frame.yOffset + sourceY * frame.yStride + sourceX) & 0x03ff;
      const uSample = readU16LE(frame.data, frame.uOffset + chromaY * frame.uvStride + chromaX) & 0x03ff;
      const vSample = readU16LE(frame.data, frame.vOffset + chromaY * frame.uvStride + chromaX) & 0x03ff;

      const iCode = normalizeYuv10Sample(ySample, frame.range, 'y');
      const pCode = normalizeYuv10Sample(uSample, frame.range, 'uv') - 0.5;
      const tCode = normalizeYuv10Sample(vSample, frame.range, 'uv') - 0.5;
      const lmsCode = doviIptToLms([iCode, pCode, tCode]).map(clamp01) as [number, number, number];
      const lmsNits: [number, number, number] = [
        pqEotf(lmsCode[0]),
        pqEotf(lmsCode[1]),
        pqEotf(lmsCode[2]),
      ];
      const rgb2020Nits = doviLmsToBt2020(lmsNits);
      const rgb709Nits = bt2020ToBt709(rgb2020Nits).map((value) => Math.max(0, value)) as [number, number, number];
      const rgbMapped = libplaceboSoftclipRgb([
        bt2390ToneMap(rgb709Nits[0]),
        bt2390ToneMap(rgb709Nits[1]),
        bt2390ToneMap(rgb709Nits[2]),
      ]);
      const rgbSdr: [number, number, number] = rgbMapped.map((value) => bt1886Oetf(value)) as [number, number, number];
      const offset = (y * width + x) * 4;
      const r = Math.round(rgbSdr[0] * 255);
      const g = Math.round(rgbSdr[1] * 255);
      const b = Math.round(rgbSdr[2] * 255);
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = 255;
      totalR += r;
      totalG += g;
      totalB += b;
      if (r > 2 || g > 2 || b > 2) nonBlackPixels += 1;
    }
  }

  const count = width * height;
  return {
    width,
    height,
    data: pixels,
    stats: {
      averageRgb: [totalR / count, totalG / count, totalB / count],
      nonBlackPixels,
    },
  };
}

export function convertI420P10ToLumaPreview(frame: I420P10Frame, maxWidth = 960): SdrPreviewImage {
  const width = Math.max(1, Math.min(frame.width, maxWidth));
  const height = Math.max(1, Math.round((width / frame.width) * frame.height));
  const pixels = new Uint8ClampedArray(width * height * 4);
  const scaleX = frame.width / width;
  const scaleY = frame.height / height;
  let total = 0;
  let nonBlackPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(frame.height - 1, Math.floor(y * scaleY));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(frame.width - 1, Math.floor(x * scaleX));
      const ySample = readU16LE(frame.data, frame.yOffset + sourceY * frame.yStride + sourceX) & 0x03ff;
      const yCode = normalizeYuv10Sample(ySample, frame.range, 'y');
      const value = Math.round(srgbEncode(yCode) * 255);
      const offset = (y * width + x) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
      total += value;
      if (value > 2) nonBlackPixels += 1;
    }
  }

  const count = width * height;
  const average = total / count;
  return {
    width,
    height,
    data: pixels,
    stats: {
      averageRgb: [average, average, average],
      nonBlackPixels,
    },
  };
}
