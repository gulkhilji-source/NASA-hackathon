# Merge notes

## Source selection
- Client UI, interactive body map, daily check-in, trends, simulated wearable telemetry, charts, guidance, SBAR reporting, Resilience Center and client tests are based on the `AstraVitals-guide-complete.zip` version.
- Expanded Express API, JSON-backed storage, health validation/alerts, personal baselines, wellbeing, symptoms, mission-watch insights, radiation history and reminders are brought in from `AstraVitals-complete(1).zip`.
- The newer guide version's investigation engine, scenario definitions and telemetry client remain the source of truth.

## Integration
- The server entry point combines the Phase 4 health routes with the newer investigation engine.
- The model endpoint now respects the requested scenario and exposes rules-tier flags.
- Investigation creation folds recent measurements and wellbeing context into the selected scenario before creating the investigation.
- Dashboard card motion is applied with a reduced-motion accessibility fallback.

## Verification
- Server tests: 62 passed.
- Client tests: 8 passed.
- A Vite production build could not be run in this environment because dependency installation timed out and the local `vite` executable was unavailable. Run `npm install` followed by `npm run build` on your computer to verify the production bundle.

## Important prototype limitations
This is a demonstration system. Synthetic readings are not physical wearable data, thresholds and guidance are not medically validated, and local JSON storage is not production-grade secure multi-user storage. Do not use it for real clinical or mission-critical decisions.
