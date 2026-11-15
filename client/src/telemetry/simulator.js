// Digital twin of the proposed wrist wearable (PPG + IMU + skin temperature + optional CO2 node).
// It generates 1 Hz summary packets using the same schema a real BLE device would send.
// Illustrative physiology only — NOT clinically validated.
import { mulberry32, gaussian } from "./prng.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const DEFAULT_CONTROLS = {
  exercise: false,        // crew member is exercising
  looseStrap: 0,          // 0..1 sensor contact problem (motion artefact / poor contact)
  shortSleepNights: 0,    // consecutive short nights (0..5)
  co2: 420,               // ppm at the wearable/cabin sensor
  spaceWeatherHoursAgo: null, // null = quiet; number = hours since an event
  spo2Drop: 0             // true oxygen-saturation drop in points (a real event, not an artefact)
};

export function createSimulator({ seed = 7, baselineHR = 66, baselineSpo2 = 97.5, baselineTemp = 33.4 } = {}) {
  const rand = mulberry32(seed);
  const controls = { ...DEFAULT_CONTROLS };
  let ex = 0, ar = 0, t = 0;

  function tick() {
    t += 1;
    ex += ((controls.exercise ? 1 : 0) - ex) * 0.12;
    ar = 0.9 * ar + gaussian(rand) * 1.1;

    const sleepEffect = Math.min(controls.shortSleepNights, 5) * 2.4;
    const weatherEffect = typeof controls.spaceWeatherHoursAgo === "number" && controls.spaceWeatherHoursAgo <= 48 ? 3.5 : 0;
    const co2Excess = Math.max(0, controls.co2 - 1000);
    const hrTrue = baselineHR + sleepEffect + weatherEffect + co2Excess * 0.012 + 55 * ex + ar;
    const spo2True = baselineSpo2 - co2Excess * 0.0025 - 0.6 * ex - controls.spo2Drop + gaussian(rand) * 0.25;
    const tempTrue = baselineTemp + 0.6 * ex + gaussian(rand) * 0.04;
    const activity = clamp(0.06 + 0.72 * ex + gaussian(rand) * 0.025, 0, 1);
    const sqi = clamp(1 - controls.looseStrap * 0.75 - ex * 0.2 + gaussian(rand) * 0.03, 0, 1);

    // sensor artefacts when contact is poor
    let hr = hrTrue, spo2 = spo2True;
    if (rand() < controls.looseStrap * 0.35) hr += (rand() - 0.5) * 80;
    if (rand() < controls.looseStrap * 0.3) spo2 -= rand() * 14 * controls.looseStrap;

    const nights = Math.min(controls.shortSleepNights, 5);
    const sleepHistory = Array.from({ length: 7 }, (_, i) => (i >= 7 - nights ? 4.6 : 7.6));

    return {
      v: 1, t, hr: Math.round(hr * 10) / 10, spo2: Math.round(clamp(spo2, 60, 100) * 10) / 10,
      skinTemp: Math.round(tempTrue * 100) / 100, activity: Math.round(activity * 1000) / 1000,
      co2: Math.round(controls.co2), sqi: Math.round(sqi * 1000) / 1000, batt: Math.max(0.05, 0.95 - t * 0.00002),
      sleepHistory, spaceWeatherHoursAgo: controls.spaceWeatherHoursAgo,
      meta: { baselineTemp }
    };
  }

  return { controls, tick, setControls(patch) { Object.assign(controls, patch); } };
}
