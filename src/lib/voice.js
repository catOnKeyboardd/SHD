// Owner: voice (ElevenLabs)
//
// startListening()             begin recording from the mic
// stopListening(lang) → text   stop and return the transcript
// speak(text, lang)            play the text as speech; resolves when done
let recorder;
let chunks = [];

export async function startListening() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.start();
}

export function stopListening(lang = 'en') {
  return new Promise((resolve, reject) => {
    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      try {
        const audio = new Blob(chunks, { type: recorder.mimeType });
        const res = await fetch(`/api/stt?lang=${lang}`, { method: 'POST', body: audio });
        if (!res.ok) throw new Error(`STT failed: ${await res.text()}`);
        resolve((await res.json()).text);
      } catch (err) {
        reject(err);
      }
    };
    recorder.stop();
  });
}

export async function speak(text, lang = 'en') {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) throw new Error(`TTS failed: ${await res.text()}`);

  const audio = new Audio(URL.createObjectURL(await res.blob()));
  await audio.play();
  return new Promise((resolve) => (audio.onended = resolve));
}
