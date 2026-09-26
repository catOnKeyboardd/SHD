const ESI = { 1: 'ESI 1', 2: 'ESI 2', '3-5': 'ESI 3–5' };

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
        <div><dt>Triage</dt><dd>{ESI[vitals.esi] ?? '—'}</dd></div>
        <div><dt>HR</dt><dd>{vitals.hr ?? '—'}</dd></div>
        <div><dt>RR</dt><dd>{vitals.rr ?? '—'}</dd></div>
      </dl>
      {priority.reasons.length > 0 && <p className="reasons">{priority.reasons.join(' · ')}</p>}
      <footer>{left ? `Left kiosk ${ago(updatedAt)}` : `Updated ${ago(updatedAt)}`}</footer>
    </article>
  );
}
