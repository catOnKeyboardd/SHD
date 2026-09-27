export type Rgb = [number, number, number];

export type RoiName = 'forehead' | 'leftCheek' | 'rightCheek';

/** Mean skin colour of each face region for one video frame. */
export interface RoiFrame {
  t: number;
  rois: Partial<Record<RoiName, Rgb>>;
}

/** A numeric vital sign with a 0..1 confidence derived from signal quality. */
export interface Reading {
  value: number;
  confidence: number;
  /** True when confidence is high enough for the triage engine to act on it. */
  usable: boolean;
}

/** Why an observation came out the way it did: a `reason` when not assessable, plus the numbers behind it. */
export type Diagnostics = Record<string, string | number | null>;

export interface AlertnessResult {
  state: 'alert' | 'reduced' | 'unresponsive' | 'unknown';
  debug: Diagnostics;
}

export interface PainResult {
  severe: boolean;
  assessable: boolean;
  debug: Diagnostics;
}

export interface FacialDroopResult {
  positive: boolean;
  assessable: boolean;
  debug: Diagnostics;
}

export interface MeasurementResult {
  heartRate: Reading | null;
  respiration: Reading | null;
  alertness: AlertnessResult;
  pain: PainResult;
  facialDroop: FacialDroopResult;
  quality: { faceCoverage: number; meanFps: number };
}
