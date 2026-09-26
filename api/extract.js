// Owner: AI
// POST /api/extract  body: { transcript, lang }
//   → { symptoms: [], onset, pain_score, red_flags: [], suggested_level: 'green'|'yellow'|'red', reason }
export async function POST() {
  return new Response('Not implemented', { status: 501 });
}
