export const HYPOTHESES = [
  "sleepDebt", "spaceWeather", "cabinCO2", "dehydration",
  "psychologicalStrain", "sensorError", "other"
];

export const LABELS = {
  sleepDebt: "Sleep Debt",
  spaceWeather: "Space Weather Impact",
  cabinCO2: "Cabin CO₂",
  dehydration: "Dehydration / Fluid Shift",
  psychologicalStrain: "Psychological Strain",
  sensorError: "Sensor Error",
  other: "Other / Unexplained"
};

// Illustrative demo likelihoods only. Not clinically calibrated.
export const CHECKS = [
  {
    id: "remeasure", label: "Repeat the measurement", duration: 1,
    reason: "A second reading helps separate a real change from a sensor or measurement issue.",
    likelihood: { sleepDebt: .90, spaceWeather: .90, cabinCO2: .90, dehydration: .90, psychologicalStrain: .90, sensorError: .10, other: .85 }
  },
  {
    id: "co2", label: "Cabin CO₂ reading", duration: 1,
    reason: "A direct cabin reading can quickly test whether elevated CO₂ is a relevant environmental factor.",
    likelihood: { sleepDebt: .10, spaceWeather: .10, cabinCO2: .90, dehydration: .10, psychologicalStrain: .10, sensorError: .10, other: .15 }
  },
  {
    id: "pvt", label: "Brief reaction-time test", duration: 3,
    reason: "A short performance check can add evidence about fatigue-related impairment.",
    likelihood: { sleepDebt: .85, spaceWeather: .45, cabinCO2: .50, dehydration: .35, psychologicalStrain: .55, sensorError: .10, other: .50 }
  },
  {
    id: "hydration", label: "Hydration check", duration: 2,
    reason: "A quick fluid-intake and symptom review can test a hydration-related contributor.",
    likelihood: { sleepDebt: .20, spaceWeather: .20, cabinCO2: .20, dehydration: .85, psychologicalStrain: .20, sensorError: .10, other: .30 }
  },
  {
    id: "mood", label: "Mood and stress check-in", duration: 1,
    reason: "A brief private check-in can add context about psychological strain.",
    likelihood: { sleepDebt: .50, spaceWeather: .50, cabinCO2: .25, dehydration: .20, psychologicalStrain: .90, sensorError: .15, other: .40 }
  },
  {
    id: "symptoms", label: "Symptom checklist", duration: 1,
    reason: "A structured symptom review can identify patterns that require a different response.",
    likelihood: { sleepDebt: .30, spaceWeather: .35, cabinCO2: .80, dehydration: .50, psychologicalStrain: .35, sensorError: .05, other: .50 }
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
    psychologicalStrain: .12, sensorError: .12, other: .20
  };
  if (context.spaceWeatherRecent) priors.spaceWeather *= 3;
  if ((context.shortSleepNights || 0) >= 3) priors.sleepDebt *= 3;
  if (context.elevatedCO2) priors.cabinCO2 *= 4;
  if (context.lowMoodRecent || context.highStressRecent) priors.psychologicalStrain *= 2;
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

export function shouldStop(posterior, checkCount, redFlag = false) {
  if (redFlag || checkCount >= 5) return true;
  const ranked = Object.values(posterior).sort((a, b) => b - a);
  return ranked[0] >= .55 && ranked[0] >= 1.5 * (ranked[1] || 0);
}

export function validateMeasurement(value, min = 20, max = 250) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { valid: false, reason: "Value must be numeric." };
  if (numeric < min || numeric > max) return { valid: false, reason: "Value is outside the configured plausible range; verify the sensor." };
  return { valid: true, value: numeric };
}

export function createInvestigation(scenario, healthContext = {}) {
  const context = { ...scenario.context, ...healthContext };
  const posterior = buildPriors(context);
  const nextCheck = chooseNextCheck(posterior, [], context);
  return {
    id: `astravitals-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scenarioId: scenario.id,
    context,
    createdAt: new Date().toISOString(),
    posterior,
    prior: posterior,
    checks: [],
    reasoning: scenario.observations.map((label) => ({ label, done: true })),
    nextCheck,
    complete: false,
    status: "investigating"
  };
}

export function recordCheck(investigation, checkId, result, context = {}) {
  const check = CHECKS.find((item) => item.id === checkId);
  if (!check) throw new Error("Unknown check.");
  if (investigation.complete) throw new Error("Investigation is already complete.");
  if (investigation.checks.some((item) => item.checkId === checkId)) throw new Error("This check has already been recorded.");
  if (!["normal", "abnormal"].includes(String(result).toLowerCase())) throw new Error("Result must be normal or abnormal.");
  if (investigation.nextCheck?.id !== checkId) throw new Error("Submit the currently recommended next check.");
  const posterior = updatePosterior(investigation.posterior, check, result);
  const checks = [...investigation.checks, { checkId, label: check.label, result: String(result).toLowerCase(), duration: check.duration, recordedAt: new Date().toISOString() }];
  const complete = shouldStop(posterior, checks.length);
  const nextCheck = complete ? null : chooseNextCheck(posterior, checks.map((item) => item.checkId), context);
  const reasoning = [...investigation.reasoning, { label: `${check.label}: ${String(result).toLowerCase()}`, done: true }];
  if (nextCheck) reasoning.push({ label: `Selected next check: ${nextCheck.label}`, done: false });
  return { ...investigation, posterior, checks, reasoning, nextCheck, complete, status: complete ? "complete" : "investigating" };
}
