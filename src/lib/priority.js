// Owner: dashboard/logic
// computePriority(vitals, baseline, ai) → { level: 'green'|'yellow'|'red', reasons: [] }
// Rules decide; the AI's suggested_level may raise the level but never lower it.
const RANK = { green: 0, yellow: 1, red: 2 };

export function computePriority(vitals, baseline, ai) {
  let level = 'green';
  const reasons = [];
  const raise = (to, reason) => {
    if (RANK[to] > RANK[level]) level = to;
    if (reason) reasons.push(reason);
  };

  if (vitals) {
    if (vitals.esi === 1) raise('red', 'Camera: suspected ESI 1');
    else if (vitals.esi === 2) raise('yellow', 'Camera: ESI 2 findings');
    else if (vitals.complete && vitals.esi === null) raise('yellow', 'Camera measurement unreliable — recheck');

    if (vitals.hr !== null && (vitals.hr > 100 || vitals.hr < 50)) reasons.push(`Heart rate ${vitals.hr}`);
    if (vitals.rr !== null && (vitals.rr > 20 || vitals.rr < 10)) reasons.push(`Respiration ${vitals.rr}`);
    if (vitals.consciousness === 'reduced' || vitals.consciousness === 'unresponsive') {
      reasons.push(`Consciousness ${vitals.consciousness}`);
    }
    if (vitals.pain === 'severe') reasons.push('Severe pain expression');
    if (vitals.facialDroop === 'asymmetric') reasons.push('Asymmetric smile');

    if (baseline?.hr && vitals.hr !== null && vitals.hr - baseline.hr >= 20) {
      raise('yellow', `Heart rate up ${vitals.hr - baseline.hr} from arrival`);
    }
  }

  if (ai?.suggested_level) raise(ai.suggested_level, ai.reason);

  return { level, reasons };
}
