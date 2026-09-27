import thresholds from '../triage/thresholds.json';
import type { AlertnessResult } from '../types';
import { median } from '../signals/dsp';
import { avg, type FaceObservation } from './frames';

const T = thresholds.observation;

export function blinkScore(o: FaceObservation): number {
  return avg(o, 'eyeBlinkLeft', 'eyeBlinkRight');
}

export function eyesClosed(o: FaceObservation): boolean {
  return blinkScore(o) > T.eyeClosedBlendshape;
}

const round = (x: number) => +x.toFixed(2);

/**
 * Alertness from the share of passive frames with the eyes closed (PERCLOS).
 * `expectedFrames` is the number of passive video frames in the same span, so
 * a face that is mostly missing gives 'unknown' rather than 'alert'.
 */
export function assessAlertness(rest: FaceObservation[], expectedFrames: number): AlertnessResult {
  if (!rest.length || rest.length < expectedFrames * 0.5) {
    return { state: 'unknown', debug: { reason: 'face missing in most frames', frames: rest.length, expectedFrames } };
  }
  const perclos = rest.filter(eyesClosed).length / rest.length;
  const debug = { perclos: round(perclos), blinkMedian: round(median(rest.map(blinkScore))) };
  if (perclos >= T.perclosUnresponsive) return { state: 'unresponsive', debug };
  if (perclos >= T.perclosReduced) return { state: 'reduced', debug };
  return { state: 'alert', debug };
}
