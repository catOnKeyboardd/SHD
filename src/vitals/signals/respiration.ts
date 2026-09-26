import { MIN_CONFIDENCE_FOR_TRIAGE, RESPIRATION } from '../config';
import type { Reading } from '../types';
import {
  bandpass,
  countPeaks,
  detrendLinear,
  peakFrequency,
  powerSpectrum,
  ramp,
  resampleUniform,
  snrDb,
  std,
  type TimedValue,
} from './dsp';

interface SourceEstimate {
  rpm: number;
  confidence: number;
}

function estimateFromSource(samples: TimedValue[]): SourceEstimate | null {
  if (samples.length < 4) return null;
  const durationSec = (samples[samples.length - 1].t - samples[0].t) / 1000;
  if (durationSec < RESPIRATION.minDurationSec) return null;

  const fs = RESPIRATION.resampleHz;
  const [lo, hi] = RESPIRATION.bandHz;
  const x = bandpass(detrendLinear(resampleUniform(samples, fs)), fs, lo, hi);
  const spec = powerSpectrum(x, fs, lo, hi, 1024);
  const f0 = peakFrequency(spec);
  if (!Number.isFinite(f0)) return null;
  const snr = snrDb(spec, f0, RESPIRATION.snrHalfWidthHz, false);

  // Half a breathing period apart and above 0.3 SD, so landmark jitter is not counted as breaths.
  const minDistance = Math.max(Math.floor(fs / hi), Math.floor((0.5 * fs) / f0));
  const peaks = countPeaks(x, minDistance, 0.3 * std(x));
  const peakCountRpm =
    peaks.length >= 2 ? ((peaks.length - 1) / ((peaks[peaks.length - 1] - peaks[0]) / fs)) * 60 : NaN;

  const rpm = f0 * 60;
  let confidence = ramp(snr, RESPIRATION.snrForZeroConfidence, RESPIRATION.snrForFullConfidence);
  if (!Number.isFinite(peakCountRpm) || Math.abs(peakCountRpm - rpm) > RESPIRATION.agreementRpm) {
    confidence *= 0.5;
  }
  // Fewer than ~3 observed cycles in the window cannot pin down a rate.
  if ((rpm / 60) * durationSec < 3) confidence *= 0.5;

  return { rpm, confidence };
}

/**
 * Respiration rate from two independent signals: vertical shoulder motion
 * (primary) and low-frequency forehead intensity (respiratory-induced
 * intensity variation of the rPPG signal). Agreement raises confidence.
 */
export function estimateRespiration(
  shoulderY: TimedValue[],
  foreheadIntensity: TimedValue[],
  qualityFactor = 1,
): Reading | null {
  const motion = estimateFromSource(shoulderY);
  const riiv = estimateFromSource(foreheadIntensity);
  const candidates = [motion, riiv].filter((c): c is SourceEstimate => c !== null);
  if (!candidates.length) return null;

  let rpm: number;
  let confidence: number;
  if (motion && riiv && Math.abs(motion.rpm - riiv.rpm) <= RESPIRATION.agreementRpm) {
    const w = motion.confidence + riiv.confidence || 1;
    rpm = (motion.rpm * motion.confidence + riiv.rpm * riiv.confidence) / w;
    confidence = Math.min(1, Math.max(motion.confidence, riiv.confidence) * 1.15);
  } else {
    const best = candidates.reduce((p, q) => (q.confidence > p.confidence ? q : p));
    rpm = best.rpm;
    confidence = candidates.length > 1 ? best.confidence * 0.7 : best.confidence;
  }
  confidence *= qualityFactor;

  return {
    value: Math.round(rpm),
    confidence: +confidence.toFixed(2),
    usable: confidence >= MIN_CONFIDENCE_FOR_TRIAGE,
  };
}
