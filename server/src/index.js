import express from "express";
import cors from "cors";
import { scenarios, getScenario } from "./scenarios.js";
import { CHECKS, HYPOTHESES, LABELS, buildPriors, chooseNextCheck, createInvestigation, recordCheck, validateMeasurement, resolveContext, evaluateRules } from "./engine.js";
import { getInvestigation, saveInvestigation, updateInvestigation, addMeasurement, listMeasurements, latestMeasurement, addWellbeing, listWellbeing, getBaseline, saveBaseline, addSymptomReport, listSymptomReports, addReminder, listReminders, updateReminder } from "./store.js";
import { createHealthRecord, validateHealthRecord, validateBaseline, summarizeMetricTrend, METRIC_RULES } from "./health.js";
import { buildMissionWatch } from "./mission-watch.js";

const app = express();
const PORT = process.env.PORT || 4000;
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req, res) => res.json({
  status: "ok", service: "AstraVitals API", timestamp: new Date().toISOString(),
  capabilities: ["investigations", "health-telemetry", "personal-baselines", "trend-analysis", "wellbeing", "wearable-simulation", "symptom-body-map", "mission-insights", "radiation-exposure", "reminders", "offline-ready-client"],
  storage: "persistent-json"
}));
app.get("/api/metrics", (_req, res) => {
  res.json({ metrics: METRIC_RULES, note: "Prototype screening thresholds; configure against approved mission medical protocols." });
});
app.get("/api/scenarios", (_req, res) => res.json({ scenarios }));
app.get("/api/scenarios/:id", (req, res) => {
  const scenario = getScenario(req.params.id);
  if (!scenario) return res.status(404).json({ error: "Scenario not found." });
  return res.json({ scenario });
});
app.get("/api/model", (req, res) => {
  const scenario = getScenario(req.query.scenarioId) || scenarios[0];
  const context = resolveContext(scenario);
  const priors = buildPriors(context);
  res.json({
    hypotheses: HYPOTHESES.map((id) => ({ id, label: LABELS[id] })),
    priors,
    checks: CHECKS.map(({ id, label, duration, reason }) => ({ id, label, duration, reason })),
    nextCheck: chooseNextCheck(priors, [], context),
    flags: evaluateRules(scenario),
    modelNote: "Illustrative assumptions only; not clinically calibrated."
  });
});
app.post("/api/investigations/start", (req, res) => {
  const scenario = getScenario(req.body?.scenarioId);
  if (!scenario) return res.status(400).json({ error: "A valid scenarioId is required." });
  const recentMeasurements = listMeasurements({ crewId: scenario.id, limit: 10 });
  const recentWellbeing = listWellbeing({ crewId: scenario.id, limit: 5 });
  const sleepSamples = recentMeasurements.slice(0, 3).map((item) => item.values.sleepHours).filter(Number.isFinite);
  const healthContext = {
    elevatedCO2: Number(recentMeasurements[0]?.values.co2 ?? scenario.co2) > (METRIC_RULES.co2.high || 1000),
    shortSleepNights: sleepSamples.length >= 3 && sleepSamples.every((hours) => hours < 6) ? 3 : (scenario.context.shortSleepNights || 0),
    lowMoodRecent: recentWellbeing[0]?.mood <= 2,
    highStressRecent: recentWellbeing[0]?.stress >= 4
  };
  const investigationScenario = { ...scenario, context: { ...(scenario.context || {}), ...healthContext } };
  const investigation = saveInvestigation(createInvestigation(investigationScenario));
  res.status(201).json({ investigation });
});
app.get("/api/investigations/:id", (req, res) => {
  const investigation = getInvestigation(req.params.id);
  if (!investigation) return res.status(404).json({ error: "Investigation not found." });
  res.json({ investigation });
});
app.post("/api/investigations/:id/check", (req, res) => {
  const investigation = getInvestigation(req.params.id);
  if (!investigation) return res.status(404).json({ error: "Investigation not found." });
  try {
    const scenario = getScenario(investigation.scenarioId);
    const updated = updateInvestigation(recordCheck(investigation, req.body?.checkId, req.body?.result, investigation.context || scenario.context));
    return res.json({ investigation: updated });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
app.post("/api/investigations/:id/summary", (req, res) => {
  const investigation = getInvestigation(req.params.id);
  if (!investigation) return res.status(404).json({ error: "Investigation not found." });
  const ranked = Object.entries(investigation.posterior).sort((a, b) => b[1] - a[1]);
  res.json({
    investigationId: investigation.id,
    status: investigation.status,
    checksCompleted: investigation.checks.length,
    leadingHypotheses: ranked.slice(0, 2).map(([id, probability]) => ({ id, label: LABELS[id], probability })),
    disclaimer: "These are illustrative model beliefs, not diagnoses."
  });
});
app.post("/api/measurements/validate", (req, res) => {
  const { value, min, max } = req.body || {};
  res.json(validateMeasurement(value, min, max));
});
// Health telemetry: append-only records preserve an auditable mission timeline.
app.get("/api/measurements", (req, res) => {
  res.json({ records: listMeasurements({ crewId: req.query.crewId, limit: req.query.limit }) });
});
app.post("/api/measurements", (req, res) => {
  try {
    const crewId = req.body?.crewId || "demo-crew";
    const previousRecord = latestMeasurement(crewId);
    const baseline = getBaseline(String(crewId).slice(0, 80));
    const record = createHealthRecord(req.body || {}, crewId, previousRecord?.values, baseline);
    addMeasurement(record);
    return res.status(201).json({ record, alerts: record.alerts });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
});
app.get("/api/crew/:crewId/summary", (req, res) => {
  const crewId = String(req.params.crewId || "").slice(0, 80);
  const records = listMeasurements({ crewId, limit: 500 });
  const latest = records[0] || null;
  const values = records.map((record) => record.values);
  const average = (key) => {
    const samples = values.map((item) => Number(item[key])).filter(Number.isFinite);
    return samples.length ? Number((samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2)) : null;
  };
  const alerts = records.reduce((total, record) => total + record.alerts.length, 0);
  const checkIns = listWellbeing({ crewId, limit: 500 });
  res.json({
    crewId, latest, measurementCount: records.length, alertCount: alerts,
    averages: Object.fromEntries(["heartRate", "spo2", "systolic", "diastolic", "glucose", "temperature", "sleepHours", "co2", "radiation"].map((key) => [key, average(key)])),
    latestWellbeing: checkIns[0] || null,
    wellbeingCount: checkIns.length,
    personalBaseline: getBaseline(crewId)?.values || null
  });
});

app.get("/api/alerts", (req, res) => {
  const records = listMeasurements({ crewId: req.query.crewId, limit: 500 });
  const alerts = records.flatMap((record) => record.alerts.map((alert) => ({
    ...alert, recordId: record.id, crewId: record.crewId, recordedAt: record.recordedAt
  })));
  res.json({ alerts: alerts.slice(0, 200), count: alerts.length });
});
app.get("/api/crew/:crewId/baseline", (req, res) => {
  const crewId = String(req.params.crewId || "").slice(0, 80);
  res.json({ baseline: getBaseline(crewId) });
});
app.put("/api/crew/:crewId/baseline", (req, res) => {
  const crewId = String(req.params.crewId || "").slice(0, 80);
  if (!crewId) return res.status(400).json({ error: "A crewId is required." });
  const validation = validateBaseline(req.body?.values || {});
  if (!validation.valid) return res.status(400).json({ error: validation.errors.join(" "), errors: validation.errors });
  const baseline = saveBaseline({ crewId, values: validation.values, updatedAt: new Date().toISOString() });
  return res.status(200).json({ baseline });
});
app.get("/api/crew/:crewId/trends", (req, res) => {
  const crewId = String(req.params.crewId || "").slice(0, 80);
  const metric = String(req.query.metric || "heartRate");
  if (!METRIC_RULES[metric]) return res.status(400).json({ error: "Unknown metric. Request one of the metrics returned by /api/metrics." });
  const records = listMeasurements({ crewId, limit: req.query.limit || 100 });
  const trend = summarizeMetricTrend(records, metric);
  const baseline = getBaseline(crewId);
  return res.json({ crewId, trend, baseline: baseline?.values?.[metric] ?? null, note: "Trend summaries describe recorded prototype data and are not clinical interpretations." });
});

app.get("/api/wellbeing", (req, res) => {
  res.json({ checkIns: listWellbeing({ crewId: req.query.crewId, limit: req.query.limit }) });
});
app.post("/api/wellbeing", (req, res) => {
  const { crewId = "demo-crew", mood, stress, notes = "" } = req.body || {};
  const validScale = (v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 5;
  if (!validScale(mood) || !validScale(stress) || typeof notes !== "string" || notes.length > 1000) {
    return res.status(400).json({ error: "Mood and stress must be integer ratings from 1 to 5; notes must be under 1000 characters." });
  }
  const checkIn = addWellbeing({
    id: `wellbeing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    crewId: String(crewId).slice(0, 80),
    mood: Number(mood), stress: Number(stress), notes,
    recordedAt: new Date().toISOString()
  });
  return res.status(201).json({ checkIn });
});


// Simulated wearable stream. This endpoint never connects to a physical device.
app.post("/api/wearables/simulate", (req, res) => {
  const crewId = String(req.body?.crewId || "demo-crew").slice(0, 80);
  const scenario = getScenario(crewId);
  const previous = latestMeasurement(crewId)?.values || {};
  const base = scenario || { heartRate: 72, spo2: 98, temperature: 36.7, sleepHours: 7, co2: 500, radiation: 0.05 };
  const jitter = (value, spread, min, max) => Math.max(min, Math.min(max, Number((Number(value) + (Math.random() * 2 - 1) * spread).toFixed(2))));
  const payload = {
    crewId, source: "wearable",
    heartRate: jitter(previous.heartRate ?? base.heartRate, 3, 35, 180),
    spo2: jitter(previous.spo2 ?? base.spo2, 1, 85, 100),
    temperature: jitter(previous.temperature ?? base.temperature, 0.08, 35, 40),
    sleepHours: Number((previous.sleepHours ?? base.sleepHours ?? 7).toFixed(1)),
    co2: Number(previous.co2 ?? base.co2 ?? 500),
    radiation: Number(previous.radiation ?? base.radiation ?? 0.05)
  };
  try {
    const record = createHealthRecord(payload, crewId, previous, getBaseline(crewId));
    addMeasurement(record);
    return res.status(201).json({ record, simulated: true, note: "Synthetic wearable sample only; no physical device was accessed." });
  } catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
});

// Body-map symptom reports are private crew records; bodyRegion is a controlled label.
app.get("/api/symptoms", (req, res) => res.json({ reports: listSymptomReports({ crewId: req.query.crewId, limit: req.query.limit }) }));
app.post("/api/symptoms", (req, res) => {
  const { crewId = "demo-crew", bodyRegion, severity, symptoms = [], notes = "" } = req.body || {};
  const regions = ["head", "eyes", "chest", "abdomen", "back", "left-arm", "right-arm", "left-leg", "right-leg", "other"];
  if (!regions.includes(bodyRegion) || !Number.isInteger(Number(severity)) || Number(severity) < 1 || Number(severity) > 5 || !Array.isArray(symptoms) || symptoms.length > 20 || symptoms.some((item) => typeof item !== "string" || item.length > 80) || typeof notes !== "string" || notes.length > 1000) {
    return res.status(400).json({ error: "Provide a supported body region, severity from 1–5, up to 20 symptom labels, and notes under 1000 characters." });
  }
  const report = addSymptomReport({ id: `symptom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, crewId: String(crewId).slice(0, 80), bodyRegion, severity: Number(severity), symptoms, notes, recordedAt: new Date().toISOString() });
  return res.status(201).json({ report });
});

// Transparent mission-watch score: a rule-based prioritisation aid, not a medical prediction.
app.get("/api/crew/:crewId/insights", (req, res) => {
  const crewId = String(req.params.crewId || "").slice(0, 80);
  const result = buildMissionWatch({
    measurements: listMeasurements({ crewId, limit: 100 }),
    wellbeing: listWellbeing({ crewId, limit: 10 }),
    symptoms: listSymptomReports({ crewId, limit: 20 })
  });
  res.json({ crewId, ...result, generatedAt: new Date().toISOString() });
});

// Radiation is treated as a cumulative mission-dose reading supplied by the data source.
app.get("/api/crew/:crewId/radiation", (req, res) => {
  const crewId = String(req.params.crewId || "").slice(0, 80);
  const records = listMeasurements({ crewId, limit: 500 }).filter((record) => Number.isFinite(record.values.radiation));
  const latest = records[0] || null;
  const points = records.slice().reverse().map((record) => ({ recordedAt: record.recordedAt, dose: record.values.radiation, source: record.source }));
  res.json({ crewId, latestDose: latest?.values.radiation ?? null, unit: "mSv (as supplied by source)", points, sampleCount: points.length, note: "Values are treated as cumulative dose readings; do not sum successive readings. Mission-specific limits must come from approved radiation-protection guidance." });
});

app.get("/api/reminders", (req, res) => res.json({ reminders: listReminders({ crewId: req.query.crewId }) }));
app.post("/api/reminders", (req, res) => {
  const { crewId = "demo-crew", title, dueAt, category = "health" } = req.body || {};
  const due = Date.parse(dueAt);
  if (typeof title !== "string" || !title.trim() || title.length > 120 || !Number.isFinite(due) || !["health", "sleep", "wellbeing", "mission"].includes(category)) return res.status(400).json({ error: "A title, valid dueAt date, and supported category are required." });
  const reminder = addReminder({ id: `reminder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, crewId: String(crewId).slice(0, 80), title: title.trim(), category, dueAt: new Date(due).toISOString(), completed: false, createdAt: new Date().toISOString() });
  return res.status(201).json({ reminder });
});
app.patch("/api/reminders/:id", (req, res) => {
  if (typeof req.body?.completed !== "boolean") return res.status(400).json({ error: "completed must be a boolean." });
  const reminder = updateReminder(req.params.id, { completed: req.body.completed });
  if (!reminder) return res.status(404).json({ error: "Reminder not found." });
  return res.json({ reminder });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => console.log(`AstraVitals API listening on http://localhost:${PORT}`));
