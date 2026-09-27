// Live result tiles for the patient being measured (names and numbers only).
// Add ?debug to the URL to see the numbers behind the readings, consciousness and pain.
import thresholds from '../../vitals/triage/thresholds.json';

const URGENCY = {
  emergency: ['Emergency', 'Get help now', 'urgency-emergency'],
  'very-urgent': ['Very urgent', 'Tell a nurse now', 'urgency-very-urgent'],
  urgent: ['Urgent', 'A nurse will see you soon', 'urgency-urgent'],
  standard: ['Standard', 'Please wait to be called', 'urgency-standard'],
  'non-urgent': ['Non-urgent', 'Please wait to be called', 'urgency-non-urgent'],
};
const CHECKING = ['Checking…', 'Please stay still', 'urgency-pending'];
const UNCLEAR = ['Unclear', 'Please ask a nurse', 'urgency-pending'];

const showDebug = new URLSearchParams(window.location.search).has('debug');
const PAIN_ALARM = thresholds.urgent.pain;

function Tile({ name, value, unit, alarm }) {
  return (
    <div className={`tile${alarm ? ' alarm' : ''}`}>
      <span className="name">{name}</span>
      <span className="value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
    </div>
  );
}

function Confidence({ value }) {
  const pct = Math.round(value * 100);
  const word = value < 0.4 ? 'Low' : value < 0.7 ? 'Medium' : 'High';
  return (
    <div className="headline confidence">
      <span className="name">Confidence</span>
      <span className="value">
        {word}
        <small>{pct}%</small>
      </span>
      <div className="meter">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Urgency({ urgency, settled }) {
  const [word, hint, cls] = URGENCY[urgency] ?? (settled ? UNCLEAR : CHECKING);
  return (
    <div className={`headline ${cls}`}>
      <span className="name">Urgency</span>
      <span className="value">{word}</span>
      <span className="hint">{hint}</span>
    </div>
  );
}

function Debug({ debug }) {
  return (
    <pre className="debug">
      {Object.entries(debug)
        .map(([k, d]) => `${k}: ${Object.entries(d).map(([f, v]) => `${f}=${v}`).join('  ')}`)
        .join('\n')}
    </pre>
  );
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

export default function ResultScreen({ vitals }) {
  if (!vitals) return null;
  const none = vitals.settled ? '—' : '…';

  return (
    <section className="summary">
      <div className="headlines">
        <Urgency urgency={vitals.urgency} settled={vitals.settled} />
        <Confidence value={vitals.confidence} />
      </div>
      <div className="tiles">
        <Tile name="Heart rate" value={vitals.hr ?? none} unit={vitals.hr && 'bpm'} />
        <Tile name="Respiration" value={vitals.rr ?? none} unit={vitals.rr && '/min'} />
        <Tile name="Consciousness" value={vitals.consciousness ? cap(vitals.consciousness) : none} />
        <Tile
          name="Pain"
          value={vitals.pain === null ? none : vitals.pain.toFixed(1)}
          unit={vitals.pain !== null && '/10'}
          alarm={vitals.pain >= PAIN_ALARM}
        />
      </div>
      {showDebug && <Debug debug={vitals.debug} />}
    </section>
  );
}
