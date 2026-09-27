import thresholds from '../triage/thresholds.json';
import type { FacialDroopResult } from '../types';
import { median } from '../signals/dsp';
import type { FaceObservation } from './frames';

const T = thresholds.observation;
const round = (x: number) => +x.toFixed(3);

/**
 * Smile symmetry: how far each mouth corner rises from its resting height
 * (`rest` frames) while smiling on request (`smile` frames), combined with
 * MediaPipe's per-side smile scores.
 */
export function assessFacialDroop(rest: FaceObservation[], smile: FaceObservation[]): FacialDroopResult {
  const counts = { restFrames: rest.length, smileFrames: smile.length };
  if (rest.length < 20 || smile.length < 8) {
    return { positive: false, assessable: false, debug: { reason: 'too few face frames', ...counts } };
  }

  const baseA = median(rest.map((o) => o.cornerA));
  const baseB = median(rest.map((o) => o.cornerB));
  const lifts = smile.map((o) => ({ a: baseA - o.cornerA, b: baseB - o.cornerB, o }));
  // Use the peak half of the smile so onset and fatigue frames do not dilute it.
  const cutoff = median(lifts.map((l) => Math.max(l.a, l.b)));
  const peak = lifts.filter((l) => Math.max(l.a, l.b) >= cutoff);

  const liftA = median(peak.map((l) => l.a));
  const liftB = median(peak.map((l) => l.b));
  const maxLift = Math.max(liftA, liftB);
  const smileL = median(peak.map((l) => l.o.blend.mouthSmileLeft ?? 0));
  const smileR = median(peak.map((l) => l.o.blend.mouthSmileRight ?? 0));
  const debug = { ...counts, liftA: round(liftA), liftB: round(liftB), smileL: round(smileL), smileR: round(smileR) };
  if (maxLift < T.smileMinLift) {
    return { positive: false, assessable: false, debug: { reason: 'no smile detected', ...debug } };
  }

  const geoAsym = Math.abs(liftA - liftB) / maxLift;
  const blendAsym = Math.max(smileL, smileR) > 0.1 ? Math.abs(smileL - smileR) / Math.max(smileL, smileR) : 0;
  const asymmetry = Math.max(geoAsym, blendAsym);
  return {
    positive: asymmetry >= T.smileAsymmetryPositive,
    assessable: true,
    debug: { ...debug, asymmetry: round(asymmetry) },
  };
}
