import { PROTOCOL } from '../config';
import type { MeasurementResult, Reading } from '../types';
import thresholds from './thresholds.json';

/** Plain-language urgency shown to patients and staff, most urgent first; null while unknown. */
export type Urgency = 'emergency' | 'very-urgent' | 'urgent' | 'standard' | 'non-urgent' | null;

export interface Triage {
  /** null when the face was barely seen or the video too choppy to judge. */
  urgency: Urgency;
  /** Findings that set the urgency, e.g. "pain 7.5". */
  reasons: string[];
}

const Q = thresholds.quality;

function usable(r: Reading | null): number | null {
  return r !== null && r.usable ? r.value : null;
}

/**
 * Camera-only triage in five levels. The most urgent level with a matching
 * finding wins; vital signs only count when their reading is confident.
 * Without any finding the result is 'non-urgent', unless the face was barely
 * seen or the video too choppy to judge at all.
 */
export function triage(m: MeasurementResult): Triage {
  const hr = usable(m.heartRate);
  const rr = usable(m.respiration);
  const pain = m.pain.assessable ? m.pain.score : null;

  const tiers: [Exclude<Urgency, null>, [boolean, string][]][] = [
    [
      'emergency',
      [
        [hr !== null && (hr < thresholds.critical.heartRateBelow || hr > thresholds.critical.heartRateAbove), `heart rate ${hr}`],
        [rr !== null && (rr < thresholds.critical.respirationBelow || rr > thresholds.critical.respirationAbove), `respiration ${rr}`],
        [m.alertness.state === 'unresponsive', 'unresponsive'],
      ],
    ],
    [
      'very-urgent',
      [
        [m.alertness.state === 'reduced', 'reduced alertness'],
        [pain !== null && pain >= thresholds.veryUrgent.pain, `pain ${pain}`],
        [hr !== null && hr > thresholds.veryUrgent.heartRateAbove, `heart rate ${hr}`],
        [rr !== null && rr > thresholds.veryUrgent.respirationAbove, `respiration ${rr}`],
      ],
    ],
    [
      'urgent',
      [
        [pain !== null && pain >= thresholds.urgent.pain, `pain ${pain}`],
        [hr !== null && hr > thresholds.urgent.heartRateAbove, `heart rate ${hr}`],
        [rr !== null && rr > thresholds.urgent.respirationAbove, `respiration ${rr}`],
      ],
    ],
    [
      'standard',
      [
        [pain !== null && pain >= thresholds.standard.pain, `pain ${pain}`],
        [hr !== null && (hr > thresholds.standard.heartRateAbove || hr < thresholds.standard.heartRateBelow), `heart rate ${hr}`],
        [rr !== null && (rr > thresholds.standard.respirationAbove || rr < thresholds.standard.respirationBelow), `respiration ${rr}`],
      ],
    ],
  ];

  for (const [urgency, findings] of tiers) {
    const reasons = findings.filter(([hit]) => hit).map(([, why]) => why);
    if (reasons.length) return { urgency, reasons };
  }
  const unreliable = m.quality.faceCoverage < Q.unclearFaceCoverage || m.quality.meanFps < Q.unclearFps;
  return unreliable ? { urgency: null, reasons: ['face barely visible or video too choppy'] } : { urgency: 'non-urgent', reasons: [] };
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
