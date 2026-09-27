/** Measurement protocol and signal-processing parameters. */
export const PROTOCOL = {
  /** Rolling window all results are computed over. */
  windowMs: 20_000,
  /** Interval between result updates. */
  liveIntervalMs: 1_000,
  /** No face for this long means the patient left; the page returns to positioning. */
  patientLeftMs: 5_000,
  /** Overall confidence cannot exceed elapsed / this, so it starts low and grows. */
  confidenceRampMs: 30_000,
  /** Passive face data needed before eye closure and pain are judged. */
  minObservationMs: 5_000,
  /** Passive data before the first smile prompt; also the resting baseline for it. */
  smileFirstPromptMs: 10_000,
  /** Smile prompt length. The first `smileSettleMs` is skipped while the patient hears the prompt and reacts. */
  smilePromptMs: 5_000,
  smileSettleMs: 1_500,
  /** Pause before prompting again when a smile could not be assessed. */
  smileRetryMs: 15_000,
  smileMaxAttempts: 3,
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
