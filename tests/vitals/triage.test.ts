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
    facialDroop: { positive: false, assessable: true, debug: {} },
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
    ['facial droop', { facialDroop: { positive: true, assessable: true, debug: {} } }],
  ])('%s → ESI 2', (_, o) => {
    expect(triage(baseline(o))).toBe(2);
  });

  it('ignores extreme values from low-confidence readings', () => {
    expect(triage(baseline({ respiration: reading(40, 0.2) }))).toBe('nurse');
  });

  it('never reassures when heart rate is unreliable', () => {
    expect(triage(baseline({ heartRate: reading(78, 0.2) }))).toBe('unreliable');
    expect(triage(baseline({ heartRate: null }))).toBe('unreliable');
  });

  it('never reassures when face coverage is poor', () => {
    const q = { ...baseline().quality, faceCoverage: 0.4 };
    expect(triage(baseline({ quality: q }))).toBe('unreliable');
  });

  it('high-risk findings still escalate even when data quality is poor', () => {
    expect(triage(baseline({ heartRate: null, respiration: reading(38) }))).toBe(1);
  });
});

describe('overall confidence', () => {
  it('starts low and grows with recording time', () => {
    const m = baseline();
    const early = overallConfidence(m, 3_000);
    const mid = overallConfidence(m, 15_000);
    const late = overallConfidence(m, 30_000);
    expect(early).toBeLessThan(0.15);
    expect(mid).toBeGreaterThan(early);
    expect(late).toBeGreaterThan(mid);
    expect(late).toBeGreaterThan(0.8);
  });

  it('stays low without vital-sign readings', () => {
    expect(overallConfidence(baseline({ heartRate: null, respiration: null }), 60_000)).toBeLessThanOrEqual(0.4);
  });

  it('drops when the face is often missing', () => {
    const q = { ...baseline().quality, faceCoverage: 0.4 };
    expect(overallConfidence(baseline({ quality: q }), 60_000)).toBeLessThan(0.5);
  });
});

describe('urgency wording', () => {
  it('escalations show immediately, even at low confidence', () => {
    expect(urgencyOf(1, 0.1)).toBe('emergency');
    expect(urgencyOf(2, 0.1)).toBe('urgent');
  });

  it('routine needs enough confidence', () => {
    expect(urgencyOf('nurse', 0.3)).toBeNull();
    expect(urgencyOf('nurse', 0.8)).toBe('routine');
    expect(urgencyOf('unreliable', 0.9)).toBeNull();
  });
});
