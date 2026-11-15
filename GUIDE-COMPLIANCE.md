# Challenge #04 guide compliance matrix

| Guide requirement | Where in AstraVitals | Status |
|---|---|---|
| Record HR, BP, glucose, temperature, sleep, mood | Check-in tab (all six, plus SpO2, exercise, radiation dose) | Done |
| Input via keyboards, buttons, cameras or other | Keyboard fields, mood buttons, body map, wearable fill (simulated BLE packet) | Done except camera |
| Organised, understandable presentation | Dashboard, Trends, Crew Health, SBAR | Done |
| Recognise unusual changes | Rules tier, personal baseline + CUSUM, multi-day trend detector, colour-coded alerts | Done |
| Accessible guidance, preventive care | Guidance cards (hazard-tagged), Crew Guidance panel | Done (not clinician-reviewed) |
| Hazard: space radiation | Dose logging + cumulative record; DONKI space-weather feed | Partial (no exposure estimation) |
| Hazard: isolation and confinement | Mood, sleep, trends, behavioural guidance | Done |
| Hazard: distance from Earth | Local engine, offline records, SBAR handoff | Done |
| Hazard: gravity fields | Exercise, resting HR, BP trends over days | Done |
| Hazard: hostile/closed environment | CO2 and temperature recorded beside personal data | Done |
| Interactive body map | Check-in tab | Done |
| Dynamic charts over days or weeks | Trends tab (6 charts, baselines) | Done |
| Colour-coded alerts | Alert banners, hazard dots | Done |
| Reminders and notifications | In-app reminders and badge (no OS push) | Partial |
| Simple medical guidance | Guidance engine | Done |
| Gamification | Streak and consistency badges | Done |
| Decision support, not diagnosis | Disclaimers everywhere; rules and probabilities labelled illustrative | Done |

Beyond the guide: explainable Bayesian next-best-check, wearable digital twin with fault injection, signal-quality gating, tamper-evident log, SBAR for delayed contact.
