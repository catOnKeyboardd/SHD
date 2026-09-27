/** Measurement protocol and signal-processing parameters. */
export const PROTOCOL = {
  /** Rolling window all results are computed over. */
  windowMs: 20_000,
  /** Interval between result updates. */
  liveIntervalMs: 1_000,
  /** No face for this long means the patient left; the page returns to positioning. */
  patientLeftMs: 5_000,
  /** Overall confidence is capped by sqrt(elapsed / this), so it starts low and grows quickly. */
  confidenceRampMs: 15_000,
  /** "Unclear" (data too poor to judge) is only shown after this much recording. */
  unclearAfterMs: 30_000,
  /** A heart-rate or respiration estimate is shown for this long when no new one can be made. */
  vitalsHoldMs: 15_000,
  /** Face data needed before eye closure and pain are judged. */
  minObservationMs: 5_000,
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
