let voice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  return en.find((v) => v.localService) ?? en[0] ?? null;
}

/**
 * Spoken prompts for patients who cannot read the screen well. Browsers only
 * allow speech after a user gesture on the page; before that this silently no-ops.
 */
export function speak(text: string): void {
  const synth = window.speechSynthesis;
  if (!synth) return;
  voice ??= pickVoice();
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  if (voice) u.voice = voice;
  synth.speak(u);
}

export function stopSpeaking(): void {
  window.speechSynthesis?.cancel();
}
