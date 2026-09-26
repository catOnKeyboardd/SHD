// Owner: voice
// POST /api/tts  body: { text, lang }  →  audio/mpeg
export async function POST(request) {
  const { text, lang = 'en' } = await request.json();
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', language_code: lang }),
  });
  if (!res.ok) return new Response(await res.text(), { status: res.status });

  return new Response(res.body, { headers: { 'Content-Type': 'audio/mpeg' } });
}
