# Wearable concept (design + digital twin — not a built device)

**Positioning:** agencies already fly wearables. AstraVitals' contribution is the reasoning layer: wearable evidence flows into the Next Best Check engine, which asks "what should we check next?" instead of only plotting numbers.

## Proposed hardware (bench prototype, not built)
| Function | Part (example) | Notes |
|---|---|---|
| MCU + BLE | Seeed XIAO nRF52840 Sense or ESP32-S3 | Built-in IMU on the XIAO |
| HR / SpO2 | MAX30102 | Wrist SpO2 is a trend only; needs calibration |
| Skin temperature | TMP117 / MAX30205 | Skin is not core temperature |
| Motion | 6-axis IMU | Use gyro magnitude and high-pass accel (no 1 g reference in microgravity) |
| CO2 (optional) | SCD41 | Personal CO2 pocket sensing in microgravity |
| Power | 150–300 mAh LiPo | Spacecraft battery safety requirements apply |

## Data flow
Band (filter, HR/HRV, SpO2, activity, signal-quality index) -> 1 Hz BLE packet -> crew hub (Web Bluetooth) -> quality gate -> baseline + rules -> derived context -> Next Best Check engine.

## Packet schema v1
```json
{"v":1,"t":1763100000,"hr":78,"spo2":96,"skinTemp":33.4,"activity":0.12,"co2":420,"sqi":0.82,"batt":0.74}
```
The simulator (`client/src/telemetry/simulator.js`) emits this schema. A physical device would only replace the source.

## Software / simulated / physical-only
- **Software (implemented):** baseline, CUSUM, rules tier, quality gate, priors from data, offline engine, SBAR, hash-chained log.
- **Simulated (implemented):** PPG-derived HR/SpO2 values, IMU activity, temperature, CO2, artefacts and faults, battery.
- **Physical-only (NOT done):** real PPG/SpO2 accuracy, contact and comfort, microgravity behaviour, EMI, battery safety, any clinical validation.

## Next steps if continued
KiCad schematic + enclosure CAD; replay public wrist datasets (WESAD, PPG-DaLiA) through the pipeline; Web Bluetooth `BleSource` implementing the same source interface; bench build.
