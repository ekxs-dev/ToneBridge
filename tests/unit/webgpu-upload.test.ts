import { describe, expect, it } from 'vitest';
import { buildI420P10GpuUpload } from '../../src/core/gpu-upload';
import { createI420P10Frame, expectedI420P10ByteLength } from '../../src/core/raw-frame';
import { renderI420P10SdrWithWebGpu } from '../../src/core/webgpu-render';
import { uploadI420P10ToWebGpu } from '../../src/core/webgpu-upload';

describe('WebGPU upload probe', () => {
  it('reports unavailable without requiring WebGPU in unit tests', async () => {
    const frame = createI420P10Frame(new Uint8Array(expectedI420P10ByteLength(2, 2)), 2, 2);
    const probe = await uploadI420P10ToWebGpu(buildI420P10GpuUpload(frame));

    expect(probe.ok).toBe(false);
    expect(probe.attempted).toBe(false);
    expect(probe.error).toMatch(/WebGPU|GPUBufferUsage/);
  });

  it('reports render unavailable without requiring WebGPU in unit tests', async () => {
    const frame = createI420P10Frame(new Uint8Array(expectedI420P10ByteLength(2, 2)), 2, 2);
    const result = await renderI420P10SdrWithWebGpu(buildI420P10GpuUpload(frame), 'raw-luma');

    expect(result.preview).toBeNull();
    expect(result.probe.ok).toBe(false);
    expect(result.probe.attempted).toBe(false);
    expect(result.probe.error).toMatch(/WebGPU|GPUBufferUsage/);
  });
});
