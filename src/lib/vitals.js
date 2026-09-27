// Owner: vitals. The only file the rest of the app uses for camera vitals.
// Free, fully in-browser: MediaPipe face/pose landmarks + POS rPPG (src/vitals/).
//
// startScan(onVitals, { video, overlay, onStatus }) → stop()
//
// onVitals is called about once a second while a patient is being measured:
//   { sessionId, hr, rr, hrv: null, stress: null, bp: null, confidence: 0..1,
//     urgency: 'emergency'|'urgent'|'routine'|null, consciousness, pain, settled, debug }
// hr / rr show the latest estimate at any confidence (null only before the first one);
// hrv, stress and bp are not measurable with this method.
// confidence starts low and rises over the first 15 s as data accumulates.
// It is called with null when the patient walks away (no face for 5 s).
//
// onStatus(status) drives the scan UI (instruction text, positioning checks,
// progress, gaze dot); see ScanStatus in src/vitals/session.ts.
import { startVitalsScan } from '../vitals/session';

export function startScan(onVitals, { video, overlay, onStatus } = {}) {
  return startVitalsScan({ video, overlay, onVitals, onStatus });
}
