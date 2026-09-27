import { describe, expect, it } from 'vitest';
import { overallConfidence, triage } from '../../src/vitals/triage/engine';
import type { MeasurementResult, PainResult, Reading } from '../../src/vitals/types';

function reading(value: number, confidence = 0.9): Reading {
  return { value, confidence, usable: confidence >= 0.5 };
}

function pain(score: number, assessable = true): PainResult {
  return { score, assessable, debug: {} };
}

function baseline(overrides: Partial<MeasurementResult> = {}): MeasurementResult {
  return {
    heartRate: reading(78),
    respiration: reading(16),
    alertness: { state: 'alert', debug: {} },
    pain: pain(0.8),
    quality: { faceCoverage: 0.98, meanFps: 29 },
    ...overrides,
  };
}

const urgencyOf = (o: Partial<MeasurementResult>) => triage(baseline(o)).urgency;

describe('triage engine', () => {
  it('normal findings are non-urgent', () => {
    expect(triage(baseline())).toEqual({ urgency: 'non-urgent', reasons: [] });
  });

  it.each([
    ['bradycardia', { heartRate: reading(35) }],
    ['extreme tachycardia', { heartRate: reading(165) }],
    ['bradypnea', { respiration: reading(6) }],
    ['extreme tachypnea', { respiration: reading(40) }],
    ['unresponsive', { alertness: { state: 'unresponsive' as const, debug: {} } }],
  ])('%s → emergency', (_, o) => {
    expect(urgencyOf(o)).toBe('emergency');
  });

  it.each([
    ['reduced alertness', { alertness: { state: 'reduced' as const, debug: {} } }],
    ['severe pain', { pain: pain(7.5) }],
    ['heart rate over 120', { heartRate: reading(130) }],
    ['respiration over 28', { respiration: reading(32) }],
  ])('%s → very urgent', (_, o) => {
    expect(urgencyOf(o)).toBe('very-urgent');
  });

  it.each([
    ['moderate pain', { pain: pain(4.5) }],
    ['heart rate 100–120', { heartRate: reading(112) }],
    ['respiration 21–28', { respiration: reading(24) }],
  ])('%s → urgent', (_, o) => {
    expect(urgencyOf(o)).toBe('urgent');
  });

  it.each([
    ['mild pain', { pain: pain(2.5) }],
    ['heart rate 91–100', { heartRate: reading(95) }],
    ['slow heart rate', { heartRate: reading(45) }],
    ['respiration 19–20', { respiration: reading(19) }],
  ])('%s → standard', (_, o) => {
    expect(urgencyOf(o)).toBe('standard');
  });

  it('pain climbs through every level as it rises', () => {
    expect([1, 2, 4, 7].map((s) => urgencyOf({ pain: pain(s) }))).toEqual([
      'non-urgent',
      'standard',
      'urgent',
      'very-urgent',
    ]);
  });

  it('the most urgent finding wins and all its reasons are listed', () => {
    expect(triage(baseline({ pain: pain(8), heartRate: reading(125), respiration: reading(19) }))).toEqual({
      urgency: 'very-urgent',
      reasons: ['pain 8', 'heart rate 125'],
    });
  });

  it('pain that could not be assessed does not count', () => {
    expect(urgencyOf({ pain: pain(9, false) })).toBe('non-urgent');
  });

  it('ignores extreme values from low-confidence readings', () => {
    expect(urgencyOf({ respiration: reading(40, 0.2) })).toBe('non-urgent');
  });

  it('a missing heart rate alone does not make the result unclear', () => {
    expect(urgencyOf({ heartRate: null })).toBe('non-urgent');
  });

  it('is unclear only when the face is barely seen or the video is very choppy', () => {
    const q = baseline().quality;
    expect(urgencyOf({ quality: { ...q, faceCoverage: 0.6 } })).toBe('non-urgent');
    expect(urgencyOf({ quality: { ...q, faceCoverage: 0.4 } })).toBeNull();
    expect(urgencyOf({ quality: { ...q, meanFps: 8 } })).toBeNull();
  });

  it('findings still escalate even when data quality is poor', () => {
    expect(urgencyOf({ heartRate: null, respiration: reading(38), quality: { faceCoverage: 0.4, meanFps: 29 } })).toBe(
      'emergency',
    );
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
