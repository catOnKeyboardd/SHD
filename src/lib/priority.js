// Owner: dashboard/logic
// computePriority(vitals, baseline, ai) → { level: 'green'|'yellow'|'red', reasons: [] }
// Rules decide; the AI's suggested_level may raise the level but never lower it.
export function computePriority(vitals, baseline, ai) {
  return { level: 'green', reasons: [] };
}
