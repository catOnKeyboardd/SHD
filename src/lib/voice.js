// Owner: voice (ElevenLabs)
//
// startListening()             begin recording from the mic
// stopListening(lang) → text   stop and return the transcript
// speak(text, lang)            play the text as speech; resolves when done
export async function startListening() {
  throw new Error('startListening not implemented');
}

export async function stopListening(lang = 'en') {
  throw new Error('stopListening not implemented');
}

export async function speak(text, lang = 'en') {
  throw new Error('speak not implemented');
}
