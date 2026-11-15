import React, { useState } from "react";
import { Download, ClipboardCopy, Satellite } from "lucide-react";
import { LineChart } from "./charts.jsx";
import ResilienceCenter from "./ResilienceCenter.jsx";
import { LIMITS, CO2_ELEVATED_PPM, LABELS } from "../../../server/src/engine.js";
import { ENTRY_LIMITS } from "../../../server/src/vitals.js";
import { buildSBAR } from "../report.js";
import "./wearable.css";

export function CrewHealthView({ live, session, onGoLive }) {
  if (!live || !session?.state?.last) {
    return <section className="panel view-panel"><h2>Crew Health · wearable telemetry</h2>
      <p className="sim-note">Telemetry charts appear when the simulated wearable is streaming. Scenario mode uses fixed snapshots.</p>
      <button className="primary-button" onClick={onGoLive}>Switch to Live wearable (simulated)</button></section>;
  }
  const { packets, stats, last } = session.state;
  const s = last.stats, p = last.packet;
  const xs = ["-2 min", "-1.5", "-1", "-0.5", "now"];
  return <>
    <div className="stat-grid">
      <div className="stat-tile"><span>Personal HR baseline</span><b>{s.baseline.toFixed(1)} bpm</b></div>
      <div className="stat-tile"><span>Robust spread (MAD)</span><b>±{s.spread.toFixed(1)}</b></div>
      <div className="stat-tile"><span>Deviation z-score</span><b>{s.z >= 0 ? "+" : ""}{s.z.toFixed(1)}</b></div>
      <div className="stat-tile"><span>CUSUM change monitor</span><b>{s.cusum.toFixed(1)}{s.sustained ? " ▲ ALERT" : ""}</b></div>
      <div className="stat-tile"><span>Signal quality (SQI)</span><b>{Math.round(p.sqi * 100)}%</b></div>
      <div className="stat-tile"><span>Activity (gravity-independent)</span><b>{p.activity.toFixed(2)}</b></div>
      <div className="stat-tile"><span>Baseline samples</span><b>{s.sampleCount}</b></div>
      <div className="stat-tile"><span>Battery (simulated)</span><b>{Math.round(p.batt * 100)}%</b></div>
    </div>
    <div className="chart-grid">
      <div className="panel telemetry-card"><h3>Heart rate vs personal baseline (raw, incl. artefacts)</h3><LineChart values={packets.map((x) => x.hr)} baseline={s.baseline} spread={s.spread} xLabels={xs} /></div>
      <div className="panel telemetry-card"><h3>SpO₂ % (raw)</h3><LineChart values={packets.map((x) => x.spo2)} baseline={LIMITS.spo2Warning} xLabels={xs} /></div>
      <div className="panel telemetry-card"><h3>Skin temperature °C</h3><LineChart values={packets.map((x) => x.skinTemp)} baseline={p.meta.baselineTemp} xLabels={xs} /></div>
      <div className="panel telemetry-card"><h3>Activity from IMU (0–1)</h3><LineChart values={packets.map((x) => x.activity)} domain={[0, 1]} baseline={0.3} xLabels={xs} /></div>
      <div className="panel telemetry-card"><h3>Signal quality index (trust threshold 0.6)</h3><LineChart values={packets.map((x) => x.sqi)} domain={[0, 1]} baseline={0.6} xLabels={xs} /></div>
      <div className="panel telemetry-card"><h3>CO₂ ppm (wearable/cabin node)</h3><LineChart values={packets.map((x) => x.co2)} baseline={CO2_ELEVATED_PPM} xLabels={xs} /></div>
    </div>
    <section className="panel view-panel"><h2>Latest packet (BLE-ready schema v1)</h2>
      <pre className="packet-pre">{JSON.stringify({ ...p, sleepHistory: undefined, meta: undefined }, null, 2)}</pre>
      <p className="sim-note">A physical wearable would send exactly this over BLE; the app only swaps its TelemetrySource.</p></section>
  </>;
}

export function InvestigationsView({ history, onClear }) {
  return <section className="panel view-panel"><h2>Investigations (this device)</h2>
    {history.length ? <table className="data-table"><thead><tr><th>Started</th><th>Source</th><th>Status</th><th>Checks</th><th>Leading explanation</th></tr></thead>
      <tbody>{history.map((h) => <tr key={h.id}><td>{new Date(h.createdAt).toLocaleString()}</td><td>{h.scenarioName}</td><td>{h.status}</td><td>{h.checks}</td><td>{h.top}</td></tr>)}</tbody></table>
      : <p className="sim-note">No investigations yet. Start one from the Dashboard.</p>}
    {history.length > 0 && <div className="btn-row"><button className="report-button" onClick={onClear}>Clear history</button></div>}
    <p className="sim-note">Stored locally in this browser only.</p></section>;
}

export function ReportsView({ scenario, session, flags, entry, trends }) {
  const [copied, setCopied] = useState("");
  const text = buildSBAR({ scenario, session, flags, entry, trends });
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = `astravitals-sbar-${scenario.id}.txt`; a.click(); URL.revokeObjectURL(url);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied("Copied."); } catch { setCopied("Copy failed — select the text manually."); } };
  return <section className="panel view-panel"><h2>Mission report · SBAR handoff</h2>
    <p className="sim-note">Compact, text-only summary designed for delayed or low-bandwidth ground contact (e.g. deep-space light delay): deltas and conclusions, not raw data.</p>
    <pre className="sbar-pre">{text}</pre>
    <div className="btn-row"><button className="report-button" onClick={download}><Download size={14} /> Download SBAR (.txt)</button>
      <button className="report-button" onClick={copy}><ClipboardCopy size={14} /> Copy</button></div>
    {copied && <p className="sim-note" aria-live="polite">{copied}</p>}</section>;
}

export function SettingsView() {
  const E = ENTRY_LIMITS;
  const rows = [
    ["Blood pressure review (high / low)", `≥ ${E.sysWarning}/${E.diaWarning} / < ${E.sysLowWarning}/${E.diaLowWarning} mmHg`],
    ["Blood pressure critical (high / low)", `≥ ${E.sysCritical}/${E.diaCritical} / systolic < ${E.sysLowCritical} mmHg`],
    ["Blood glucose review (fasting / post-meal / unsure)", `≥ ${E.glucoseHigh.fasting} / ≥ ${E.glucoseHigh.postMeal} / ≥ ${E.glucoseHigh.unsure} mg/dL; low < ${E.glucoseLowWarning}`],
    ["Blood glucose critical", `< ${E.glucoseLowCritical} or ≥ ${E.glucoseCritical} mg/dL`],
    ["Mood / very short sleep review", `mood ≤ ${E.moodWarning} of 5 / sleep < ${E.sleepWarning} h`],
    ["Severe chest or head symptom", "critical (escalates)"],
    ["SpO₂ review / critical", `< ${LIMITS.spo2Warning}% / < ${LIMITS.spo2Critical}%`],
    ["Resting HR review / critical", `≥ ${LIMITS.hrRestWarning} / ≥ ${LIMITS.hrRestCritical} bpm (not applied during exertion)`],
    ["Temperature (absolute)", `≥ ${LIMITS.tempWarning}°C / ≥ ${LIMITS.tempCritical}°C`],
    ["Skin temperature vs baseline", `+${LIMITS.tempDeltaWarning}°C / +${LIMITS.tempDeltaCritical}°C`],
    ["CO₂ elevated / critical", `≥ ${CO2_ELEVATED_PPM} / ≥ ${LIMITS.co2Critical} ppm`],
    ["Poor signal quality", "SQI < 0.5 caps optical alerts at “unverified warning”"]
  ];
  return <>
    <section className="panel view-panel"><h2>Demo safety limits (rules tier)</h2>
      <p className="sim-note">Illustrative demo values — not clinical reference ranges and not mission limits. Real limits must come from flight-medicine and spacecraft-environment authorities. These rules run before, and independently of, the probabilistic model.</p>
      <table className="data-table"><tbody>{rows.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody></table></section>
    <ResilienceCenter />
  </>;
}
