# AstraVitals — Combined build

This combined project uses the richer NASA-space-app client from `AstraVitals-guide-complete.zip` together with the expanded Phase 4 telemetry API and persistent health-record services from `AstraVitals-complete(1).zip`.

## Combined features

- Animated dashboard/stat cards and responsive navigation
- Interactive body map and daily crew check-ins
- Multi-day health trends, personal baselines, guidance, streaks and reminders
- Simulated wearable stream, signal-quality checks and telemetry charts
- Explainable investigation engine with safety-rule escalation
- Crew health, mission reports (SBAR), settings and Resilience Center
- Server-backed health measurements, alerts, wellbeing, symptoms, radiation history, mission insights and reminders
- Offline-first client behavior and local audit-chain module

See `MERGE-NOTES.md` for integration and verification details.

# AstraVitals

**Hear the signal. Understand the change. Know what to check next.**

An offline-first astronaut health intelligence prototype. ASTRAVITALS compares simulated crew measurements with personal baselines, uses transparent Bayesian reasoning to rank possible contributors, and recommends one useful next check.

> **Safety notice:** This is a hackathon prototype using simulated data and illustrative likelihoods. It is not a medical device, diagnostic system, or substitute for qualified medical judgment. In a real mission, emergency protocols and medical authority always take precedence.

## Requirements
- Node.js 20+
- npm 10+

## Run the full project

From this folder:

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000
- API health: http://localhost:4000/api/health

The Vite development server proxies `/api` requests to the Express backend.

## Other commands

```bash
npm run build
npm test
npm start
```

`npm start` runs the API server. The built frontend is in `client/dist`; serve it with your preferred static host or reverse proxy.

## What's included
- Responsive React + Vite frontend in `client/`; Node.js + Express backend in `server/` (now **optional** ground-station sync)
- **Reasoning engine runs in the browser** (`server/src/engine.js` is imported by the client), so investigations work with no network
- Explainable Bayesian posterior updates; Shannon entropy / expected information gain per crew-minute
- **Rules-first safety tier** (SpO2, resting HR, temperature, CO2) that runs before and independently of the Bayesian model and escalates critical readings
- **Measurement-driven context**: priors are derived from measured values (CO2 ppm, sleep history, activity, signal quality), not hand-typed flags
- **Auto-answered checks**: a sensor can answer a check (e.g. CO2) at zero crew time; the crew can also skip an unavailable check
- **Simulated wearable (digital twin)** streaming BLE-ready 1 Hz packets with fault injection (loose strap, exercise, sleep debt, CO2 rise, space weather, low SpO2)
- **Personal, activity-aware baseline** (median/MAD) with CUSUM change detection; exertion is recognised instead of alarmed
- **Signal-quality index** feeds the Sensor Error hypothesis
- Working tabs: Dashboard, Check-in, Trends, Investigations (history), Crew Health (telemetry), Mission Reports (SBAR handoff incl. check-in and trends), Settings (demo limits + Resilience Center)
- Tamper-evident (SHA-256 hash-chained) activity log with a Verify button
- Optional NASA DONKI space-weather feed (cached; falls back when offline)
- Self-hosted fonts and an app-shell service worker (production build) for offline opening
- **Daily Check-in** (manual entry): HR, blood pressure, blood glucose, temperature, SpO₂, sleep, mood, exercise, radiation dose, notes; plausibility validation; one-tap fill of HR/SpO₂ from the wearable only when signal quality is good and the crew member is at rest
- **Interactive body map** (keyboard accessible) with severity levels; severe chest/head symptoms escalate like a device alarm
- **Rules-based guidance** per flagged value and per trend, tagged with the NASA hazard it relates to, with a safety line for low mood
- **Multi-day trends** (own-baseline median/MAD, last 3 vs earlier values), five-hazard coverage panel, reminders, consistency streak and badges
- Crew-entered mood and reported symptoms answer the engine's checks at zero crew minutes (used as evidence only, never also as priors)
- 58 automated unit tests (`npm test`); see `GUIDE-COMPLIANCE.md` for the mapping to the challenge guide

## Challenge guide compliance
See [GUIDE-COMPLIANCE.md](GUIDE-COMPLIANCE.md) for a requirement-by-requirement map.

## Demo workflow
1. Switch to **Live wearable (simulated)**. At baseline the engine reports "No deviation to investigate".
2. Press **Sleep debt (4 nights)**; wait a few seconds. The deviation appears, then **Start Investigation**.
3. Try **Exercise** (heart rate rises but is recognised as exertion, no alarm), **Loose strap** (signal quality drops and Sensor Error rises), **CO₂ rise** (the sensor answers the CO₂ check with no crew time).
4. Open **Crew Health** for live telemetry, baseline, CUSUM and the packet schema; **Mission Reports** for the SBAR handoff.
5. In **Settings**, add notes, then **Verify log integrity**.

## Project structure

```text
client/src/
  checkins.js              browser-local persistence for check-ins
  App.jsx                  dashboard + routing between tabs
  data.js                  re-exports the server scenarios (single source of truth)
  telemetry/               simulator, baseline + CUSUM, live glue, seeded series
  features/                charts, simulator controls, views, Resilience Center
  auditChain.js            hash-chained log helpers
  spaceWeather.js          optional NASA DONKI feed
  report.js                SBAR report
  features/CheckInView.jsx, BodyMap.jsx, TrendsView.jsx, checkin.css   manual entry, body map, trends
server/src/
  vitals.js                check-in validation, rules, trends, guidance, streaks, reminders (pure, tested)
  engine.js                Bayesian engine, rules tier, auto checks, skip
  scenarios.js             three scenario snapshots
  index.js                 optional API
```

## Scientific and implementation limitations
- Check-in limits (BP, glucose, temperature, mood, symptoms) are illustrative general-adult reference points, not mission limits or clinical advice. Guidance text is generic self-care plus escalation; it has not been reviewed by a clinician.
- Radiation dose is whatever the crew member types in; the app does not estimate exposure. The static 0.12 mSv dashboard tile and the 0.4 mSv/day demo values are placeholders, not verified NASA figures.
- Check-ins are stored unencrypted in browser localStorage.
- The 14-day demo history is scripted and synthetic.
- No camera/OCR input was built.
- Check-in limits (blood pressure, glucose, temperature, sleep, mood) are illustrative general-adult reference points, not clinical or mission limits; they must be reviewed by a clinician before any real use.
- The Trends tab can load a **synthetic** 14-day history scripted to show a developing strain pattern; it is labelled synthetic everywhere it appears.
- Radiation: the dashboard tile shows a static demo value; the check-in only records a dose the crew member types in from a dosimeter. The app does not estimate exposure.
- Camera-based input (mentioned in the challenge guide) is not implemented.
- Reminders are in-app and derived from the log; there is no background push notification when the app is closed.
- Check-ins are stored unencrypted in browser localStorage.
- All crew health values and scenario contexts are synthetic. The wearable is a **software simulation**; no physical device was built or validated.
- Likelihoods and safety limits are illustrative assumptions, not clinically calibrated values or mission limits.
- The model treats the candidate explanations as one categorical variable (relative likelihood), although real contributors can co-occur; checks are assumed conditionally independent.
- Wrist PPG/SpO2 accuracy, skin-vs-core temperature, microgravity behaviour and battery safety need physical testing; none of that is claimed here.
- Scenario numbers (e.g. CO2 ppm, radiation) are demo values and should be checked against NASA sources before being quoted as realistic.
- The activity log is tamper-evident, not tamper-proof, and is not a regulated medical audit log.
- The DONKI feed call could not be tested from the build sandbox; it falls back gracefully if unreachable.
