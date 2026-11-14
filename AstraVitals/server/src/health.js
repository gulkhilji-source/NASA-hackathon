// Mission health telemetry and screening rules.
// Thresholds are configurable prototype defaults, not clinical diagnostic criteria.
export const METRIC_RULES = {
  heartRate: { label: "Heart rate", unit: "bpm", min: 25, max: 220, low: 40, high: 120 },
  spo2: { label: "Oxygen saturation", unit: "%", min: 50, max: 100, low: 92, high: null },
  systolic: { label: "Systolic blood pressure", unit: "mmHg", min: 50, max: 260, low: 90, high: 160 },
  diastolic: { label: "Diastolic blood pressure", unit: "mmHg", min: 30, max: 160, low: 60, high: 100 },
  glucose: { label: "Blood glucose", unit: "mg/dL", min: 20, max: 600, low: 70, high: 200 },
  temperature: { label: "Body temperature", unit: "°C", min: 30, max: 43, low: 35, high: 38 },
  sleepHours: { label: "Sleep", unit: "hours", min: 0, max: 24, low: 6, high: null },
  co2: { label: "Cabin CO₂", unit: "ppm", min: 0, max: 20000, low: null, high: 1000 },
  radiation: { label: "Radiation dose", unit: "mSv", min: 0, max: 1000, low: null, high: 0.5 }
};

const numeric = (value) => value !== undefined && value !== null && value !== "";
export function validateHealthRecord(input = {}) {
  const errors = [];
  const values = {};
  for (const [key, rule] of Object.entries(METRIC_RULES)) {
    if (!numeric(input[key])) continue;
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < rule.min || value > rule.max) {
      errors.push(`${rule.label} must be between ${rule.min} and ${rule.max} ${rule.unit}.`);
    } else values[key] = value;
  }
  if (!Object.keys(values).length) errors.push("At least one valid numeric health measurement is required.");
  if (numeric(input.mood)) {
    const mood = Number(input.mood);
    if (!Number.isInteger(mood) || mood < 1 || mood > 5) errors.push("Mood must be an integer from 1 to 5.");
    else values.mood = mood;
  }
  if (input.symptoms !== undefined) {
    if (!Array.isArray(input.symptoms) || input.symptoms.length > 30 || input.symptoms.some((s) => typeof s !== "string" || s.length > 120)) {
      errors.push("Symptoms must be an array of up to 30 short text labels.");
    } else values.symptoms = input.symptoms;
  }
  return { valid: errors.length === 0, errors, values };
}

export function assessHealthRecord(values = {}, previous = null) {
  const alerts = [];
  for (const [key, rule] of Object.entries(METRIC_RULES)) {
    const value = values[key];
    if (!numeric(value)) continue;
    if (rule.low !== null && value < rule.low) alerts.push({ metric: key, label: rule.label, severity: key === "spo2" || key === "systolic" ? "high" : "review", direction: "low", value, threshold: rule.low, message: `${rule.label} is below the configured prototype threshold.` });
    if (rule.high !== null && value > rule.high) alerts.push({ metric: key, label: rule.label, severity: key === "spo2" ? "high" : "review", direction: "high", value, threshold: rule.high, message: `${rule.label} is above the configured prototype threshold.` });
  }
  if (numeric(values.mood) && Number(values.mood) <= 2) {
    alerts.push({ metric: "mood", label: "Mood", severity: "review", direction: "low", value: Number(values.mood), threshold: 2, message: "Low mood check-in recorded; consider a private wellbeing follow-up." });
  }
  if (previous) {
    for (const key of ["heartRate", "spo2", "temperature"]) {
      if (numeric(values[key]) && numeric(previous[key])) {
        const change = Number(values[key]) - Number(previous[key]);
        const pct = Math.abs(change) / Math.max(Math.abs(Number(previous[key])), 1);
        if (pct >= 0.15) alerts.push({ metric: key, label: METRIC_RULES[key].label, severity: "review", direction: change > 0 ? "rising" : "falling", value: Number(values[key]), previous: Number(previous[key]), message: `${METRIC_RULES[key].label} changed by at least 15% from the previous recorded value.` });
      }
    }
  }
  return alerts;
}

export function createHealthRecord(input, crewId = "demo-crew", previous = null, baseline = null) {
  const validation = validateHealthRecord(input);
  if (!validation.valid) {
    const error = new Error(validation.errors.join(" "));
    error.status = 400;
    throw error;
  }
  const values = validation.values;
  return {
    id: `health-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    crewId: String(crewId).slice(0, 80),
    recordedAt: input.recordedAt && !Number.isNaN(Date.parse(input.recordedAt)) ? new Date(input.recordedAt).toISOString() : new Date().toISOString(),
    values,
    alerts: [...assessHealthRecord(values, previous), ...assessAgainstBaseline(values, baseline)],
    source: ["manual", "wearable", "simulated"].includes(input.source) ? input.source : "manual"
  };
}

const BASELINE_DEVIATION_LIMITS = {
  heartRate: 0.20,
  spo2: 0.03,
  systolic: 0.15,
  diastolic: 0.15,
  glucose: 0.25,
  temperature: 0.015,
  sleepHours: 0.25,
  co2: 0.30
};

export function validateBaseline(input = {}) {
  const errors = [];
  const values = {};
  for (const [key, value] of Object.entries(input || {})) {
    const rule = METRIC_RULES[key];
    if (!rule) {
      errors.push(`Unknown baseline metric: ${key}.`);
      continue;
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < rule.min || number > rule.max) {
      errors.push(`${rule.label} baseline must be between ${rule.min} and ${rule.max} ${rule.unit}.`);
    } else values[key] = number;
  }
  if (!Object.keys(values).length) errors.push("At least one valid baseline metric is required.");
  return { valid: errors.length === 0, errors, values };
}

export function assessAgainstBaseline(values = {}, baseline = null) {
  if (!baseline?.values) return [];
  const alerts = [];
  for (const [key, limit] of Object.entries(BASELINE_DEVIATION_LIMITS)) {
    if (!numeric(values[key]) || !numeric(baseline.values[key])) continue;
    const current = Number(values[key]);
    const reference = Number(baseline.values[key]);
    if (reference === 0) continue;
    const deviation = (current - reference) / Math.abs(reference);
    if (Math.abs(deviation) >= limit) {
      const rule = METRIC_RULES[key];
      alerts.push({
        metric: key,
        label: rule.label,
        severity: "review",
        direction: deviation > 0 ? "above-baseline" : "below-baseline",
        value: current,
        baseline: reference,
        deviationPercent: Number((deviation * 100).toFixed(1)),
        thresholdPercent: Number((limit * 100).toFixed(1)),
        message: `${rule.label} differs from the saved crew baseline by ${Math.abs(deviation * 100).toFixed(1)}%. Review the trend and measurement context.`
      });
    }
  }
  return alerts;
}

export function summarizeMetricTrend(records = [], metric) {
  if (!METRIC_RULES[metric]) return null;
  const points = records
    .filter((record) => numeric(record.values?.[metric]))
    .map((record) => ({ recordedAt: record.recordedAt, value: Number(record.values[metric]), source: record.source }))
    .reverse();
  if (!points.length) return { metric, label: METRIC_RULES[metric].label, unit: METRIC_RULES[metric].unit, count: 0, points: [], average: null, min: null, max: null, change: null, direction: "insufficient-data" };
  const values = points.map((point) => point.value);
  const first = values[0];
  const latest = values[values.length - 1];
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    metric,
    label: METRIC_RULES[metric].label,
    unit: METRIC_RULES[metric].unit,
    count: values.length,
    points,
    average: Number(average.toFixed(2)),
    min: Math.min(...values),
    max: Math.max(...values),
    first,
    latest,
    change: Number((latest - first).toFixed(2)),
    changePercent: first === 0 ? null : Number((((latest - first) / Math.abs(first)) * 100).toFixed(1)),
    direction: latest > first ? "rising" : latest < first ? "falling" : "stable"
  };
}
