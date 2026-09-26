import { lockExposure, startCamera, stopStream } from './capture/camera';
import { Pipeline, type FrameInfo, type GateStatus } from './capture/pipeline';
import { PROTOCOL } from './config';
import { speak, stopSpeaking } from './speech';
import thresholds from './triage/thresholds.json';
import { triage } from './triage/engine';
import type { MeasurementResult } from './types';
import { loadLandmarkers } from './vision/landmarkers';

type MeasurePhase = 'rest' | 'gazeLeft' | 'gazeRight' | 'smile' | 'monitor';
export type ScanPhase = 'loading' | 'error' | 'positioning' | MeasurePhase;

export type CheckKey = 'face' | 'distance' | 'centered' | 'shoulders' | 'lighting' | 'smooth';

/** What the scan UI should show right now. */
export interface ScanStatus {
  phase: ScanPhase;
  instruction: string;
  checks: Record<CheckKey, boolean>;
  /** 0..1 through the prompted cycle; 1 while monitoring. */
  progress: number;
  secondsLeft: number;
  gaze: 'left' | 'right' | null;
}

/**
 * Payload of `onVitals` (see src/lib/vitals.js). Vitals are null until a
 * reading is confident enough to use; observations are null until assessable.
 */
export interface VitalsUpdate {
  sessionId: number;
  hr: number | null;
  rr: number | null;
  hrv: null;
  stress: null;
  bp: null;
  quality: 'good' | 'poor';
  /** Camera-only ESI suggestion; null while pending or when data is unreliable. */
  esi: 1 | 2 | '3-5' | null;
  consciousness: 'alert' | 'reduced' | 'unresponsive' | null;
  pain: 'none' | 'severe' | null;
  facialDroop: 'symmetric' | 'asymmetric' | null;
  /** The prompted 20 s cycle is finished; later updates use the latest 20 s. */
  complete: boolean;
}

export interface ScanOptions {
  video: HTMLVideoElement;
  overlay: HTMLCanvasElement;
  /** Called about once a second while measuring, and with null when the patient leaves. */
  onVitals: (v: VitalsUpdate | null) => void;
  onStatus?: (s: ScanStatus) => void;
}

const PHASE_TEXT: Record<MeasurePhase, string> = {
  rest: 'Hold still, breathe normally, look at the screen',
  gazeLeft: 'Keep your head still — look at the dot on the left',
  gazeRight: 'Now look at the dot on the right',
  smile: 'Smile showing your teeth, and hold it',
  monitor: 'Monitoring — relax and breathe normally',
};

function phaseAt(elapsed: number): MeasurePhase {
  if (elapsed < PROTOCOL.restMs) return 'rest';
  if (elapsed < PROTOCOL.gazeLeftMs[1]) return 'gazeLeft';
  if (elapsed < PROTOCOL.gazeRightMs[1]) return 'gazeRight';
  if (elapsed < PROTOCOL.totalMs) return 'smile';
  return 'monitor';
}

function gateMessage(g: GateStatus): string {
  if (!g.face) return 'Please face the screen';
  if (g.distance === 'far') return 'Please move a little closer';
  if (g.distance === 'near') return 'Please move back so your shoulders are visible';
  if (!g.centered) return 'Please center your face in the picture';
  if (!g.shoulders) return 'Please make sure both shoulders are visible';
  if (g.lighting === 'dark') return 'Too dark — please move to a brighter spot';
  if (g.lighting === 'bright') return 'Too bright — please avoid direct light';
  if (!g.smooth) return 'Device is running slowly — close other apps';
  return 'Good — hold still…';
}

function checksOf(g: GateStatus): Record<CheckKey, boolean> {
  return {
    face: g.face,
    distance: g.distance === 'ok',
    centered: g.centered,
    shoulders: g.shoulders,
    lighting: g.lighting === 'ok',
    smooth: g.smooth,
  };
}

function toUpdate(m: MeasurementResult, elapsedMs: number, sessionId: number): VitalsUpdate {
  const level = triage(m);
  const complete = elapsedMs >= PROTOCOL.totalMs;
  // During the prompted cycle only escalations are reported; reassuring states wait for all checks.
  const esi = level === 1 || level === 2 ? level : complete && level === 'nurse' ? '3-5' : null;
  const gazeDone = complete || elapsedMs >= PROTOCOL.gazeRightMs[1];
  const state = m.alertness.state;
  const hr = m.heartRate?.usable ? m.heartRate.value : null;
  const Q = thresholds.quality;
  return {
    sessionId,
    hr,
    rr: m.respiration?.usable ? m.respiration.value : null,
    hrv: null,
    stress: null,
    bp: null,
    quality: hr !== null && m.quality.faceCoverage >= Q.minFaceCoverage && m.quality.meanFps >= Q.minFps ? 'good' : 'poor',
    esi,
    consciousness: state === 'unknown' || (state === 'alert' && !gazeDone) ? null : state,
    pain: m.pain.assessable ? (m.pain.severe ? 'severe' : 'none') : null,
    facialDroop: m.facialDroop.assessable ? (m.facialDroop.positive ? 'asymmetric' : 'symmetric') : null,
    complete,
  };
}

/**
 * Runs the camera scan: positioning gate, 20 s prompted cycle (rest, gaze,
 * smile), then continuous monitoring over the latest 20 s. A new session
 * starts automatically when the patient leaves and the next one sits down.
 * Returns stop().
 */
export function startVitalsScan({ video, overlay, onVitals, onStatus = () => {} }: ScanOptions): () => void {
  let stopped = false;
  let stream: MediaStream | null = null;
  let pipeline: Pipeline | null = null;
  let gateSince: number | null = null;
  let phase: ScanPhase = 'loading';
  let sessionId = 0;

  const status: ScanStatus = {
    phase,
    instruction: 'Loading…',
    checks: { face: false, distance: false, centered: false, shoulders: false, lighting: false, smooth: false },
    progress: 0,
    secondsLeft: PROTOCOL.totalMs / 1000,
    gaze: null,
  };
  const emit = (patch: Partial<ScanStatus>) => {
    Object.assign(status, patch, { phase });
    onStatus({ ...status });
  };

  function onFrame(info: FrameInfo): void {
    if (!info.recording) {
      if (phase !== 'positioning') return;
      const now = performance.now();
      if (info.gate.ok) {
        gateSince ??= now;
        if (now - gateSince >= PROTOCOL.gateHoldMs) return beginMeasurement();
      } else {
        gateSince = null;
      }
      emit({ instruction: gateMessage(info.gate), checks: checksOf(info.gate) });
      return;
    }

    const next = phaseAt(info.elapsedMs);
    if (next !== phase) {
      phase = next;
      speak(next === 'monitor' ? 'Check complete. Monitoring continues.' : PHASE_TEXT[next]);
    }
    const monitoring = next === 'monitor';
    emit({
      instruction: info.gate.face ? PHASE_TEXT[next] : 'Please look back at the screen',
      progress: monitoring ? 1 : info.elapsedMs / PROTOCOL.totalMs,
      secondsLeft: monitoring ? 0 : Math.max(0, Math.ceil((PROTOCOL.totalMs - info.elapsedMs) / 1000)),
      gaze: next === 'gazeLeft' ? 'left' : next === 'gazeRight' ? 'right' : null,
    });
  }

  function beginMeasurement(): void {
    if (!pipeline) return;
    sessionId++;
    phase = 'rest';
    speak(PHASE_TEXT.rest);
    if (stream) void lockExposure(stream);
    pipeline.beginRecording();
    emit({ instruction: PHASE_TEXT.rest, progress: 0, secondsLeft: PROTOCOL.totalMs / 1000 });
  }

  function toPositioning(): void {
    phase = 'positioning';
    gateSince = null;
    stopSpeaking();
    onVitals(null);
    emit({ instruction: 'Please sit facing the screen', progress: 0, gaze: null });
  }

  function teardown(): void {
    pipeline?.stop();
    pipeline = null;
    stopStream(stream);
    stream = null;
    video.pause();
    video.srcObject = null;
    stopSpeaking();
  }

  (async () => {
    emit({ instruction: 'Loading…' });
    try {
      const lm = await loadLandmarkers();
      if (stopped) return;
      emit({ instruction: 'Starting camera…' });
      const s = await startCamera(video);
      if (stopped) return stopStream(s);
      stream = s;
      pipeline = new Pipeline(video, overlay, lm);
      pipeline.onFrame = onFrame;
      pipeline.onResult = (m, elapsed) => onVitals(toUpdate(m, elapsed, sessionId));
      pipeline.onPatientLeft = toPositioning;
      pipeline.start();
      toPositioning();
    } catch (err) {
      console.error(err);
      teardown();
      phase = 'error';
      const denied = (err as DOMException)?.name === 'NotAllowedError';
      emit({
        instruction: denied
          ? 'Camera permission was denied. Allow camera access in the browser settings, then reload.'
          : `Could not start the camera: ${(err as Error).message ?? err}`,
      });
    }
  })();

  return () => {
    stopped = true;
    teardown();
  };
}
