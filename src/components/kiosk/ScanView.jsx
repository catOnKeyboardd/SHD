// Owner: vitals. Camera preview, instructions and positioning checks.
// The scan starts on mount and keeps monitoring until unmount.
import { useEffect, useRef, useState } from 'react';
import { startScan } from '../../lib/vitals.js';

const CHECKS = [
  ['face', 'Face detected'],
  ['distance', 'Distance OK'],
  ['centered', 'Face centered'],
  ['shoulders', 'Shoulders visible'],
  ['lighting', 'Lighting OK'],
  ['smooth', 'Smooth video'],
];

export default function ScanView({ onVitals = () => {} }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const onVitalsRef = useRef(onVitals);
  onVitalsRef.current = onVitals;
  const [status, setStatus] = useState({ phase: 'loading', instruction: 'Loading…', checks: {} });

  useEffect(
    () =>
      startScan((v) => onVitalsRef.current(v), {
        video: videoRef.current,
        overlay: overlayRef.current,
        onStatus: setStatus,
      }),
    [],
  );

  return (
    <section className="scan">
      <div className="stage">
        <video ref={videoRef} playsInline muted autoPlay />
        <canvas ref={overlayRef} />
        <div className="instruction">{status.instruction}</div>
      </div>

      {status.phase === 'positioning' && (
        <ul className="checklist">
          {CHECKS.map(([key, label]) => (
            <li key={key} className={status.checks[key] ? 'ok' : ''}>
              {label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
