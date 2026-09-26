# SHD

HTH3: an ER waiting-room recheck kiosk. Patients get a camera vitals scan and a spoken check-in, and a nurse dashboard ranks them by who needs a recheck.

## Setup

```bash
npm install
cp .env.example .env   # only needed for api/ (voice, AI); .env is gitignored
npm run dev            # first run copies the MediaPipe runtime and downloads models into public/
npm test
npm run build
```

- Kiosk: http://localhost:5173/#/kiosk (camera scan starts automatically)
- Nurse dashboard: http://localhost:5173/#/dashboard (open in a second tab in the same browser)

The site is deployed as static files on **GitHub Pages**: pushing to `main` runs `.github/workflows/deploy.yml` (test, build, publish). On first use set Settings → Pages → Source to **GitHub Actions**. The live URL is `https://<owner>.github.io/SHD/`.

Files in `api/` run at `/api/*` only during `npm run dev`. GitHub Pages has no server, so they do not exist on the deployed site; features that need a secret API key must move to in-browser APIs (e.g. Web Speech) or another approach. API keys are never read in `src/`.

## Structure and owners

| Area | Files |
|---|---|
| Vitals (MediaPipe + POS, free, in-browser) | `src/lib/vitals.js`, `src/vitals/`, `src/components/kiosk/ScanView.jsx`, `tests/vitals/` |
| Voice (ElevenLabs) | `api/stt.js`, `api/tts.js`, `src/lib/voice.js`, `src/components/kiosk/VoiceCheckIn.jsx` |
| AI (Gemini) | `api/extract.js`, `src/lib/extract.js` |
| Dashboard + logic | `src/lib/priority.js`, `src/lib/sync.js`, `src/data/`, `src/components/dashboard/*` |
| UI/UX | `src/styles/`, `LanguagePicker.jsx`, `ResultScreen.jsx` |

`src/pages/Kiosk.jsx` wires the kiosk steps together. Keep edits there small, and tell the team before changing it.

## Contracts between parts

```js
// vitals.js
startScan(onVitals, { video, overlay, onStatus }) → stop()
onVitals({ sessionId, hr, rr, hrv: null, stress: null, bp: null, quality: 'good'|'poor',
           esi: 1|2|'3-5'|null, consciousness, pain, facialDroop, complete })  // ~1/s; null when the patient leaves

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

## Vitals details

- Heart rate: forehead and cheek regions → skin filter → POS rPPG → spectral peak, with SNR-based confidence.
- Respiration: shoulder motion (pose landmarks) fused with forehead intensity.
- Observations from face blendshapes: consciousness (eye closure + following an on-screen dot), pain expression, smile symmetry.
- Flow: positioning checks → 20 s prompted cycle (rest, gaze dot, smile) → continuous monitoring over the latest 20 s. No face for 5 s resets for the next patient.
- `hrv`, `stress` and `bp` are not measurable with this method and are always null.
- ESI cut-offs are in `src/vitals/triage/thresholds.json`. Adults only; not clinically validated.

## Git workflow

```bash
git checkout main && git pull
git checkout -b feature/<your-area>
# commit only your own files, push, open a PR into main
```

Merge small and often.
