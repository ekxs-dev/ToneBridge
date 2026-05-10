export type RealtimePreviewAdapter = 'webcodecs' | 'ffmpeg.wasm';
export type RealtimePreviewStatus = 'idle' | 'running' | 'stopped' | 'ended' | 'failed';

export interface RealtimePreviewReport {
  adapter: RealtimePreviewAdapter | null;
  status: RealtimePreviewStatus;
  targetFps: number;
  renderedFrames: number;
  droppedFrames: number;
  effectiveFps: number;
  currentSeconds: number | null;
  lastFrameMs: number | null;
  averageFrameMs: number | null;
  consecutiveFailures: number;
  note: string | null;
  error: string | null;
}

export interface RealtimePreviewClock {
  startSeconds: number;
  startedAtMs: number;
  nowMs: number;
  durationSeconds: number | null;
}

const MIN_TARGET_FPS = 0.25;
const MAX_TARGET_FPS = 4;

export function createRealtimePreviewReport(targetFps = 0.25): RealtimePreviewReport {
  return {
    adapter: null,
    status: 'idle',
    targetFps: clampRealtimeTargetFps(targetFps),
    renderedFrames: 0,
    droppedFrames: 0,
    effectiveFps: 0,
    currentSeconds: null,
    lastFrameMs: null,
    averageFrameMs: null,
    consecutiveFailures: 0,
    note: null,
    error: null,
  };
}

export function clampRealtimeTargetFps(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_TARGET_FPS, Math.max(MIN_TARGET_FPS, value));
}

export function realtimeSecondsForWallClock(clock: RealtimePreviewClock): number {
  const startSeconds = Math.max(0, Number.isFinite(clock.startSeconds) ? clock.startSeconds : 0);
  const elapsedSeconds = Math.max(0, (clock.nowMs - clock.startedAtMs) / 1000);
  const seconds = startSeconds + elapsedSeconds;
  if (clock.durationSeconds == null || !Number.isFinite(clock.durationSeconds) || clock.durationSeconds <= 0) {
    return seconds;
  }
  return Math.min(clock.durationSeconds, seconds);
}

export function estimateRealtimeDroppedFrames(targetFps: number, frameElapsedMs: number): number {
  const fps = clampRealtimeTargetFps(targetFps);
  const intervalMs = 1000 / fps;
  if (!Number.isFinite(frameElapsedMs) || frameElapsedMs <= intervalMs) return 0;
  return Math.max(0, Math.floor(frameElapsedMs / intervalMs));
}

export function updateRealtimeFrameReport(
  report: RealtimePreviewReport,
  options: {
    nowMs: number;
    startedAtMs: number;
    frameElapsedMs: number;
    currentSeconds: number;
  },
): RealtimePreviewReport {
  const renderedFrames = report.renderedFrames + 1;
  const previousTotalMs = (report.averageFrameMs ?? 0) * report.renderedFrames;
  const averageFrameMs = (previousTotalMs + options.frameElapsedMs) / renderedFrames;
  const elapsedSeconds = Math.max(0.001, (options.nowMs - options.startedAtMs) / 1000);
  return {
    ...report,
    status: 'running',
    renderedFrames,
    droppedFrames: report.droppedFrames + estimateRealtimeDroppedFrames(report.targetFps, options.frameElapsedMs),
    effectiveFps: renderedFrames / elapsedSeconds,
    currentSeconds: options.currentSeconds,
    lastFrameMs: options.frameElapsedMs,
    averageFrameMs,
    consecutiveFailures: 0,
    error: null,
  };
}
