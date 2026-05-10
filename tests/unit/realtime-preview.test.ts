import { describe, expect, it } from 'vitest';
import {
  clampRealtimeTargetFps,
  createRealtimePreviewReport,
  estimateRealtimeDroppedFrames,
  realtimeSecondsForWallClock,
  updateRealtimeFrameReport,
} from '../../src/core/realtime-preview';

describe('realtime preview planning', () => {
  it('clamps fallback target FPS to a browser-safe diagnostic range', () => {
    expect(clampRealtimeTargetFps(0)).toBe(0.25);
    expect(clampRealtimeTargetFps(1.5)).toBe(1.5);
    expect(clampRealtimeTargetFps(24)).toBe(4);
  });

  it('advances selected seconds from wall clock and caps at duration', () => {
    expect(realtimeSecondsForWallClock({
      startSeconds: 10,
      startedAtMs: 1000,
      nowMs: 2500,
      durationSeconds: 60,
    })).toBe(11.5);

    expect(realtimeSecondsForWallClock({
      startSeconds: 59,
      startedAtMs: 1000,
      nowMs: 5000,
      durationSeconds: 60,
    })).toBe(60);
  });

  it('records effective FPS and dropped frames for slow fallback decodes', () => {
    const report = {
      ...createRealtimePreviewReport(2),
      status: 'running' as const,
    };
    const updated = updateRealtimeFrameReport(report, {
      startedAtMs: 1000,
      nowMs: 2500,
      frameElapsedMs: 1200,
      currentSeconds: 12.5,
    });

    expect(estimateRealtimeDroppedFrames(2, 1200)).toBe(2);
    expect(updated.renderedFrames).toBe(1);
    expect(updated.droppedFrames).toBe(2);
    expect(updated.effectiveFps).toBeCloseTo(0.666, 2);
    expect(updated.currentSeconds).toBe(12.5);
  });
});
