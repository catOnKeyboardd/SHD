# SHD

HTH3: an ER waiting-room recheck kiosk. Patients get a camera vitals scan and a spoken check-in, and a nurse dashboard ranks them by who needs a recheck.

## Setup

```bash
npm install
cp .env.example .env   # fill in keys; .env is gitignored
npm run dev
```

- Kiosk: http://localhost:5173/kiosk
- Nurse dashboard: http://localhost:5173/dashboard (open in a second tab in the same browser)

Files in `api/` run server-side at `/api/*`, both locally (`npm run dev`) and on Vercel. API keys are only read there, never in `src/`.

## Structure and owners

| Area | Files |
|---|---|
| Vitals (Binah) | `src/lib/vitals.js`, `src/components/kiosk/ScanView.jsx` |
| Voice (ElevenLabs) | `api/stt.js`, `api/tts.js`, `src/lib/voice.js`, `src/components/kiosk/VoiceCheckIn.jsx` |
| AI (Gemini) | `api/extract.js`, `src/lib/extract.js` |
| Dashboard + logic | `src/lib/priority.js`, `src/lib/sync.js`, `src/data/`, `src/components/dashboard/*` |
| UI/UX | `src/styles/`, `LanguagePicker.jsx`, `ResultScreen.jsx` |

`src/pages/Kiosk.jsx` wires the kiosk steps together. Keep edits there small, and tell the team before changing it.

## Contracts between parts

```js
// vitals.js
startScan(onVitals) → stop()
onVitals({ hr, hrv, stress, bp, rr, quality })

// voice.js
startListening()
stopListening(lang) → transcript
speak(text, lang)

// extract.js
extractSymptoms(transcript, lang) →
  { symptoms, onset, pain_score, red_flags, suggested_level, reason }

// priority.js
computePriority(vitals, baseline, ai) → { level: 'green' | 'yellow' | 'red', reasons }
```

## Git workflow

```bash
git checkout main && git pull
git checkout -b feature/<your-area>
# commit only your own files, push, open a PR into main
```

Merge small and often.
