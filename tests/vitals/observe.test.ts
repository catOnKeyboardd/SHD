import { describe, expect, it } from 'vitest';
import { assessAlertness } from '../../src/vitals/observe/alertness';
import type { FaceObservation } from '../../src/vitals/observe/frames';
import { assessPain } from '../../src/vitals/observe/pain';

const FRAME_MS = 33;

/** `ms` of frames with fixed blendshapes. */
function frames(ms: number, blend: Record<string, number> = { eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 }) {
  const out: FaceObservation[] = [];
  for (let t = 0; t < ms; t += FRAME_MS) out.push({ t, blend });
  return out;
}

const closed = { eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 };
const rest = frames(10_000);
const expected = rest.length;

describe('alertness', () => {
  it('eyes open → alert', () => {
    expect(assessAlertness(rest, expected).state).toBe('alert');
  });

  it('eyes closed about half the time → reduced', () => {
    const obs = [...frames(5_000), ...frames(5_000, closed)];
    expect(assessAlertness(obs, expected).state).toBe('reduced');
  });

  it('eyes closed throughout → unresponsive', () => {
    expect(assessAlertness(frames(10_000, closed), expected).state).toBe('unresponsive');
  });

  it('face missing in most frames → unknown', () => {
    const r = assessAlertness(rest.slice(0, 50), expected);
    expect(r.state).toBe('unknown');
    expect(r.debug.reason).toBeTruthy();
  });
});

describe('pain expression', () => {
  it('neutral face is not severe', () => {
    const r = assessPain(frames(10_000, { eyeBlinkLeft: 0.1, eyeBlinkRight: 0.1, eyeSquintLeft: 0.2, eyeSquintRight: 0.2 }));
    expect(r.assessable).toBe(true);
    expect(r.severe).toBe(false);
  });

  it('sustained grimace is flagged', () => {
    const grimace = {
      browDownLeft: 0.6,
      browDownRight: 0.6,
      eyeSquintLeft: 0.6,
      eyeSquintRight: 0.6,
      noseSneerLeft: 0.4,
      noseSneerRight: 0.4,
    };
    expect(assessPain(frames(10_000, grimace)).severe).toBe(true);
  });

  it('closed eyes are not scored as pain, and say why', () => {
    const r = assessPain(frames(10_000, { ...closed, browDownLeft: 0.8, browDownRight: 0.8 }));
    expect(r.assessable).toBe(false);
    expect(r.severe).toBe(false);
    expect(r.debug.reason).toBe('eyes judged closed');
    expect(r.debug.openShare).toBe(0);
    expect(r.debug.blinkMedian).toBe(0.9);
  });

  it('missing blendshapes are reported as such', () => {
    const r = assessPain(frames(10_000, {}));
    expect(r.assessable).toBe(false);
    expect(r.debug.reason).toBe('no blendshapes from MediaPipe');
  });
});
