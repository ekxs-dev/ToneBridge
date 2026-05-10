export interface HevcCodecConfig {
  brand: 'hvc1' | 'hev1';
  profileSpace?: number;
  profileIdc: number;
  profileCompatibilityFlags?: number;
  tierFlag?: boolean;
  levelIdc: number;
  constraintIndicatorFlags?: number;
}

function reverseBits32(value: number): number {
  let input = value >>> 0;
  let output = 0;
  for (let bit = 0; bit < 32; bit += 1) {
    output = (output << 1) | (input & 1);
    input >>>= 1;
  }
  return output >>> 0;
}

function hevcCompatibilityString(flags: number): string {
  return reverseBits32(flags).toString(16).toUpperCase();
}

function hevcConstraintString(flags: number): string {
  return flags.toString(16).toUpperCase();
}

export function buildHevcCodecString(config: HevcCodecConfig): string {
  const profileSpacePrefix = ['', 'A', 'B', 'C'][config.profileSpace ?? 0] ?? '';
  const profile = `${profileSpacePrefix}${config.profileIdc}`;
  const compatibility = hevcCompatibilityString(config.profileCompatibilityFlags ?? 0);
  const tier = config.tierFlag ? 'H' : 'L';
  const level = `${tier}${config.levelIdc}`;
  const constraint = hevcConstraintString(config.constraintIndicatorFlags ?? 0);
  return `${config.brand}.${profile}.${compatibility}.${level}.B${constraint}`;
}

export function inferCodecFamily(codecName: string): 'hevc' | 'h264' | 'unknown' {
  const normalized = codecName.toLowerCase();
  if (normalized === 'hevc' || normalized === 'h265' || normalized.startsWith('hev1') || normalized.startsWith('hvc1')) {
    return 'hevc';
  }
  if (normalized === 'h264' || normalized === 'avc' || normalized.startsWith('avc1')) {
    return 'h264';
  }
  return 'unknown';
}

export function requireHevc(codecName: string): void {
  if (inferCodecFamily(codecName) !== 'hevc') {
    throw new Error(`Unsupported codec for DV P5 path: ${codecName}`);
  }
}
