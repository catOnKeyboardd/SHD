// Owner: vitals. The only file the rest of the app uses for camera vitals.
// Free, fully in-browser: MediaPipe face/pose landmarks + POS rPPG (src/vitals/).
//
// startScan(onVitals, { video, overlay, onStatus }) → stop()
//
// onVitals is called about once a second while a patient is being measured:
//   { sessionId, hr, rr, hrv: null, stress: null, bp: null, quality: 'good'|'poor',
//     esi: 1|2|'3-5'|null, consciousness, pain, facialDroop, complete }
// hr / rr are null until confident; hrv, stress and bp are not measurable with this method.
// It is called with null when the patient walks away (no face for 5 s).
//
// onStatus(status) drives the scan UI (instruction text, positioning checks,
// progress, gaze dot); see ScanStatus in src/vitals/session.ts.
import { startVitalsScan } from '../vitals/session';

export function startScan(onVitals, { video, overlay, onStatus } = {}) {
  return startVitalsScan({ video, overlay, onVitals, onStatus });
}
