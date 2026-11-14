# AstraVitals — Integrated mission health tools

This build completes the planned prototype feature set while retaining the existing AstraVitals dashboard design language and original investigation flow.

## Added capabilities

### Crew health entry and monitoring
- Manual entry for heart rate, SpO₂, blood pressure, glucose, temperature, sleep, cabin CO₂, and radiation readings.
- Input validation and screening alerts through the existing health API.
- Crew-specific baseline editor backed by persistent server storage.
- Historical metric selector with average, minimum, maximum, sample count, direction, and a small trend plot.

### Wellbeing and symptoms
- Mood and stress check-ins (1–5) with optional private notes.
- Body-region symptom log with severity, labels, and notes.
- Recent symptom reports displayed for the active crew member.

### Mission watch and environmental context
- Explainable rule-based watch score with visible contributing factors.
- Radiation exposure history. Radiation values are interpreted as cumulative readings supplied by the source and are not summed across samples.
- Synthetic wearable sample endpoint and dashboard action. This is a simulator only; no physical wearable is paired.

### Reminders and offline behaviour
- Persistent crew-specific reminders with completion state.
- Optional browser notifications. The user must explicitly enable browser permission; due reminders are checked while the app is open.
- Existing offline measurement queue continues to retry on reconnection/focus.
- Private crew records are not added to the service-worker cache.

### Reports
Mission JSON exports now include telemetry, alerts, symptom reports, mission-watch insights, radiation history, reminders, scenario, and investigation context.

## New API routes

- `POST /api/wearables/simulate` — generate one synthetic wearable-style reading.
- `GET /api/symptoms?crewId=...` / `POST /api/symptoms` — list and record body-region symptom reports.
- `GET /api/crew/:crewId/insights` — calculate a transparent rule-based mission-watch score and contributing factors.
- `GET /api/crew/:crewId/radiation` — return cumulative radiation readings in chronological order.
- `GET /api/reminders?crewId=...` / `POST /api/reminders` — list and create reminders.
- `PATCH /api/reminders/:id` — mark a reminder complete/incomplete.

Previously added endpoints for measurements, wellbeing, baselines, trends, alerts, summaries, and investigations remain available.

## Run and verify

From the project root (the directory containing the root `package.json`):

```bash
npm install
npm test
npm run build
npm run dev
```

Frontend: `http://localhost:5173`  
API: `http://localhost:4000/api/health`

## Important limits

- All scenario and wearable readings are synthetic unless entered manually by a user.
- There is no direct Bluetooth, ANT+, medical-device, or wearable-vendor integration. Such integrations require device protocols, permissions, hardware, and vendor credentials.
- There is no live NASA DONKI/OSDR feed connection in this prototype. Radiation and environmental readings are logged from supplied or simulated values.
- The mission-watch score and threshold alerts are transparent software heuristics, not a medically validated prediction model or diagnosis.
- Reminders notify only while the app is open and browser notification permission has been granted. There is no background push service.
- JSON file persistence is for a local hackathon demo, not a secure multi-user production database. Before operational use, add authentication, encryption at rest/in transit, access controls, audit governance, backups, and qualified flight-medicine review.
