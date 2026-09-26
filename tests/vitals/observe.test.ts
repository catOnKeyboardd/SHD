import { describe, expect, it } from 'vitest';
import { PROTOCOL } from '../../src/vitals/config';
import { assessAlertness } from '../../src/vitals/observe/alertness';
import { assessFacialDroop } from '../../src/vitals/observe/facialDroop';
import type { FaceObservation } from '../../src/vitals/observe/frames';
import { assessPain } from '../../src/vitals/observe/pain';

const FRAME_MS = 33;

interface Script {
  rest?: Record<string, number>;
  gazeLeft?: Record<string, number>;
  gazeRight?: Record<string, number>;
  smile?: Record<string, number>;
  restCorners?: [number, number];
  smileCorners?: [number, number];
}

/** Builds a 20 s observation stream where each protocol phase has fixed blendshapes. */
function stream(s: Script): FaceObservation[] {
  const out: FaceObservation[] = [];
  for (let t = 0; t < PROTOCOL.totalMs; t += FRAME_MS) {
    let blend = s.rest ?? {};
    let corners = s.restCorners ?? [0.9, 0.9];
    if (t >= PROTOCOL.gazeLeftMs[0] && t < PROTOCOL.gazeLeftMs[1]) blend = s.gazeLeft ?? blend;
    else if (t >= PROTOCOL.gazeRightMs[0] && t < PROTOCOL.gazeRightMs[1]) blend = s.gazeRight ?? blend;
    else if (t >= PROTOCOL.smileMs[0]) {
      blend = s.smile ?? blend;
      corners = s.smileCorners ?? corners;
    }
    out.push({ t, blend, cornerA: corners[0], cornerB: corners[1] });
  }
  return out;
}

const restFrames = Math.ceil(PROTOCOL.restMs / FRAME_MS);
const lookLeft = { eyeLookOutLeft: 0.6, eyeLookInRight: 0.6 };
const lookRight = { eyeLookInLeft: 0.6, eyeLookOutRight: 0.6 };
const closed = { eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 };

describe('alertness', () => {
  it('eyes open and following the dot → alert', () => {
    const r = assessAlertness(stream({ gazeLeft: lookLeft, gazeRight: lookRight }), restFrames);
    expect(r.state).toBe('alert');
    expect(r.followedGaze).toBe(true);
  });

  it('eyes open but not following → reduced', () => {
    const r = assessAlertness(stream({}), restFrames);
    expect(r.state).toBe('reduced');
    expect(r.followedGaze).toBe(false);
  });

  it('eyes closed throughout → unresponsive', () => {
    const r = assessAlertness(stream({ rest: closed }), restFrames);
    expect(r.state).toBe('unresponsive');
  });

  it('mostly closed eyes at rest but following the dot → reduced', () => {
    const r = assessAlertness(stream({ rest: closed, gazeLeft: lookLeft, gazeRight: lookRight }), restFrames);
    expect(r.state).toBe('reduced');
    expect(r.followedGaze).toBe(true);
  });

  it('too few face frames → unknown', () => {
    const r = assessAlertness(stream({}).slice(0, 50), restFrames);
    expect(r.state).toBe('unknown');
  });
});

describe('pain expression', () => {
  it('neutral face is not severe', () => {
    const r = assessPain(stream({ rest: { eyeSquintLeft: 0.2, eyeSquintRight: 0.2 } }));
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
    expect(assessPain(stream({ rest: grimace })).severe).toBe(true);
  });

  it('closed eyes are not scored as pain', () => {
    const r = assessPain(stream({ rest: { ...closed, browDownLeft: 0.8, browDownRight: 0.8 } }));
    expect(r.assessable).toBe(false);
    expect(r.severe).toBe(false);
  });
});

describe('continuous monitoring window', () => {
  /** Prompted cycle followed by `extraMs` of monitoring frames with the given blendshapes. */
  function withMonitoring(cycle: FaceObservation[], blend: Record<string, number>, extraMs: number) {
    const out = [...cycle];
    for (let t = PROTOCOL.totalMs; t < PROTOCOL.totalMs + extraMs; t += FRAME_MS) {
      out.push({ t, blend, cornerA: 0.9, cornerB: 0.9 });
    }
    return out;
  }
  const cycle = stream({ gazeLeft: lookLeft, gazeRight: lookRight });
  const window: [number, number] = [PROTOCOL.totalMs, Infinity];
  const windowFrames = Math.ceil(15_000 / FRAME_MS);

  it('eyes closing after the prompted cycle → reduced, keeping the gaze result', () => {
    const r = assessAlertness(withMonitoring(cycle, closed, 15_000), windowFrames, window);
    expect(r.followedGaze).toBe(true);
    expect(r.state).toBe('reduced');
  });

  it('eyes open during monitoring → alert', () => {
    expect(assessAlertness(withMonitoring(cycle, {}, 15_000), windowFrames, window).state).toBe('alert');
  });

  it('pain uses only the monitoring window', () => {
    const grimace = { browDownLeft: 0.6, browDownRight: 0.6, eyeSquintLeft: 0.6, eyeSquintRight: 0.6, noseSneerLeft: 0.4, noseSneerRight: 0.4 };
    const obs = withMonitoring(cycle, grimace, 15_000);
    expect(assessPain(obs).severe).toBe(false);
    expect(assessPain(obs, window).severe).toBe(true);
  });
});

describe('facial droop (smile symmetry)', () => {
  it('symmetric smile is negative', () => {
    const r = assessFacialDroop(
      stream({ smileCorners: [0.8, 0.8], smile: { mouthSmileLeft: 0.7, mouthSmileRight: 0.7 } }),
    );
    expect(r.assessable).toBe(true);
    expect(r.positive).toBe(false);
  });

  it('one-sided smile is positive', () => {
    const r = assessFacialDroop(
      stream({ smileCorners: [0.8, 0.89], smile: { mouthSmileLeft: 0.7, mouthSmileRight: 0.15 } }),
    );
    expect(r.positive).toBe(true);
  });

  it('no smile attempt is not assessable', () => {
    const r = assessFacialDroop(stream({}));
    expect(r.assessable).toBe(false);
    expect(r.positive).toBe(false);
  });
});
