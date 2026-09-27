import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { PROTOCOL } from '../config';
import { assessAlertness } from '../observe/alertness';
import { assessFacialDroop } from '../observe/facialDroop';
import { inRange, type FaceObservation } from '../observe/frames';
import { assessPain } from '../observe/pain';
import type { TimedValue } from '../signals/dsp';
import { estimateHeartRate } from '../signals/heartRate';
import { estimateRespiration } from '../signals/respiration';
import type { FacialDroopResult, MeasurementResult, Reading, RoiFrame } from '../types';
import type { Landmarkers } from '../vision/landmarkers';
import thresholds from '../triage/thresholds.json';
import { roiPixelPolygons, sampleRois } from './roi';

export interface GateStatus {
  face: boolean;
  distance: 'ok' | 'far' | 'near' | null;
  centered: boolean;
  shoulders: boolean;
  lighting: 'ok' | 'dark' | 'bright' | null;
  smooth: boolean;
  ok: boolean;
}

export interface FrameInfo {
  gate: GateStatus;
  recording: boolean;
  elapsedMs: number;
  /** Prompt the patient should be following right now. */
  prompt: 'smile' | null;
}

interface FrameRecord {
  t: number;
  face: boolean;
  /** No prompt was running during this frame. */
  passive: boolean;
  moving: boolean;
  brightnessJump: boolean;
}

const MIN_SKIN_RATIO = 0.3;
const POSE_LEFT_SHOULDER = 11;
const POSE_RIGHT_SHOULDER = 12;

type Pt = { x: number; y: number };

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Drop entries of a time-sorted array with `from <= t < to`. */
function dropRange<T extends { t: number }>(arr: T[], from: number, to: number): void {
  let i0 = 0;
  while (i0 < arr.length && arr[i0].t < from) i0++;
  let i1 = i0;
  while (i1 < arr.length && arr[i1].t < to) i1++;
  if (i1 > i0) arr.splice(i0, i1 - i0);
}
interface SmileCheck {
  attempts: number;
  /** Elapsed time at which the next prompt may start. */
  nextAt: number;
  /** Elapsed time the running prompt started, or null when none is running. */
  promptStart: number | null;
  result: FacialDroopResult | null;
}

/**
 * Per-frame processing loop: runs the landmarkers, evaluates the positioning
 * gate and, while recording, accumulates the raw traces the estimators need.
 *
 * Recording is continuous: vitals, eye closure and pain are recomputed over
 * the latest `PROTOCOL.windowMs`. Once enough resting data exists the patient
 * is asked to smile; the prompt repeats until the smile can be assessed or
 * `PROTOCOL.smileMaxAttempts` is reached.
 */
export class Pipeline {
  onFrame: (info: FrameInfo) => void = () => {};
  /** Result from the latest window, emitted every `PROTOCOL.liveIntervalMs`. */
  onResult: (result: MeasurementResult, elapsedMs: number) => void = () => {};
  /** Face lost long enough to assume the patient left; recording has stopped. */
  onPatientLeft: () => void = () => {};

  private readonly work = document.createElement('canvas');
  private readonly ctx = this.work.getContext('2d', { willReadFrequently: true })!;
  private readonly overlayCtx: CanvasRenderingContext2D;
  private running = false;
  private lastTs = 0;
  private lastPoseTs = 0;
  private lastShoulders: { l: NormalizedLandmark; r: NormalizedLandmark; t: number } | null = null;
  private frameTimes: number[] = [];

  private recording = false;
  private startT = 0;
  private lastResultT = 0;
  private lastResult: MeasurementResult | null = null;
  private lastFaceT = 0;
  private smile: SmileCheck = { attempts: 0, nextAt: 0, promptStart: null, result: null };
  /** Start of the uninterrupted passive stretch the vitals are computed from. */
  private vitalsStart = 0;
  /** Vitals from before the last prompt, shown until the new stretch is long enough. */
  private held: { heartRate: Reading | null; respiration: Reading | null; until: number } | null = null;
  private roiFrames: RoiFrame[] = [];
  private faceObs: FaceObservation[] = [];
  private shoulderY: TimedValue[] = [];
  private foreheadLum: TimedValue[] = [];
  private frameLog: FrameRecord[] = [];
  private lastNose: Pt | null = null;
  private lastLum: number | null = null;

  constructor(
    private readonly video: HTMLVideoElement,
    overlay: HTMLCanvasElement,
    private readonly lm: Landmarkers,
  ) {
    this.overlayCtx = overlay.getContext('2d')!;
  }

  start(): void {
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    this.recording = false;
  }

  beginRecording(): void {
    this.roiFrames = [];
    this.faceObs = [];
    this.shoulderY = [];
    this.foreheadLum = [];
    this.frameLog = [];
    this.lastNose = null;
    this.lastLum = null;
    this.lastResultT = 0;
    this.lastResult = null;
    this.smile = { attempts: 0, nextAt: PROTOCOL.smileFirstPromptMs, promptStart: null, result: null };
    this.vitalsStart = 0;
    this.held = null;
    this.startT = performance.now();
    this.lastFaceT = this.startT;
    this.recording = true;
  }

  private schedule(): void {
    if (!this.running) return;
    const v = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => this.tick());
    else requestAnimationFrame(() => this.tick());
  }

  private tick(): void {
    if (!this.running) return;
    try {
      if (this.video.readyState >= 2 && this.video.videoWidth > 0) this.process();
    } catch (err) {
      console.error(err);
    }
    this.schedule();
  }

  private process(): void {
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;

    const w = this.video.videoWidth;
    const h = this.video.videoHeight;
    if (this.work.width !== w || this.work.height !== h) {
      this.work.width = w;
      this.work.height = h;
      this.overlayCtx.canvas.width = w;
      this.overlayCtx.canvas.height = h;
    }
    this.ctx.drawImage(this.video, 0, 0, w, h);

    this.frameTimes.push(ts);
    if (this.frameTimes.length > 30) this.frameTimes.shift();
    const fps =
      this.frameTimes.length > 1
        ? ((this.frameTimes.length - 1) * 1000) / (ts - this.frameTimes[0])
        : 0;

    const faceRes = this.lm.face.detectForVideo(this.work, ts);
    const face = faceRes.faceLandmarks[0];
    const blend: Record<string, number> = {};
    for (const c of faceRes.faceBlendshapes[0]?.categories ?? []) blend[c.categoryName] = c.score;

    let poseRan = false;
    if (ts - this.lastPoseTs >= PROTOCOL.poseIntervalMs) {
      this.lastPoseTs = ts;
      poseRan = true;
      const poseRes = this.lm.pose.detectForVideo(this.work, ts);
      const p = poseRes.landmarks[0];
      this.lastShoulders = p ? { l: { ...p[POSE_LEFT_SHOULDER] }, r: { ...p[POSE_RIGHT_SHOULDER] }, t: ts } : null;
      poseRes.close();
    }
    const sh = this.lastShoulders && ts - this.lastShoulders.t < 500 ? this.lastShoulders : null;
    const shouldersOk = !!sh && [sh.l, sh.r].every((s) => (s.visibility ?? 1) > 0.5 && s.y < 0.97 && s.y > 0);

    const rois = face ? sampleRois(this.ctx, face, w, h) : {};
    const px = (i: number): Pt => ({ x: face[i].x * w, y: face[i].y * h });

    let distance: GateStatus['distance'] = null;
    let centered = false;
    let iod = 0;
    let eyeL: Pt = { x: 0, y: 0 };
    let eyeR: Pt = { x: 0, y: 0 };
    if (face) {
      eyeL = mid(px(33), px(133));
      eyeR = mid(px(362), px(263));
      iod = Math.hypot(eyeR.x - eyeL.x, eyeR.y - eyeL.y);
      const ratio = iod / w;
      distance = ratio < 0.05 ? 'far' : ratio > 0.2 ? 'near' : 'ok';
      const nose = face[1];
      centered = nose.x > 0.25 && nose.x < 0.75 && nose.y > 0.15 && nose.y < 0.65;
    }
    const lum = rois.forehead?.luminance;
    const lighting: GateStatus['lighting'] = lum === undefined ? null : lum < 60 ? 'dark' : lum > 225 ? 'bright' : 'ok';
    const smooth = fps >= thresholds.quality.minFps;
    const gate: GateStatus = {
      face: !!face,
      distance,
      centered,
      shoulders: shouldersOk,
      lighting,
      smooth,
      ok: !!face && distance === 'ok' && centered && shouldersOk && lighting === 'ok' && smooth,
    };

    let elapsed = 0;
    if (this.recording) {
      elapsed = ts - this.startT;
      if (face) this.lastFaceT = ts;
      if (ts - this.lastFaceT > PROTOCOL.patientLeftMs) {
        this.recording = false;
        this.draw(face, sh, w, h, gate.ok);
        this.onPatientLeft();
        return;
      }
      this.updateSmilePrompt(elapsed, !!face);
      this.record(elapsed, face, blend, rois, iod, eyeL, eyeR, px, sh, poseRan, w, h);
      this.prune(elapsed);
    }

    this.draw(face, sh, w, h, gate.ok);
    const prompt = this.recording && this.smile.promptStart !== null ? 'smile' : null;
    this.onFrame({ gate, recording: this.recording, elapsedMs: elapsed, prompt });
    if (this.recording) this.maybeEmit(elapsed);
  }

  /** Starts a smile prompt when due, and scores it once it has run its course. */
  private updateSmilePrompt(elapsed: number, face: boolean): void {
    const s = this.smile;
    if (s.promptStart === null) {
      const due = !s.result?.assessable && s.attempts < PROTOCOL.smileMaxAttempts && elapsed >= s.nextAt;
      if (due && face) {
        s.promptStart = elapsed;
        s.attempts++;
      }
      return;
    }
    const start = s.promptStart;
    if (elapsed - start < PROTOCOL.smilePromptMs) return;

    const rest = this.faceObs.filter((o) => o.passive && inRange(o, [start - PROTOCOL.smileFirstPromptMs, start]));
    const smiling = this.faceObs.filter((o) =>
      inRange(o, [start + PROTOCOL.smileSettleMs, start + PROTOCOL.smilePromptMs]),
    );
    s.result = assessFacialDroop(rest, smiling);
    s.promptStart = null;
    s.nextAt = elapsed + PROTOCOL.smileRetryMs;

    this.vitalsStart = elapsed;
    this.held = this.lastResult && {
      heartRate: this.lastResult.heartRate,
      respiration: this.lastResult.respiration,
      until: elapsed + PROTOCOL.windowMs,
    };
  }

  private maybeEmit(elapsed: number): void {
    if (elapsed - this.lastResultT < PROTOCOL.liveIntervalMs) return;
    this.lastResultT = elapsed;
    this.lastResult = this.snapshot(elapsed);
    this.onResult(this.lastResult, elapsed);
  }

  /** Keep only the rolling window. */
  private prune(elapsed: number): void {
    const cutoff = elapsed - PROTOCOL.windowMs;
    if (cutoff <= 0) return;
    for (const arr of [this.roiFrames, this.shoulderY, this.foreheadLum, this.frameLog, this.faceObs]) {
      dropRange(arr as { t: number }[], -Infinity, cutoff);
    }
  }

  private record(
    t: number,
    face: NormalizedLandmark[] | undefined,
    blend: Record<string, number>,
    rois: ReturnType<typeof sampleRois>,
    iod: number,
    eyeL: Pt,
    eyeR: Pt,
    px: (i: number) => Pt,
    sh: { l: NormalizedLandmark; r: NormalizedLandmark } | null,
    poseRan: boolean,
    w: number,
    h: number,
  ): void {
    const passive = this.smile.promptStart === null;
    const rec: FrameRecord = { t, face: false, passive, moving: false, brightnessJump: false };
    this.frameLog.push(rec);

    if (poseRan && sh && passive) {
      const width = Math.abs(sh.l.x - sh.r.x) * w;
      if (width > 1) this.shoulderY.push({ t, v: (((sh.l.y + sh.r.y) / 2) * h) / width });
    }

    if (!face || iod <= 0) return;
    rec.face = true;

    const frame: RoiFrame = { t, rois: {} };
    for (const [name, s] of Object.entries(rois)) {
      if (s && s.skinRatio >= MIN_SKIN_RATIO) frame.rois[name as keyof typeof rois] = s.rgb;
    }

    if (passive) {
      this.roiFrames.push(frame);
      const lum = rois.forehead?.luminance;
      if (lum !== undefined) {
        this.foreheadLum.push({ t, v: lum });
        rec.brightnessJump = this.lastLum !== null && Math.abs(lum - this.lastLum) / this.lastLum > 0.06;
        this.lastLum = lum;
      }
      const nose = px(1);
      rec.moving = !!this.lastNose && Math.hypot(nose.x - this.lastNose.x, nose.y - this.lastNose.y) / iod > 0.012;
      this.lastNose = nose;
    } else {
      this.lastNose = null;
      this.lastLum = null;
    }

    // Mouth corners in a frame rotated so the eye line is horizontal.
    const angle = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x);
    const centre = mid(eyeL, eyeR);
    const alignedY = (p: Pt) => (-Math.sin(angle) * (p.x - centre.x) + Math.cos(angle) * (p.y - centre.y)) / iod;
    this.faceObs.push({ t, blend, cornerA: alignedY(px(61)), cornerB: alignedY(px(291)), passive });
  }

  /** Result for the latest `PROTOCOL.windowMs` (arrays are already pruned to it). */
  private snapshot(elapsedMs: number): MeasurementResult {
    const vitalsFrom = Math.max(elapsedMs - PROTOCOL.windowMs, this.vitalsStart);
    const sinceVitalsStart = <T extends { t: number }>(arr: T[]) => arr.filter((x) => x.t >= vitalsFrom);

    const frames = this.frameLog;
    const passive = frames.filter((f) => f.passive);
    const vitalsFrames = sinceVitalsStart(passive).filter((f) => f.face);
    const faceFrames = frames.filter((f) => f.face).length;

    const motionScore = vitalsFrames.length ? vitalsFrames.filter((f) => f.moving).length / vitalsFrames.length : 1;
    const brightnessJumps = vitalsFrames.filter((f) => f.brightnessJump).length;
    const qualityFactor = Math.max(
      0.3,
      1 - Math.max(0, motionScore - 0.15) * 1.5 - Math.min(0.3, brightnessJumps * 0.05),
    );
    const spanMs = Math.min(elapsedMs, PROTOCOL.windowMs);

    const held = this.held && elapsedMs < this.held.until ? this.held : null;
    const heartRate = estimateHeartRate(sinceVitalsStart(this.roiFrames), qualityFactor) ?? held?.heartRate ?? null;
    const respiration =
      estimateRespiration(sinceVitalsStart(this.shoulderY), sinceVitalsStart(this.foreheadLum), qualityFactor) ??
      held?.respiration ??
      null;

    const rest = this.faceObs.filter((o) => o.passive);
    const warmingUp = { reason: 'collecting data', frames: rest.length };
    const observing = elapsedMs >= PROTOCOL.minObservationMs;

    return {
      heartRate,
      respiration,
      alertness: observing ? assessAlertness(rest, passive.length) : { state: 'unknown', debug: warmingUp },
      pain: observing ? assessPain(rest) : { severe: false, assessable: false, debug: warmingUp },
      facialDroop: this.facialDroopStatus(),
      quality: {
        faceCoverage: frames.length ? faceFrames / frames.length : 0,
        meanFps: spanMs > 0 ? frames.length / (spanMs / 1000) : 0,
      },
    };
  }

  private facialDroopStatus(): FacialDroopResult {
    const s = this.smile;
    if (s.result?.assessable) return { ...s.result, debug: { ...s.result.debug, attempts: s.attempts } };
    const reason =
      s.promptStart !== null
        ? 'smile prompt running'
        : s.attempts === 0
          ? 'waiting for first prompt'
          : s.attempts >= PROTOCOL.smileMaxAttempts
            ? `gave up: ${s.result?.debug.reason}`
            : `retrying: ${s.result?.debug.reason}`;
    return {
      positive: false,
      assessable: false,
      debug: { ...s.result?.debug, reason, attempts: s.attempts },
    };
  }

  private draw(
    face: NormalizedLandmark[] | undefined,
    sh: { l: NormalizedLandmark; r: NormalizedLandmark } | null,
    w: number,
    h: number,
    ok: boolean,
  ): void {
    const g = this.overlayCtx;
    g.clearRect(0, 0, w, h);
    g.lineWidth = Math.max(2, w / 320);
    g.strokeStyle = ok ? 'rgba(52, 211, 153, 0.9)' : 'rgba(251, 191, 36, 0.9)';
    if (face) {
      for (const poly of roiPixelPolygons(face, w, h)) {
        g.beginPath();
        poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.stroke();
      }
    }
    if (sh) {
      g.fillStyle = g.strokeStyle;
      for (const s of [sh.l, sh.r]) {
        g.beginPath();
        g.arc(s.x * w, s.y * h, g.lineWidth * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}
