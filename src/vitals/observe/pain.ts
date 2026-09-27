import { PROTOCOL } from '../config';
import thresholds from '../triage/thresholds.json';
import type { PainResult } from '../types';
import { median } from '../signals/dsp';
import { blinkScore, eyesClosed } from './alertness';
import { avg, type FaceObservation } from './frames';

const T = thresholds.observation;
const round = (x: number) => +x.toFixed(2);

function quantile(x: number[], q: number): number {
  if (!x.length) return NaN;
  const a = [...x].sort((p, r) => p - r);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))];
}

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

/**
 * Eye-closure statistics behind the open-eye gate. Looking down at a screen
 * below the camera, narrow eyes or glasses glare can push `eyeBlink*` over the
 * closed threshold with the eyes open; these numbers show whether that happens.
 */
function eyeStats(obs: FaceObservation[]) {
  const blink = obs.map(blinkScore);
  const nearGate = blink.filter((b) => Math.abs(b - T.eyeClosedBlendshape) <= 0.1).length;
  return {
    blinkMedian: round(median(blink)),
    blinkP10: round(quantile(blink, 0.1)),
    blinkP90: round(quantile(blink, 0.9)),
    blinkLeft: round(median(obs.map((o) => o.blend.eyeBlinkLeft ?? 0))),
    blinkRight: round(median(obs.map((o) => o.blend.eyeBlinkRight ?? 0))),
    lookDown: round(median(obs.map((o) => avg(o, 'eyeLookDownLeft', 'eyeLookDownRight')))),
    eyeSquint: round(median(obs.map((o) => avg(o, 'eyeSquintLeft', 'eyeSquintRight')))),
    nearGateShare: round(nearGate / obs.length),
  };
}

/** Raw expression score (0..3) to 0..10 with one decimal, via `thresholds.observation.painScale`. */
export function toPainScale(raw: number): number {
  const { raw: xs, score: ys } = T.painScale;
  if (raw <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (raw <= xs[i]) return +(ys[i - 1] + ((raw - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1])).toFixed(1);
  }
  return ys[ys.length - 1];
}

const MIN_RECENT_FRAMES = 5;

/**
 * Pain expression. Whether the face can be assessed (eyes open often enough)
 * is judged over all `obs`; the score uses only the last
 * `PROTOCOL.painRecentMs` so it follows expression changes. Falls back to 0
 * when it cannot be assessed.
 */
export function assessPain(obs: FaceObservation[]): PainResult {
  const blendshapes = obs.length ? Object.keys(obs[obs.length - 1].blend).length : 0;
  if (!obs.length || blendshapes === 0) {
    return {
      score: 0,
      assessable: false,
      debug: { reason: obs.length ? 'no blendshapes from MediaPipe' : 'no face frames', frames: obs.length, blendshapes },
    };
  }
  const open = obs.filter((o) => !eyesClosed(o));
  const openShare = open.length / obs.length;
  const debug = { frames: obs.length, blendshapes, openShare: round(openShare), ...eyeStats(obs) };
  if (openShare < T.painMinOpenEyeShare) {
    return { score: 0, assessable: false, debug: { reason: 'eyes judged closed', ...debug } };
  }
  if (open.length < 20) {
    return { score: 0, assessable: false, debug: { reason: 'too few face frames', ...debug } };
  }
  const cutoff = obs[obs.length - 1].t - PROTOCOL.painRecentMs;
  let recent = open.filter((o) => o.t >= cutoff);
  if (recent.length < MIN_RECENT_FRAMES) recent = open.slice(-20);
  const aus = recent.map(actionUnits);
  const raw = median(aus.map((a) => a.au4 + a.au67 + a.au910));
  return {
    score: toPainScale(raw),
    assessable: true,
    debug: {
      ...debug,
      recentFrames: recent.length,
      raw: round(raw),
      au4: round(median(aus.map((a) => a.au4))),
      au67: round(median(aus.map((a) => a.au67))),
      au910: round(median(aus.map((a) => a.au910))),
    },
  };
}
