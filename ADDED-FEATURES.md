# AstraVitals — change log (hackathon day)

Original idea and structure kept. Main changes:

1. Engine runs client-side (true offline); server is optional. `/api/model` honours the selected scenario.
2. Context derived from measurements; rules-first safety tier; red-flag stop wired to the escalation path.
3. Sensor-answered checks (0 crew minutes) and "skip unavailable check".
4. New hypothesis: Recent Exertion. Sensor-error prior driven by wearable signal quality.
5. Simulated wearable + personal baseline (median/MAD) + CUSUM change detection + real, scaled charts.
6. All five tabs wired; Resilience Center mounted under Settings with a hash-chained log.
7. SBAR handoff report; optional NASA DONKI feed.
8. Fixes: stale service worker (cache-first on /api), duplicate scenario data, static avatar initials, bogus 28% before investigation, duplicated "next check" reasoning line, unused validate endpoint input handling, unbounded in-memory store.

## Guide-compliance update
9. Daily Check-in tab: manual entry for HR, blood pressure, glucose, temperature, SpO2, sleep, mood, exercise, radiation dose, notes; plausibility validation.
10. Interactive body map with severity; severe chest/head symptoms escalate.
11. Rules-based guidance per flag and trend, hazard-tagged.
12. Trends tab: multi-day charts vs personal baseline, five-hazard coverage, streak and badges, synthetic demo history.
13. Reminders (in-app), SBAR now includes check-in and trends.
14. Fixes found while testing: wearable import gated on the newest packet's signal quality, stale form errors cleared on edit, grid stretching, duplicate chart-label keys.

## Guide-compliance pass
9. Check-in tab: manual entry (HR, BP, glucose, temperature, SpO2, sleep, mood, exercise, radiation dose) with validation; body map; fill HR/SpO2 from the wearable only when signal quality is good (newest packet and 10 s average) and the crew member is at rest.
10. Rules tier for check-ins (`server/src/vitals.js`); a critical manual value escalates exactly like a device alarm.
11. Trends tab: multi-day charts, robust baseline comparison, findings, streak/badges, five-hazard coverage.
12. Guidance: conservative, tagged by hazard, escalate-only for critical values; self-harm safety line in low-mood guidance.
13. Reminders derived from the log (work offline); nav badge and dashboard banner.
14. Engine bridge: logged mood and reported symptoms answer checks at zero crew time. Used as evidence only, never also as a prior (no double counting). "No symptom typed" is NOT treated as "normal".
15. SBAR includes the latest check-in and flagged trends.
