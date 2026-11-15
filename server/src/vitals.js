// Crew-entered daily check-ins: validation, rules, multi-day trends, guidance, streaks, reminders.
// Pure functions only (no DOM, no storage) so they run in the browser, offline, and in `node --test`.
// All thresholds are ILLUSTRATIVE general-adult reference points, NOT mission limits or clinical advice.
import { LIMITS, SHORT_SLEEP_HOURS, validateMeasurement } from "./engine.js";

/* ------------------------------------------------------------------ *
 * Field definitions and plausibility ranges (used for validation).    *
 * ------------------------------------------------------------------ */
export const FIELD_SPECS = {
  hr: { label: "Resting heart rate", unit: "bpm", min: 20, max: 250 },
  sys: { label: "Systolic blood pressure", unit: "mmHg", min: 50, max: 260 },
  dia: { label: "Diastolic blood pressure", unit: "mmHg", min: 30, max: 160 },
  glucose: { label: "Blood glucose", unit: "mg/dL", min: 20, max: 600 },
  temp: { label: "Body temperature", unit: "°C", min: 30, max: 43 },
  spo2: { label: "SpO₂", unit: "%", min: 50, max: 100 },
  sleepHours: { label: "Sleep last night", unit: "h", min: 0, max: 24 },
  exerciseMin: { label: "Exercise", unit: "min", min: 0, max: 600 },
  radiationMsv: { label: "Radiation dose", unit: "mSv", min: 0, max: 50 }
};

export const MOOD_LABELS = ["Very low", "Low", "Neutral", "Good", "Very good"];
export const GLUCOSE_CONTEXTS = ["fasting", "postMeal", "unsure"];

export const REGIONS = {
  head: "Head", eyes: "Eyes / vision", chest: "Chest", abdomen: "Abdomen", back: "Back",
  leftArm: "Left arm", rightArm: "Right arm", leftLeg: "Left leg", rightLeg: "Right leg"
};
export const SEVERITY_LABELS = { 1: "Mild", 2: "Moderate", 3: "Severe" };

// Entry-level limits that are NOT already in engine.LIMITS (HR, SpO2, temperature reuse engine.LIMITS).
export const ENTRY_LIMITS = {
  sysWarning: 140, diaWarning: 90, sysCritical: 180, diaCritical: 120,
  sysLowWarning: 90, diaLowWarning: 60, sysLowCritical: 80,
  glucoseLowWarning: 70, glucoseLowCritical: 54, glucoseCritical: 300,
  glucoseHigh: { fasting: 126, postMeal: 180, unsure: 180 },
  tempLowWarning: 35.0, tempLowCritical: 34.0,
  hrLowWarning: 40,
  sleepWarning: 4, moodWarning: 2
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/* ------------------------------------------------------------------ *
 * Validation                                                          *
 * ------------------------------------------------------------------ */
/** Validate raw form input (strings or numbers). Returns { valid, errors, entry } — never throws. */
export function validateEntry(raw = {}) {
  const errors = {};
  const entry = {};

  for (const [key, spec] of Object.entries(FIELD_SPECS)) {
    const v = raw[key];
    if (v === undefined || v === null || String(v).trim() === "") continue;
    const r = validateMeasurement(v, spec.min, spec.max);
    if (!r.valid) {
      errors[key] = r.reason === "Value must be numeric."
        ? `${spec.label} must be a number.`
        : `${spec.label} must be between ${spec.min} and ${spec.max} ${spec.unit}. Re-check the device.`;
    } else entry[key] = r.value;
  }

  // Blood pressure is a pair: both or neither, and systolic must exceed diastolic.
  if (isNum(entry.sys) !== isNum(entry.dia) && !errors.sys && !errors.dia) {
    errors[isNum(entry.sys) ? "dia" : "sys"] = "Enter both systolic and diastolic values.";
  } else if (isNum(entry.sys) && isNum(entry.dia) && entry.sys <= entry.dia) {
    errors.sys = "Systolic must be higher than diastolic. Re-check the reading.";
  }

  if (raw.mood !== undefined && raw.mood !== null && String(raw.mood).trim() !== "") {
    const m = Number(raw.mood);
    if (Number.isInteger(m) && m >= 1 && m <= 5) entry.mood = m;
    else errors.mood = "Mood must be a whole number from 1 to 5.";
  }

  if (isNum(entry.glucose)) {
    const ctx = raw.glucoseContext || "unsure";
    if (GLUCOSE_CONTEXTS.includes(ctx)) entry.glucoseContext = ctx;
    else errors.glucose = "Glucose context must be fasting, post-meal or unsure.";
  }

  if (raw.symptoms !== undefined) {
    if (!Array.isArray(raw.symptoms)) errors.symptoms = "Symptoms must be a list.";
    else {
      const byRegion = new Map();
      for (const s of raw.symptoms) {
        const severity = Number(s?.severity);
        if (!REGIONS[s?.region] || !Number.isInteger(severity) || severity < 1 || severity > 3) {
          errors.symptoms = "Each symptom needs a known body region and a severity from 1 to 3.";
          break;
        }
        byRegion.set(s.region, { region: s.region, severity, note: String(s.note || "").trim().slice(0, 200) });
      }
      if (!errors.symptoms && byRegion.size) entry.symptoms = [...byRegion.values()];
    }
  }

  if (typeof raw.note === "string" && raw.note.trim()) entry.note = raw.note.trim().slice(0, 500);

  const hasData = Object.keys(FIELD_SPECS).some((k) => isNum(entry[k])) || isNum(entry.mood) || entry.symptoms?.length;
  if (!hasData && !Object.keys(errors).length) errors.form = "Enter at least one measurement, a mood rating or a symptom.";

  return { valid: Object.keys(errors).length === 0, errors, entry };
}

const CORE_FIELDS = ["hr", "sys", "dia", "glucose", "temp", "spo2", "sleepHours", "mood"];
/** Fraction (0..1) of the eight core indicators present in an entry. */
export const completeness = (e = {}) => CORE_FIELDS.filter((k) => isNum(e[k])).length / CORE_FIELDS.length;

/* ------------------------------------------------------------------ *
 * Rules tier for check-ins (same flag shape as engine.evaluateRules)  *
 * ------------------------------------------------------------------ */
const SEV_ORDER = { critical: 0, warning: 1, notice: 2 };

export function evaluateEntry(e = {}) {
  const flags = [];
  const L = ENTRY_LIMITS;
  const add = (id, severity, label, value, limit) => flags.push({ id, severity, label, value, limit, source: "checkin" });

  if (isNum(e.hr)) {
    if (e.hr >= LIMITS.hrRestCritical) add("ci-hr", "critical", "Resting heart rate critically high", e.hr, `≥ ${LIMITS.hrRestCritical} bpm`);
    else if (e.hr >= LIMITS.hrRestWarning) add("ci-hr", "warning", "Resting heart rate above review limit", e.hr, `≥ ${LIMITS.hrRestWarning} bpm`);
    else if (e.hr < L.hrLowWarning) add("ci-hr", "warning", "Resting heart rate unusually low", e.hr, `< ${L.hrLowWarning} bpm`);
  }
  if (isNum(e.spo2)) {
    if (e.spo2 < LIMITS.spo2Critical) add("ci-spo2", "critical", "SpO₂ critically low", e.spo2, `< ${LIMITS.spo2Critical}%`);
    else if (e.spo2 < LIMITS.spo2Warning) add("ci-spo2", "warning", "SpO₂ below review limit", e.spo2, `< ${LIMITS.spo2Warning}%`);
  }
  if (isNum(e.temp)) {
    if (e.temp >= LIMITS.tempCritical) add("ci-temp", "critical", "Body temperature critically high", e.temp, `≥ ${LIMITS.tempCritical}°C`);
    else if (e.temp >= LIMITS.tempWarning) add("ci-temp", "warning", "Body temperature elevated", e.temp, `≥ ${LIMITS.tempWarning}°C`);
    else if (e.temp < L.tempLowCritical) add("ci-temp", "critical", "Body temperature critically low", e.temp, `< ${L.tempLowCritical}°C`);
    else if (e.temp < L.tempLowWarning) add("ci-temp", "warning", "Body temperature low", e.temp, `< ${L.tempLowWarning}°C`);
  }
  if (isNum(e.sys) && isNum(e.dia)) {
    const bp = `${e.sys}/${e.dia}`;
    if (e.sys >= L.sysCritical || e.dia >= L.diaCritical) add("ci-bp", "critical", "Blood pressure critically high", bp, `≥ ${L.sysCritical}/${L.diaCritical} mmHg`);
    else if (e.sys < L.sysLowCritical) add("ci-bp", "critical", "Blood pressure critically low", bp, `systolic < ${L.sysLowCritical} mmHg`);
    else if (e.sys >= L.sysWarning || e.dia >= L.diaWarning) add("ci-bp", "warning", "Blood pressure elevated", bp, `≥ ${L.sysWarning}/${L.diaWarning} mmHg`);
    else if (e.sys < L.sysLowWarning || e.dia < L.diaLowWarning) add("ci-bp", "warning", "Blood pressure low", bp, `< ${L.sysLowWarning}/${L.diaLowWarning} mmHg`);
  }
  if (isNum(e.glucose)) {
    const high = L.glucoseHigh[e.glucoseContext] ?? L.glucoseHigh.unsure;
    if (e.glucose < L.glucoseLowCritical) add("ci-glucose", "critical", "Blood glucose critically low", e.glucose, `< ${L.glucoseLowCritical} mg/dL`);
    else if (e.glucose >= L.glucoseCritical) add("ci-glucose", "critical", "Blood glucose critically high", e.glucose, `≥ ${L.glucoseCritical} mg/dL`);
    else if (e.glucose < L.glucoseLowWarning) add("ci-glucose", "warning", "Blood glucose low", e.glucose, `< ${L.glucoseLowWarning} mg/dL`);
    else if (e.glucose >= high) add("ci-glucose", "warning", `Blood glucose high (${e.glucoseContext || "unsure"})`, e.glucose, `≥ ${high} mg/dL`);
  }
  if (isNum(e.sleepHours)) {
    if (e.sleepHours < L.sleepWarning) add("ci-sleep", "warning", "Very short sleep last night", e.sleepHours, `< ${L.sleepWarning} h`);
    else if (e.sleepHours < SHORT_SLEEP_HOURS) add("ci-sleep", "notice", "Short sleep last night", e.sleepHours, `< ${SHORT_SLEEP_HOURS} h`);
  }
  if (isNum(e.mood) && e.mood <= L.moodWarning) add("ci-mood", "warning", "Low mood reported", e.mood, `≤ ${L.moodWarning} of 5`);
  if (isNum(e.exerciseMin) && e.exerciseMin === 0) add("ci-exercise", "notice", "No exercise logged for this check-in period", 0, "> 0 min");

  for (const s of e.symptoms || []) {
    const name = `${SEVERITY_LABELS[s.severity]} symptom: ${REGIONS[s.region]}`;
    const urgentRegion = s.region === "chest" || s.region === "head";
    if (s.severity === 3 && urgentRegion) add(`ci-symptom-${s.region}`, "critical", name, s.severity, "severity 3 in chest/head");
    else if (s.severity === 3 || s.region === "eyes") add(`ci-symptom-${s.region}`, "warning", name, s.severity, s.region === "eyes" ? "any vision change" : "severity 3");
    else add(`ci-symptom-${s.region}`, "notice", name, s.severity, "logged");
  }
  return flags.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}

/* ------------------------------------------------------------------ *
 * Multi-day trends                                                    *
 * ------------------------------------------------------------------ */
const median = (arr) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

export const TREND_METRICS = [
  { key: "sleepHours", label: "Sleep", unit: "h", bad: "low", minSpread: 0.75 },
  { key: "mood", label: "Mood", unit: "/5", bad: "low", minSpread: 0.5 },
  { key: "hr", label: "Resting heart rate", unit: "bpm", bad: "high", minSpread: 2.5 },
  { key: "sys", label: "Systolic BP", unit: "mmHg", bad: "high", minSpread: 5 },
  { key: "temp", label: "Body temperature", unit: "°C", bad: "high", minSpread: 0.3 },
  { key: "exerciseMin", label: "Exercise", unit: "min", bad: "low", minSpread: 10 }
];

export const byTime = (entries) => [...entries].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
export const seriesOf = (entries, key) => byTime(entries).filter((e) => isNum(e[key])).map((e) => ({ at: e.at, value: e[key] }));

/**
 * Compare the last 3 values with the earlier personal baseline (median + MAD, robust to outliers).
 * Needs >= 8 values per metric. Returns one summary per metric; `flagged` is true when the recent
 * mean is >= 2 robust spreads away from baseline in the unfavourable direction.
 */
export function analyzeTrends(entries = []) {
  const out = [];
  for (const m of TREND_METRICS) {
    const values = seriesOf(entries, m.key).map((p) => p.value);
    if (values.length < 8) { out.push({ ...m, ready: false, n: values.length, flagged: false }); continue; }
    const base = values.slice(0, -3);
    const recent = values.slice(-3);
    const med = median(base);
    const spread = Math.max(1.4826 * median(base.map((v) => Math.abs(v - med))), m.minSpread);
    const delta = mean(recent) - med;
    const z = delta / spread;
    const flagged = m.bad === "low" ? z <= -2 : z >= 2;
    out.push({ ...m, ready: true, n: values.length, baseline: med, recent: mean(recent), delta, z, flagged });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Guidance (rules-based, conservative, never a diagnosis)             *
 * ------------------------------------------------------------------ */
const EMERGENCY = "Stop routine activity. Follow the mission-approved emergency medical procedure and contact the designated medical authority now.";
const REPORT = "If it persists or worsens, contact the flight surgeon / designated medical authority.";

const GUIDE = {
  "ci-bp-high": { hazard: "gravity", title: "Blood pressure above review limit", steps: ["Rest quietly for 5 minutes, arm relaxed and supported, then re-measure and log the second reading.", "Avoid caffeine and hard exercise for 30 minutes before measuring.", "Check your hydration log and drink if you are behind.", "Report it to the medical authority if the repeat reading is still high, or if you also have headache, vision change or chest discomfort."] },
  "ci-bp-low": { hazard: "gravity", title: "Blood pressure below review limit", steps: ["Re-measure after 5 minutes of rest and log both readings.", "Move slowly and secure yourself before standing up or changing position.", "Check hydration and recent food intake.", "Report it if you feel faint, dizzy or the reading stays low."] },
  "ci-glucose-high": { hazard: "environment", title: "Blood glucose above review limit", steps: ["Repeat the measurement and note whether you were fasting or had just eaten.", "Review your recent meals and fluid intake.", "Log the repeat reading.", "Report it if the repeat stays high or you have unusual thirst, nausea or fatigue."] },
  "ci-glucose-low": { hazard: "environment", title: "Blood glucose below review limit", steps: ["Repeat the measurement to confirm.", "Follow your crew medical kit instructions for low glucose.", "Re-check after treatment and log it.", "Report it, especially if you feel shaky, confused or sweaty."] },
  "ci-temp": { hazard: "environment", title: "Body temperature outside review range", steps: ["Re-measure with the same device after a few minutes.", "Check suit, clothing and cabin temperature.", "Log any other symptoms (chills, aches, cough).", "Report it if the repeat reading is still outside range."] },
  "ci-hr": { hazard: "gravity", title: "Resting heart rate outside review range", steps: ["Sit or float calmly for 5 minutes, then re-measure.", "Note caffeine, exercise, stress or poor sleep in your check-in note.", "Check the wearable signal quality in Crew Health before trusting an optical reading.", "Report it if the repeat reading is still outside range or you feel palpitations."] },
  "ci-spo2": { hazard: "environment", title: "Oxygen saturation below review limit", steps: ["Re-measure with a warm, still finger and good contact.", "Check the cabin CO₂ / air-quality readings.", "Report it promptly if the repeat reading is still low or you feel short of breath."] },
  "ci-sleep": { hazard: "isolation", title: "Short sleep", steps: ["Protect your next sleep period: dim lights, reduce noise, keep your sleep schedule.", "Avoid caffeine late in your day.", "Flag fatigue to the crew before safety-critical tasks.", "Report it if short sleep continues for several nights."] },
  "ci-mood": { hazard: "isolation", title: "Low mood", steps: ["Talk to a crewmate you trust, or schedule a private call with family or the behavioural-health support channel.", "Keep your exercise and daylight-simulation routine.", "Log what is weighing on you in the note field.", "If you have thoughts of harming yourself, contact the designated medical authority immediately."] },
  "ci-symptom-eyes": { hazard: "gravity", title: "Vision change reported", steps: ["Note when it started and whether it affects one or both eyes.", "Vision changes are monitored on long missions (SANS). Do not wait for it to resolve.", "Report it to the flight surgeon at your next contact and log daily."] },
  "ci-symptom-head": { hazard: "environment", title: "Head symptom reported", steps: ["Check cabin CO₂ and air quality right away.", "Note timing, severity and anything that changed (exercise, sleep, food).", REPORT] },
  "ci-symptom-chest": { hazard: "gravity", title: "Chest symptom reported", steps: ["Stop strenuous activity and rest.", REPORT] },
  "ci-symptom-generic": { hazard: "gravity", title: "Symptom logged", steps: ["Note timing, severity and anything that changed.", "Re-check this region at your next check-in.", REPORT] },
  "ci-exercise": { hazard: "gravity", title: "Exercise countermeasure missed", steps: ["Resistance and aerobic exercise slow bone and muscle loss in microgravity.", "Fit in your prescribed session as soon as the schedule allows.", "Log the minutes so the trend stays accurate."] }
};

const TREND_GUIDE = {
  sleepHours: { hazard: "isolation", title: "Sleep is trending down", steps: ["Your recent sleep is well below your own baseline.", "Review light, noise, workload and caffeine; protect the next sleep period.", "Consider raising it with the crew surgeon before it affects performance."] },
  mood: { hazard: "isolation", title: "Mood is trending down", steps: ["Your recent mood is well below your own baseline.", "Schedule contact with family or the behavioural-health support channel.", "Keep routines that help: exercise, sleep schedule, shared meals."] },
  hr: { hazard: "gravity", title: "Resting heart rate is trending up", steps: ["Your recent resting heart rate is above your own baseline.", "Common contributors include poor sleep, dehydration and stress. Check your log for those.", "Report it if the trend continues or you feel unwell."] },
  sys: { hazard: "gravity", title: "Blood pressure is trending up", steps: ["Your recent systolic readings are above your own baseline.", "Re-measure under the same conditions each day for a fair comparison.", "Report it if the trend continues."] },
  temp: { hazard: "environment", title: "Body temperature is trending up", steps: ["Recent temperatures are above your own baseline.", "Check cabin temperature and note any symptoms.", "Report it if the trend continues."] },
  exerciseMin: { hazard: "gravity", title: "Exercise has dropped", steps: ["Your recent exercise minutes are well below your own baseline.", "Countermeasure exercise helps protect bones, muscles and the heart in microgravity.", "Rebuild the routine this week and log it."] }
};

function guideFor(flag) {
  if (flag.id === "ci-bp") return flag.label.includes("low") ? GUIDE["ci-bp-low"] : GUIDE["ci-bp-high"];
  if (flag.id === "ci-glucose") return flag.label.includes("low") ? GUIDE["ci-glucose-low"] : GUIDE["ci-glucose-high"];
  if (GUIDE[flag.id]) return GUIDE[flag.id];
  if (flag.id.startsWith("ci-symptom-")) return GUIDE["ci-symptom-generic"];
  return null;
}

/**
 * Build ordered guidance from check-in flags and trends.
 * Returns [{ id, tone: "urgent" | "review" | "info", title, hazard, steps, because }].
 */
export function buildGuidance({ flags = [], trends = [] } = {}) {
  const items = [];
  const seen = new Set();
  const push = (item) => { if (!seen.has(item.id)) { seen.add(item.id); items.push(item); } };

  const critical = flags.filter((f) => f.severity === "critical");
  if (critical.length) {
    push({ id: "emergency", tone: "urgent", title: "Critical value — escalate", hazard: null, steps: [EMERGENCY], because: critical.map((f) => `${f.label} (${f.value})`).join("; ") });
  }
  for (const f of flags) {
    if (f.severity === "critical") continue;
    const g = guideFor(f);
    if (!g) continue;
    push({ id: `${g.title}`, tone: f.severity === "warning" ? "review" : "info", title: g.title, hazard: g.hazard, steps: g.steps, because: `${f.label} (${f.value}; limit ${f.limit})` });
  }
  for (const t of trends.filter((x) => x.flagged)) {
    const g = TREND_GUIDE[t.key];
    push({ id: `trend-${t.key}`, tone: "review", title: g.title, hazard: g.hazard, steps: g.steps, because: `Recent ${t.recent.toFixed(1)} ${t.unit} vs your baseline ${t.baseline.toFixed(1)} ${t.unit} (z = ${t.z.toFixed(1)})` });
  }
  if (!items.length) {
    push({ id: "all-clear", tone: "info", title: "Nothing flagged", hazard: null, steps: ["Keep logging each day: consistent data is what makes real changes stand out.", "Keep your exercise, sleep and hydration routines."], because: "No rule or trend threshold was crossed." });
  }
  const order = { urgent: 0, review: 1, info: 2 };
  return items.sort((a, b) => order[a.tone] - order[b.tone]);
}

/* ------------------------------------------------------------------ *
 * Gamification (rewards CONSISTENCY, never particular health values)  *
 * ------------------------------------------------------------------ */
const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const nextDay = (key) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + 1); return dayKey(d); };

export function computeStreak(entries = [], now = new Date()) {
  const days = [...new Set(entries.map((e) => dayKey(e.at)))].sort();
  let longest = 0, run = 0, prev = null;
  for (const k of days) { run = prev && nextDay(prev) === k ? run + 1 : 1; longest = Math.max(longest, run); prev = k; }
  const set = new Set(days);
  const cursor = new Date(now);
  const todayDone = set.has(dayKey(cursor));
  if (!todayDone) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (set.has(dayKey(cursor))) { current += 1; cursor.setDate(cursor.getDate() - 1); }
  return { current, longest, todayDone, totalDays: days.length };
}

const distinctDays = (entries, pred) => new Set(entries.filter(pred).map((e) => dayKey(e.at))).size;

export function computeBadges(entries = [], now = new Date()) {
  const { longest } = computeStreak(entries, now);
  return [
    { id: "first", label: "First check-in", desc: "Log your first entry.", earned: entries.length >= 1 },
    { id: "streak3", label: "3-day streak", desc: "Check in 3 days in a row.", earned: longest >= 3 },
    { id: "streak7", label: "7-day streak", desc: "Check in 7 days in a row.", earned: longest >= 7 },
    { id: "complete", label: "Full set", desc: "Log all 8 core indicators in one check-in.", earned: entries.some((e) => completeness(e) === 1) },
    { id: "wellbeing", label: "Wellbeing watch", desc: "Log your mood on 5 different days.", earned: distinctDays(entries, (e) => isNum(e.mood)) >= 5 },
    { id: "countermeasure", label: "Countermeasure keeper", desc: "Log exercise on 5 different days.", earned: distinctDays(entries, (e) => isNum(e.exerciseMin) && e.exerciseMin > 0) >= 5 }
  ];
}

/* ------------------------------------------------------------------ *
 * Reminders (derived from the log, so they work fully offline)        *
 * ------------------------------------------------------------------ */
const DAY_MS = 864e5;

export function dueReminders(entries = [], now = Date.now()) {
  const sorted = byTime(entries);
  const latest = sorted[sorted.length - 1];
  const age = (e) => (e ? now - Date.parse(e.at) : Infinity);
  const out = [];
  if (!latest || age(latest) >= DAY_MS) {
    out.push({ id: "checkin", label: "Daily health check-in is due", detail: latest ? `Last check-in ${Math.floor(age(latest) / 36e5)} h ago.` : "No check-in recorded yet." });
    return out;
  }
  const lastMood = [...sorted].reverse().find((e) => isNum(e.mood));
  if (age(lastMood) >= DAY_MS) out.push({ id: "mood", label: "Mood check-in is due", detail: "No mood rating in the last 24 h." });
  const lastExercise = [...sorted].reverse().find((e) => isNum(e.exerciseMin) && e.exerciseMin > 0);
  if (age(lastExercise) >= DAY_MS) out.push({ id: "exercise", label: "Exercise countermeasure not logged", detail: "No exercise minutes logged in the last 24 h." });
  return out;
}

/* ------------------------------------------------------------------ *
 * Coverage of NASA's five human-spaceflight hazards                   *
 * ------------------------------------------------------------------ */
export function hazardCoverage(entries = [], { co2, now = Date.now() } = {}) {
  const sorted = byTime(entries);
  const last7 = sorted.filter((e) => now - Date.parse(e.at) <= 7 * DAY_MS);
  const trends = analyzeTrends(entries);
  const flagged = (k) => trends.find((t) => t.key === k)?.flagged;

  const rad = last7.filter((e) => isNum(e.radiationMsv));
  const radTotal = rad.reduce((a, e) => a + e.radiationMsv, 0);
  const latestMood = [...sorted].reverse().find((e) => isNum(e.mood));
  const moodFresh = latestMood && now - Date.parse(latestMood.at) <= 2 * DAY_MS;
  const ex = last7.filter((e) => isNum(e.exerciseMin));
  const exAvg = ex.length ? mean(ex.map((e) => e.exerciseMin)) : null;

  return [
    { id: "radiation", label: "Space radiation", status: rad.length ? "ok" : "nodata",
      detail: rad.length ? `${radTotal.toFixed(2)} mSv logged over the last 7 days (${rad.length} entr${rad.length === 1 ? "y" : "ies"}); cumulative record kept` : "No dose logged yet. Enter dosimeter readings in the check-in." },
    { id: "isolation", label: "Isolation & confinement", status: !moodFresh ? "nodata" : (latestMood.mood <= 2 || flagged("mood") || flagged("sleepHours")) ? "watch" : "ok",
      detail: moodFresh ? `Latest mood ${latestMood.mood}/5${flagged("mood") ? ", trending down" : ""}${flagged("sleepHours") ? "; sleep trending down" : ""}` : "No recent mood rating." },
    { id: "distance", label: "Distance from Earth", status: "ok",
      detail: "Engine, records, guidance and SBAR handoff all run locally with no link to Earth." },
    { id: "gravity", label: "Altered gravity", status: exAvg === null ? "nodata" : (flagged("exerciseMin") || flagged("hr") || flagged("sys")) ? "watch" : "ok",
      detail: exAvg === null ? "No exercise logged yet." : `Exercise averaging ${Math.round(exAvg)} min per logged day (last 7 days)${flagged("exerciseMin") ? "; dropped vs baseline" : ""}` },
    { id: "environment", label: "Hostile / closed environment", status: !isNum(co2) ? "nodata" : co2 >= 1000 ? "watch" : "ok",
      detail: isNum(co2) ? `Cabin CO₂ ${co2} ppm${co2 >= 1000 ? " (above demo threshold)" : ""}; recorded alongside personal data` : "No cabin measurement available." }
  ];
}

/* ------------------------------------------------------------------ *
 * Engine bridge: what crew-entered data can answer at zero crew time  *
 * ------------------------------------------------------------------ */
/** Fields merged into a scenario snapshot so engine.autoResults can answer "mood" and "symptoms" checks. */
export function engineEvidence(entry, now = Date.now(), maxAgeMs = DAY_MS) {
  if (!entry || now - Date.parse(entry.at) > maxAgeMs) return {};
  const out = {};
  if (isNum(entry.mood)) out.moodScore = entry.mood;
  const reported = (entry.symptoms || []).length;
  if (reported > 0) out.symptomCount = reported; // absence of input is not evidence
  return out;
}

export function summarizeEntry(e) {
  if (!e) return "";
  const parts = [];
  if (isNum(e.hr)) parts.push(`HR ${e.hr} bpm`);
  if (isNum(e.sys) && isNum(e.dia)) parts.push(`BP ${e.sys}/${e.dia} mmHg`);
  if (isNum(e.glucose)) parts.push(`glucose ${e.glucose} mg/dL${e.glucoseContext && e.glucoseContext !== "unsure" ? ` (${e.glucoseContext === "postMeal" ? "post-meal" : e.glucoseContext})` : ""}`);
  if (isNum(e.temp)) parts.push(`temp ${e.temp}°C`);
  if (isNum(e.spo2)) parts.push(`SpO₂ ${e.spo2}%`);
  if (isNum(e.sleepHours)) parts.push(`sleep ${e.sleepHours} h`);
  if (isNum(e.mood)) parts.push(`mood ${e.mood}/5 (${MOOD_LABELS[e.mood - 1]})`);
  if (isNum(e.exerciseMin)) parts.push(`exercise ${e.exerciseMin} min`);
  if (isNum(e.radiationMsv)) parts.push(`dose ${e.radiationMsv} mSv`);
  if (e.symptoms?.length) parts.push(`symptoms: ${e.symptoms.map((s) => `${REGIONS[s.region]} (${SEVERITY_LABELS[s.severity].toLowerCase()})`).join(", ")}`);
  return parts.join(", ");
}

/* ------------------------------------------------------------------ *
 * Synthetic 14-day history for demos (clearly marked synthetic)       *
 * ------------------------------------------------------------------ */
/** Deterministic: same output every call, so demos and tests are reproducible. */
export function demoHistory(now = Date.now()) {
  const jitter = (i, k, amp) => Math.sin(i * 12.9898 + k * 78.233) * amp;
  const days = 14;
  const out = [];
  for (let i = 0; i < days; i++) {
    const late = Math.max(0, i - 10); // last four days: developing strain scenario
    const e = {
      id: `demo-${i}`,
      at: new Date(now - (days - 1 - i) * DAY_MS - 60e3).toISOString(),
      source: "demo",
      hr: Math.round(64 + jitter(i, 1, 1.5) + late * 2.4),
      sys: Math.round(118 + jitter(i, 2, 3) + late * 3),
      dia: Math.round(76 + jitter(i, 3, 2) + late),
      glucose: Math.round(91 + jitter(i, 4, 4)), glucoseContext: "fasting",
      temp: Math.round((36.7 + jitter(i, 5, 0.12)) * 10) / 10,
      spo2: Math.round(97.5 + jitter(i, 6, 0.6)),
      sleepHours: Math.round((7.4 + jitter(i, 7, 0.3) - late * 0.75) * 10) / 10,
      mood: late ? Math.max(2, 4 - Math.ceil(late / 2)) : (i % 3 === 0 ? 3 : 4),
      exerciseMin: late ? Math.max(0, 120 - late * 30) : Math.round(110 + jitter(i, 8, 10)),
      radiationMsv: Math.round((0.4 + jitter(i, 9, 0.04)) * 100) / 100
    };
    if (i === days - 1) e.symptoms = [{ region: "eyes", severity: 1, note: "Slight blur when reading small text" }];
    out.push(e);
  }
  return out;
}
