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

export interface AlertnessResult {
  state: 'alert' | 'reduced' | 'unresponsive' | 'unknown';
  followedGaze: boolean | null;
}

export interface PainResult {
  severe: boolean;
  assessable: boolean;
}

export interface FacialDroopResult {
  positive: boolean;
  assessable: boolean;
}

export interface MeasurementResult {
  heartRate: Reading | null;
  respiration: Reading | null;
  alertness: AlertnessResult;
  pain: PainResult;
  facialDroop: FacialDroopResult;
  quality: { faceCoverage: number; meanFps: number };
}
