// Owner: voice
// POST /api/stt?lang=en  body: raw audio (webm)  →  { text }
export async function POST(request) {
  const audio = await request.blob();
  const lang = new URL(request.url).searchParams.get('lang') || 'en';

  const form = new FormData();
  form.append('file', audio, 'speech.webm');
  form.append('model_id', 'scribe_v2');
  form.append('language_code', lang);

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    body: form,
  });
  if (!res.ok) return new Response(await res.text(), { status: res.status });

  const { text } = await res.json();
  return Response.json({ text: text.trim() });
}
