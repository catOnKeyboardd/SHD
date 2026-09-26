import { PROTOCOL } from '../config';
import thresholds from '../triage/thresholds.json';
import type { FacialDroopResult } from '../types';
import { median } from '../signals/dsp';
import { inRange, type FaceObservation } from './frames';

const T = thresholds.observation;

/**
 * Smile symmetry: how far each mouth corner rises from its resting height
 * during the smile prompt, combined with MediaPipe's per-side smile scores.
 */
export function assessFacialDroop(obs: FaceObservation[]): FacialDroopResult {
  const rest = obs.filter((o) => o.t < PROTOCOL.restMs);
  const [s, e] = PROTOCOL.smileMs;
  const smile = obs.filter((o) => inRange(o, [s + T.smileSettleMs, e]));
  const notAssessable = { positive: false, assessable: false };
  if (rest.length < 20 || smile.length < 8) return notAssessable;

  const baseA = median(rest.map((o) => o.cornerA));
  const baseB = median(rest.map((o) => o.cornerB));
  const lifts = smile.map((o) => ({ a: baseA - o.cornerA, b: baseB - o.cornerB, o }));
  // Use the peak half of the smile so onset and fatigue frames do not dilute it.
  const cutoff = median(lifts.map((l) => Math.max(l.a, l.b)));
  const peak = lifts.filter((l) => Math.max(l.a, l.b) >= cutoff);

  const liftA = median(peak.map((l) => l.a));
  const liftB = median(peak.map((l) => l.b));
  const maxLift = Math.max(liftA, liftB);
  if (maxLift < T.smileMinLift) return notAssessable;

  const geoAsym = Math.abs(liftA - liftB) / maxLift;
  const smileL = median(peak.map((l) => l.o.blend.mouthSmileLeft ?? 0));
  const smileR = median(peak.map((l) => l.o.blend.mouthSmileRight ?? 0));
  const blendAsym = Math.max(smileL, smileR) > 0.1 ? Math.abs(smileL - smileR) / Math.max(smileL, smileR) : 0;
  return { positive: Math.max(geoAsym, blendAsym) >= T.smileAsymmetryPositive, assessable: true };
}
