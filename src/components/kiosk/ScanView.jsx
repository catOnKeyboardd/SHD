// Owner: vitals. Camera preview, positioning checks, progress and the gaze-test dot.
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
  const [status, setStatus] = useState({ phase: 'loading', instruction: 'Loading…', checks: {}, progress: 0 });

  useEffect(
    () =>
      startScan((v) => onVitalsRef.current(v), {
        video: videoRef.current,
        overlay: overlayRef.current,
        onStatus: setStatus,
      }),
    [],
  );

  const measuring = !['loading', 'error', 'positioning'].includes(status.phase);
  const live = status.phase === 'monitor';

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

      {measuring && (
        <div className={`progress${live ? ' live' : ''}`}>
          <div className="track">
            <div className="bar" style={{ width: `${status.progress * 100}%` }} />
          </div>
          <span className="time">{live ? '● Live' : `${status.secondsLeft} s`}</span>
        </div>
      )}

      {status.gaze && <div className={`gaze-dot ${status.gaze}`} />}
    </section>
  );
}
