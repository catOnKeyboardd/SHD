const URGENCY = { emergency: 'Emergency', urgent: 'Urgent', routine: 'Routine' };

function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}

export default function PatientCard({ patient }) {
  const { id, vitals, priority, updatedAt, left } = patient;
  return (
    <article className={`card ${priority.level}${left ? ' left' : ''}`}>
      <header>
        <strong>{id}</strong>
        <span className="badge">{priority.level}</span>
      </header>
      <dl>
        <div><dt>Urgency</dt><dd>{URGENCY[vitals.urgency] ?? '—'}</dd></div>
        <div><dt>Confidence</dt><dd>{Math.round(vitals.confidence * 100)}%</dd></div>
        <div><dt>HR</dt><dd>{vitals.hr ?? '—'}</dd></div>
        <div><dt>RR</dt><dd>{vitals.rr ?? '—'}</dd></div>
      </dl>
      {priority.reasons.length > 0 && <p className="reasons">{priority.reasons.join(' · ')}</p>}
      <footer>{left ? `Left kiosk ${ago(updatedAt)}` : `Updated ${ago(updatedAt)}`}</footer>
    </article>
  );
}
