import type { MeasurementResult, Reading } from '../types';
import thresholds from './thresholds.json';

export type TriageLevel = 1 | 2 | 'nurse' | 'unreliable';

const C = thresholds.critical;
const D = thresholds.dangerZone;
const Q = thresholds.quality;

function usable(r: Reading | null): number | null {
  return r !== null && r.usable ? r.value : null;
}

/**
 * ESI-oriented triage suggestion from camera-only data. It can only raise
 * urgency: without a chief complaint the resource-based ESI 3–5 split is left
 * to the nurse, and poor data never yields a reassuring result.
 */
export function triage(m: MeasurementResult): TriageLevel {
  const hr = usable(m.heartRate);
  const rr = usable(m.respiration);

  const critical =
    (hr !== null && (hr < C.heartRateBelow || hr > C.heartRateAbove)) ||
    (rr !== null && (rr < C.respirationBelow || rr > C.respirationAbove)) ||
    m.alertness.state === 'unresponsive';
  if (critical) return 1;

  const highRisk =
    m.alertness.state === 'reduced' ||
    m.facialDroop.positive ||
    m.pain.severe ||
    (hr !== null && hr > D.heartRateAbove) ||
    (rr !== null && rr > D.respirationAbove);
  if (highRisk) return 2;

  const unreliable =
    hr === null ||
    m.quality.faceCoverage < Q.minFaceCoverage ||
    m.quality.meanFps < Q.minFps ||
    m.alertness.state === 'unknown';
  return unreliable ? 'unreliable' : 'nurse';
}
