import thresholds from './triage/thresholds.json';
import type { MeasurementResult } from './types';

const LOG_EVERY_MS = 5_000;

/**
 * Console trace of the pain check for tuning on real devices. Filter the
 * console by "[pain]". Logs when the result or its reason changes, and every
 * `LOG_EVERY_MS` otherwise.
 */
export function createPainLogger(): (m: MeasurementResult, elapsedMs: number, sessionId: number) => void {
  let lastKey = '';
  let lastT = -Infinity;
  let loggedSession = -1;

  return (m, elapsedMs, sessionId) => {
    if (sessionId !== loggedSession) {
      loggedSession = sessionId;
      const T = thresholds.observation;
      console.log(
        `[pain] session ${sessionId} started. Eyes count as closed when eyeBlink > ${T.eyeClosedBlendshape}; ` +
          `pain needs open-eye share >= ${T.painMinOpenEyeShare}; severe when score >= ${T.painSevereScore}.`,
      );
    }
    const { reason, ...numbers } = m.pain.debug;
    const value = m.pain.assessable ? (m.pain.severe ? 'severe' : 'none') : 'EMPTY';
    const key = `${sessionId}|${value}|${reason ?? ''}`;
    if (key === lastKey && elapsedMs - lastT < LOG_EVERY_MS) return;
    const changed = key !== lastKey;
    lastKey = key;
    lastT = elapsedMs;

    console.log(
      `[pain] t=${(elapsedMs / 1000).toFixed(0)}s ${value}${reason ? ` (${reason})` : ''}${changed ? ' ← changed' : ''}`,
      {
        ...numbers,
        consciousness: m.alertness.state,
        perclos: m.alertness.debug.perclos ?? null,
        faceCoverage: +m.quality.faceCoverage.toFixed(2),
        fps: Math.round(m.quality.meanFps),
      },
    );
  };
}
