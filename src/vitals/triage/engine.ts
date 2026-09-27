import { MIN_CONFIDENCE_FOR_TRIAGE, PROTOCOL } from '../config';
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

/**
 * Overall 0..1 trust in the current result. Capped by recording time so it
 * starts low and grows, then scaled by face coverage, frame rate and the
 * signal quality of the vital signs.
 */
export function overallConfidence(m: MeasurementResult, elapsedMs: number): number {
  const time = Math.min(1, elapsedMs / PROTOCOL.confidenceRampMs);
  const video = Math.min(1, m.quality.faceCoverage) * Math.min(1, m.quality.meanFps / Q.minFps);
  const signal = ((m.heartRate?.confidence ?? 0) + (m.respiration?.confidence ?? 0)) / 2;
  return +(time * video * (0.4 + 0.6 * signal)).toFixed(2);
}

/**
 * Escalations are reported as soon as they are found; a reassuring 'routine'
 * needs the overall confidence to be high enough.
 */
export function urgencyOf(level: TriageLevel, confidence: number): Urgency {
  if (level === 1) return 'emergency';
  if (level === 2) return 'urgent';
  if (level === 'nurse' && confidence >= MIN_CONFIDENCE_FOR_TRIAGE) return 'routine';
  return null;
}
