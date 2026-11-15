export const HYPOTHESES = [
  "sleepDebt", "spaceWeather", "cabinCO2", "dehydration",
  "psychologicalStrain", "exertion", "sensorError", "other"
];

export const LABELS = {
  sleepDebt: "Sleep Debt",
  spaceWeather: "Space Weather Impact",
  cabinCO2: "Cabin CO₂",
  dehydration: "Dehydration / Fluid Shift",
  psychologicalStrain: "Psychological Strain",
  exertion: "Recent Exertion / Workload",
  sensorError: "Sensor Error",
  other: "Other / Unexplained"
};

// Illustrative demo likelihoods only. Not clinically calibrated.
export const CHECKS = [
  {
    id: "remeasure", label: "Repeat the measurement", duration: 1,
    reason: "A second reading helps separate a real change from a sensor or measurement issue.",
    likelihood: { exertion: .35, sleepDebt: .90, spaceWeather: .90, cabinCO2: .90, dehydration: .90, psychologicalStrain: .90, sensorError: .10, other: .85 }
  },
  {
    id: "co2", label: "Cabin CO₂ reading", duration: 1,
    reason: "A direct cabin reading can quickly test whether elevated CO₂ is a relevant environmental factor.",
    likelihood: { exertion: .10, sleepDebt: .10, spaceWeather: .10, cabinCO2: .90, dehydration: .10, psychologicalStrain: .10, sensorError: .10, other: .15 }
  },
  {
    id: "pvt", label: "Brief reaction-time test", duration: 3,
    reason: "A short performance check can add evidence about fatigue-related impairment.",
    likelihood: { exertion: .30, sleepDebt: .85, spaceWeather: .45, cabinCO2: .50, dehydration: .35, psychologicalStrain: .55, sensorError: .10, other: .50 }
  },
  {
    id: "hydration", label: "Hydration check", duration: 2,
    reason: "A quick fluid-intake and symptom review can test a hydration-related contributor.",
    likelihood: { exertion: .35, sleepDebt: .20, spaceWeather: .20, cabinCO2: .20, dehydration: .85, psychologicalStrain: .20, sensorError: .10, other: .30 }
  },
  {
    id: "mood", label: "Mood and stress check-in", duration: 1,
    reason: "A brief private check-in can add context about psychological strain.",
    likelihood: { exertion: .25, sleepDebt: .50, spaceWeather: .50, cabinCO2: .25, dehydration: .20, psychologicalStrain: .90, sensorError: .15, other: .40 }
  },
  {
    id: "symptoms", label: "Symptom checklist", duration: 1,
    reason: "A structured symptom review can identify patterns that require a different response.",
    likelihood: { exertion: .25, sleepDebt: .30, spaceWeather: .35, cabinCO2: .80, dehydration: .50, psychologicalStrain: .35, sensorError: .05, other: .50 }
  }
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalize = (values) => {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  if (!total) return Object.fromEntries(HYPOTHESES.map((key) => [key, 1 / HYPOTHESES.length]));
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value / total]));
};

export function buildPriors(context = {}) {
  const priors = {
    sleepDebt: .18, spaceWeather: .16, cabinCO2: .10, dehydration: .12,
    psychologicalStrain: .12, exertion: .08, sensorError: .12, other: .20
  };
  if (context.spaceWeatherRecent) priors.spaceWeather *= 3;
  if ((context.shortSleepNights || 0) >= 3) priors.sleepDebt *= 3;
  if (context.elevatedCO2) priors.cabinCO2 *= 4;
  if (context.activityHigh) priors.exertion *= 5;
  // Wearable signal-quality index (0..1): poor contact/motion makes a sensor artefact more plausible.
  if (typeof context.sqi === "number") priors.sensorError = .03 + .55 * (1 - clamp(context.sqi, 0, 1));
  // Keep an explicit unexplained category so the model cannot force a neat answer.
  priors.other = Math.max(priors.other, .08);
  return normalize(priors);
}

export function entropy(distribution) {
  return -Object.values(distribution).reduce((sum, p) => p > 0 ? sum + p * Math.log2(p) : sum, 0);
}

export function updatePosterior(prior, check, result) {
  const abnormal = String(result).toLowerCase() === "abnormal";
  const weighted = {};
  for (const hypothesis of HYPOTHESES) {
    const pAbnormal = clamp(check.likelihood[hypothesis] ?? .5, .001, .999);
    weighted[hypothesis] = prior[hypothesis] * (abnormal ? pAbnormal : 1 - pAbnormal);
  }
  return normalize(weighted);
}

export function expectedInformationGain(prior, check) {
  let expectedEntropy = 0;
  for (const outcome of ["abnormal", "normal"]) {
    const probability = HYPOTHESES.reduce((sum, h) => {
      const p = check.likelihood[h] ?? .5;
      return sum + prior[h] * (outcome === "abnormal" ? p : 1 - p);
    }, 0);
    const unnormalized = {};
    for (const h of HYPOTHESES) {
      const p = check.likelihood[h] ?? .5;
      unnormalized[h] = prior[h] * (outcome === "abnormal" ? p : 1 - p);
    }
    const posterior = normalize(unnormalized);
    expectedEntropy += probability * entropy(posterior);
  }
  return Math.max(0, entropy(prior) - expectedEntropy);
}

export function chooseNextCheck(posterior, usedChecks = [], context = {}) {
  if (context.elevatedCO2 && !usedChecks.includes("co2")) {
    const co2 = CHECKS.find((check) => check.id === "co2");
    return { ...co2, informationGain: expectedInformationGain(posterior, co2), score: expectedInformationGain(posterior, co2) / co2.duration, mandatory: true };
  }
  const available = CHECKS.filter((check) => !usedChecks.includes(check.id));
  if (!available.length) return null;
  const ranked = available.map((check) => {
    const gain = expectedInformationGain(posterior, check);
    return { ...check, informationGain: gain, score: gain / check.duration, mandatory: false };
  }).sort((a, b) => b.score - a.score);
  return ranked[0];
}

export function validateMeasurement(value, min = 20, max = 250) {
  const numeric = typeof value === "number" || (typeof value === "string" && value.trim() !== "") ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return { valid: false, reason: "Value must be numeric." };
  if (numeric < min || numeric > max) return { valid: false, reason: "Value is outside the configured plausible range; verify the sensor." };
  return { valid: true, value: numeric };
}

/* ------------------------------------------------------------------ *
 * Measurement-driven context (demo thresholds, NOT clinical limits).  *
 * ------------------------------------------------------------------ */
export const CO2_ELEVATED_PPM = 1000;          // configurable demo cabin threshold
export const SHORT_SLEEP_HOURS = 6;

export const LIMITS = {
  spo2Warning: 95, spo2Critical: 90,
  hrRestWarning: 100, hrRestCritical: 130,
  tempWarning: 38.0, tempCritical: 39.0,       // absolute core-style temperature
  tempDeltaWarning: 1.5, tempDeltaCritical: 2.5, // skin temperature vs personal baseline
  co2Critical: 3000
};

/** Turn raw measurements into the context flags the Bayesian engine uses. */
export function deriveContext(m = {}) {
  const c = {};
  if (typeof m.co2 === "number") c.elevatedCO2 = m.co2 >= CO2_ELEVATED_PPM;
  if (typeof m.spaceWeatherHoursAgo === "number") c.spaceWeatherRecent = m.spaceWeatherHoursAgo <= 48;
  if (Array.isArray(m.sleepHistory)) {
    let n = 0; // consecutive most-recent short nights
    for (let i = m.sleepHistory.length - 1; i >= 0 && m.sleepHistory[i] < SHORT_SLEEP_HOURS; i--) n++;
    c.shortSleepNights = n;
  }
  if (typeof m.activity === "number") c.activityHigh = m.activity >= .5;
  if (typeof m.sqi === "number") c.sqi = m.sqi;
  return c;
}

/** Declared context in the scenario, overridden by anything derivable from measurements. */
export function resolveContext(scenario = {}) {
  return { ...(scenario.context || {}), ...deriveContext(scenario) };
}

/**
 * Rules-first safety tier. Runs BEFORE and independently of the probabilistic model.
 * Severity: critical (escalate now) > warning (review) > notice (data quality).
 * Optical readings (HR/SpO2) are capped at "warning" when signal quality is poor.
 */
export function evaluateRules(m = {}) {
  const flags = [];
  const lowQuality = typeof m.sqi === "number" && m.sqi < .5;
  const cap = (sev) => (lowQuality && sev === "critical" ? "warning" : sev);
  const add = (id, severity, label, value, limit, optical = false) =>
    flags.push({ id, severity: optical ? cap(severity) : severity, label: optical && lowQuality ? `${label} (unverified: poor signal quality)` : label, value, limit });

  if (lowQuality) flags.push({ id: "signalQuality", severity: "notice", label: "Optical sensor signal quality is poor — verify contact before trusting HR/SpO₂", value: m.sqi, limit: .5 });
  if (typeof m.spo2 === "number") {
    if (m.spo2 < LIMITS.spo2Critical) add("spo2", "critical", "SpO₂ critically low", m.spo2, LIMITS.spo2Critical, true);
    else if (m.spo2 < LIMITS.spo2Warning) add("spo2", "warning", "SpO₂ below review limit", m.spo2, LIMITS.spo2Warning, true);
  }
  if (typeof m.heartRate === "number" && !(typeof m.activity === "number" && m.activity >= .5)) {
    if (m.heartRate >= LIMITS.hrRestCritical) add("heartRate", "critical", "Resting heart rate critically high", m.heartRate, LIMITS.hrRestCritical, true);
    else if (m.heartRate >= LIMITS.hrRestWarning) add("heartRate", "warning", "Resting heart rate above review limit", m.heartRate, LIMITS.hrRestWarning, true);
  }
  if (typeof m.temperature === "number") {
    const delta = typeof m.temperatureBaseline === "number" ? m.temperature - m.temperatureBaseline : null;
    const crit = delta !== null ? delta >= LIMITS.tempDeltaCritical : m.temperature >= LIMITS.tempCritical;
    const warn = delta !== null ? delta >= LIMITS.tempDeltaWarning : m.temperature >= LIMITS.tempWarning;
    if (crit) add("temperature", "critical", "Temperature critically elevated", m.temperature, delta !== null ? `+${LIMITS.tempDeltaCritical}°C vs baseline` : LIMITS.tempCritical);
    else if (warn) add("temperature", "warning", "Temperature elevated", m.temperature, delta !== null ? `+${LIMITS.tempDeltaWarning}°C vs baseline` : LIMITS.tempWarning);
  }
  if (typeof m.co2 === "number" && m.co2 >= LIMITS.co2Critical) add("co2", "critical", "Cabin CO₂ critically high", m.co2, LIMITS.co2Critical);
  const order = { critical: 0, warning: 1, notice: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Checks that a sensor can answer without crew time (cost 0). */
export function autoResults(m = {}) {
  const out = {};
  if (typeof m.co2 === "number") out.co2 = m.co2 >= CO2_ELEVATED_PPM ? "abnormal" : "normal";
  if (typeof m.persistentDeviation === "boolean") out.remeasure = m.persistentDeviation ? "abnormal" : "normal";
  // Fresh crew check-in (see vitals.engineEvidence). Used as EVIDENCE here, never also as a prior,
  // so one observation is not counted twice.
  if (typeof m.moodScore === "number") out.mood = m.moodScore <= 2 ? "abnormal" : "normal";
  // Only a REPORTED symptom answers the check. "No symptom typed" is absence of input, not evidence of "normal".
  if (typeof m.symptomCount === "number" && m.symptomCount > 0) out.symptoms = "abnormal";
  return out;
}

export function shouldStop(posterior, checkCount, redFlag = false) {
  if (redFlag || checkCount >= 5) return true;
  const ranked = Object.values(posterior).sort((a, b) => b - a);
  return ranked[0] >= .55 && ranked[0] >= 1.5 * (ranked[1] || 0);
}

const usedIds = (inv) => [...inv.checks.map((c) => c.checkId), ...(inv.skipped || [])];
const countedChecks = (checks) => checks.length;

function applyCheck(investigation, check, result, context, source = "crew") {
  const normalized = String(result).toLowerCase();
  const posterior = updatePosterior(investigation.posterior, check, normalized);
  const checks = [...investigation.checks, {
    checkId: check.id, label: check.label, result: normalized, duration: source === "sensor" ? 0 : check.duration,
    source, recordedAt: new Date().toISOString()
  }];
  const complete = shouldStop(posterior, countedChecks(checks), investigation.redFlag);
  const skipped = investigation.skipped || [];
  const nextCheck = complete ? null : chooseNextCheck(posterior, [...checks.map((c) => c.checkId), ...skipped], context);
  const reasoning = investigation.reasoning.filter((r) => r.done !== false);
  reasoning.push({ label: `${check.label}: ${normalized}${source === "sensor" ? " (answered by sensor)" : ""}`, done: true });
  if (nextCheck) reasoning.push({ label: `Selected next check: ${nextCheck.label}`, done: false });
  return { ...investigation, posterior, checks, reasoning, nextCheck, complete, status: complete ? "complete" : "investigating" };
}

/** Apply every consecutive recommended check that a sensor can answer on its own. */
export function applyAutoChecks(investigation, measurements = {}, context = {}) {
  const auto = autoResults(measurements);
  let inv = investigation;
  while (inv.nextCheck && auto[inv.nextCheck.id]) {
    inv = applyCheck(inv, CHECKS.find((c) => c.id === inv.nextCheck.id), auto[inv.nextCheck.id], context, "sensor");
  }
  return inv;
}

export function createInvestigation(scenario) {
  const context = resolveContext(scenario);
  const flags = evaluateRules(scenario);
  const redFlag = flags.some((f) => f.severity === "critical");
  const posterior = buildPriors(context);
  const nextCheck = redFlag ? null : chooseNextCheck(posterior, [], context);
  const reasoning = [
    ...(scenario.observations || []).map((label) => ({ label, done: true })),
    ...flags.filter((f) => f.severity !== "notice").map((f) => ({ label: `Safety rule: ${f.label}`, done: true }))
  ];
  if (redFlag) reasoning.push({ label: "Critical safety rule triggered — routine investigation stopped; follow mission emergency procedure", done: true });
  else if (nextCheck) reasoning.push({ label: `Selected next check: ${nextCheck.label}`, done: false });
  const base = {
    id: `astravitals-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scenarioId: scenario.id,
    createdAt: new Date().toISOString(),
    posterior, prior: posterior, checks: [], skipped: [], flags, redFlag,
    reasoning, nextCheck,
    complete: redFlag,
    status: redFlag ? "escalate" : "investigating"
  };
  return redFlag ? base : applyAutoChecks(base, scenario, context);
}

export function recordCheck(investigation, checkId, result, context = {}, measurements = null) {
  const check = CHECKS.find((item) => item.id === checkId);
  if (!check) throw new Error("Unknown check.");
  if (investigation.complete) throw new Error("Investigation is already complete.");
  if (investigation.checks.some((item) => item.checkId === checkId)) throw new Error("This check has already been recorded.");
  if (!["normal", "abnormal"].includes(String(result).toLowerCase())) throw new Error("Result must be normal or abnormal.");
  if (investigation.nextCheck?.id !== checkId) throw new Error("Submit the currently recommended next check.");
  const updated = applyCheck(investigation, check, result, context, "crew");
  return measurements && !updated.complete ? applyAutoChecks(updated, measurements, context) : updated;
}

/** Crew cannot perform the recommended check (no equipment/time): re-rank without it. */
export function skipCheck(investigation, checkId, context = {}) {
  if (investigation.complete) throw new Error("Investigation is already complete.");
  if (investigation.nextCheck?.id !== checkId) throw new Error("Only the currently recommended check can be skipped.");
  if (investigation.nextCheck.mandatory) throw new Error("A safety-priority check cannot be skipped.");
  const skipped = [...(investigation.skipped || []), checkId];
  const nextCheck = chooseNextCheck(investigation.posterior, [...investigation.checks.map((c) => c.checkId), ...skipped], context);
  const reasoning = investigation.reasoning.filter((r) => r.done !== false);
  reasoning.push({ label: `${CHECKS.find((c) => c.id === checkId).label}: skipped (unavailable)`, done: true });
  if (nextCheck) reasoning.push({ label: `Selected next check: ${nextCheck.label}`, done: false });
  return { ...investigation, skipped, nextCheck, reasoning, complete: !nextCheck, status: nextCheck ? "investigating" : "complete" };
}

/** A critical safety rule fired while an investigation was already running: stop routine checks and escalate. */
export function escalateInvestigation(investigation, flags = []) {
  if (investigation.status === "escalate") return investigation;
  const critical = flags.filter((f) => f.severity === "critical");
  if (!critical.length) return investigation;
  const reasoning = investigation.reasoning.filter((r) => r.done !== false);
  critical.forEach((f) => reasoning.push({ label: `Safety rule: ${f.label}`, done: true }));
  reasoning.push({ label: "Critical safety rule triggered during investigation — routine checks stopped; follow mission emergency procedure", done: true });
  return { ...investigation, flags, redFlag: true, nextCheck: null, complete: true, status: "escalate", reasoning };
}
