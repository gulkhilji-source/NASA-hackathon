# AstraVitals Phase 3 changes

Phase 3 adds backend health intelligence while preserving the existing React dashboard markup and CSS.

## Added
- Crew-specific personal baseline storage in the persistent JSON store.
- Baseline validation against supported metric ranges.
- Per-metric baseline deviation screening alerts on newly submitted measurements.
- Longitudinal trend summaries with chronological points, average, minimum, maximum, net change, percentage change, and direction.
- Baseline included in crew summary responses.
- Next Best Check initialization now considers recent health telemetry and wellbeing signals: cabin CO₂, repeated short sleep, low mood, and high stress.
- New automated tests for baseline validation, baseline alerts, trend summaries, and health-context priors.

## New endpoints
- `GET /api/crew/:crewId/baseline`
- `PUT /api/crew/:crewId/baseline`
- `GET /api/crew/:crewId/trends?metric=heartRate&limit=100`

## UI preservation
No dashboard layout, component styling, colors, spacing, navigation, or CSS was changed in this phase. The new capabilities are available through the API and documented in `README.md`; a dedicated in-dashboard data-entry and trends workflow can be added as a later phase if desired.

## Verification
- 17/17 backend unit tests passed.
- Server JavaScript syntax checks passed.
- Frontend production build was not run because the Vite dependency was unavailable in the build environment. The frontend source was unchanged in this phase.

## Safety
Baseline deviation percentages and model priors are illustrative prototype assumptions, not medically validated thresholds or diagnostic probabilities.
