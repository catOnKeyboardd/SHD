/** Measurement protocol and signal-processing parameters. */
export const PROTOCOL = {
  /** Prompted cycle length, and the rolling window used for continuous monitoring afterwards. */
  totalMs: 20_000,
  /** Interval between result updates. */
  liveIntervalMs: 1_000,
  /** After the prompted cycle, rolling results start once this much monitoring data exists. */
  minMonitorWindowMs: 10_000,
  /** No face for this long means the patient left; the page returns to positioning. */
  patientLeftMs: 5_000,
  /** Quiet period used for heart rate and passive observation. */
  restMs: 14_000,
  /** Eye-tracking prompt: dot on the left, then on the right. */
  gazeLeftMs: [14_000, 15_500] as const,
  gazeRightMs: [15_500, 17_000] as const,
  /** Smile prompt for facial-symmetry check. */
  smileMs: [17_000, 20_000] as const,
  /** Quality gate must pass continuously this long before measurement auto-starts. */
  gateHoldMs: 1_500,
  /** Pose inference interval; respiration needs far less than video rate. */
  poseIntervalMs: 66,
};

export const HEART_RATE = {
  resampleHz: 30,
  bandHz: [0.7, 3.5] as const, // 42–210 bpm
  minDurationSec: 8,
  snrHalfWidthHz: 0.1,
  /** SNR (dB) mapped linearly to confidence 0..1. */
  snrForZeroConfidence: -4,
  snrForFullConfidence: 4,
  /** Minimum share of the window in which a ROI must be visible. */
  minCoverage: 0.8,
};

export const RESPIRATION = {
  resampleHz: 10,
  bandHz: [0.1, 1.0] as const, // 6–60 breaths/min
  minDurationSec: 10,
  snrHalfWidthHz: 0.05,
  snrForZeroConfidence: -3,
  snrForFullConfidence: 5,
  /** Spectral and peak-count estimates disagreeing by more than this lower confidence. */
  agreementRpm: 5,
};

/** Readings with confidence below this are shown but never used for triage. */
export const MIN_CONFIDENCE_FOR_TRIAGE = 0.5;
