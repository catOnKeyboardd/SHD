// Patient flow. Current minimal version: the camera scan starts on its own and
// results update live; each update is published to the nurse dashboard.
// LanguagePicker and VoiceCheckIn slot in here once they are implemented.
import { useRef, useState } from 'react';
import ScanView from '../components/kiosk/ScanView.jsx';
import ResultScreen from '../components/kiosk/ResultScreen.jsx';
import { computePriority } from '../lib/priority.js';
import { publishPatient } from '../lib/sync.js';
import '../styles/kiosk.css';

const newPatientId = () => `P-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export default function Kiosk() {
  const [vitals, setVitals] = useState(null);
  const patient = useRef({ sessionId: null, id: null });

  function handleVitals(v) {
    setVitals(v);
    const p = patient.current;
    if (!v) {
      if (p.id) publishPatient({ id: p.id, left: true, updatedAt: Date.now() });
      patient.current = { sessionId: null, id: null };
      return;
    }
    if (v.sessionId !== p.sessionId) patient.current = { sessionId: v.sessionId, id: newPatientId() };
    publishPatient({
      id: patient.current.id,
      vitals: v,
      priority: computePriority(v, null, null),
      updatedAt: Date.now(),
    });
  }

  return (
    <main className="kiosk">
      <ScanView onVitals={handleVitals} />
      <ResultScreen vitals={vitals} />
      <p className="disclaimer">Camera estimate · not a medical device · confirm clinically</p>
    </main>
  );
}
