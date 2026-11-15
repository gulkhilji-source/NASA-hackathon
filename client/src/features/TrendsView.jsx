import React, { useMemo } from "react";
import { Award, ClipboardList, Database, Flame, ShieldCheck, TrendingDown } from "lucide-react";
import { LineChart } from "./charts.jsx";
import {
  analyzeTrends, computeBadges, computeStreak, hazardCoverage, seriesOf, summarizeEntry, byTime
} from "../../../server/src/vitals.js";
import "./wearable.css";
import "./checkin.css";

const CHARTS = [
  { key: "sleepHours", title: "Sleep (hours per night)" },
  { key: "mood", title: "Mood (1–5)", domain: [1, 5] },
  { key: "hr", title: "Resting heart rate (bpm)" },
  { key: "sys", title: "Systolic blood pressure (mmHg)" },
  { key: "exerciseMin", title: "Exercise countermeasure (min)" },
  { key: "glucose", title: "Blood glucose (mg/dL)" }
];

const md = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
function xLabels(points) {
  if (points.length < 2) return [];
  const idx = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (points.length - 1))))];
  return idx.map((i) => md(points[i].at));
}

export default function TrendsView({ entries, co2, onSeed, onClear }) {
  const trends = useMemo(() => analyzeTrends(entries), [entries]);
  const streak = useMemo(() => computeStreak(entries), [entries]);
  const badges = useMemo(() => computeBadges(entries), [entries]);
  const coverage = useMemo(() => hazardCoverage(entries, { co2 }), [entries, co2]);
  const recent = useMemo(() => byTime(entries).slice(-10).reverse(), [entries]);
  const flagged = trends.filter((t) => t.flagged);
  const demoCount = entries.filter((e) => e.source === "demo").length;

  return (
    <>
      <section className="panel view-panel">
        <h2>Mission trends · days and weeks</h2>
        <p className="sim-note">Your own history is the reference: recent values are compared with your personal baseline (median and robust spread), not with a population average. Needs at least 8 values per indicator.</p>
        <div className="btn-row">
          <button type="button" className="preset-chip" onClick={onSeed}><Database size={12} /> Load 14-day synthetic demo history</button>
          {entries.length > 0 && <button type="button" className="skip-button" onClick={onClear}>Delete all check-ins</button>}
        </div>
        {demoCount > 0 && <p className="ci-demo-note">Synthetic demo data is loaded ({demoCount} entries). It is scripted to show a developing strain pattern and is not real crew data.</p>}
      </section>

      <div className="ci-two">
        <section className="panel view-panel">
          <h2><Flame size={16} /> Consistency</h2>
          <div className="ci-streak">
            <div><b>{streak.current}</b><span>day streak</span></div>
            <div><b>{streak.longest}</b><span>longest</span></div>
            <div><b>{streak.totalDays}</b><span>days logged</span></div>
          </div>
          <p className="sim-note">{streak.todayDone ? "Today's check-in is done." : "No check-in yet today."} Badges reward <i>consistent logging</i>, never particular health values, so nobody is nudged to report numbers they did not measure.</p>
          <div className="ci-badges">
            {badges.map((b) => (
              <div key={b.id} className={`ci-badge ${b.earned ? "earned" : ""}`} title={b.desc}>
                <Award size={16} /><b>{b.label}</b><small>{b.earned ? "Earned" : b.desc}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel view-panel">
          <h2><ShieldCheck size={16} /> NASA's five hazards · what is being monitored</h2>
          <div className="ci-hazards">
            {coverage.map((c) => (
              <div key={c.id} className={`ci-hazard ${c.status}`}>
                <span className="dot" /><div><b>{c.label}</b><small>{c.detail}</small></div>
              </div>
            ))}
          </div>
          <p className="sim-note">Green = data present and within your baseline. Amber = worth a look. Grey = nothing logged yet. Not a medical status.</p>
        </section>
      </div>

      <section className="panel view-panel">
        <h2><TrendingDown size={16} /> Findings</h2>
        {flagged.length ? flagged.map((t) => (
          <div key={t.key} className="alert-banner warning" role="status">
            <TrendingDown size={16} />
            <div><b>REVIEW · {t.label}</b> — recent average {t.recent.toFixed(1)} {t.unit} vs your baseline {t.baseline.toFixed(1)} {t.unit} ({t.delta > 0 ? "+" : ""}{t.delta.toFixed(1)}, z = {t.z.toFixed(1)}). Guidance is on the Check-in tab.</div>
          </div>
        )) : <p className="sim-note">{trends.some((t) => t.ready) ? "No indicator has moved meaningfully away from your own baseline." : "Not enough history yet. Keep logging, or load the synthetic demo history."}</p>}
      </section>

      <div className="chart-grid">
        {CHARTS.map((c) => {
          const pts = seriesOf(entries, c.key);
          const t = trends.find((x) => x.key === c.key);
          return (
            <div className="panel telemetry-card" key={c.key}>
              <h3>{c.title}{t?.flagged ? " · ⚠ review" : ""}</h3>
              {pts.length >= 2
                ? <LineChart values={pts.map((p) => p.value)} baseline={t?.ready ? t.baseline : undefined} domain={c.domain} xLabels={xLabels(pts)} />
                : <p className="sim-note">Not enough data to chart yet.</p>}
            </div>
          );
        })}
      </div>

      <section className="panel view-panel">
        <h2><ClipboardList size={16} /> Recent check-ins</h2>
        {recent.length ? (
          <table className="data-table">
            <thead><tr><th>When</th><th>Source</th><th>Entry</th></tr></thead>
            <tbody>{recent.map((e) => <tr key={e.id}><td>{new Date(e.at).toLocaleString()}</td><td>{e.source === "demo" ? "synthetic demo" : "crew"}</td><td>{summarizeEntry(e)}</td></tr>)}</tbody>
          </table>
        ) : <p className="sim-note">No check-ins yet.</p>}
        <p className="sim-note">Stored in this browser only. Dose values are whatever the crew member enters from their dosimeter; the app does not estimate radiation exposure.</p>
      </section>
    </>
  );
}
