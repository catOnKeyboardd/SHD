export interface TimedValue {
  t: number; // milliseconds
  v: number;
}

export function mean(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return x.length ? s / x.length : 0;
}

export function std(x: ArrayLike<number>): number {
  const m = mean(x);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] - m) ** 2;
  return x.length ? Math.sqrt(s / x.length) : 0;
}

export function median(x: ArrayLike<number>): number {
  if (!x.length) return NaN;
  const a = Array.from(x).sort((p, q) => p - q);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** Linear interpolation of irregularly timed samples onto a uniform grid at `fs` Hz. */
export function resampleUniform(samples: TimedValue[], fs: number): Float64Array {
  if (samples.length < 2) return new Float64Array(0);
  const t0 = samples[0].t;
  const t1 = samples[samples.length - 1].t;
  const n = Math.floor(((t1 - t0) / 1000) * fs) + 1;
  const out = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + (i * 1000) / fs;
    while (j < samples.length - 2 && samples[j + 1].t < t) j++;
    const a = samples[j];
    const b = samples[j + 1];
    const span = b.t - a.t;
    const w = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
    out[i] = a.v + (b.v - a.v) * w;
  }
  return out;
}

export function detrendLinear(x: ArrayLike<number>): Float64Array {
  const n = x.length;
  const out = new Float64Array(n);
  if (n < 2) return out;
  const tm = (n - 1) / 2;
  const xm = mean(x);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - tm) * (x[i] - xm);
    den += (i - tm) ** 2;
  }
  const slope = den ? num / den : 0;
  for (let i = 0; i < n; i++) out[i] = x[i] - xm - slope * (i - tm);
  return out;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place iterative radix-2 complex FFT. Length must be a power of two. */
function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/** Zero-phase band-pass by masking FFT bins outside [lo, hi] Hz. */
export function bandpass(x: ArrayLike<number>, fs: number, lo: number, hi: number): Float64Array {
  const n = x.length;
  if (n < 4) return Float64Array.from(x);
  const size = nextPow2(n * 2);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const m = mean(x);
  for (let i = 0; i < n; i++) re[i] = x[i] - m;
  // Mirror-pad the tail to reduce wrap-around edge artifacts.
  for (let i = n; i < size && i < 2 * n; i++) re[i] = x[2 * n - 1 - i] - m;
  fft(re, im);
  for (let k = 0; k < size; k++) {
    const f = (Math.min(k, size - k) * fs) / size;
    if (f < lo || f > hi) {
      re[k] = 0;
      im[k] = 0;
    }
  }
  fft(re, im, true);
  return re.slice(0, n);
}

export interface Spectrum {
  freqs: Float64Array;
  power: Float64Array;
}

/** Hann-windowed, zero-padded power spectrum restricted to [lo, hi] Hz. */
export function powerSpectrum(
  x: ArrayLike<number>,
  fs: number,
  lo: number,
  hi: number,
  minFft = 2048,
): Spectrum {
  const n = x.length;
  const size = Math.max(minFft, nextPow2(n));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const m = mean(x);
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, n - 1));
    re[i] = (x[i] - m) * w;
  }
  fft(re, im);
  const kLo = Math.ceil((lo * size) / fs);
  const kHi = Math.floor((hi * size) / fs);
  const len = Math.max(0, kHi - kLo + 1);
  const freqs = new Float64Array(len);
  const power = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const k = kLo + i;
    freqs[i] = (k * fs) / size;
    power[i] = re[k] * re[k] + im[k] * im[k];
  }
  return { freqs, power };
}

/** Frequency of the spectral maximum, refined by parabolic interpolation. */
export function peakFrequency(spec: Spectrum): number {
  const { freqs, power } = spec;
  if (!power.length) return NaN;
  let best = 0;
  for (let i = 1; i < power.length; i++) if (power[i] > power[best]) best = i;
  if (best === 0 || best === power.length - 1) return freqs[best];
  const a = power[best - 1];
  const b = power[best];
  const c = power[best + 1];
  const denom = a - 2 * b + c;
  const offset = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  const df = freqs[1] - freqs[0];
  return freqs[best] + offset * df;
}

/**
 * SNR in dB: power near f0 (and optionally its first harmonic) versus the
 * remaining power in the analysed band.
 */
export function snrDb(spec: Spectrum, f0: number, halfWidth: number, includeHarmonic: boolean): number {
  let signal = 0;
  let noise = 0;
  for (let i = 0; i < spec.freqs.length; i++) {
    const f = spec.freqs[i];
    const near =
      Math.abs(f - f0) <= halfWidth || (includeHarmonic && Math.abs(f - 2 * f0) <= halfWidth * 2);
    if (near) signal += spec.power[i];
    else noise += spec.power[i];
  }
  if (signal <= 0) return -Infinity;
  if (noise <= 0) return 30;
  return 10 * Math.log10(signal / noise);
}

/** Indices of local maxima above `minHeight`, separated by at least `minDistance` samples. */
export function countPeaks(x: ArrayLike<number>, minDistance: number, minHeight = 0): number[] {
  const peaks: number[] = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] > minHeight && x[i] >= x[i - 1] && x[i] > x[i + 1]) {
      const last = peaks[peaks.length - 1];
      if (last !== undefined && i - last < minDistance) {
        if (x[i] > x[last]) peaks[peaks.length - 1] = i;
      } else {
        peaks.push(i);
      }
    }
  }
  return peaks;
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Linear map of `x` from [lo, hi] to [0, 1], clamped. */
export function ramp(x: number, lo: number, hi: number): number {
  return clamp01((x - lo) / (hi - lo));
}
