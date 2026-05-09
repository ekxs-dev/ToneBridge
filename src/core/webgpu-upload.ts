import type { I420P10GpuUpload } from './gpu-upload';

interface GpuBufferLike {
  destroy(): void;
}

interface GpuDeviceLike {
  queue: {
    writeBuffer(buffer: GpuBufferLike, offset: number, data: ArrayBufferLike, dataOffset: number, size: number): void;
    onSubmittedWorkDone(): Promise<void>;
  };
  createBuffer(descriptor: { size: number; usage: number }): GpuBufferLike;
  destroy(): void;
}

interface GpuAdapterLike {
  requestDevice(): Promise<GpuDeviceLike>;
}

interface GpuNavigatorLike {
  requestAdapter(): Promise<GpuAdapterLike | null>;
}

export interface WebGpuUploadProbe {
  attempted: boolean;
  ok: boolean;
  elapsedMs: number;
  bytes: number;
  buffers: number;
  error: string | null;
}

function unavailable(error: string): WebGpuUploadProbe {
  return {
    attempted: false,
    ok: false,
    elapsedMs: 0,
    bytes: 0,
    buffers: 0,
    error,
  };
}

function uploadArray(device: GpuDeviceLike, usage: number, data: Uint32Array): GpuBufferLike {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage,
  });
  device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength);
  return buffer;
}

export async function uploadI420P10ToWebGpu(upload: I420P10GpuUpload): Promise<WebGpuUploadProbe> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return unavailable('WebGPU is unavailable in this environment.');
  }
  const bufferUsage = (globalThis as { GPUBufferUsage?: Record<string, number> }).GPUBufferUsage;
  if (!bufferUsage) {
    return unavailable('GPUBufferUsage is unavailable in this environment.');
  }

  const startedAt = performance.now();
  const gpu = (navigator as Navigator & { gpu: GpuNavigatorLike }).gpu;
  const buffers: GpuBufferLike[] = [];
  let device: GpuDeviceLike | null = null;
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return {
        attempted: true,
        ok: false,
        elapsedMs: performance.now() - startedAt,
        bytes: 0,
        buffers: 0,
        error: 'WebGPU adapter request returned null.',
      };
    }

    device = await adapter.requestDevice();
    const storageUsage = bufferUsage.STORAGE | bufferUsage.COPY_DST;
    const uniformUsage = bufferUsage.UNIFORM | bufferUsage.COPY_DST;
    buffers.push(uploadArray(device, storageUsage, upload.yPlane));
    buffers.push(uploadArray(device, storageUsage, upload.uPlane));
    buffers.push(uploadArray(device, storageUsage, upload.vPlane));
    buffers.push(uploadArray(device, uniformUsage, upload.frameParamsUniform));
    await device.queue.onSubmittedWorkDone();

    return {
      attempted: true,
      ok: true,
      elapsedMs: performance.now() - startedAt,
      bytes: upload.totalByteLength,
      buffers: buffers.length,
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      elapsedMs: performance.now() - startedAt,
      bytes: 0,
      buffers: buffers.length,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    for (const buffer of buffers) buffer.destroy();
    device?.destroy();
  }
}
