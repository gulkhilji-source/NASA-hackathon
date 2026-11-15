// Glue: simulator packets + baseline tracker -> the same scenario-shaped object the dashboard already uses.
import { createSimulator } from "./simulator.js";
import { createBaselineTracker, median } from "./baseline.js";

export const LIVE_ID = "live";
const WINDOW = 10;
const HISTORY = 120;

export function createLiveSession(opts = {}) {
  const sim = createSimulator(opts);
  const tracker = createBaselineTracker({ initial: opts.baselineHR ?? 66 });
  const state = { packets: [], stats: [], last: null };
  function step() {
    const p = sim.tick();
    const s = tracker.update({ hr: p.hr, activity: p.activity, sqi: p.sqi });
    state.packets.push(p); state.stats.push(s);
    if (state.packets.length > HISTORY) { state.packets.shift(); state.stats.shift(); }
    state.last = { packet: p, stats: s };
    return state.last;
  }
  for (let i = 0; i < 60; i++) step(); // warm start so the baseline is already learned
  return { sim, step, state };
}

const r1 = (v) => Math.round(v * 10) / 10;

export function liveScenario(session, identity = {}) {
  const { packets, stats } = session.state;
  const recent = packets.slice(-WINDOW);
  const { packet, stats: s } = session.state.last;
  const hr = median(recent.map((p) => p.hr));
  const spo2 = median(recent.map((p) => p.spo2));
  const sqi = recent.reduce((a, p) => a + p.sqi, 0) / recent.length;
  const activity = recent.reduce((a, p) => a + p.activity, 0) / recent.length;
  const lastNight = packet.sleepHistory[packet.sleepHistory.length - 1];
  const hoursAgo = packet.spaceWeatherHoursAgo;

  const observations = [];
  const dev = Math.round((hr / s.baseline - 1) * 100);
  if (Math.abs(s.z) >= 2 && s.resting) observations.push(`Heart-rate deviation detected (${dev >= 0 ? "+" : ""}${dev}% vs personal baseline, z=${s.z.toFixed(1)})`);
  if (s.sustained) observations.push("Sustained resting deviation detected by change-point (CUSUM) monitor");
  if (activity >= 0.5) observations.push("Recent exertion detected by motion sensor (heart rate expected to be raised)");
  if (packet.co2 >= 1000) observations.push(`CO₂ ${packet.co2} ppm above configured cabin threshold`);
  const nights = packet.sleepHistory.filter((h) => h < 6).length;
  if (nights >= 2) observations.push(`${nights} consecutive short-sleep nights (from motion-based sleep estimate)`);
  if (typeof hoursAgo === "number") observations.push(`Space-weather event recorded ${hoursAgo} hours ago`);
  if (sqi < 0.6) observations.push(`Wearable signal quality is low (${Math.round(sqi * 100)}%) — readings may be unreliable`);
  const anomalous = observations.length > 0;
  if (!anomalous) observations.push("All monitored values within personal baseline");

  return {
    id: LIVE_ID, name: "Live · simulated wearable", mission: identity.mission || "Artemis-III",
    astronaut: identity.astronaut || "Alex Rivera", role: identity.role || "Flight Engineer", sol: "LIVE",
    heartRate: Math.round(hr), heartRateBaseline: Math.round(s.baseline), baselineSpread: s.spread, zScore: s.z,
    spo2: Math.round(spo2), temperature: r1(packet.skinTemp), temperatureBaseline: packet.meta.baselineTemp, temperatureKind: "skin",
    sleepHours: lastNight, sleepHistory: packet.sleepHistory, co2: packet.co2, radiation: 0.1,
    weather: typeof hoursAgo === "number" ? `Active · ${hoursAgo}h ago` : "Quiet",
    spaceWeatherHoursAgo: hoursAgo, activity, sqi, persistentDeviation: s.persistentDeviation,
    alert: observations[0], context: {}, observations, anomalous, live: true, battery: packet.batt, sustained: s.sustained
  };
}
