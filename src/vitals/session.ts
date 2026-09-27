import { lockExposure, startCamera, stopStream } from './capture/camera';
import { Pipeline, type FrameInfo, type GateStatus } from './capture/pipeline';
import { PROTOCOL } from './config';
import { speak, stopSpeaking } from './speech';
import { overallConfidence, triage, urgencyOf, type Urgency } from './triage/engine';
import type { Diagnostics, MeasurementResult } from './types';
import { loadLandmarkers } from './vision/landmarkers';

type MeasurePhase = 'monitor' | 'smile';
export type ScanPhase = 'loading' | 'error' | 'positioning' | MeasurePhase;

export type CheckKey = 'face' | 'distance' | 'centered' | 'shoulders' | 'lighting' | 'smooth';

/** What the scan UI should show right now. */
export interface ScanStatus {
  phase: ScanPhase;
  instruction: string;
  checks: Record<CheckKey, boolean>;
}

/**
 * Payload of `onVitals` (see src/lib/vitals.js). Vitals show the latest
 * estimate whatever its confidence and are null only before the first one;
 * observations are null until assessable.
 */
export interface VitalsUpdate {
  sessionId: number;
  hr: number | null;
  rr: number | null;
  hrv: null;
  stress: null;
  bp: null;
  /** 0..1 trust in this update; starts low and grows with recording time and signal quality. */
  confidence: number;
  /** Camera-only triage suggestion; null while still checking or when the face is barely visible. */
  urgency: Urgency;
  consciousness: 'alert' | 'reduced' | 'unresponsive' | null;
  pain: 'none' | 'severe' | null;
  facialDroop: 'symmetric' | 'asymmetric' | null;
  /** Past `PROTOCOL.unclearAfterMs`; a null urgency now means the data is too poor to judge. */
  settled: boolean;
  /** Numbers behind the readings and observations, for troubleshooting. */
  debug: { vitals: Diagnostics; consciousness: Diagnostics; pain: Diagnostics; smile: Diagnostics };
}

export interface ScanOptions {
  video: HTMLVideoElement;
  overlay: HTMLCanvasElement;
  /** Called about once a second while measuring, and with null when the patient leaves. */
  onVitals: (v: VitalsUpdate | null) => void;
  onStatus?: (s: ScanStatus) => void;
}

const PHASE_TEXT: Record<MeasurePhase, string> = {
  monitor: 'Hold still, breathe normally, look at the screen',
  smile: 'Smile showing your teeth, and hold it',
};

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
  const state = m.alertness.state;
  return {
    sessionId,
    hr: m.heartRate?.value ?? null,
    rr: m.respiration?.value ?? null,
    hrv: null,
    stress: null,
    bp: null,
    confidence: overallConfidence(m, elapsedMs),
    urgency: elapsedMs < PROTOCOL.minObservationMs ? null : urgencyOf(triage(m)),
    consciousness: state === 'unknown' ? null : state,
    pain: m.pain.assessable ? (m.pain.severe ? 'severe' : 'none') : null,
    facialDroop: m.facialDroop.assessable ? (m.facialDroop.positive ? 'asymmetric' : 'symmetric') : null,
    settled: elapsedMs >= PROTOCOL.unclearAfterMs,
    debug: {
      vitals: {
        hrConfidence: m.heartRate?.confidence ?? null,
        rrConfidence: m.respiration?.confidence ?? null,
        faceCoverage: +m.quality.faceCoverage.toFixed(2),
        fps: Math.round(m.quality.meanFps),
      },
      consciousness: m.alertness.debug,
      pain: m.pain.debug,
      smile: m.facialDroop.debug,
    },
  };
}

/**
 * Runs the camera scan: positioning gate, then continuous monitoring over the
 * latest 20 s with an on-demand smile prompt. A new session starts
 * automatically when the patient leaves and the next one sits down.
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

    const next: MeasurePhase = info.prompt ?? 'monitor';
    if (next !== phase) {
      phase = next;
      speak(next === 'smile' ? PHASE_TEXT.smile : 'Thank you. You can relax now.');
    }
    emit({ instruction: info.gate.face ? PHASE_TEXT[next] : 'Please look back at the screen' });
  }

  function beginMeasurement(): void {
    if (!pipeline) return;
    sessionId++;
    phase = 'monitor';
    speak(PHASE_TEXT.monitor);
    if (stream) void lockExposure(stream);
    pipeline.beginRecording();
    emit({ instruction: PHASE_TEXT.monitor });
  }

  function toPositioning(): void {
    phase = 'positioning';
    gateSince = null;
    stopSpeaking();
    onVitals(null);
    emit({ instruction: 'Please sit facing the screen' });
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
    let cameraStage = false;
    try {
      const lm = await loadLandmarkers((p) => {
        if (stopped) return;
        emit({
          instruction:
            p.stage === 'download' ? `Downloading AI models… ${Math.round(p.fraction * 100)}%` : 'Preparing AI models…',
        });
      });
      if (stopped) return;
      cameraStage = true;
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
          : `${cameraStage ? 'Could not start the camera' : 'Could not load the AI models'}: ${(err as Error).message ?? err}`,
      });
    }
  })();

  return () => {
    stopped = true;
    teardown();
  };
}
