// Waiting patients from kiosk tabs in the same browser, most urgent first.
import { useEffect, useState } from 'react';
import { onPatient } from '../../lib/sync.js';
import { seedPatients } from '../../data/seedPatients.js';
import PatientCard from './PatientCard.jsx';

const RANK = { red: 0, yellow: 1, green: 2 };

export default function PatientList() {
  const [patients, setPatients] = useState(() => Object.fromEntries(seedPatients.map((p) => [p.id, p])));
  const [, tick] = useState(0);

  useEffect(
    () => onPatient((update) => setPatients((all) => ({ ...all, [update.id]: { ...all[update.id], ...update } }))),
    [],
  );
  // Re-render so "updated … ago" stays current.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const list = Object.values(patients)
    .filter((p) => p.priority)
    .sort((a, b) => Number(!!a.left) - Number(!!b.left) || RANK[a.priority.level] - RANK[b.priority.level] || b.updatedAt - a.updatedAt);

  if (!list.length) return <p className="empty">No patients yet. Open the kiosk in another tab of this browser.</p>;
  return (
    <div className="patients">
      {list.map((p) => (
        <PatientCard key={p.id} patient={p} />
      ))}
    </div>
  );
}
