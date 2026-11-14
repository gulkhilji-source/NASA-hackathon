# AstraVitals software enhancements

The existing visual interface and CSS design have been preserved.

## Existing foundation retained
- React + Vite client and Express API
- Mission scenarios and Next Best Check investigation flow
- Explainable Bayesian evidence updates
- JSON mission report export

## Software upgrades
- Persistent JSON-backed storage for investigations, health measurements, and wellbeing check-ins
- Validated telemetry for heart rate, SpO₂, blood pressure, blood glucose, body temperature, sleep, cabin CO₂, and radiation dose
- Configurable prototype threshold checks and change-from-previous-reading alerts
- Mood and stress check-ins with optional notes
- Crew summary endpoint with latest record, averages, and alert counts
- API capability and metric metadata endpoints
- Browser persistence for selected scenario and current investigation
- Existing dashboard metric cards and heart-rate chart connected to saved health telemetry
- Scenario-specific crew histories so measurements from different simulated astronauts are not mixed
- Health screening alerts surfaced in the existing assessment text without changing the dashboard layout
- Offline telemetry queue with automatic sync when connectivity returns or the app regains focus
- Mission report export now includes health measurement and alert history
- Production service-worker registration and offline GET cache with network-first API behavior
- Automated unit tests for telemetry validation, alerts, trends, and existing investigation engine

## Important safety boundary
All sample values and screening thresholds are illustrative prototype logic, not medical advice or validated clinical alarms. A qualified aerospace medical team must approve thresholds, alert handling, security, and operational procedures before real crew use.
