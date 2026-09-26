import { describe, expect, it } from 'vitest';
import { bandpass, peakFrequency, powerSpectrum, resampleUniform } from '../../src/vitals/signals/dsp';
import { estimateHeartRate } from '../../src/vitals/signals/heartRate';
import { estimateRespiration } from '../../src/vitals/signals/respiration';
import type { RoiFrame } from '../../src/vitals/types';

/** Deterministic PRNG so tests are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
}

/** Jittered ~30 fps timestamps, as delivered by mobile browsers. */
function frameTimes(durationMs: number, seed = 1): number[] {
  const r = rng(seed);
  const out: number[] = [];
  for (let t = 0; t < durationMs; t += 33.3 + r() * 8) out.push(t);
  return out;
}

/**
 * Skin reflectance with a blood-volume pulse along the standard PBV direction,
 * plus slow multiplicative illumination drift and sensor noise.
 */
function syntheticRoiFrames(bpm: number, durationMs: number, pulseAmp = 0.003, noise = 0.6): RoiFrame[] {
  const r = rng(7);
  const pbv = [0.33, 0.77, 0.53];
  const base = { forehead: [185, 130, 110], leftCheek: [175, 120, 100], rightCheek: [178, 122, 103] };
  return frameTimes(durationMs).map((t) => {
    const s = t / 1000;
    const pulse = Math.sin(2 * Math.PI * (bpm / 60) * s) + 0.3 * Math.sin(4 * Math.PI * (bpm / 60) * s);
    const light = 1 + 0.02 * Math.sin(2 * Math.PI * 0.07 * s);
    const rois: RoiFrame['rois'] = {};
    for (const [name, rgb] of Object.entries(base) as [keyof typeof base, number[]][]) {
      rois[name] = rgb.map((c, i) => c * light * (1 + pulseAmp * pbv[i] * pulse) + r() * noise) as [
        number,
        number,
        number,
      ];
    }
    return { t, rois };
  });
}

describe('dsp', () => {
  it('finds the frequency of a sinusoid', () => {
    const fs = 30;
    const x = Array.from({ length: 300 }, (_, i) => Math.sin(2 * Math.PI * 1.3 * (i / fs)));
    expect(peakFrequency(powerSpectrum(x, fs, 0.5, 4))).toBeCloseTo(1.3, 1);
  });

  it('band-pass removes out-of-band components', () => {
    const fs = 30;
    const x = Array.from(
      { length: 600 },
      (_, i) => Math.sin(2 * Math.PI * 0.2 * (i / fs)) + 0.5 * Math.sin(2 * Math.PI * 1.5 * (i / fs)),
    );
    const y = bandpass(x, fs, 0.7, 3.5);
    expect(peakFrequency(powerSpectrum(y, fs, 0.05, 4))).toBeCloseTo(1.5, 1);
  });

  it('resamples irregular samples onto a uniform grid', () => {
    const s = [
      { t: 0, v: 0 },
      { t: 150, v: 1.5 },
      { t: 1000, v: 10 },
    ];
    const y = resampleUniform(s, 10);
    expect(y.length).toBe(11);
    expect(y[1]).toBeCloseTo(1, 5);
    expect(y[10]).toBeCloseTo(10, 5);
  });
});

describe('heart rate (POS)', () => {
  for (const bpm of [55, 72, 96, 128, 165]) {
    it(`recovers ${bpm} bpm from 14 s of synthetic video`, () => {
      const reading = estimateHeartRate(syntheticRoiFrames(bpm, 14_000));
      expect(reading).not.toBeNull();
      expect(Math.abs(reading!.value - bpm)).toBeLessThanOrEqual(3);
      expect(reading!.usable).toBe(true);
    });
  }

  it('reports low confidence when there is no pulse', () => {
    const reading = estimateHeartRate(syntheticRoiFrames(72, 14_000, 0, 1.5));
    expect(reading).not.toBeNull();
    expect(reading!.usable).toBe(false);
  });

  it('returns null when the window is too short', () => {
    expect(estimateHeartRate(syntheticRoiFrames(72, 4_000))).toBeNull();
  });
});

describe('respiration', () => {
  function breathing(rpm: number, durationMs: number, amp: number, noise: number, seed: number) {
    const r = rng(seed);
    return frameTimes(durationMs, seed)
      .filter((_, i) => i % 2 === 0)
      .map((t) => ({
        t,
        v: amp * Math.sin(2 * Math.PI * (rpm / 60) * (t / 1000)) + 0.0004 * (t / 1000) + r() * noise,
      }));
  }

  for (const rpm of [12, 18, 24, 32]) {
    it(`recovers ${rpm} breaths/min from 20 s of shoulder motion`, () => {
      const reading = estimateRespiration(breathing(rpm, 20_000, 0.004, 0.001, 3), breathing(rpm, 14_000, 0.3, 0.2, 5));
      expect(reading).not.toBeNull();
      expect(Math.abs(reading!.value - rpm)).toBeLessThanOrEqual(2);
      expect(reading!.usable).toBe(true);
    });
  }

  it('stays confident when shoulder motion carries landmark jitter', () => {
    const shoulders = breathing(15, 20_000, 0.004, 0.004, 21);
    const uninformative = breathing(0, 14_000, 0, 0.2, 22);
    const reading = estimateRespiration(shoulders, uninformative);
    expect(reading).not.toBeNull();
    expect(Math.abs(reading!.value - 15)).toBeLessThanOrEqual(2);
    expect(reading!.usable).toBe(true);
  });

  it('is not usable on pure noise', () => {
    const noise = (seed: number) => breathing(0, 20_000, 0, 0.002, seed);
    const reading = estimateRespiration(noise(11), noise(12));
    expect(reading === null || !reading.usable).toBe(true);
  });
});
