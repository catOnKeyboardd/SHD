import thresholds from '../triage/thresholds.json';
import type { PainResult } from '../types';
import { median } from '../signals/dsp';
import { blinkScore, eyesClosed } from './alertness';
import { avg, type FaceObservation } from './frames';

const T = thresholds.observation;
const round = (x: number) => +x.toFixed(2);

/**
 * Approximation of the Prkachin–Solomon Pain Intensity action units from
 * MediaPipe blendshapes: brow lowering (AU4), orbital tightening (AU6/7) and
 * levator contraction (AU9/10). Eye closure (AU43) is left to the alertness
 * module so a sleeping patient is not scored as being in pain.
 */
function actionUnits(o: FaceObservation) {
  return {
    au4: avg(o, 'browDownLeft', 'browDownRight'),
    au67: Math.max(avg(o, 'cheekSquintLeft', 'cheekSquintRight'), avg(o, 'eyeSquintLeft', 'eyeSquintRight')),
    au910: Math.max(avg(o, 'noseSneerLeft', 'noseSneerRight'), avg(o, 'mouthUpperUpLeft', 'mouthUpperUpRight')),
  };
}

/** Pain expression over passive (unprompted) frames. */
export function assessPain(rest: FaceObservation[]): PainResult {
  const open = rest.filter((o) => !eyesClosed(o));
  const openShare = rest.length ? open.length / rest.length : 0;
  const debug = {
    frames: rest.length,
    blendshapes: rest.length ? Object.keys(rest[rest.length - 1].blend).length : 0,
    openShare: round(openShare),
    blinkMedian: rest.length ? round(median(rest.map(blinkScore))) : null,
  };
  if (rest.length && openShare < T.painMinOpenEyeShare) {
    return { severe: false, assessable: false, debug: { reason: 'eyes judged closed', ...debug } };
  }
  if (open.length < 20) {
    return { severe: false, assessable: false, debug: { reason: 'too few face frames', ...debug } };
  }
  const aus = open.map(actionUnits);
  const au4 = median(aus.map((a) => a.au4));
  const au67 = median(aus.map((a) => a.au67));
  const au910 = median(aus.map((a) => a.au910));
  const score = median(aus.map((a) => a.au4 + a.au67 + a.au910));
  return {
    severe: score >= T.painSevereScore,
    assessable: true,
    debug: { ...debug, score: round(score), au4: round(au4), au67: round(au67), au910: round(au910) },
  };
}
