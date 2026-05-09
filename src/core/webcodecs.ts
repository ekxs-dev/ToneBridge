import type { Mp4Sample, Mp4VideoTrack } from './mp4';

export interface EncodedChunkPlan {
  type: EncodedVideoChunkType;
  timestamp: number;
  duration: number;
  byteLength: number;
}

export interface DecodedFrameProbe {
  supported: boolean;
  codec: string | null;
  decodedFrames: number;
  elapsedMs: number;
  format: string | null;
  timestamp: number | null;
  codedWidth: number | null;
  codedHeight: number | null;
  displayWidth: number | null;
  displayHeight: number | null;
  colorSpace: Record<string, unknown> | null;
  error: string | null;
}

export function sampleTimestampUs(sample: Mp4Sample, timescale: number): number {
  return Math.round((sample.cts / timescale) * 1_000_000);
}

export function sampleDurationUs(sample: Mp4Sample, timescale: number): number {
  return Math.round((sample.duration / timescale) * 1_000_000);
}

export function buildVideoDecoderConfig(track: Mp4VideoTrack): VideoDecoderConfig {
  if (!track.hevcConfig) {
    throw new Error('HEVC decoder configuration is missing hvcC.');
  }

  return {
    codec: track.hevcConfig.codecString,
    codedWidth: track.width,
    codedHeight: track.height,
    description: track.hevcConfig.description,
    hardwareAcceleration: 'prefer-hardware',
    optimizeForLatency: true,
  };
}

export function planEncodedChunk(sample: Mp4Sample, track: Mp4VideoTrack): EncodedChunkPlan {
  return {
    type: sample.isSync ? 'key' : 'delta',
    timestamp: sampleTimestampUs(sample, track.timescale),
    duration: sampleDurationUs(sample, track.timescale),
    byteLength: sample.size,
  };
}

export function createEncodedVideoChunk(fileBytes: Uint8Array, sample: Mp4Sample, track: Mp4VideoTrack): EncodedVideoChunk {
  const plan = planEncodedChunk(sample, track);
  return new EncodedVideoChunk({
    type: plan.type,
    timestamp: plan.timestamp,
    duration: plan.duration,
    data: fileBytes.slice(sample.offset, sample.offset + sample.size),
  });
}

export async function decodeFirstFrameFromMp4Track(
  fileBytes: Uint8Array,
  track: Mp4VideoTrack,
  maxSamples = 12,
): Promise<DecodedFrameProbe> {
  const startedAt = performance.now();
  const codec = track.hevcConfig?.codecString ?? null;
  const baseResult = (): DecodedFrameProbe => ({
    supported: false,
    codec,
    decodedFrames: 0,
    elapsedMs: performance.now() - startedAt,
    format: null,
    timestamp: null,
    codedWidth: null,
    codedHeight: null,
    displayWidth: null,
    displayHeight: null,
    colorSpace: null,
    error: null,
  });

  if (typeof VideoDecoder === 'undefined' || typeof EncodedVideoChunk === 'undefined') {
    return { ...baseResult(), error: 'WebCodecs VideoDecoder is unavailable.' };
  }

  if (!track.hevcConfig) {
    return { ...baseResult(), error: 'Missing hvcC decoder description.' };
  }

  const config = buildVideoDecoderConfig(track);
  let supportedConfig: VideoDecoderConfig;
  try {
    const support = await VideoDecoder.isConfigSupported(config);
    if (!support.supported) {
      return { ...baseResult(), codec: config.codec, error: `VideoDecoder does not support ${config.codec}.` };
    }
    supportedConfig = support.config ?? config;
  } catch (error) {
    return { ...baseResult(), codec: config.codec, error: error instanceof Error ? error.message : String(error) };
  }

  let decodedFrames = 0;
  const frameProbes: Pick<
    DecodedFrameProbe,
    'format' | 'timestamp' | 'codedWidth' | 'codedHeight' | 'displayWidth' | 'displayHeight' | 'colorSpace'
  >[] = [];
  let decoderError: string | null = null;
  const decoder = new VideoDecoder({
    output: (frame) => {
      decodedFrames += 1;
      if (frameProbes.length === 0) {
        const colorSpace = frame.colorSpace?.toJSON?.() as Record<string, unknown> | undefined;
        frameProbes.push({
          format: frame.format,
          timestamp: frame.timestamp,
          codedWidth: frame.codedWidth,
          codedHeight: frame.codedHeight,
          displayWidth: frame.displayWidth,
          displayHeight: frame.displayHeight,
          colorSpace: colorSpace ?? null,
        });
      }
      frame.close();
    },
    error: (error) => {
      decoderError = error.message;
    },
  });

  try {
    decoder.configure(supportedConfig);
    for (const sample of track.samples.slice(0, maxSamples)) {
      decoder.decode(createEncodedVideoChunk(fileBytes, sample, track));
    }
    await decoder.flush();
  } catch (error) {
    decoderError = error instanceof Error ? error.message : String(error);
  } finally {
    decoder.close();
  }

  const elapsedMs = performance.now() - startedAt;
  const firstFrame = frameProbes[0];
  if (!firstFrame) {
    return {
      ...baseResult(),
      supported: true,
      codec: supportedConfig.codec,
      decodedFrames,
      elapsedMs,
      error: decoderError ?? 'Decoder produced no frames.',
    };
  }

  return {
    supported: true,
    codec: supportedConfig.codec,
    decodedFrames,
    elapsedMs,
    format: firstFrame.format,
    timestamp: firstFrame.timestamp,
    codedWidth: firstFrame.codedWidth,
    codedHeight: firstFrame.codedHeight,
    displayWidth: firstFrame.displayWidth,
    displayHeight: firstFrame.displayHeight,
    colorSpace: firstFrame.colorSpace,
    error: decoderError,
  };
}
