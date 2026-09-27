import { PROTOCOL } from './config';
import thresholds from './triage/thresholds.json';
import type { MeasurementResult } from './types';

const LOG_EVERY_MS = 5_000;
/** A score change at least this large is logged right away. */
const LOG_SCORE_STEP = 1;

/**
 * Console trace of the pain check for tuning on real devices. Filter the
 * console by "[pain]". Logs when assessability or its reason changes, when
 * the score moves by `LOG_SCORE_STEP` or more, and every `LOG_EVERY_MS`.
 */
export function createPainLogger(): (m: MeasurementResult, elapsedMs: number, sessionId: number) => void {
  let lastKey = '';
  let lastScore = 0;
  let lastT = -Infinity;
  let loggedSession = -1;

  return (m, elapsedMs, sessionId) => {
    if (sessionId !== loggedSession) {
      loggedSession = sessionId;
      const T = thresholds.observation;
      console.log(
        `[pain] session ${sessionId} started. Eyes count as closed when eyeBlink > ${T.eyeClosedBlendshape}; ` +
          `pain needs open-eye share >= ${T.painMinOpenEyeShare}; score uses the last ${PROTOCOL.painRecentMs / 1000} s; ` +
          `raw ${JSON.stringify(T.painScale.raw)} → 0-10 ${JSON.stringify(T.painScale.score)}.`,
      );
    }
    const { reason, ...numbers } = m.pain.debug;
    const key = `${sessionId}|${m.pain.assessable}|${reason ?? ''}`;
    const changed = key !== lastKey;
    const jumped = Math.abs(m.pain.score - lastScore) >= LOG_SCORE_STEP;
    if (!changed && !jumped && elapsedMs - lastT < LOG_EVERY_MS) return;
    lastKey = key;
    lastScore = m.pain.score;
    lastT = elapsedMs;

    const value = m.pain.assessable ? `${m.pain.score.toFixed(1)}/10` : `0/10 DEFAULT, not assessable`;
    const note = changed ? ' ← status changed' : jumped ? ' ← score jumped' : '';
    console.log(`[pain] t=${(elapsedMs / 1000).toFixed(0)}s ${value}${reason ? ` (${reason})` : ''}${note}`, {
      ...numbers,
      consciousness: m.alertness.state,
      perclos: m.alertness.debug.perclos ?? null,
      faceCoverage: +m.quality.faceCoverage.toFixed(2),
      fps: Math.round(m.quality.meanFps),
    });
  };
}
