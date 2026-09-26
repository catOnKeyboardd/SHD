// Owner: voice
// Hold the button to talk; the transcript is shown so the patient can confirm or redo.
// onConfirm(transcript) is called once the patient accepts it.
import { useState } from 'react';
import { startListening, stopListening, speak } from '../../lib/voice.js';

const PROMPTS = {
  en: 'Please tell me what symptoms you have, and how long you have had them.',
  fr: 'Dites-moi quels symptômes vous avez, et depuis combien de temps.',
};

const LABELS = {
  en: { ask: 'Hear the question', hold: 'Hold to talk', listening: 'Listening…', working: 'Transcribing…', check: 'Is this right?', yes: 'Yes', redo: 'Say again', retry: "Sorry, I didn't catch that. Could you try again?" },
  fr: { ask: 'Écouter la question', hold: 'Maintenir pour parler', listening: 'J’écoute…', working: 'Transcription…', check: 'Est-ce correct ?', yes: 'Oui', redo: 'Recommencer', retry: 'Désolé, je n’ai pas compris. Pouvez-vous répéter ?' },
};

export default function VoiceCheckIn({ lang = 'en', onConfirm = () => {} }) {
  const [status, setStatus] = useState('idle'); // idle | listening | working | review
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const t = LABELS[lang];

  async function handleDown() {
    setError('');
    try {
      await startListening();
      setStatus('listening');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUp() {
    if (status !== 'listening') return;
    setStatus('working');
    try {
      const text = await stopListening(lang);
      if (!text) {
        setStatus('idle');
        await speak(t.retry, lang);
        return;
      }
      setTranscript(text);
      setStatus('review');
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  }

  return (
    <section>
      <button onClick={() => speak(PROMPTS[lang], lang).catch((e) => setError(e.message))}>
        {t.ask}
      </button>

      {status !== 'review' && (
        <button
          onPointerDown={handleDown}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          disabled={status === 'working'}
        >
          {status === 'listening' ? t.listening : status === 'working' ? t.working : t.hold}
        </button>
      )}

      {status === 'review' && (
        <div>
          <p>“{transcript}”</p>
          <p>{t.check}</p>
          <button onClick={() => onConfirm(transcript)}>{t.yes}</button>
          <button onClick={() => { setTranscript(''); setStatus('idle'); }}>{t.redo}</button>
        </div>
      )}

      {error && <p role="alert">{error}</p>}
    </section>
  );
}
