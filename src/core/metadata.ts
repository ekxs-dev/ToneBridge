export interface FrameMetadata {
  timestamp: number;
  poc: number;
  rpuIndex: number;
}

export function metadataForTimestamp(frames: FrameMetadata[], timestamp: number): FrameMetadata | null {
  return frames.find((frame) => frame.timestamp === timestamp) ?? null;
}

export function sortByDisplayTimestamp(frames: FrameMetadata[]): FrameMetadata[] {
  return [...frames].sort((a, b) => a.timestamp - b.timestamp);
}

export function sortByPoc(frames: FrameMetadata[]): FrameMetadata[] {
  return [...frames].sort((a, b) => a.poc - b.poc);
}

export interface DoviCompactMetadata {
  nonlinearOffset: [number, number, number];
  nonlinearMatrix: number[];
  linearMatrix: number[];
  sourceMinPq: number;
  sourceMaxPq: number;
  pivots: number[];
  polyCoeffs: number[];
  mmrCoeffs: number[];
}

export const COMPACT_DOVI_LAYOUT = {
  nonlinearOffset: 0,
  nonlinearMatrix: 4,
  linearMatrix: 16,
  sourcePq: 28,
  pivots: 32,
  polyCoeffs: 60,
  mmrCoeffs: 132,
  float32Count: 276,
} as const;

export const COMPACT_DOVI_FLOAT32_COUNT = COMPACT_DOVI_LAYOUT.float32Count;

function packVec4Rows(floats: Float32Array, offset: number, values: number[], rowCount: number, rowWidth: number): void {
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < rowWidth; column += 1) {
      floats[offset + row * 4 + column] = values[row * rowWidth + column] ?? 0;
    }
  }
}

export function packCompactDoviMetadata(metadata: DoviCompactMetadata): ArrayBuffer {
  const floats = new Float32Array(COMPACT_DOVI_FLOAT32_COUNT);
  floats.set(metadata.nonlinearOffset, COMPACT_DOVI_LAYOUT.nonlinearOffset);
  packVec4Rows(floats, COMPACT_DOVI_LAYOUT.nonlinearMatrix, metadata.nonlinearMatrix, 3, 3);
  packVec4Rows(floats, COMPACT_DOVI_LAYOUT.linearMatrix, metadata.linearMatrix, 3, 3);
  floats[COMPACT_DOVI_LAYOUT.sourcePq] = metadata.sourceMinPq;
  floats[COMPACT_DOVI_LAYOUT.sourcePq + 1] = metadata.sourceMaxPq;
  floats.set(metadata.pivots.slice(0, 28), COMPACT_DOVI_LAYOUT.pivots);
  floats.set(metadata.polyCoeffs.slice(0, 72), COMPACT_DOVI_LAYOUT.polyCoeffs);
  floats.set(metadata.mmrCoeffs.slice(0, 144), COMPACT_DOVI_LAYOUT.mmrCoeffs);
  return floats.buffer;
}

export function createIdentityDoviMetadata(): DoviCompactMetadata {
  return {
    nonlinearOffset: [0, 0, 0],
    nonlinearMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    linearMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    sourceMinPq: 0,
    sourceMaxPq: 1,
    pivots: [0, 1],
    polyCoeffs: [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    mmrCoeffs: [],
  };
}
