import { describe, expect, it } from 'vitest';
import { triage } from '../../src/vitals/triage/engine';
import type { MeasurementResult, Reading } from '../../src/vitals/types';

function reading(value: number, confidence = 0.9): Reading {
  return { value, confidence, usable: confidence >= 0.5 };
}

function baseline(overrides: Partial<MeasurementResult> = {}): MeasurementResult {
  return {
    heartRate: reading(78),
    respiration: reading(16),
    alertness: { state: 'alert', followedGaze: true },
    pain: { severe: false, assessable: true },
    facialDroop: { positive: false, assessable: true },
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
    ['unresponsive', { alertness: { state: 'unresponsive' as const, followedGaze: false } }],
  ])('%s → suspected ESI 1', (_, o) => {
    expect(triage(baseline(o))).toBe(1);
  });

  it.each([
    ['danger-zone heart rate', { heartRate: reading(112) }],
    ['danger-zone respiration', { respiration: reading(24) }],
    ['respiratory distress', { respiration: reading(32) }],
    ['reduced alertness', { alertness: { state: 'reduced' as const, followedGaze: false } }],
    ['severe pain expression', { pain: { severe: true, assessable: true } }],
    ['facial droop', { facialDroop: { positive: true, assessable: true } }],
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
