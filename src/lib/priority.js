// Owner: dashboard/logic
// computePriority(vitals, baseline, ai) → { level: 'green'|'yellow'|'red', reasons: [] }
// Rules decide; the AI's suggested_level may raise the level but never lower it.
import thresholds from '../vitals/triage/thresholds.json';

const RANK = { green: 0, yellow: 1, red: 2 };

export function computePriority(vitals, baseline, ai) {
  let level = 'green';
  const reasons = [];
  const raise = (to, reason) => {
    if (RANK[to] > RANK[level]) level = to;
    if (reason) reasons.push(reason);
  };

  if (vitals) {
    if (vitals.urgency === 'emergency') raise('red', 'Camera: emergency');
    else if (vitals.urgency === 'urgent') raise('yellow', 'Camera: urgent findings');
    else if (vitals.settled && vitals.urgency === null) raise('yellow', 'Camera measurement unreliable — recheck');

    if (vitals.hr !== null && (vitals.hr > 100 || vitals.hr < 50)) reasons.push(`Heart rate ${vitals.hr}`);
    if (vitals.rr !== null && (vitals.rr > 20 || vitals.rr < 10)) reasons.push(`Respiration ${vitals.rr}`);
    if (vitals.consciousness === 'reduced' || vitals.consciousness === 'unresponsive') {
      reasons.push(`Consciousness ${vitals.consciousness}`);
    }
    if (vitals.pain !== null && vitals.pain >= thresholds.observation.painModerate) {
      reasons.push(`Pain expression ${vitals.pain.toFixed(1)}/10`);
    }

    if (baseline?.hr && vitals.hr !== null && vitals.hr - baseline.hr >= 20) {
      raise('yellow', `Heart rate up ${vitals.hr - baseline.hr} from arrival`);
    }
  }

  if (ai?.suggested_level) raise(ai.suggested_level, ai.reason);

  return { level, reasons };
}
