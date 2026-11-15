import React from "react";

const fmtTick = (v, range) => (range < 10 ? v.toFixed(1) : String(Math.round(v)));

/** Real SVG line chart scaled to the data. Optional baseline (dashed) and ±spread band. */
export function LineChart({ values, baseline, spread = 0, xLabels = [], domain, height = 190 }) {
  const finite = values.filter(Number.isFinite);
  let lo, hi;
  if (domain) [lo, hi] = domain;
  else {
    const refs = Number.isFinite(baseline) ? [baseline - spread * 3, baseline + spread * 3] : [];
    const lo0 = Math.min(...finite, ...refs), hi0 = Math.max(...finite, ...refs);
    const pad = (hi0 - lo0) * 0.08 + 1;
    lo = Math.floor(lo0 - pad); hi = Math.ceil(hi0 + pad);
  }
  const W = 520, top = 20, bottom = 146;
  const y = (v) => bottom - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1)) * (bottom - top);
  const x = (i) => (values.length < 2 ? 0 : (i / (values.length - 1)) * W);
  const path = values.map((v, i) => (Number.isFinite(v) ? `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}` : "")).join(" ");
  const ticks = [0, 1, 2, 3].map((k) => hi - ((hi - lo) * k) / 3);
  const last = values[values.length - 1];
  return (
    <div className="chart-wrap">
      <div className="chart-y">{ticks.map((t, i) => <span key={i}>{fmtTick(t, hi - lo)}</span>)}</div>
      <svg className="health-chart" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
        {[20, 62, 104, 146].map((gy) => <line key={gy} x1="0" x2={W} y1={gy} y2={gy} className="grid-line" />)}
        {spread > 0 && Number.isFinite(baseline) && <rect x="0" width={W} y={y(baseline + spread)} height={Math.max(1, y(baseline - spread) - y(baseline + spread))} className="baseline-band" />}
        {Number.isFinite(baseline) && <line x1="0" x2={W} y1={y(baseline)} y2={y(baseline)} className="baseline-line" />}
        <path d={path} className="chart-path" vectorEffect="non-scaling-stroke" />
        {Number.isFinite(last) && <circle cx={x(values.length - 1)} cy={y(last)} r="6" className="chart-point" />}
      </svg>
      <div className="chart-x">{xLabels.map((l, i) => <span key={`${l}-${i}`}>{l}</span>)}</div>
    </div>
  );
}

export function Sparkline({ values }) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return <div className="sparkline" />;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const d = v.map((val, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * 150).toFixed(1)} ${(26 - ((val - lo) / span) * 22).toFixed(1)}`).join(" ");
  return <div className="sparkline"><svg viewBox="0 0 150 28" preserveAspectRatio="none"><path d={d} /></svg></div>;
}
