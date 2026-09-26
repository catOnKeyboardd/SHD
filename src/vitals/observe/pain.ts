import { PROTOCOL } from '../config';
import thresholds from '../triage/thresholds.json';
import type { PainResult } from '../types';
import { median } from '../signals/dsp';
import { eyesClosed } from './alertness';
import { avg, inRange, type FaceObservation } from './frames';

const T = thresholds.observation;

/**
 * Approximation of the Prkachin–Solomon Pain Intensity action units from
 * MediaPipe blendshapes: brow lowering (AU4), orbital tightening (AU6/7) and
 * levator contraction (AU9/10). Eye closure (AU43) is left to the alertness
 * module so a sleeping patient is not scored as being in pain.
 */
function painScore(o: FaceObservation): number {
  const au4 = avg(o, 'browDownLeft', 'browDownRight');
  const au67 = Math.max(avg(o, 'cheekSquintLeft', 'cheekSquintRight'), avg(o, 'eyeSquintLeft', 'eyeSquintRight'));
  const au910 = Math.max(avg(o, 'noseSneerLeft', 'noseSneerRight'), avg(o, 'mouthUpperUpLeft', 'mouthUpperUpRight'));
  return au4 + au67 + au910;
}

export function assessPain(
  obs: FaceObservation[],
  restRange: readonly [number, number] = [0, PROTOCOL.restMs],
): PainResult {
  const rest = obs.filter((o) => inRange(o, restRange));
  const open = rest.filter((o) => !eyesClosed(o));
  if (!rest.length || open.length / rest.length < T.painMinOpenEyeShare || open.length < 20) {
    return { severe: false, assessable: false };
  }
  return { severe: median(open.map(painScore)) >= T.painSevereScore, assessable: true };
}
