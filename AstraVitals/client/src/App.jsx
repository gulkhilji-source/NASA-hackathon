import React, { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, Bell, Brain, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, Cloud, Download, Droplet, FileText,
  Gauge, Heart, Home, Menu, Moon, Radio, Radiation, RefreshCw, Search,
  Settings, ShieldCheck, Signal, Sparkles, Sun, Thermometer, Users,
  Waves, WifiOff, X, Zap, Watch, ClipboardList, BellRing, Save,
  TrendingUp, RadioTower
} from "lucide-react";
import { fallbackScenarios, navItems } from "./data";

const API = "/api";
const PENDING_TELEMETRY_KEY = "astravitals.pendingTelemetry";
const readLocal = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch { return fallback; }
};
const iconFor = (name) => ({
  Home, Search, Users, FileText, Settings
}[name] || CircleHelp);

function percent(value) {
  return `${Math.round(value)}%`;
}

function App() {
  const [scenarios, setScenarios] = useState(() => readLocal("astravitals.scenarios", fallbackScenarios));
  const [scenarioId, setScenarioId] = useState(() => readLocal("astravitals.scenarioId", "night-41"));
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [session, setSession] = useState(() => readLocal("astravitals.session", null));
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("Local systems operational");
  const [showCheck, setShowCheck] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const scenario = scenarios.find((item) => item.id === scenarioId) || scenarios[0];
  const [healthRecords, setHealthRecords] = useState(() => readLocal(`astravitals.healthRecords.${scenarioId}`, []));
  const [healthAlerts, setHealthAlerts] = useState(() => readLocal(`astravitals.healthAlerts.${scenarioId}`, []));
  const [insights, setInsights] = useState(null);
  const [symptomReports, setSymptomReports] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [trendMetric, setTrendMetric] = useState("heartRate");
  const [trendData, setTrendData] = useState(null);
  const [radiationData, setRadiationData] = useState(null);
  const [baselineValues, setBaselineValues] = useState({ heartRate: "", spo2: "", systolic: "", diastolic: "", glucose: "", temperature: "", sleepHours: "" });
  const [healthForm, setHealthForm] = useState({ heartRate: "", spo2: "", systolic: "", diastolic: "", glucose: "", temperature: "", sleepHours: "", co2: "", radiation: "" });
  const [wellbeingForm, setWellbeingForm] = useState({ mood: "3", stress: "3", notes: "" });
  const [symptomForm, setSymptomForm] = useState({ bodyRegion: "head", severity: "2", symptoms: "", notes: "" });
  const [reminderForm, setReminderForm] = useState({ title: "", dueAt: "", category: "health" });

  const latestHealth = healthRecords[0]?.values || {};
  const latestHealthAlerts = healthRecords[0]?.alerts || [];
  const heartRate = latestHealth.heartRate ?? scenario.heartRate;
  const spo2 = latestHealth.spo2 ?? scenario.spo2;
  const temperature = latestHealth.temperature ?? scenario.temperature;
  const sleepHours = latestHealth.sleepHours ?? scenario.sleepHours;
  const posterior = session?.posterior || model?.priors || {};
  const ranked = Object.entries(posterior).sort((a, b) => b[1] - a[1]);
  const topCause = ranked[0] || ["sleepDebt", 0.28];
  const secondCause = ranked[1] || ["spaceWeather", 0.28];
  const nextCheck = session?.nextCheck || model?.nextCheck;
  const checksDone = session?.checks?.length || 0;
  const maxChecks = 5;
  const checkNames = {
    sleepDebt: "Sleep Debt",
    spaceWeather: "Space Weather Impact",
    cabinCO2: "CO₂ Levels",
    dehydration: "Dehydration",
    psychologicalStrain: "Stress",
    sensorError: "Sensor Error",
    other: "Other / Unexplained"
  };
  const checkIcons = {
    sleepDebt: Moon, spaceWeather: Sun, cabinCO2: Cloud,
    dehydration: Droplet, psychologicalStrain: Brain,
    sensorError: Settings, other: CircleHelp
  };

  useEffect(() => {
    fetch(`${API}/scenarios`).then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        if (data.scenarios?.length) {
          setScenarios(data.scenarios);
          try { localStorage.setItem("astravitals.scenarios", JSON.stringify(data.scenarios)); } catch {}
        }
      })
      .catch(() => setNotice("Offline demo mode · using saved mission data"));
    fetch(`${API}/model`).then((r) => r.ok ? r.json() : Promise.reject())
      .then(setModel).catch(() => {});
  }, []);

  async function refreshHealthData() {
    try {
      const [measurementsResponse, alertsResponse] = await Promise.all([
        fetch(`${API}/measurements?crewId=${encodeURIComponent(scenarioId)}&limit=100`),
        fetch(`${API}/alerts?crewId=${encodeURIComponent(scenarioId)}`)
      ]);
      if (!measurementsResponse.ok || !alertsResponse.ok) throw new Error("Health API unavailable");
      const [measurementsData, alertsData] = await Promise.all([
        measurementsResponse.json(), alertsResponse.json()
      ]);
      const records = measurementsData.records || [];
      const alerts = alertsData.alerts || [];
      setHealthRecords(records);
      setHealthAlerts(alerts);
      try {
        localStorage.setItem(`astravitals.healthRecords.${scenarioId}`, JSON.stringify(records));
        localStorage.setItem(`astravitals.healthAlerts.${scenarioId}`, JSON.stringify(alerts));
      } catch {}
      return true;
    } catch {
      setHealthRecords(readLocal(`astravitals.healthRecords.${scenarioId}`, []));
      setHealthAlerts(readLocal(`astravitals.healthAlerts.${scenarioId}`, []));
      return false;
    }
  }

  async function refreshMissionTools() {
    try {
      const [insightResponse, symptomResponse, reminderResponse, trendResponse, radiationResponse, baselineResponse] = await Promise.all([
        fetch(`${API}/crew/${encodeURIComponent(scenarioId)}/insights`),
        fetch(`${API}/symptoms?crewId=${encodeURIComponent(scenarioId)}&limit=20`),
        fetch(`${API}/reminders?crewId=${encodeURIComponent(scenarioId)}`),
        fetch(`${API}/crew/${encodeURIComponent(scenarioId)}/trends?metric=${encodeURIComponent(trendMetric)}&limit=30`),
        fetch(`${API}/crew/${encodeURIComponent(scenarioId)}/radiation`),
        fetch(`${API}/crew/${encodeURIComponent(scenarioId)}/baseline`)
      ]);
      if (insightResponse.ok) setInsights(await insightResponse.json());
      if (symptomResponse.ok) setSymptomReports((await symptomResponse.json()).reports || []);
      if (reminderResponse.ok) setReminders((await reminderResponse.json()).reminders || []);
      if (trendResponse.ok) setTrendData((await trendResponse.json()).trend || null);
      if (radiationResponse.ok) setRadiationData(await radiationResponse.json());
      if (baselineResponse.ok) {
        const baseline = (await baselineResponse.json()).baseline?.values || {};
        setBaselineValues((old) => Object.fromEntries(Object.keys(old).map((key) => [key, baseline[key] ?? ""])));
      }
    } catch { setNotice("Mission tools unavailable · saved dashboard data remains available"); }
  }

  async function syncPendingTelemetry() {
    const pending = readLocal(PENDING_TELEMETRY_KEY, []);
    if (!pending.length) return;
    const remaining = [];
    for (const payload of pending) {
      try {
        const response = await fetch(`${API}/measurements`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("Telemetry sync failed");
      } catch { remaining.push(payload); }
    }
    try { localStorage.setItem(PENDING_TELEMETRY_KEY, JSON.stringify(remaining)); } catch {}
    if (remaining.length < pending.length) {
      await refreshHealthData();
      setNotice(remaining.length ? "Some health records remain queued for sync" : "Offline health records synced successfully");
    }
  }

  useEffect(() => {
    refreshHealthData();
    const handleOnline = () => syncPendingTelemetry();
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleOnline);
    };
  }, []);

  // Each selected mission scenario contributes one clearly-labelled simulated telemetry sample.
  // It is queued locally if the API is unavailable and synced when connectivity returns.
  useEffect(() => {
    setHealthRecords(readLocal(`astravitals.healthRecords.${scenarioId}`, []));
    setHealthAlerts(readLocal(`astravitals.healthAlerts.${scenarioId}`, []));
    refreshHealthData();
    refreshMissionTools();
    const lastScenario = readLocal("astravitals.lastTelemetryScenario", null);
    if (lastScenario === scenarioId) return;
    const payload = {
      crewId: scenarioId,
      source: "simulated",
      heartRate: scenario.heartRate,
      spo2: scenario.spo2,
      temperature: scenario.temperature,
      sleepHours: scenario.sleepHours,
      co2: scenario.co2,
      radiation: scenario.radiation
    };
    try { localStorage.setItem("astravitals.lastTelemetryScenario", JSON.stringify(scenarioId)); } catch {}
    fetch(`${API}/measurements`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(async (response) => {
      if (!response.ok) throw new Error("Telemetry endpoint unavailable");
      await response.json();
      await syncPendingTelemetry();
      await refreshHealthData();
      setNotice("Simulated crew telemetry recorded · health history updated");
    }).catch(() => {
      const pending = readLocal(PENDING_TELEMETRY_KEY, []);
      try { localStorage.setItem(PENDING_TELEMETRY_KEY, JSON.stringify([...pending, payload])); } catch {}
      setNotice("Health telemetry queued offline · will sync when connected");
    });
  }, [scenarioId]);

  useEffect(() => { refreshMissionTools(); }, [trendMetric]);

  useEffect(() => {
    const notifyDueReminders = () => {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const notified = readLocal("astravitals.notifiedReminders", []);
      const nextNotified = [...notified];
      reminders.filter((item) => !item.completed && Date.parse(item.dueAt) <= Date.now() && !notified.includes(item.id)).forEach((item) => {
        new Notification("AstraVitals mission reminder", { body: item.title, tag: item.id });
        nextNotified.push(item.id);
      });
      if (nextNotified.length !== notified.length) {
        try { localStorage.setItem("astravitals.notifiedReminders", JSON.stringify(nextNotified.slice(-500))); } catch {}
      }
    };
    notifyDueReminders();
    const timer = window.setInterval(notifyDueReminders, 60000);
    return () => window.clearInterval(timer);
  }, [reminders]);

  useEffect(() => {
    try {
      localStorage.setItem("astravitals.scenarioId", JSON.stringify(scenarioId));
      localStorage.setItem("astravitals.session", JSON.stringify(session));
    } catch {}
  }, [scenarioId, session]);

  useEffect(() => {
    if (session?.scenarioId && session.scenarioId !== scenarioId) {
      setSession(null);
      setShowCheck(false);
    }
  }, [scenarioId]);

  const contextCards = useMemo(() => [
    { label: "Space Weather", value: scenario.context.spaceWeatherRecent ? "Active" : "Quiet", sub: scenario.context.spaceWeatherRecent ? "(22h ago)" : "No recent event", icon: Sun, tone: "amber" },
    { label: "CO₂ Level", value: `${latestHealth.co2 ?? scenario.co2} ppm`, sub: (latestHealth.co2 ?? scenario.co2) > 1000 ? "Above prototype threshold" : "Within demo range", icon: Cloud, tone: (latestHealth.co2 ?? scenario.co2) > 1000 ? "red" : "blue" },
    { label: "Radiation Dose", value: `${latestHealth.radiation ?? scenario.radiation} mSv`, sub: "Recorded mission dose", icon: Radiation, tone: "amber" },
    { label: "Sleep Trend", value: `${sleepHours}h`, sub: "(24h)", icon: Moon, tone: sleepHours < 6 ? "amber" : "green" }
  ], [scenario, latestHealth, sleepHours]);

  async function startInvestigation() {
    setLoading(true);
    try {
      const response = await fetch(`${API}/investigations/start`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId })
      });
      if (!response.ok) throw new Error("API unavailable");
      const data = await response.json();
      setSession(data.investigation);
      setShowCheck(true);
      setNotice("Investigation started · reasoning engine online");
    } catch {
      setNotice("Backend unavailable · showing read-only demo");
      setShowCheck(true);
    } finally { setLoading(false); }
  }

  async function submitCheck(result) {
    if (!session?.id || !nextCheck) {
      setNotice("Connect the backend to run an investigation.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API}/investigations/${session.id}/check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkId: nextCheck.id, result })
      });
      if (!response.ok) throw new Error("Could not submit check");
      const data = await response.json();
      setSession(data.investigation);
      setNotice(`Evidence recorded · ${result.toLowerCase()}`);
    } catch (error) { setNotice(error.message); }
    finally { setLoading(false); }
  }

  async function saveBaseline(event) {
    event.preventDefault();
    const values = Object.fromEntries(Object.entries(baselineValues).filter(([, value]) => value !== "").map(([key, value]) => [key, Number(value)]));
    if (!Object.keys(values).length) { setNotice("Enter at least one personal baseline value"); return; }
    try {
      const response = await fetch(`${API}/crew/${encodeURIComponent(scenarioId)}/baseline`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save baseline");
      setNotice("Personal crew baseline saved"); await refreshHealthData(); await refreshMissionTools();
    } catch (error) { setNotice(error.message); }
  }

  async function submitHealthReading(event) {
    event.preventDefault();
    const values = Object.fromEntries(Object.entries(healthForm).filter(([, value]) => value !== "").map(([key, value]) => [key, Number(value)]));
    if (!Object.keys(values).length) { setNotice("Enter at least one health measurement"); return; }
    const payload = { crewId: scenarioId, source: "manual", ...values };
    try {
      const response = await fetch(`${API}/measurements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save measurement");
      setHealthForm({ heartRate: "", spo2: "", systolic: "", diastolic: "", glucose: "", temperature: "", sleepHours: "", co2: "", radiation: "" });
      setNotice("Health reading saved · screening complete");
      await refreshHealthData(); await refreshMissionTools();
    } catch (error) {
      const pending = readLocal(PENDING_TELEMETRY_KEY, []);
      try { localStorage.setItem(PENDING_TELEMETRY_KEY, JSON.stringify([...pending, payload])); } catch {}
      setNotice(`${error.message} · reading queued for offline sync`);
    }
  }

  async function simulateWearable() {
    try {
      const response = await fetch(`${API}/wearables/simulate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crewId: scenarioId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Wearable simulation failed");
      setNotice("Synthetic wearable sample received · no physical device connected");
      await refreshHealthData(); await refreshMissionTools();
    } catch (error) { setNotice(error.message); }
  }

  async function submitWellbeing(event) {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/wellbeing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crewId: scenarioId, mood: Number(wellbeingForm.mood), stress: Number(wellbeingForm.stress), notes: wellbeingForm.notes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save check-in");
      setWellbeingForm({ mood: "3", stress: "3", notes: "" });
      setNotice("Private wellbeing check-in saved"); await refreshMissionTools();
    } catch (error) { setNotice(error.message); }
  }

  async function submitSymptom(event) {
    event.preventDefault();
    const symptoms = symptomForm.symptoms.split(",").map((item) => item.trim()).filter(Boolean);
    try {
      const response = await fetch(`${API}/symptoms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crewId: scenarioId, bodyRegion: symptomForm.bodyRegion, severity: Number(symptomForm.severity), symptoms, notes: symptomForm.notes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save symptom report");
      setSymptomForm({ bodyRegion: "head", severity: "2", symptoms: "", notes: "" });
      setNotice("Crew symptom report recorded"); await refreshMissionTools();
    } catch (error) { setNotice(error.message); }
  }

  async function enableReminderNotifications() {
    if (!("Notification" in window)) { setNotice("This browser does not support desktop notifications"); return; }
    const permission = await Notification.requestPermission();
    setNotice(permission === "granted" ? "Mission reminder notifications enabled" : "Browser notification permission was not granted");
  }

  async function createReminder(event) {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/reminders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crewId: scenarioId, ...reminderForm, dueAt: new Date(reminderForm.dueAt).toISOString() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create reminder");
      setReminderForm({ title: "", dueAt: "", category: "health" });
      setNotice("Mission reminder scheduled"); await refreshMissionTools();
    } catch (error) { setNotice(error.message); }
  }

  async function completeReminder(id, completed) {
    try {
      const response = await fetch(`${API}/reminders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed }) });
      if (!response.ok) throw new Error("Could not update reminder");
      await refreshMissionTools();
    } catch (error) { setNotice(error.message); }
  }

  function exportReport() {
    const report = {
      project: "AstraVitals",
      generatedAt: new Date().toISOString(),
      scenario,
      investigation: session,
      healthTelemetry: healthRecords,
      healthAlerts,
      symptomReports,
      missionWatchInsights: insights,
      radiationExposure: radiationData,
      reminders,
      safety: "Simulated hackathon prototype; not a medical diagnosis."
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `astravitals-report-${scenario.id}.json`; link.click();
    URL.revokeObjectURL(url);
  }

  function changeNav(item) {
    setActiveNav(item);
    setMobileNav(false);
    setNotice(`${item} workspace opened`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const NavIcon = ({ name }) => {
    const Icon = iconFor(name);
    return <Icon size={18} />;
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <div className="astravitals-mark"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="astravitals-word">ASTRAVITALS</span></div>
          <div className="brand-name">AstraVitals</div>
          <p>Hear the Signal.<br />Know What to Check.</p>
        </div>
        <nav className="side-nav">
          {navItems.map((item) => (
            <button key={item} className={`nav-link ${activeNav === item ? "active" : ""}`} onClick={() => changeNav(item)}>
              <NavIcon name={item} /><span>{item}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <div className="status-line"><span className="pulse-dot" /> Offline Mode</div>
          <small><Signal size={12} /> All systems operational</small>
        </div>
        <div className="nasa-lockup"><div className="nasa-roundel">NASA</div><span>NASA Space Apps<br />Challenge 2026</span></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMobileNav(!mobileNav)}><Menu /></button>
          <div className="page-heading">
            <h1>{activeNav === "Dashboard" ? "PROJECT " : ""}<span>{activeNav === "Dashboard" ? "ASTRAVITALS" : activeNav.toUpperCase()}</span></h1>
            <p>{activeNav === "Dashboard" ? "Astronaut Health Intelligence System" : `${activeNav} · Astronaut Health Intelligence System`}</p>
          </div>
          <div className="top-actions">
            <span className="top-pill online"><CheckCircle2 size={15} /> Offline Mode</span>
            <span className="top-pill"><Zap size={15} /> Mission: {scenario.mission}</span>
            <span className="top-pill"><Clock3 size={15} /> Sol: {scenario.sol}</span>
            <button className="avatar" title="Crew profile">AR</button>
          </div>
        </header>

        <section className="scenario-strip">
          <div className="scenario-label"><Radio size={15} /> ACTIVE SIMULATION</div>
          <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
            {scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <span className="demo-tag">SIMULATED CREW DATA</span>
          <span className="notice"><span className="pulse-dot" /> {notice}</span>
        </section>

        {activeNav === "Dashboard" && <section className="metrics-grid">
          <div className="panel crew-card">
            <div className="astronaut-art"><div className="helmet"><div className="helmet-glass"><span /></div><div className="suit" /></div></div>
            <div className="crew-info"><span className="eyebrow">ASTRONAUT</span><h2>{scenario.astronaut}</h2><p>{scenario.role}</p><span className="health-chip"><Activity size={14} /> Monitoring</span></div>
          </div>
          <Metric icon={Heart} label="Heart Rate" value={`${heartRate} bpm`} status={`${heartRate >= scenario.heartRateBaseline ? "↑" : "↓"} ${Math.abs(Math.round((heartRate / scenario.heartRateBaseline - 1) * 100))}%`} tone="pink" />
          <Metric icon={Droplet} label="SpO₂" value={`${spo2}%`} status={spo2 < 95 ? "Review" : "Normal"} tone="cyan" />
          <Metric icon={Thermometer} label="Temperature" value={`${temperature}°C`} status={temperature < 35 || temperature > 38 ? "Review" : "Normal"} tone="teal" />
          <Metric icon={Moon} label="Sleep (24h)" value={`${sleepHours}h`} status={sleepHours < 6 ? "Low" : "In range"} tone="violet" />
        </section>}

        {(activeNav === "Dashboard" || activeNav === "Investigations") && <section className="dashboard-grid">
          <div className="panel overview-panel">
            <PanelTitle icon={Activity} title="Health Overview" meta="Last 24h" />
            <div className="chart-legend"><span><i className="legend-pink" /> HR</span><span><i className="legend-dash" /> Baseline</span></div>
            <HealthChart current={heartRate} baseline={scenario.heartRateBaseline} />
          </div>

          <div className="panel next-panel">
            <div className="next-title"><div><Sparkles size={21} /><h2>Next Best Check</h2></div><span>STEP {Math.min(checksDone + 1, 5)} OF 5</span></div>
            <div className="check-recommendation">
              <div className="test-icon"><FlaskIcon /></div>
              <div><h3>{nextCheck?.label || (session?.complete ? "Investigation complete" : "Start an investigation")}</h3><p>{nextCheck?.reason || "ASTRAVITALS will select the most informative next check using mission context and the current evidence."}</p></div>
            </div>
            {!session ? (
              <button className="primary-button" onClick={startInvestigation} disabled={loading}>{loading ? "Starting..." : "Start Investigation"} <ArrowRight size={17} /></button>
            ) : session.complete ? (
              <div className="complete-note"><CheckCircle2 size={17} /> Investigation reached its stopping rule</div>
            ) : showCheck ? (
              <div className="check-actions">
                <span className="check-prompt">What was the result?</span>
                <button className="result-button normal" onClick={() => submitCheck("normal")} disabled={loading}><Check size={15} /> Normal</button>
                <button className="result-button abnormal" onClick={() => submitCheck("abnormal")} disabled={loading}><AlertTriangle size={15} /> Abnormal</button>
              </div>
            ) : <button className="primary-button" onClick={() => setShowCheck(true)}>Continue Check <ArrowRight size={17} /></button>}
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
            <div className="cause-foot">Illustrative model beliefs · not medical probabilities</div>
          </div>

          <div className="panel reasoning-panel">
            <PanelTitle icon={Brain} title="Reasoning Trail" action="View Details" />
            <div className="timeline">
              {(session?.reasoning || scenario.observations.map((label) => ({ label, done: true }))).map((item, index) => (
                <div className="timeline-item" key={`${item.label}-${index}`}><span className={`timeline-dot ${item.done === false ? "pending" : ""}`}>{item.done === false ? <Clock3 size={12} /> : <Check size={12} />}</span><p>{item.label}</p></div>
              ))}
              {session && <div className="timeline-item current"><span className="timeline-dot pending"><Sparkles size={12} /></span><p>Selected next check: {nextCheck?.label || "Stopping rule reached"}</p></div>}
            </div>
          </div>

          <div className="panel context-panel">
            <PanelTitle icon={Zap} title="Mission Context" meta="LIVE CONTEXT" />
            <div className="context-grid">
              {contextCards.map((item) => <div className="context-tile" key={item.label}><item.icon className={item.tone} size={22} /><span>{item.label}</span><b>{item.value}</b><small>{item.sub}</small></div>)}
            </div>
          </div>

          <div className="panel conclusion-panel">
            <div className="conclusion-head"><CheckCircle2 size={19} /><h2>Current Assessment</h2></div>
            <div className="probable-chip">{session ? checkNames[topCause[0]] : "Awaiting investigation"} · {percent(topCause[1] * 100)}</div>
            <p className="assessment-copy">{latestHealthAlerts.length ? `${latestHealthAlerts.length} new health alert${latestHealthAlerts.length === 1 ? "" : "s"}. ${latestHealthAlerts[0].message}` : session ? (session.complete ? "The stopping rule has been reached. Review the evidence and follow mission medical protocol." : "Evidence is being gathered. This is a working hypothesis, not a diagnosis.") : "Start an investigation to see how ASTRAVITALS updates its working hypotheses."}</p>
            <div className="action-line"><span>Recommended focus</span><b>{session ? (nextCheck?.label || "Review evidence and escalate as needed") : "Begin with the highest-value check"}</b></div>
            <div className="uncertainty"><CircleHelp size={14} /> Runner-up: {checkNames[secondCause[0]]} ({percent(secondCause[1] * 100)})</div>
            <button className="report-button" onClick={exportReport}><Download size={14} /> Export Mission Report</button>
          </div>
        </section>}

        {activeNav === "Crew Health" && <section className="health-tools-grid" aria-label="Crew health tools">
          <div className="panel tool-panel">
            <PanelTitle icon={Activity} title="Record Health Data" meta="MANUAL ENTRY" />
            <form className="tool-form" onSubmit={submitHealthReading}>
              {[["heartRate","Heart rate","bpm"],["spo2","SpO₂","%"],["systolic","Systolic BP","mmHg"],["diastolic","Diastolic BP","mmHg"],["glucose","Glucose","mg/dL"],["temperature","Temperature","°C"],["sleepHours","Sleep","hours"],["co2","Cabin CO₂","ppm"],["radiation","Radiation dose","mSv"]].map(([key,label,unit]) => <label key={key}>{label}<input className="health-input" type="number" step="any" placeholder={unit} value={healthForm[key]} onChange={(e) => setHealthForm((old) => ({ ...old, [key]: e.target.value }))} /></label>)}
              <div className="tool-actions"><button className="primary-button" type="submit"><Save size={15}/> Save Reading</button><button className="secondary-button" type="button" onClick={simulateWearable}><Watch size={15}/> Simulate Wearable</button></div>
            </form>
            <small className="tool-note">Wearable samples are synthetic simulations, not a real device connection.</small>
          </div>

          <div className="panel tool-panel">
            <PanelTitle icon={Brain} title="Wellbeing Check-in" meta="PRIVATE CREW INPUT" />
            <form className="tool-form one-column" onSubmit={submitWellbeing}>
              <label>Mood (1–5)<select className="health-input" value={wellbeingForm.mood} onChange={(e) => setWellbeingForm((old) => ({ ...old, mood: e.target.value }))}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></label>
              <label>Stress (1–5)<select className="health-input" value={wellbeingForm.stress} onChange={(e) => setWellbeingForm((old) => ({ ...old, stress: e.target.value }))}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></label>
              <label>Optional private note<textarea className="health-input" rows="3" maxLength="1000" value={wellbeingForm.notes} onChange={(e) => setWellbeingForm((old) => ({ ...old, notes: e.target.value }))} placeholder="How are you feeling?" /></label>
              <button className="primary-button" type="submit"><Save size={15}/> Save Check-in</button>
            </form>
            <small className="tool-note">Self-reported wellbeing is supportive context, not a psychological diagnosis.</small>
          </div>

          <div className="panel tool-panel">
            <PanelTitle icon={ClipboardList} title="Astronaut Body Map" meta="SYMPTOM LOG" />
            <div className="body-map-regions" aria-label="Select affected body region">{["head","eyes","chest","abdomen","back","left-arm","right-arm","left-leg","right-leg"].map((region) => <button type="button" key={region} className={symptomForm.bodyRegion === region ? "selected" : ""} aria-pressed={symptomForm.bodyRegion === region} onClick={() => setSymptomForm((old) => ({ ...old, bodyRegion: region }))}>{region.replace("-", " ")}</button>)}</div>
            <form className="tool-form one-column" onSubmit={submitSymptom}>
              <label>Body region<select className="health-input" value={symptomForm.bodyRegion} onChange={(e) => setSymptomForm((old) => ({ ...old, bodyRegion: e.target.value }))}>{["head","eyes","chest","abdomen","back","left-arm","right-arm","left-leg","right-leg","other"].map((region) => <option key={region} value={region}>{region.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}</select></label>
              <label>Severity (1–5)<select className="health-input" value={symptomForm.severity} onChange={(e) => setSymptomForm((old) => ({ ...old, severity: e.target.value }))}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></label>
              <label>Symptoms (comma separated)<input className="health-input" value={symptomForm.symptoms} onChange={(e) => setSymptomForm((old) => ({ ...old, symptoms: e.target.value }))} placeholder="e.g. headache, dizziness" /></label>
              <label>Notes<textarea className="health-input" rows="2" maxLength="1000" value={symptomForm.notes} onChange={(e) => setSymptomForm((old) => ({ ...old, notes: e.target.value }))} placeholder="Optional context" /></label>
              <button className="primary-button" type="submit"><Save size={15}/> Record Symptom</button>
            </form>
            <div className="recent-list">{symptomReports.slice(0,3).map((report) => <div className="recent-row" key={report.id}><b>{report.bodyRegion.replace("-", " ")}</b><span>Severity {report.severity}/5 · {report.symptoms.join(", ") || "No labels"}</span></div>)}{!symptomReports.length && <small className="tool-note">No symptom reports recorded for this crew.</small>}</div>
          </div>

          <div className="panel tool-panel">
            <PanelTitle icon={TrendingUp} title="Health Trends" meta="RECORDED HISTORY" />
            <label className="trend-picker">Metric<select className="health-input" value={trendMetric} onChange={(e) => setTrendMetric(e.target.value)}>{[["heartRate","Heart rate"],["spo2","SpO₂"],["systolic","Systolic BP"],["diastolic","Diastolic BP"],["glucose","Glucose"],["temperature","Temperature"],["sleepHours","Sleep"],["co2","Cabin CO₂"],["radiation","Radiation"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className="trend-summary"><strong>{trendData?.latest ?? "—"}</strong><span>{trendData?.unit || "Latest value"}</span><b>{trendData?.direction || "Awaiting data"}</b></div>
            <div className="trend-graph"><svg viewBox="0 0 360 110" preserveAspectRatio="none"><path d={trendPath(trendData?.points || [])} /></svg></div>
            <div className="trend-stats"><span>Average <b>{trendData?.average ?? "—"}</b></span><span>Min <b>{trendData?.min ?? "—"}</b></span><span>Max <b>{trendData?.max ?? "—"}</b></span><span>Samples <b>{trendData?.count ?? 0}</b></span></div>
            <small className="tool-note">Trend summaries describe recorded data; they are not clinical interpretations.</small>
          </div>

          <div className="panel tool-panel">
            <PanelTitle icon={RadioTower} title="Mission Watch Insights" meta="EXPLAINABLE RULES" />
            <div className="watch-score"><strong>{insights?.score ?? "—"}</strong><span>/ 100 · {insights?.level?.replaceAll("-", " ") || "Loading"}</span></div>
            {(insights?.factors || []).map((factor) => <div className="insight-row" key={factor.code}><b>{factor.label}</b><span>+{factor.points}</span><small>{factor.detail}</small></div>)}
            {!insights?.factors?.length && <small className="tool-note">No current rule-based watch factors. Continue scheduled monitoring.</small>}
            {(insights?.recommendations || []).map((item) => <p className="recommendation-line" key={item}>{item}</p>)}
            <small className="tool-note">Prioritisation aid only · not a prediction or diagnosis.</small>
          </div>

          <div className="panel tool-panel">
            <PanelTitle icon={BellRing} title="Mission Reminders" meta="SCHEDULED TASKS" />
            <button className="secondary-button" type="button" onClick={enableReminderNotifications}><Bell size={14}/> Enable Browser Notifications</button>
            <form className="tool-form one-column" onSubmit={createReminder}>
              <label>Reminder<input className="health-input" required maxLength="120" value={reminderForm.title} onChange={(e) => setReminderForm((old) => ({ ...old, title: e.target.value }))} placeholder="e.g. Complete sleep check" /></label>
              <label>Due date & time<input className="health-input" required type="datetime-local" value={reminderForm.dueAt} onChange={(e) => setReminderForm((old) => ({ ...old, dueAt: e.target.value }))} /></label>
              <label>Category<select className="health-input" value={reminderForm.category} onChange={(e) => setReminderForm((old) => ({ ...old, category: e.target.value }))}>{["health","sleep","wellbeing","mission"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <button className="primary-button" type="submit"><Bell size={15}/> Add Reminder</button>
            </form>
            <div className="recent-list">{reminders.map((reminder) => <div className="recent-row" key={reminder.id}><label><input type="checkbox" checked={reminder.completed} onChange={(e) => completeReminder(reminder.id, e.target.checked)} /> <b>{reminder.title}</b></label><span>{new Date(reminder.dueAt).toLocaleString()}</span></div>)}{!reminders.length && <small className="tool-note">No reminders scheduled.</small>}</div>
          </div>
        </section>}

        {activeNav === "Crew Health" && <section className="health-tools-grid secondary-tools-grid" aria-label="Mission configuration and exposure tools">
          <div className="panel tool-panel">
            <PanelTitle icon={ShieldCheck} title="Personal Health Baseline" meta="CREW REFERENCE" />
            <form className="tool-form" onSubmit={saveBaseline}>
              {[["heartRate","Heart rate","bpm"],["spo2","SpO₂","%"],["systolic","Systolic BP","mmHg"],["diastolic","Diastolic BP","mmHg"],["glucose","Glucose","mg/dL"],["temperature","Temperature","°C"],["sleepHours","Sleep","hours"]].map(([key,label,unit]) => <label key={key}>{label}<input className="health-input" type="number" step="any" placeholder={unit} value={baselineValues[key]} onChange={(e) => setBaselineValues((old) => ({ ...old, [key]: e.target.value }))} /></label>)}
              <div className="tool-actions"><button className="primary-button" type="submit"><Save size={15}/> Save Baseline</button></div>
            </form>
            <small className="tool-note">Baseline deviation flags are heuristic review prompts, not individual medical limits.</small>
          </div>
          <div className="panel tool-panel">
            <PanelTitle icon={Radiation} title="Radiation Exposure Log" meta="MISSION CONTEXT" />
            <div className="watch-score"><strong>{radiationData?.latestDose ?? latestHealth.radiation ?? "—"}</strong><span>mSv · latest supplied cumulative reading</span></div>
            <div className="trend-stats"><span>Recorded samples <b>{radiationData?.sampleCount ?? 0}</b></span><span>Latest source <b>{radiationData?.points?.at(-1)?.source || "—"}</b></span></div>
            <div className="recent-list">{(radiationData?.points || []).slice(-4).reverse().map((point, index) => <div className="recent-row" key={`${point.recordedAt}-${index}`}><b>{point.dose} mSv</b><span>{new Date(point.recordedAt).toLocaleString()} · {point.source}</span></div>)}</div>
            <small className="tool-note">Successive readings are treated as cumulative values and are not added together. Compare only with approved mission-specific limits.</small>
          </div>
        </section>}

        {activeNav === "Mission Reports" && (
          <section className="panel tool-panel nav-page-panel">
            <PanelTitle icon={FileText} title="Mission Reports" meta="REPORT CENTER" />
            <p className="tool-note">Generate a downloadable snapshot of the selected crew simulation, investigation, health telemetry, alerts, symptoms, reminders and mission-watch insights.</p>
            <div className="context-grid report-summary-grid">
              <div className="context-tile"><Users size={22} /><span>Selected crew</span><b>{scenario.astronaut}</b><small>{scenario.role}</small></div>
              <div className="context-tile"><Activity size={22} /><span>Health records</span><b>{healthRecords.length}</b><small>Saved telemetry samples</small></div>
              <div className="context-tile"><AlertTriangle size={22} /><span>Health alerts</span><b>{healthAlerts.length}</b><small>Recorded alerts</small></div>
              <div className="context-tile"><ClipboardList size={22} /><span>Symptom reports</span><b>{symptomReports.length}</b><small>Crew-submitted reports</small></div>
            </div>
            <div className="tool-actions">
              <button className="primary-button" type="button" onClick={exportReport}><Download size={15} /> Export Mission Report (JSON)</button>
              <button className="secondary-button" type="button" onClick={refreshMissionTools}><RefreshCw size={15} /> Refresh report data</button>
            </div>
            <small className="tool-note">Reports contain simulated prototype data and are not clinical records or medical diagnoses.</small>
          </section>
        )}

        {activeNav === "Settings" && (
          <section className="panel tool-panel nav-page-panel">
            <PanelTitle icon={Settings} title="Settings" meta="MISSION CONFIGURATION" />
            <div className="settings-row">
              <div><b>Active simulation</b><small>Choose which simulated astronaut dataset powers the dashboard and reports.</small></div>
              <select className="health-input settings-select" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
                {scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="settings-row">
              <div><b>Browser notifications</b><small>Allow AstraVitals to display due mission reminders in this browser.</small></div>
              <button className="secondary-button" type="button" onClick={enableReminderNotifications}><Bell size={14} /> Enable notifications</button>
            </div>
            <div className="settings-row">
              <div><b>Refresh mission data</b><small>Reload health records, trends, symptoms, reminders and mission insights from the API.</small></div>
              <button className="secondary-button" type="button" onClick={async () => { await refreshHealthData(); await refreshMissionTools(); setNotice("Mission data refresh requested"); }}><RefreshCw size={14} /> Refresh data</button>
            </div>
            <div className="settings-row">
              <div><b>Investigation session</b><small>Start a fresh investigation for the currently selected crew simulation.</small></div>
              <button className="secondary-button" type="button" onClick={() => { setSession(null); setShowCheck(false); setNotice("Investigation session reset"); }}><RefreshCw size={14} /> Reset investigation</button>
            </div>
            <div className="settings-row">
              <div><b>Export data</b><small>Download the current mission snapshot as a JSON report.</small></div>
              <button className="primary-button" type="button" onClick={exportReport}><Download size={14} /> Export report</button>
            </div>
            <small className="tool-note">AstraVitals is a simulated hackathon prototype. Settings affect this browser session and the selected demo crew only.</small>
          </section>
        )}

        <footer className="footer"><span><span className="footer-star">✦</span> AstraVitals <i /> Next Best Check Engine</span><div className="ecg-line"><Waves size={18} /></div><em>Because in space, every next check counts.</em></footer>
        <div className="safety-note"><AlertTriangle size={12} /> Prototype only · Simulated data · Not for clinical use · Follow approved mission medical protocols</div>
      </main>
    </div>
  );
}

function trendPath(points) {
  if (!points.length) return "M 0 55 L 360 55";
  const values = points.map((point) => Number(point.value)).filter(Number.isFinite);
  if (!values.length) return "M 0 55 L 360 55";
  const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
  return values.map((value, index) => `${index ? "L" : "M"} ${(index / Math.max(1, values.length - 1)) * 360} ${95 - ((value - min) / span) * 80}`).join(" ");
}

function Metric({ icon: Icon, label, value, status, tone }) {
  return <div className={`panel metric-card ${tone}`}><div className="metric-top"><Icon size={24} /><span>{label}</span></div><strong>{value}</strong><small>{status}</small><div className="sparkline"><svg viewBox="0 0 150 28" preserveAspectRatio="none"><path d="M0 19 C10 18 12 8 22 14 S38 25 48 15 S63 7 75 14 S92 22 103 12 S122 7 132 14 S142 18 150 8" /></svg></div></div>;
}

function PanelTitle({ icon: Icon, title, meta, action }) {
  return <div className="panel-title"><div><Icon size={19} /><h2>{title}</h2></div>{action ? <button className="text-action">{action} <ArrowRight size={13} /></button> : <span>{meta}</span>}</div>;
}

function HealthChart({ current, baseline }) {
  const delta = current - baseline;
  return <div className="chart-wrap"><div className="chart-y"><span>120</span><span>100</span><span>80</span><span>60</span></div><svg className="health-chart" viewBox="0 0 520 190" preserveAspectRatio="none">
    {[20, 62, 104, 146].map((y) => <line key={y} x1="0" x2="520" y1={y} y2={y} className="grid-line" />)}
    {[0, 86, 172, 258, 344, 430, 520].map((x) => <line key={x} x1={x} x2={x} y1="0" y2="160" className="grid-line vertical" />)}
    <line x1="0" x2="520" y1="112" y2="112" className="baseline-line" />
    <path d={`M0 118 C35 112 38 89 70 101 S115 130 145 111 S190 93 220 112 S265 128 300 110 S342 100 372 115 S420 129 448 105 S490 ${Math.max(20, 90 - delta * 2)} 520 ${Math.max(15, 70 - delta * 2)}`} className="chart-path" />
    <circle cx="520" cy={Math.max(15, 70 - delta * 2)} r="6" className="chart-point" />
  </svg><div className="chart-x"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div>;
}

function FlaskIcon() {
  return <div className="flask-drawing"><div className="flask-neck" /><div className="flask-body"><span /></div></div>;
}

export default App;
