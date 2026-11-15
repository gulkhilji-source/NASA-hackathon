import React from "react";
import { Activity, Pause, Play, Satellite } from "lucide-react";
import { DEFAULT_CONTROLS } from "../telemetry/simulator.js";
import "./wearable.css";

const PRESETS = [
  { label: "Baseline", patch: { ...DEFAULT_CONTROLS } },
  { label: "Sleep debt (4 nights)", patch: { ...DEFAULT_CONTROLS, shortSleepNights: 4 } },
  { label: "Exercise", patch: { ...DEFAULT_CONTROLS, exercise: true } },
  { label: "Loose strap", patch: { ...DEFAULT_CONTROLS, looseStrap: 0.9 } },
  { label: "CO₂ rise", patch: { ...DEFAULT_CONTROLS, co2: 1850 } },
  { label: "Space weather", patch: { ...DEFAULT_CONTROLS, spaceWeatherHoursAgo: 20 } },
  { label: "Low SpO₂ (critical)", patch: { ...DEFAULT_CONTROLS, spo2Drop: 10 } }
];

export default function SimulatorControls({ controls, onChange, paused, onTogglePause, onFetchFeed, feedStatus }) {
  const set = (patch) => onChange({ ...controls, ...patch });
  return (
    <section className="panel sim-panel">
      <div className="panel-title">
        <div><Activity size={19} /><h2>Wearable Simulator</h2></div>
        <button className="text-action" onClick={onTogglePause}>{paused ? <><Play size={12} /> Resume</> : <><Pause size={12} /> Pause</>}</button>
      </div>
      <p className="sim-note">Digital twin of the proposed wrist band (PPG + IMU + skin temperature + CO₂ node). Streams the same 1 Hz packet a real BLE device would send. Inject faults and watch the engine react.</p>
      <div className="preset-row">{PRESETS.map((p) => <button key={p.label} className="preset-chip" onClick={() => onChange({ ...p.patch })}>{p.label}</button>)}</div>
      <div className="sim-grid">
        <label className="slider-row"><span>Strap contact problem <b>{Math.round(controls.looseStrap * 100)}%</b></span>
          <input type="range" min="0" max="1" step="0.05" value={controls.looseStrap} onChange={(e) => set({ looseStrap: Number(e.target.value) })} /></label>
        <label className="slider-row"><span>Short-sleep nights <b>{controls.shortSleepNights}</b></span>
          <input type="range" min="0" max="5" step="1" value={controls.shortSleepNights} onChange={(e) => set({ shortSleepNights: Number(e.target.value) })} /></label>
        <label className="slider-row"><span>Cabin / personal CO₂ <b>{controls.co2} ppm</b></span>
          <input type="range" min="400" max="3500" step="50" value={controls.co2} onChange={(e) => set({ co2: Number(e.target.value) })} /></label>
        <label className="toggle-row"><input type="checkbox" checked={controls.exercise} onChange={(e) => set({ exercise: e.target.checked })} /> Crew member exercising</label>
        <label className="toggle-row"><input type="checkbox" checked={typeof controls.spaceWeatherHoursAgo === "number"} onChange={(e) => set({ spaceWeatherHoursAgo: e.target.checked ? 20 : null })} /> Space-weather event (20 h ago)</label>
        <div className="feed-row">
          <button className="preset-chip" onClick={onFetchFeed}><Satellite size={12} /> Use NASA DONKI feed</button>
          {feedStatus && <small>{feedStatus}</small>}
        </div>
      </div>
    </section>
  );
}
