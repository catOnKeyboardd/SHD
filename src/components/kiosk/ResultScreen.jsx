// Live result tiles for the patient being measured (names and numbers only).
const ESI = { 1: ['ESI 1', 'level-1'], 2: ['ESI 2', 'level-2'], '3-5': ['ESI 3–5', 'level-3'] };

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

const cap = (s) => s[0].toUpperCase() + s.slice(1);

export default function ResultScreen({ vitals }) {
  if (!vitals) return null;
  // Pending while the 20 s prompted cycle runs; not assessable once it is over.
  const none = vitals.complete ? '—' : '…';
  const [esiText, esiClass] = ESI[vitals.esi] ?? [vitals.complete ? 'Retest' : '…', 'level-pending'];

  return (
    <section className="summary">
      <div className={`level ${esiClass}`}>
        <span className="name">Triage</span>
        <span className="value">{esiText}</span>
      </div>
      <Tile name="Heart rate" value={vitals.hr ?? none} unit={vitals.hr && 'bpm'} />
      <Tile name="Respiration" value={vitals.rr ?? none} unit={vitals.rr && '/min'} />
      <Tile
        name="Consciousness"
        value={vitals.consciousness ? cap(vitals.consciousness) : none}
        alarm={vitals.consciousness === 'reduced' || vitals.consciousness === 'unresponsive'}
      />
      <Tile name="Pain" value={vitals.pain ? cap(vitals.pain) : none} alarm={vitals.pain === 'severe'} />
      <Tile
        name="Smile"
        value={vitals.facialDroop ? cap(vitals.facialDroop) : none}
        alarm={vitals.facialDroop === 'asymmetric'}
      />
    </section>
  );
}
