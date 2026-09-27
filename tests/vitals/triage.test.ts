import { describe, expect, it } from 'vitest';
import { overallConfidence, triage, urgencyOf } from '../../src/vitals/triage/engine';
import type { MeasurementResult, Reading } from '../../src/vitals/types';

function reading(value: number, confidence = 0.9): Reading {
  return { value, confidence, usable: confidence >= 0.5 };
}

function baseline(overrides: Partial<MeasurementResult> = {}): MeasurementResult {
  return {
    heartRate: reading(78),
    respiration: reading(16),
    alertness: { state: 'alert', debug: {} },
    pain: { severe: false, assessable: true, debug: {} },
    quality: { faceCoverage: 0.98, meanFps: 29 },
    ...overrides,
  };
}

describe('triage engine', () => {
  it('normal findings defer ESI 3–5 to the nurse', () => {
    expect(triage(baseline())).toBe('nurse');
  });

  it.each([
    ['bradycardia', { heartRate: reading(35) }],
    ['extreme tachycardia', { heartRate: reading(165) }],
    ['bradypnea', { respiration: reading(6) }],
    ['extreme tachypnea', { respiration: reading(40) }],
    ['unresponsive', { alertness: { state: 'unresponsive' as const, debug: {} } }],
  ])('%s → suspected ESI 1', (_, o) => {
    expect(triage(baseline(o))).toBe(1);
  });

  it.each([
    ['danger-zone heart rate', { heartRate: reading(112) }],
    ['danger-zone respiration', { respiration: reading(24) }],
    ['respiratory distress', { respiration: reading(32) }],
    ['reduced alertness', { alertness: { state: 'reduced' as const, debug: {} } }],
    ['severe pain expression', { pain: { severe: true, assessable: true, debug: {} } }],
  ])('%s → ESI 2', (_, o) => {
    expect(triage(baseline(o))).toBe(2);
  });

  it('ignores extreme values from low-confidence readings', () => {
    expect(triage(baseline({ respiration: reading(40, 0.2) }))).toBe('nurse');
  });

  it('a missing or low-confidence heart rate alone does not make the result unreliable', () => {
    expect(triage(baseline({ heartRate: reading(78, 0.2) }))).toBe('nurse');
    expect(triage(baseline({ heartRate: null }))).toBe('nurse');
  });

  it('is unreliable only when the face is barely seen or the video is very choppy', () => {
    const q = baseline().quality;
    expect(triage(baseline({ quality: { ...q, faceCoverage: 0.6 } }))).toBe('nurse');
    expect(triage(baseline({ quality: { ...q, faceCoverage: 0.4 } }))).toBe('unreliable');
    expect(triage(baseline({ quality: { ...q, meanFps: 8 } }))).toBe('unreliable');
  });

  it('high-risk findings still escalate even when data quality is poor', () => {
    expect(triage(baseline({ heartRate: null, respiration: reading(38) }))).toBe(1);
  });
});

describe('overall confidence', () => {
  it('starts low, rises quickly and is full after the ramp', () => {
    const m = baseline();
    const start = overallConfidence(m, 500);
    const early = overallConfidence(m, 4_000);
    const full = overallConfidence(m, 15_000);
    expect(start).toBeLessThan(0.2);
    expect(early).toBeGreaterThan(0.45);
    expect(full).toBeGreaterThan(early);
    expect(full).toBeGreaterThan(0.9);
    expect(overallConfidence(m, 60_000)).toBe(full);
  });

  it('moderate signal quality still gives a fairly high confidence', () => {
    const m = baseline({ heartRate: reading(78, 0.6), respiration: reading(16, 0.2) });
    expect(overallConfidence(m, 20_000)).toBeGreaterThan(0.75);
  });

  it('is capped without vital-sign readings', () => {
    expect(overallConfidence(baseline({ heartRate: null, respiration: null }), 60_000)).toBeLessThanOrEqual(0.6);
  });

  it('drops when the face is often missing', () => {
    const q = { ...baseline().quality, faceCoverage: 0.4 };
    expect(overallConfidence(baseline({ quality: q }), 60_000)).toBeLessThan(0.5);
  });
});

describe('urgency wording', () => {
  it('maps triage levels to plain words', () => {
    expect(urgencyOf(1)).toBe('emergency');
    expect(urgencyOf(2)).toBe('urgent');
    expect(urgencyOf('nurse')).toBe('routine');
    expect(urgencyOf('unreliable')).toBeNull();
  });
});
