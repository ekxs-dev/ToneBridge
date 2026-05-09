import type { I420P10Frame } from './raw-frame';

export type GpuPreviewMode = 0 | 1 | 2;

export interface GpuFrameParams {
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  yStride: number;
  uvStride: number;
  range: 0 | 1;
  previewMode: GpuPreviewMode;
}

export interface I420P10GpuUpload {
  yPlane: Uint32Array;
  uPlane: Uint32Array;
  vPlane: Uint32Array;
  frameParamsUniform: Uint32Array;
  frameParams: GpuFrameParams;
  storageByteLength: number;
  totalByteLength: number;
}

export interface I420P10GpuUploadOptions {
  outputWidth?: number;
  outputHeight?: number;
  previewMode?: GpuPreviewMode;
}

function readU16LE(data: Uint8Array, sampleIndex: number): number {
  const byteOffset = sampleIndex * 2;
  return data[byteOffset] | (data[byteOffset + 1] << 8);
}

function copyPlaneToU32(frame: I420P10Frame, sourceOffset: number, stride: number, width: number, height: number): Uint32Array {
  const plane = new Uint32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      plane[y * width + x] = readU16LE(frame.data, sourceOffset + y * stride + x) & 0x03ff;
    }
  }
  return plane;
}

export function buildI420P10GpuUpload(frame: I420P10Frame, options: I420P10GpuUploadOptions = {}): I420P10GpuUpload {
  const chromaWidth = Math.ceil(frame.width / 2);
  const chromaHeight = Math.ceil(frame.height / 2);
  const outputWidth = Math.max(1, Math.floor(options.outputWidth ?? frame.width));
  const outputHeight = Math.max(1, Math.floor(options.outputHeight ?? frame.height));
  const yPlane = copyPlaneToU32(frame, frame.yOffset, frame.yStride, frame.width, frame.height);
  const uPlane = copyPlaneToU32(frame, frame.uOffset, frame.uvStride, chromaWidth, chromaHeight);
  const vPlane = copyPlaneToU32(frame, frame.vOffset, frame.uvStride, chromaWidth, chromaHeight);

  const frameParams: GpuFrameParams = {
    sourceWidth: frame.width,
    sourceHeight: frame.height,
    outputWidth,
    outputHeight,
    yStride: frame.yStride,
    uvStride: chromaWidth,
    range: frame.range === 'full' ? 0 : 1,
    previewMode: options.previewMode ?? 0,
  };
  const frameParamsUniform = new Uint32Array([
    frameParams.sourceWidth,
    frameParams.sourceHeight,
    frameParams.outputWidth,
    frameParams.outputHeight,
    frameParams.yStride,
    frameParams.uvStride,
    frameParams.range,
    frameParams.previewMode,
  ]);
  const storageByteLength = yPlane.byteLength + uPlane.byteLength + vPlane.byteLength;

  return {
    yPlane,
    uPlane,
    vPlane,
    frameParamsUniform,
    frameParams,
    storageByteLength,
    totalByteLength: storageByteLength + frameParamsUniform.byteLength,
  };
}
