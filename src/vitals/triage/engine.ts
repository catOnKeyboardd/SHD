import { PROTOCOL } from '../config';
import type { MeasurementResult, Reading } from '../types';
import thresholds from './thresholds.json';

export type TriageLevel = 1 | 2 | 'nurse' | 'unreliable';

/** Plain-language urgency shown to patients and staff; null while unknown. */
export type Urgency = 'emergency' | 'urgent' | 'routine' | null;

const C = thresholds.critical;
const D = thresholds.dangerZone;
const Q = thresholds.quality;

function usable(r: Reading | null): number | null {
  return r !== null && r.usable ? r.value : null;
}

/**
 * ESI-oriented triage suggestion from camera-only data. Escalations need a
 * confident reading; without one the result is 'nurse' unless the face was
 * barely seen or the video too choppy to judge at all.
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
    m.pain.severe ||
    (hr !== null && hr > D.heartRateAbove) ||
    (rr !== null && rr > D.respirationAbove);
  if (highRisk) return 2;

  const unreliable = m.quality.faceCoverage < Q.unclearFaceCoverage || m.quality.meanFps < Q.unclearFps;
  return unreliable ? 'unreliable' : 'nurse';
}

/**
 * Overall 0..1 trust in the current result. Capped by recording time (square
 * root, so it rises quickly), then scaled by face coverage, frame rate and the
 * signal quality of the vital signs, heart rate weighted most.
 */
export function overallConfidence(m: MeasurementResult, elapsedMs: number): number {
  const time = Math.sqrt(Math.min(1, elapsedMs / PROTOCOL.confidenceRampMs));
  const video = Math.min(1, m.quality.faceCoverage) * Math.min(1, m.quality.meanFps / Q.minFps);
  const signal = 0.7 * (m.heartRate?.confidence ?? 0) + 0.3 * (m.respiration?.confidence ?? 0);
  return +(time * video * (0.6 + 0.4 * signal)).toFixed(2);
}

export function urgencyOf(level: TriageLevel): Urgency {
  if (level === 1) return 'emergency';
  if (level === 2) return 'urgent';
  if (level === 'nurse') return 'routine';
  return null;
}
