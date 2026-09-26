import { PROTOCOL } from '../config';
import thresholds from '../triage/thresholds.json';
import type { AlertnessResult } from '../types';
import { median } from '../signals/dsp';
import { avg, inRange, type FaceObservation } from './frames';

const T = thresholds.observation;

/** Signed horizontal gaze. Direction convention does not matter; only the left/right separation is used. */
function horizontalGaze(o: FaceObservation): number {
  const b = o.blend;
  return (
    ((b.eyeLookOutLeft ?? 0) + (b.eyeLookInRight ?? 0) - (b.eyeLookInLeft ?? 0) - (b.eyeLookOutRight ?? 0)) / 2
  );
}

export function eyesClosed(o: FaceObservation): boolean {
  return avg(o, 'eyeBlinkLeft', 'eyeBlinkRight') > T.eyeClosedBlendshape;
}

/**
 * Alertness from eye closure during rest (PERCLOS) and whether the eyes follow
 * the on-screen dot to the left and then to the right. `restRange` selects the
 * passive frames used for PERCLOS; the gaze prompt always uses PROTOCOL times.
 */
export function assessAlertness(
  obs: FaceObservation[],
  expectedRestFrames: number,
  restRange: readonly [number, number] = [0, PROTOCOL.restMs],
): AlertnessResult {
  const rest = obs.filter((o) => inRange(o, restRange));
  if (rest.length < expectedRestFrames * 0.5) {
    return { state: 'unknown', followedGaze: null };
  }
  const perclos = rest.filter(eyesClosed).length / rest.length;

  const delay = T.gazeReactionDelayMs;
  const phase = ([s, e]: readonly [number, number]) =>
    obs.filter((o) => inRange(o, [s + delay, e]) && !eyesClosed(o)).map(horizontalGaze);
  const left = phase(PROTOCOL.gazeLeftMs);
  const right = phase(PROTOCOL.gazeRightMs);

  let followedGaze: boolean | null = null;
  if (left.length >= 5 && right.length >= 5) {
    followedGaze = Math.abs(median(left) - median(right)) >= T.gazeResponseMin;
  } else {
    const gazeObs = obs.filter((o) => inRange(o, [PROTOCOL.gazeLeftMs[0], PROTOCOL.gazeRightMs[1]]));
    // Face present but eyes shut throughout the prompt counts as not following.
    if (gazeObs.length >= 10 && gazeObs.filter(eyesClosed).length / gazeObs.length > 0.7) followedGaze = false;
  }

  if (perclos >= T.perclosUnresponsive && followedGaze === false) return { state: 'unresponsive', followedGaze };
  if (perclos >= T.perclosReduced || followedGaze === false) return { state: 'reduced', followedGaze };
  return { state: 'alert', followedGaze };
}
