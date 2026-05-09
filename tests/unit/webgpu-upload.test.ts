import { describe, expect, it } from 'vitest';
import { buildI420P10GpuUpload } from '../../src/core/gpu-upload';
import { createI420P10Frame, expectedI420P10ByteLength } from '../../src/core/raw-frame';
import { uploadI420P10ToWebGpu } from '../../src/core/webgpu-upload';

describe('WebGPU upload probe', () => {
  it('reports unavailable without requiring WebGPU in unit tests', async () => {
    const frame = createI420P10Frame(new Uint8Array(expectedI420P10ByteLength(2, 2)), 2, 2);
    const probe = await uploadI420P10ToWebGpu(buildI420P10GpuUpload(frame));

    expect(probe.ok).toBe(false);
    expect(probe.attempted).toBe(false);
    expect(probe.error).toMatch(/WebGPU|GPUBufferUsage/);
  });
});
