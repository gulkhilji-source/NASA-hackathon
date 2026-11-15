import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, Brain, Check, CheckCircle2, CircleHelp, Clock3, Cloud,
  Download, Droplet, FileText, Gauge, Heart, Home, Menu, Moon, Radio, Radiation, Search,
  Settings, ShieldCheck, Signal, Sparkles, Sun, Thermometer, Users, Waves, WifiOff, Zap, Siren, Info,
  ClipboardList, TrendingUp, Flame, Bell
} from "lucide-react";
import { scenarios as baseScenarios, navItems } from "./data";
import {
  buildPriors, chooseNextCheck, createInvestigation, recordCheck, skipCheck, escalateInvestigation, resolveContext, evaluateRules, LABELS
} from "../../server/src/engine.js";
import { createLiveSession, liveScenario, LIVE_ID } from "./telemetry/live.js";
import { DEFAULT_CONTROLS } from "./telemetry/simulator.js";
import { seriesFor } from "./telemetry/series.js";
import { fetchSpaceWeather } from "./spaceWeather.js";
import { loadEntries, saveEntries } from "./checkins.js";
import {
  evaluateEntry, analyzeTrends, buildGuidance, dueReminders, computeStreak, engineEvidence, demoHistory, byTime
} from "../../server/src/vitals.js";
import { LineChart, Sparkline } from "./features/charts.jsx";
import SimulatorControls from "./features/SimulatorControls.jsx";
import { CrewHealthView, InvestigationsView, ReportsView, SettingsView } from "./features/Views.jsx";
import CheckInView from "./features/CheckInView.jsx";
import TrendsView from "./features/TrendsView.jsx";
import "./features/wearable.css";
import "./features/checkin.css";

const API = "/api";
const HISTORY_KEY = "astravitals.history.v1";
const iconFor = (name) => ({ Dashboard: Home, "Check-in": ClipboardList, Trends: TrendingUp, Investigations: Search, "Crew Health": Users, "Mission Reports": FileText, Settings }[name] || CircleHelp);
const DAY_MS = 864e5;
const percent = (value) => `${Math.round(value)}%`;
const initials = (name = "") => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "AV";

const checkNames = {
  sleepDebt: "Sleep Debt", spaceWeather: "Space Weather Impact", cabinCO2: "CO₂ Levels", dehydration: "Dehydration",
  psychologicalStrain: "Stress", exertion: "Recent Exertion", sensorError: "Sensor Error", other: "Other / Unexplained"
};
const checkIcons = {
  sleepDebt: Moon, spaceWeather: Sun, cabinCO2: Cloud, dehydration: Droplet, psychologicalStrain: Brain,
  exertion: Activity, sensorError: Settings, other: CircleHelp
};

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}

function NavIcon({ name }) {
  const Icon = iconFor(name);
  return <Icon size={18} />;
}

function App() {
  const [source, setSource] = useState("scenario"); // "scenario" | "live"
  const [scenarioId, setScenarioId] = useState("night-41");
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [session, setSession] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("Local engine ready · works offline");
  const [showCheck, setShowCheck] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [backend, setBackend] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const [controls, setControls] = useState({ ...DEFAULT_CONTROLS });
  const [paused, setPaused] = useState(false);
  const [feedStatus, setFeedStatus] = useState("");
  const [, setTick] = useState(0);
  const [entries, setEntries] = useState(loadEntries);   // crew check-ins (browser-local)
  const [clock, setClock] = useState(() => Date.now());  // refreshed each minute so reminders stay current

  const liveRef = useRef(null);
  if (!liveRef.current) liveRef.current = createLiveSession();
  const live = source === "live";

  // ---- environment status (honest, not hard-coded) ----
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const ping = () => fetch(`${API}/health`).then((r) => !cancelled && setBackend(r.ok)).catch(() => !cancelled && setBackend(false));
    ping();
    const id = setInterval(ping, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // ---- crew check-ins: persistence and a slow clock for reminder freshness ----
  useEffect(() => { saveEntries(entries); }, [entries]);
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 60000); return () => clearInterval(id); }, []);

  // ---- 1 Hz wearable stream ----
  useEffect(() => {
    if (!live || paused) return undefined;
    const id = setInterval(() => { liveRef.current.step(); setTick((t) => t + 1); }, 1000);
    return () => clearInterval(id);
  }, [live, paused]);

  const baseScenarioRaw = baseScenarios.find((s) => s.id === scenarioId) || baseScenarios[0];

  // Fresh crew check-in (< 24 h) becomes engine EVIDENCE (mood / reported symptoms answer checks at 0 crew minutes).
  const sortedEntries = useMemo(() => byTime(entries), [entries]);
  const latestEntry = sortedEntries[sortedEntries.length - 1] || null;
  const freshEntry = Boolean(latestEntry) && clock - Date.parse(latestEntry.at) <= DAY_MS;
  const evidence = useMemo(() => (freshEntry ? engineEvidence(latestEntry, clock) : {}), [latestEntry, freshEntry]);
  const baseScenario = useMemo(() => ({ ...baseScenarioRaw, ...evidence }), [baseScenarioRaw, evidence]);
  const liveScn = live ? { ...liveScenario(liveRef.current, baseScenario), ...evidence } : null; // recomputed every render/tick (cheap)
  const scenario = live ? liveScn : baseScenario;

  const context = useMemo(() => resolveContext(scenario), [scenario]);
  const flags = useMemo(() => evaluateRules(scenario), [scenario]);
  // Manual check-in values go through their own rules; a critical one escalates exactly like a device alarm.
  const entryFlags = useMemo(() => (latestEntry && freshEntry ? evaluateEntry(latestEntry) : []), [latestEntry, freshEntry]);
  const allFlags = useMemo(() => [...flags, ...entryFlags.filter((f) => f.severity !== "notice")], [flags, entryFlags]);
  const critical = allFlags.some((f) => f.severity === "critical");
  const idle = live && scenario.anomalous === false && !session;
  const priors = useMemo(() => buildPriors(context), [context]);
  const posterior = session?.posterior || priors;
  const ranked = Object.entries(posterior).sort((a, b) => b[1] - a[1]);
  const topCause = ranked[0];
  const secondCause = ranked[1];
  const nextCheck = session ? session.nextCheck : (critical || idle ? null : chooseNextCheck(priors, [], context));
  const checksDone = session?.checks?.length || 0;

  const latestFlags = useMemo(() => (latestEntry ? evaluateEntry(latestEntry) : []), [latestEntry]);
  const trends = useMemo(() => analyzeTrends(entries), [entries]);
  const guidance = useMemo(() => buildGuidance({ flags: latestFlags, trends }), [latestFlags, trends]);
  const reminders = useMemo(() => dueReminders(entries, clock), [entries, clock]);
  const streak = useMemo(() => computeStreak(entries, new Date(clock)), [entries, clock]);
  // Wearable values are only offered for the form when they are trustworthy (good contact, resting).
  // Both the 10 s average AND the newest packet must be trustworthy, so a strap that just came loose is caught at once.
  const latestSqi = live ? liveRef.current.state.last?.packet.sqi ?? 0 : 0;
  const wearable = live && scenario.sqi >= 0.6 && latestSqi >= 0.6 && scenario.activity < 0.3 ? { hr: scenario.heartRate, spo2: scenario.spo2 } : null;

  useEffect(() => { setSession(null); setSnapshot(null); setShowCheck(false); }, [scenarioId, source]);

  // A critical rule that fires mid-investigation halts routine checks immediately.
  useEffect(() => {
    if (!critical || !session || session.status === "escalate") return;
    const escalated = escalateInvestigation(session, allFlags);
    setSession(escalated);
    setNotice("Critical safety rule triggered · routine investigation stopped");
  }, [critical, session, allFlags]);

  const saveHistory = useCallback((inv, snap) => {
    if (!inv || !snap) return;
    const top = Object.entries(inv.posterior).sort((a, b) => b[1] - a[1])[0];
    const entry = { id: inv.id, createdAt: inv.createdAt, scenarioName: snap.name, status: inv.status, checks: inv.checks.length, top: `${LABELS[top[0]]} ${percent(top[1] * 100)}` };
    setHistory((old) => {
      const next = [entry, ...old.filter((h) => h.id !== entry.id)].slice(0, 50);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);

  function startInvestigation() {
    setLoading(true);
    try {
      const snap = { ...scenario };
      const inv = createInvestigation(snap);
      setSnapshot(snap); setSession(inv); setShowCheck(true); saveHistory(inv, snap);
      setNotice(inv.status === "escalate" ? "Critical safety rule triggered · routine investigation stopped" : "Investigation started · local reasoning engine online");
    } catch (error) { setNotice(error.message); } finally { setLoading(false); }
  }

  function submitCheck(result) {
    if (!session || !nextCheck) return;
    try {
      const updated = recordCheck(session, nextCheck.id, result, resolveContext(snapshot), snapshot);
      setSession(updated); saveHistory(updated, snapshot);
      setNotice(`Evidence recorded · ${result.toLowerCase()}`);
    } catch (error) { setNotice(error.message); }
  }

  function skipCurrent() {
    if (!session || !nextCheck) return;
    try {
      const updated = skipCheck(session, nextCheck.id, resolveContext(snapshot));
      setSession(updated); saveHistory(updated, snapshot);
      setNotice("Check skipped · re-ranked remaining checks");
    } catch (error) { setNotice(error.message); }
  }

  function applyControls(next) {
    setControls(next);
    liveRef.current.sim.setControls(next);
  }

  async function useFeed() {
    setFeedStatus("Contacting NASA DONKI…");
    const result = await fetchSpaceWeather();
    applyControls({ ...controls, spaceWeatherHoursAgo: result.hoursAgo });
    setFeedStatus(`${result.detail} · ${result.source}`);
  }

  function exportReport() {
    const report = { project: "AstraVitals", generatedAt: new Date().toISOString(), scenario, safetyRules: allFlags, latestCheckIn: latestEntry, investigation: session, safety: "Simulated hackathon prototype; not a medical diagnosis." };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `astravitals-report-${scenario.id}.json`; link.click();
    URL.revokeObjectURL(url);
  }

  function saveCheckIn(entry) {
    const full = { ...entry, id: `ci-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), source: "crew" };
    setEntries((old) => [...old, full].slice(-400));
    setClock(Date.now());
    setNotice("Check-in saved · stored on this device");
  }
  function loadDemo() {
    if (entries.some((e) => e.source !== "demo") && !window.confirm("Replace your saved check-ins with 14 days of synthetic demo data?")) return;
    setEntries(demoHistory(Date.now())); setClock(Date.now());
    setNotice("Loaded 14 days of SYNTHETIC demo check-ins");
  }
  function clearEntries() {
    if (!window.confirm("Delete all check-ins stored on this device?")) return;
    setEntries([]); setNotice("Check-ins deleted");
  }

  function changeNav(item) { setActiveNav(item); setMobileNav(false); }

  // ---- display data ----
  const contextCards = [
    { label: "Space Weather", value: context.spaceWeatherRecent ? "Active" : "Quiet", sub: context.spaceWeatherRecent ? `(${(scenario.weather.split("·")[1] || "recent").trim()})` : "No recent event", icon: Sun, tone: "amber" },
    { label: "CO₂ Level", value: `${scenario.co2} ppm`, sub: context.elevatedCO2 ? "Above threshold" : "Within demo range", icon: Cloud, tone: context.elevatedCO2 ? "red" : "blue" },
    { label: "Radiation Dose", value: "Low", sub: `(${scenario.radiation} mSv · static demo value)`, icon: Radiation, tone: "amber" },
    { label: "Sleep Trend", value: `${scenario.sleepHours}h`, sub: "(last night)", icon: Moon, tone: scenario.sleepHours < 6 ? "amber" : "green" }
  ];
  const flagFor = (id) => flags.find((f) => f.id === id && f.severity !== "notice");
  const flagStatus = (id, okText) => { const f = flagFor(id); return f ? (f.severity === "critical" ? "Critical" : "Review") : okText; };
  const hrPct = Math.round((scenario.heartRate / scenario.heartRateBaseline - 1) * 100);

  const packets = live ? liveRef.current.state.packets : null;
  const spo2Base = 97;
  const hrSeries = packets ? packets.map((p) => p.hr) : seriesFor("hr", scenario.heartRate, scenario.heartRateBaseline, { noise: 1.6 });
  const spo2Series = packets ? packets.map((p) => p.spo2) : seriesFor("spo2", scenario.spo2, spo2Base, { noise: 0.35 });
  const tempSeries = packets ? packets.map((p) => p.skinTemp) : seriesFor("temp", scenario.temperature, scenario.temperature - 0.1, { noise: 0.05 });
  const sleepSeries = scenario.sleepHistory || seriesFor("sleep", scenario.sleepHours, 7.4, { points: 14, noise: 0.4 });
  const chartBase = scenario.heartRateBaseline;
  const chartSpread = live ? scenario.baselineSpread : 0;

  const alertIcon = { critical: Siren, warning: AlertTriangle, notice: Info };

 return (
  <>
    <style>{`
      /* HEALTH OVERVIEW ANIMATION */
      .overview-chart-motion {
        position: relative;
        overflow: hidden;
        border-radius: 12px;
      }

      .overview-chart-motion::after {
        content: "";
        position: absolute;
        inset: 0;
        width: 35%;
        pointer-events: none;
        background: linear-gradient(
          90deg,
          transparent,
          rgba(255,255,255,0.07),
          rgba(80,220,255,0.12),
          transparent
        );
        transform: translateX(-120%);
        animation: av-chart-scan 5s ease-in-out infinite;
      }

      .overview-chart-motion svg path {
        animation: av-chart-glow 3s ease-in-out infinite;
      }

      @keyframes av-chart-scan {
        0% { transform: translateX(-120%); }
        70%, 100% { transform: translateX(350%); }
      }

      @keyframes av-chart-glow {
        0%, 100% { filter: drop-shadow(0 0 1px rgba(255,90,150,0.15)); }
        50% { filter: drop-shadow(0 0 5px rgba(255,90,150,0.65)); }
      }

      /* HEART RATE CARD ANIMATION */
      .heart-rate-animated {
        position: relative;
        overflow: hidden;
        animation: av-heart-card-glow 2.5s ease-in-out infinite;
      }

      .heart-icon-pulse {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .heart-icon-pulse svg {
        color: #ff5b91;
        transform-origin: center;
        animation: av-heartbeat 1.15s ease-in-out infinite;
      }

      .heart-icon-pulse::before,
      .heart-icon-pulse::after {
        content: "";
        position: absolute;
        inset: -5px;
        border: 1px solid rgba(255,91,145,0.65);
        border-radius: 50%;
        animation: av-heart-ripple 2s ease-out infinite;
        pointer-events: none;
      }

      .heart-icon-pulse::after {
        animation-delay: 1s;
      }

      .heart-sparkline-motion svg path {
        stroke-dasharray: 500;
        stroke-dashoffset: 500;
        animation: av-heart-line 2.5s linear infinite;
      }

      @keyframes av-heartbeat {
        0%, 35%, 65%, 100% { transform: scale(1); }
        15% { transform: scale(1.22); }
        45% { transform: scale(1.12); }
      }

      @keyframes av-heart-ripple {
        0% { transform: scale(0.7); opacity: 0.8; }
        100% { transform: scale(1.9); opacity: 0; }
      }

      @keyframes av-heart-line {
        0% { stroke-dashoffset: 500; }
        100% { stroke-dashoffset: 0; }
      }

      @keyframes av-heart-card-glow {
        0%, 100% { box-shadow: 0 0 0 rgba(255,91,145,0); }
        50% { box-shadow: 0 0 18px rgba(255,91,145,0.12); }
      }

      @media (prefers-reduced-motion: reduce) {
        .overview-chart-motion *,
        .overview-chart-motion::after,
        .heart-rate-animated,
        .heart-rate-animated * {
          animation: none !important;
        }
      }
    `}</style>

    
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <div className="astravitals-mark"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="astravitals-word">ASTRAVITALS</span></div>
          <p>Hear the Signal.<br />Know What to Check.</p>
        </div>
        <nav className="side-nav">
          {navItems.map((item) => (
            <button key={item} className={`nav-link ${activeNav === item ? "active" : ""}`} onClick={() => changeNav(item)}>
              <NavIcon name={item} /><span>{item}</span>{item === "Check-in" && reminders.length > 0 && <span className="nav-badge" title="Reminders due">{reminders.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <div className="status-line"><span className="pulse-dot" /> Offline-ready</div>
          <small><Signal size={12} /> Engine runs locally</small>
          <small>{online ? <Signal size={12} /> : <WifiOff size={12} />} Network: {online ? "online" : "offline"}</small>
          <small><Radio size={12} /> Ground sync: {backend ? "connected" : "not connected"}</small>
        </div>
        <div className="nasa-lockup"><div className="nasa-roundel">NASA</div><span>NASA Space Apps<br />Challenge 2026</span></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMobileNav(!mobileNav)}><Menu /></button>
          <div className="page-heading">
            <h1>PROJECT <span>ASTRAVITALS</span></h1>
            <p>Astronaut Health Intelligence System</p>
          </div>
          <div className="top-actions">
            <span className="top-pill online"><CheckCircle2 size={15} /> Local engine</span>
            <span className="top-pill"><Zap size={15} /> Mission: {scenario.mission}</span>
            <span className="top-pill"><Clock3 size={15} /> {live ? "LIVE" : `Sol: ${scenario.sol}`}</span>
            <span className="top-pill" title="Consecutive days with a health check-in"><Flame size={15} /> Streak: {streak.current}d</span>
            <button className="avatar" title="Crew profile">{initials(scenario.astronaut)}</button>
          </div>
        </header>

        <section className="scenario-strip">
          <div className="scenario-label"><Radio size={15} /> ACTIVE SIMULATION</div>
          <div className="seg-toggle" role="group" aria-label="Data source">
            <button className={source === "scenario" ? "active" : ""} onClick={() => setSource("scenario")}>Scenario</button>
            <button className={source === "live" ? "active" : ""} onClick={() => setSource("live")}>Live wearable (simulated)</button>
          </div>
          {!live && (
            <select aria-label="Scenario" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
              {baseScenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          )}
          {live ? <span className="live-tag">● LIVE · 1 Hz{paused ? " · PAUSED" : ""}</span> : null}
          <span className="demo-tag">SIMULATED CREW DATA</span>
          <span className="notice"><span className="pulse-dot" /> {notice}</span>
        </section>

        {allFlags.length > 0 && (
          <section className="alert-stack" aria-label="Safety rules">
            {allFlags.map((f) => {
              const Icon = alertIcon[f.severity];
              return (
                <div key={f.id + f.severity} className={`alert-banner ${f.severity}`} role={f.severity === "critical" ? "alert" : "status"}>
                  <Icon size={16} />
                  <div><b>{f.severity === "critical" ? "CRITICAL · " : f.severity === "warning" ? "REVIEW · " : "DATA QUALITY · "}{f.source === "checkin" ? "Check-in: " : ""}{f.label}</b>
                    {f.severity !== "notice" && <> — value {String(f.value)} (limit {String(f.limit)}, demo threshold).</>}
                    {f.severity === "critical" && <> Stop routine investigation. Follow the mission-approved emergency medical procedure and contact the designated medical authority.</>}</div>
                </div>
              );
            })}
          </section>
        )}

        {activeNav === "Dashboard" && (
          <>
            {reminders.length > 0 && (
              <section className="ci-reminders" aria-label="Reminders">
                {reminders.map((r) => (
                  <div key={r.id} className="ci-reminder"><Bell size={14} /><b>{r.label}</b><span>{r.detail}</span>
                    <button className="text-action" onClick={() => changeNav("Check-in")}>Open check-in <ArrowRight size={13} /></button></div>
                ))}
              </section>
            )}
            {live && <SimulatorControls controls={controls} onChange={applyControls} paused={paused} onTogglePause={() => setPaused((p) => !p)} onFetchFeed={useFeed} feedStatus={feedStatus} />}

            <section className="metrics-grid">
              <div className="panel crew-card">
                <div className="astronaut-art"><div className="helmet"><div className="helmet-glass"><span /></div><div className="suit" /></div></div>
                <div className="crew-info"><span className="eyebrow">ASTRONAUT</span><h2>{scenario.astronaut}</h2><p>{scenario.role}</p><span className="health-chip"><Activity size={14} /> Monitoring</span></div>
              </div>
              <Metric icon={Heart} label="Heart Rate" value={`${scenario.heartRate} bpm`} status={`${hrPct >= 0 ? "↑" : "↓"} ${Math.abs(hrPct)}%${live && scenario.activity >= 0.5 ? " · exertion" : ""}${flagFor("heartRate") ? " · " + flagStatus("heartRate", "") : ""}`} tone="pink" values={hrSeries} />
              <Metric icon={Droplet} label="SpO₂" value={`${scenario.spo2}%`} status={flagStatus("spo2", "Normal")} tone="cyan" values={spo2Series} />
              <Metric icon={Thermometer} label={live ? "Skin Temp" : "Temperature"} value={`${scenario.temperature}°C`} status={flagStatus("temperature", "Normal")} tone="teal" values={tempSeries} />
              <Metric icon={Moon} label="Sleep (last night)" value={`${scenario.sleepHours}h`} status={scenario.sleepHours < 6 ? "Low" : "In range"} tone="violet" values={sleepSeries} />
            </section>

            <section className="dashboard-grid">
              <div className="panel overview-panel">
                <PanelTitle icon={Activity} title="Health Overview" meta={live ? "Live · last 2 min" : "Illustrative 24h trace"} />
                <div className="chart-legend"><span><i className="legend-pink" /> HR</span><span><i className="legend-dash" /> Personal baseline{live ? " ± spread" : ""}</span></div>
<div className="overview-chart-motion">
  <LineChart
    values={hrSeries}
    baseline={chartBase}
    spread={chartSpread}
    xLabels={live ? ["-2 min", "-1.5", "-1", "-0.5", "now"] : ["00:00", "06:00", "12:00", "18:00", "24:00"]}
  />
</div>
              </div>

              <div className="panel next-panel">
                <div className="next-title"><div><Sparkles size={21} /><h2>Next Best Check</h2></div><span>STEP {Math.min(checksDone + 1, 5)} OF 5</span></div>
                <div className="check-recommendation">
                  <div className="test-icon"><FlaskIcon /></div>
                  <div>
                    <h3>{nextCheck?.label || (critical || session?.status === "escalate" ? "Escalate — follow emergency procedure" : session?.complete ? "Investigation complete" : idle ? "No deviation to investigate" : "Start an investigation")}</h3>
                    <p>{nextCheck?.reason || (idle ? "Everything is within the personal baseline. Inject a fault in the simulator to see the engine react." : "ASTRAVITALS will select the most informative next check using mission context and the current evidence.")}</p>
                  </div>
                </div>
                {!session ? (
                  <button className="primary-button" onClick={startInvestigation} disabled={loading || idle}>{critical ? "Run safety review" : "Start Investigation"} <ArrowRight size={17} /></button>
                ) : session.complete ? (
                  <div className="complete-note">{session.status === "escalate" ? <><Siren size={17} /> Escalated by safety rule</> : <><CheckCircle2 size={17} /> Investigation reached its stopping rule</>}</div>
                ) : showCheck ? (
                  <div className="check-actions">
                    <span className="check-prompt">What was the result?</span>
                    <button className="result-button normal" onClick={() => submitCheck("normal")}><Check size={15} /> Normal</button>
                    <button className="result-button abnormal" onClick={() => submitCheck("abnormal")}><AlertTriangle size={15} /> Abnormal</button>
                    {!nextCheck?.mandatory && <button className="skip-button" onClick={skipCurrent}>Skip (unavailable)</button>}
                  </div>
                ) : <button className="primary-button" onClick={() => setShowCheck(true)}>Continue Check <ArrowRight size={17} /></button>}
                {session?.checks.some((c) => c.source === "sensor") && <div className="engine-caption"><Radio size={13} /> {session.checks.filter((c) => c.source === "sensor").length} check(s) answered by sensor · 0 crew minutes</div>}
                <div className="engine-caption"><ShieldCheck size={13} /> Explainable reasoning · No black-box diagnosis</div>
              </div>

              <div className="panel causes-panel">
                <PanelTitle icon={Gauge} title="Possible Causes" meta="LIVE MODEL" />
                <div className="cause-list">
                  {ranked.map(([key, value]) => {
                    const Icon = checkIcons[key] || CircleHelp;
                    return <div className="cause-row" key={key}><Icon className={`cause-icon ${key}`} size={17} /><span>{checkNames[key] || key}</span><div className="bar-track"><div className={`bar-fill ${key}`} style={{ width: `${Math.max(2, value * 100)}%` }} /></div><b>{percent(value * 100)}</b></div>;
                  })}
                </div>
                <div className="cause-foot">Relative likelihood among candidate explanations · illustrative, not medical probabilities</div>
              </div>

              <div className="panel reasoning-panel">
                <PanelTitle icon={Brain} title="Reasoning Trail" action="Mission report" onAction={() => changeNav("Mission Reports")} />
                <div className="timeline">
                  {(session?.reasoning || [...scenario.observations.map((label) => ({ label, done: true })), ...(nextCheck ? [{ label: `Recommended first check: ${nextCheck.label}`, done: false }] : [])]).map((item, index) => (
                    <div className="timeline-item" key={`${item.label}-${index}`}><span className={`timeline-dot ${item.done === false ? "pending" : ""}`}>{item.done === false ? <Clock3 size={12} /> : <Check size={12} />}</span><p>{item.label}</p></div>
                  ))}
                </div>
              </div>

              <div className="panel context-panel">
                <PanelTitle icon={Zap} title="Mission Context" meta={live ? "LIVE CONTEXT" : "SCENARIO CONTEXT"} />
                <div className="context-grid">
                  {contextCards.map((item) => <div className="context-tile" key={item.label}><item.icon className={item.tone} size={22} /><span>{item.label}</span><b>{item.value}</b><small>{item.sub}</small></div>)}
                </div>
              </div>

              <div className="panel conclusion-panel">
                <div className="conclusion-head"><CheckCircle2 size={19} /><h2>Current Assessment</h2></div>
                <div className="probable-chip">{session?.status === "escalate" ? "ESCALATE · critical safety rule" : session ? `${checkNames[topCause[0]]} · ${percent(topCause[1] * 100)}` : "Awaiting investigation"}</div>
                <p className="assessment-copy">{session ? (session.status === "escalate" ? "A critical safety rule fired before any probabilistic reasoning. Follow mission emergency procedure." : session.complete ? "The stopping rule has been reached. Review the evidence and follow mission medical protocol." : "Evidence is being gathered. This is a working hypothesis, not a diagnosis.") : "Start an investigation to see how ASTRAVITALS updates its working hypotheses."}</p>
                <div className="action-line"><span>Recommended focus</span><b>{session ? (nextCheck?.label || "Review evidence and escalate as needed") : "Begin with the highest-value check"}</b></div>
                {session && secondCause && <div className="uncertainty"><CircleHelp size={14} /> Runner-up: {checkNames[secondCause[0]]} ({percent(secondCause[1] * 100)})</div>}
                <button className="report-button" onClick={exportReport}><Download size={14} /> Export Mission Report</button>
              </div>

              <div className="panel ci-dash-panel">
                <PanelTitle icon={ClipboardList} title="Crew Guidance" action="Open check-in" onAction={() => changeNav("Check-in")} />
                {latestEntry ? (
                  <div className="ci-dash-list">
                    {guidance.slice(0, 3).map((g) => <div key={g.id} className={`ci-dash-item ${g.tone}`}><b>{g.title}</b>{g.steps[0]}</div>)}
                  </div>
                ) : <p className="sim-note">No check-in yet. Log blood pressure, glucose, sleep, mood and symptoms in the Check-in tab to get guidance and multi-day trends.</p>}
                <div className="cause-foot">Decision support only · not a diagnosis · illustrative limits</div>
              </div>
            </section>
          </>
        )}

        {activeNav === "Check-in" && <CheckInView latest={latestEntry} latestFlags={latestFlags} guidance={guidance} reminders={reminders} wearable={wearable} onSave={saveCheckIn} />}
        {activeNav === "Trends" && <TrendsView entries={entries} co2={scenario.co2} onSeed={loadDemo} onClear={clearEntries} />}
        {activeNav === "Crew Health" && <CrewHealthView live={live} session={liveRef.current} onGoLive={() => { setSource("live"); }} />}
        {activeNav === "Investigations" && <InvestigationsView history={history} onClear={() => { setHistory([]); try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ } }} />}
        {activeNav === "Mission Reports" && <ReportsView scenario={scenario} session={session} flags={allFlags} entry={latestEntry} trends={trends} />}
        {activeNav === "Settings" && <SettingsView />}

        <footer className="footer"><span><span className="footer-star">✦</span> AstraVitals <i /> Next Best Check Engine</span><div className="ecg-line"><Waves size={18} /></div><em>Because in space, every next check counts.</em></footer>
        <div className="safety-note">
          <AlertTriangle size={12} />
          Prototype only · Simulated data · Not for clinical use · Follow approved mission medical protocols
        </div>
      </main>
    </div>
  </>
  );
} 

function Metric({ icon: Icon, label, value, status, tone, values }) {
  const isHeart = tone === "pink";

  return (
    <div className={`panel metric-card ${tone} ${isHeart ? "heart-rate-animated" : ""}`}>
      <div className="metric-top">
        <span className={isHeart ? "heart-icon-pulse" : ""}>
          <Icon size={24} />
        </span>
        <span>{label}</span>
      </div>

      <strong>{value}</strong>
      <small>{status}</small>

      <div className={isHeart ? "heart-sparkline-motion" : ""}>
        <Sparkline values={values} />
      </div>
    </div>
  );
}

function PanelTitle({ icon: Icon, title, meta, action, onAction }) {
  return <div className="panel-title"><div><Icon size={19} /><h2>{title}</h2></div>{action ? <button className="text-action" onClick={onAction}>{action} <ArrowRight size={13} /></button> : <span>{meta}</span>}</div>;
}

function FlaskIcon() {
  return <div className="flask-drawing"><div className="flask-neck" /><div className="flask-body"><span /></div></div>;
}

export default App;
