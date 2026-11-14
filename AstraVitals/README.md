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
- Responsive React + Vite frontend in `client/`
- Node.js + Express backend in `server/`
- Explainable Bayesian posterior updates
- Shannon entropy / expected information gain per minute
- CO₂ safety-priority check override when cabin CO₂ is elevated
- Crew-specific health baselines with configurable-by-code deviation thresholds
- Longitudinal trend summaries for supported health indicators
- Next Best Check priors informed by recent CO₂, sleep, and wellbeing signals
- Three simulated mission scenarios
- Investigation session endpoints
- Input validation and basic automated tests
- Browser local storage for demo investigation state
- Dashboard cards and the heart-rate overview now read the latest saved crew telemetry
- Mission scenario samples are submitted to the health API and stored per simulated crew member
- Health alerts are surfaced in the existing assessment panel without adding or rearranging UI elements
- Offline telemetry submissions are queued locally and synchronised on reconnection or when the app regains focus
- Exported mission reports include saved health telemetry and alert history

## Demo workflow
1. Choose a mission scenario in the left navigation.
2. Review the astronaut's measurements, baseline deviation, and mission context.
3. Start the recommended check.
4. Choose **Abnormal** or **Normal** to submit a simulated result.
5. Watch the candidate-cause probabilities and reasoning trail update.
6. Change mission scenarios to generate separate simulated crew telemetry records.
7. Review the latest health values and any screening alerts in the existing dashboard.
8. Export a JSON mission report containing investigation and health telemetry history.

## Project structure

```text
ASTRAVITALS/
├── client/
│   ├── index.html
│   ├── package.json
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── styles.css
│       └── data.js
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── index.js
│   │   ├── engine.js
│   │   ├── scenarios.js
│   │   └── store.js
│   └── test/
│       └── engine.test.js
└── README.md
```

## Scientific and implementation limitations
- All crew health values and scenario contexts are synthetic.
- Likelihood values are illustrative assumptions, not clinically calibrated probabilities.
- The simple Naive Bayes model assumes conditional independence between checks; real observations can be correlated.
- A probability bar is a model belief, not a diagnosis or measured medical risk.
- Radiation is shown as mission exposure context, not treated as a direct explanation for an acute heart-rate change.
- API records are persisted to a local JSON file; this is suitable only for a local demo and is not a secure or multi-user production database.
- Offline telemetry is queued in browser local storage and retried when connectivity returns. The service worker caches selected non-personal GET responses only.


## Health intelligence API additions

The server now includes an append-only, JSON-backed mission record store. Records are written to `server/data/astravitals-store.json` at runtime (keep this file private; it contains crew health data).

- `GET /api/metrics` — supported measurement fields and configurable prototype screening thresholds.
- `POST /api/measurements` — record one or more numeric health indicators. Optional fields include `heartRate`, `spo2`, `systolic`, `diastolic`, `glucose`, `temperature`, `sleepHours`, `co2`, `radiation`, `mood`, and `symptoms`. Optional `crewId` and `source` (`manual`, `wearable`, `simulated`) are supported.
- `GET /api/measurements?crewId=demo-crew&limit=100` — latest records first.
- `GET /api/alerts?crewId=demo-crew` — threshold and trend alerts.
- `GET /api/crew/:crewId/summary` — latest telemetry, averages, alert count, and wellbeing summary.
- `POST /api/wellbeing` — record a mood and stress rating from 1–5, with optional private notes.
- `GET /api/wellbeing?crewId=demo-crew` — retrieve wellbeing check-ins.

Example measurement request:

```json
{
  "crewId": "crew-01",
  "source": "wearable",
  "heartRate": 76,
  "spo2": 97,
  "systolic": 118,
  "diastolic": 78,
  "glucose": 92,
  "temperature": 36.8,
  "sleepHours": 7.2,
  "co2": 420,
  "radiation": 0.08,
  "mood": 4
}
```

These endpoints are decision-support prototypes. Their screening thresholds are not clinically calibrated, are not a diagnosis, and must be replaced or approved by qualified flight-medicine personnel before operational use. The client also persists the active scenario, investigation session, and last successfully fetched scenario list in browser storage, and the production service worker provides a network-first cache for non-personal GET API metadata; private health and wellbeing responses are deliberately excluded from browser caching.


## Phase 3: baseline and trend intelligence

- `GET /api/crew/:crewId/baseline` — retrieve a crew-specific baseline.
- `PUT /api/crew/:crewId/baseline` — save baseline values. Send a JSON object with a `values` property.
- `GET /api/crew/:crewId/trends?metric=heartRate&limit=100` — return chronological points, average, minimum, maximum, change, and direction for one metric. Supported metric names are listed by `GET /api/metrics`.
- `GET /api/crew/:crewId/summary` — now also includes the saved personal baseline.

Example baseline request (PowerShell):

```powershell
Invoke-RestMethod -Method Put -Uri "http://localhost:4000/api/crew/crew-01/baseline" -ContentType "application/json" -Body '{"values":{"heartRate":68,"spo2":97,"systolic":118,"diastolic":78,"glucose":92,"temperature":36.8,"sleepHours":7.5}}'
```

After saving a baseline, later measurement submissions are checked against it and may include a `baseline` review alert. The deviation percentages are prototype screening heuristics; they are not clinical limits.

The Next Best Check Engine now stores the health context used to initialize each investigation. Recent high stress or low mood increases the illustrative psychological-strain prior; recent elevated cabin CO₂ and repeated short sleep are also considered. This does not diagnose a condition and does not override mission emergency procedures.

## Integrated mission-health tools (Phase 4)

The dashboard now includes in-place tools for manual telemetry entry, synthetic wearable samples, personal baseline editing, mood/stress check-ins, body-region symptom reporting, trend review, mission-watch factors, radiation history, and reminders. The additions reuse the existing panel styling and do not replace the original dashboard or investigation workflow.

See [PHASE-4-COMPLETION.md](./PHASE-4-COMPLETION.md) for the complete feature and API list, setup commands, and scientific/technical limitations.
