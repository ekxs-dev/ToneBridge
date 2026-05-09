struct FrameParams {
  sourceWidth: u32,
  sourceHeight: u32,
  outputWidth: u32,
  outputHeight: u32,
  yStride: u32,
  uvStride: u32,
  range: u32,
  previewMode: u32,
};

struct DoviParams {
  // ABI: 276 f32 values packed by src/core/metadata.ts and crates/lumabridge_wasm.
  nonlinearOffset: vec4<f32>,
  nonlinearMatrix0: vec4<f32>,
  nonlinearMatrix1: vec4<f32>,
  nonlinearMatrix2: vec4<f32>,
  linearMatrix0: vec4<f32>,
  linearMatrix1: vec4<f32>,
  linearMatrix2: vec4<f32>,
  sourcePq: vec4<f32>,
  pivots: array<vec4<f32>, 7>,
  polyCoeffs: array<vec4<f32>, 18>,
  mmrCoeffs: array<vec4<f32>, 36>,
};

@group(0) @binding(0) var<storage, read> yPlane: array<u32>;
@group(0) @binding(1) var<storage, read> uPlane: array<u32>;
@group(0) @binding(2) var<storage, read> vPlane: array<u32>;
@group(0) @binding(3) var<uniform> frameParams: FrameParams;
@group(0) @binding(4) var<uniform> doviParams: DoviParams;
@group(0) @binding(5) var<storage, read_write> outputPixels: array<u32>;

fn sample_y10(index: u32) -> f32 {
  return f32(yPlane[index] & 0x03ffu);
}

fn sample_u10(index: u32) -> f32 {
  return f32(uPlane[index] & 0x03ffu);
}

fn sample_v10(index: u32) -> f32 {
  return f32(vPlane[index] & 0x03ffu);
}

fn normalize_y(sample: f32) -> f32 {
  if (frameParams.range == 0u) {
    return sample / 1023.0;
  }
  return clamp((sample - 64.0) / (940.0 - 64.0), 0.0, 1.0);
}

fn normalize_uv(sample: f32) -> f32 {
  if (frameParams.range == 0u) {
    return sample / 1023.0;
  }
  return clamp((sample - 64.0) / (960.0 - 64.0), 0.0, 1.0);
}

fn pq_eotf(code: f32) -> f32 {
  let m1 = 2610.0 / 16384.0;
  let m2 = (2523.0 / 4096.0) * 128.0;
  let c1 = 3424.0 / 4096.0;
  let c2 = (2413.0 / 4096.0) * 32.0;
  let c3 = (2392.0 / 4096.0) * 32.0;
  let v = pow(max(code, 0.0), 1.0 / m2);
  return 10000.0 * pow(max(v - c1, 0.0) / (c2 - c3 * v), 1.0 / m1);
}

fn yuv2020_to_rgb(y: f32, u: f32, v: f32) -> vec3<f32> {
  let cb = u - 0.5;
  let cr = v - 0.5;
  return vec3<f32>(
    y + 1.4746 * cr,
    y - 0.16455 * cb - 0.57135 * cr,
    y + 1.8814 * cb
  );
}

fn bt2020_to_bt709(rgb: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    1.6605 * rgb.r - 0.5876 * rgb.g - 0.0728 * rgb.b,
    -0.1246 * rgb.r + 1.1329 * rgb.g - 0.0083 * rgb.b,
    -0.0182 * rgb.r - 0.1006 * rgb.g + 1.1187 * rgb.b
  );
}

fn dovi_ipt_to_lms(ipt: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    ipt.x + 0.0975689 * ipt.y + 0.205226 * ipt.z,
    ipt.x - 0.113876 * ipt.y + 0.133217 * ipt.z,
    ipt.x + 0.0326151 * ipt.y - 0.676887 * ipt.z
  );
}

fn dovi_lms_to_bt2020(lms: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    3.06441879 * lms.x - 2.16597676 * lms.y + 0.10155818 * lms.z,
    -0.65612108 * lms.x + 1.78554118 * lms.y - 0.12943749 * lms.z,
    0.01736321 * lms.x - 0.04725154 * lms.y + 1.03004253 * lms.z
  );
}

fn dovi_poly(signal: f32, coeffs: vec3<f32>) -> f32 {
  return (coeffs.z * signal + coeffs.y) * signal + coeffs.x;
}

fn tone_map_reinhard(nits: vec3<f32>) -> vec3<f32> {
  let normalized = max(nits / vec3<f32>(100.0), vec3<f32>(0.0));
  return normalized / (vec3<f32>(1.0) + normalized);
}

fn srgb_encode(linear: vec3<f32>) -> vec3<f32> {
  let value = clamp(linear, vec3<f32>(0.0), vec3<f32>(1.0));
  let low = value * vec3<f32>(12.92);
  let high = vec3<f32>(1.055) * pow(value, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055);
  return select(high, low, value <= vec3<f32>(0.0031308));
}

fn pack_rgba8(rgb: vec3<f32>) -> u32 {
  let clamped = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
  let rgba = vec4<u32>(
    u32(round(clamped.r * 255.0)),
    u32(round(clamped.g * 255.0)),
    u32(round(clamped.b * 255.0)),
    255u
  );
  return rgba.r | (rgba.g << 8u) | (rgba.b << 16u) | (rgba.a << 24u);
}

fn render_luma(y: f32) -> vec3<f32> {
  let encoded = srgb_encode(vec3<f32>(y));
  return encoded;
}

fn render_pq_sdr(y: f32, u: f32, v: f32) -> vec3<f32> {
  let rgb2020 = clamp(yuv2020_to_rgb(y, u, v), vec3<f32>(0.0), vec3<f32>(1.0));
  let nits = vec3<f32>(pq_eotf(rgb2020.r), pq_eotf(rgb2020.g), pq_eotf(rgb2020.b));
  let sdr709 = tone_map_reinhard(max(bt2020_to_bt709(nits), vec3<f32>(0.0)));
  return srgb_encode(sdr709);
}

fn render_dovi_p5_base(y: f32, u: f32, v: f32) -> vec3<f32> {
  let ipt = vec3<f32>(y, u - 0.5, v - 0.5);
  let lmsCode = clamp(dovi_ipt_to_lms(ipt), vec3<f32>(0.0), vec3<f32>(1.0));
  let lmsNits = vec3<f32>(pq_eotf(lmsCode.x), pq_eotf(lmsCode.y), pq_eotf(lmsCode.z));
  let rgb2020 = dovi_lms_to_bt2020(lmsNits);
  let sdr709 = tone_map_reinhard(max(bt2020_to_bt709(rgb2020), vec3<f32>(0.0)));
  return srgb_encode(sdr709);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= frameParams.outputWidth || id.y >= frameParams.outputHeight) {
    return;
  }

  let sourceX = min(frameParams.sourceWidth - 1u, u32(floor((f32(id.x) + 0.5) * f32(frameParams.sourceWidth) / f32(frameParams.outputWidth))));
  let sourceY = min(frameParams.sourceHeight - 1u, u32(floor((f32(id.y) + 0.5) * f32(frameParams.sourceHeight) / f32(frameParams.outputHeight))));
  let yIndex = sourceY * frameParams.yStride + sourceX;
  let uvIndex = (sourceY / 2u) * frameParams.uvStride + (sourceX / 2u);
  let y = normalize_y(sample_y10(yIndex));
  let u = normalize_uv(sample_u10(uvIndex));
  let v = normalize_uv(sample_v10(uvIndex));

  let reshapedYuv = vec3<f32>(
    dovi_poly(y, doviParams.polyCoeffs[0].xyz),
    dovi_poly(u, doviParams.polyCoeffs[1].xyz),
    dovi_poly(v, doviParams.polyCoeffs[2].xyz)
  );

  var rgb = render_pq_sdr(reshapedYuv.x, reshapedYuv.y, reshapedYuv.z);
  if (frameParams.previewMode == 1u) {
    rgb = render_luma(y);
  } else if (frameParams.previewMode == 2u) {
    rgb = render_dovi_p5_base(y, u, v);
  }

  outputPixels[id.y * frameParams.outputWidth + id.x] = pack_rgba8(rgb);
}
