import { HEART_RATE, MIN_CONFIDENCE_FOR_TRIAGE } from '../config';
import type { Reading, RoiFrame, RoiName } from '../types';
import { bandpass, peakFrequency, powerSpectrum, ramp, resampleUniform, snrDb, type Spectrum } from './dsp';
import { posBvp } from './pos';

const ROI_NAMES: RoiName[] = ['forehead', 'leftCheek', 'rightCheek'];

interface RoiAnalysis {
  spec: Spectrum;
  snr: number;
}

function analyseRoi(frames: RoiFrame[], name: RoiName, windowMs: number): RoiAnalysis | null {
  const present = frames.filter((f) => f.rois[name]);
  if (present.length < 2) return null;
  const span = present[present.length - 1].t - present[0].t;
  if (span < HEART_RATE.minDurationSec * 1000 || span < windowMs * HEART_RATE.minCoverage) return null;
  const fs = HEART_RATE.resampleHz;
  const channel = (c: 0 | 1 | 2) =>
    resampleUniform(
      present.map((f) => ({ t: f.t, v: f.rois[name]![c] })),
      fs,
    );
  const bvp = posBvp(channel(0), channel(1), channel(2), fs);
  const [lo, hi] = HEART_RATE.bandHz;
  const spec = powerSpectrum(bandpass(bvp, fs, lo, hi), fs, lo, hi);
  const f0 = peakFrequency(spec);
  return { spec, snr: snrDb(spec, f0, HEART_RATE.snrHalfWidthHz, true) };
}

/**
 * Heart rate from per-region POS signals. Region spectra are normalised and
 * combined with SNR-based weights so a noisy region (e.g. a cheek hidden by a
 * mask) cannot dominate.
 */
export function estimateHeartRate(frames: RoiFrame[], qualityFactor = 1): Reading | null {
  if (frames.length < 2) return null;
  const windowMs = frames[frames.length - 1].t - frames[0].t;

  const analyses = ROI_NAMES.map((n) => analyseRoi(frames, n, windowMs)).filter(
    (a): a is RoiAnalysis => a !== null && Number.isFinite(a.snr),
  );
  if (!analyses.length) return null;

  const len = Math.min(...analyses.map((a) => a.spec.power.length));
  const combined: Spectrum = {
    freqs: analyses[0].spec.freqs.slice(0, len),
    power: new Float64Array(len),
  };
  for (const a of analyses) {
    let total = 0;
    for (let i = 0; i < len; i++) total += a.spec.power[i];
    const weight = Math.max(0.05, a.snr - HEART_RATE.snrForZeroConfidence);
    for (let i = 0; i < len; i++) combined.power[i] += (weight * a.spec.power[i]) / (total || 1);
  }

  const f0 = peakFrequency(combined);
  const snr = snrDb(combined, f0, HEART_RATE.snrHalfWidthHz, true);
  const confidence =
    ramp(snr, HEART_RATE.snrForZeroConfidence, HEART_RATE.snrForFullConfidence) * qualityFactor;
  return {
    value: Math.round(f0 * 60),
    confidence: +confidence.toFixed(2),
    usable: confidence >= MIN_CONFIDENCE_FOR_TRIAGE,
  };
}
