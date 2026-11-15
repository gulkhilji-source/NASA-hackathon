import { LABELS } from "../../server/src/engine.js";
import { summarizeEntry } from "../../server/src/vitals.js";

const pct = (v) => `${Math.round(v * 100)}%`;

/** SBAR (Situation-Background-Assessment-Recommendation): compact handoff for delayed/low-bandwidth ground contact. */
export function buildSBAR({ scenario, session, flags = [], entry = null, trends = [], generatedAt = new Date() }) {
  const ranked = session ? Object.entries(session.posterior).sort((a, b) => b[1] - a[1]) : [];
  const critical = flags.filter((f) => f.severity === "critical");
  const lines = [];
  lines.push("ASTRAVITALS · SBAR HANDOFF (SIMULATED DATA — NOT A MEDICAL RECORD)");
  lines.push(`Generated: ${generatedAt.toISOString()}`);
  lines.push("");
  lines.push("S — SITUATION");
  lines.push(`${scenario.astronaut} (${scenario.role}), ${scenario.mission}. ${scenario.alert}.`);
  lines.push(`HR ${scenario.heartRate} bpm (personal baseline ${scenario.heartRateBaseline}), SpO₂ ${scenario.spo2}%, temp ${scenario.temperature}°C${scenario.temperatureKind === "skin" ? " (skin)" : ""}, CO₂ ${scenario.co2} ppm.`);
  if (flags.length) lines.push(`Safety rules: ${flags.map((f) => `${f.severity.toUpperCase()} — ${f.label}`).join("; ")}.`);
  lines.push("");
  lines.push("B — BACKGROUND");
  scenario.observations.forEach((o) => lines.push(`- ${o}`));
  lines.push(`- Sleep last night: ${scenario.sleepHours} h. Space weather: ${scenario.weather}.`);
  if (entry) lines.push(`- Crew check-in (${new Date(entry.at).toISOString()}${entry.source === "demo" ? ", SYNTHETIC" : ""}): ${summarizeEntry(entry)}.`);
  if (entry?.note) lines.push(`- Crew note: ${entry.note}`);
  lines.push("");
  lines.push("A — ASSESSMENT (model beliefs, not diagnoses)");
  if (!session) lines.push("No investigation run yet.");
  else {
    lines.push(`Status: ${session.status}. Checks completed: ${session.checks.length} (${session.checks.filter((c) => c.source === "sensor").length} answered by sensor).`);
    ranked.slice(0, 3).forEach(([id, p]) => lines.push(`- ${LABELS[id] || id}: ${pct(p)}`));
    session.checks.forEach((c) => lines.push(`  · ${c.label}: ${c.result}${c.source === "sensor" ? " (sensor)" : ""}`));
  }
  lines.push("");
  const moving = trends.filter((t) => t.flagged);
  if (moving.length) {
    lines.push("Multi-day trends vs personal baseline:");
    moving.forEach((t) => lines.push(`- ${t.label}: recent ${t.recent.toFixed(1)} ${t.unit} vs baseline ${t.baseline.toFixed(1)} ${t.unit} (z = ${t.z.toFixed(1)})`));
    lines.push("");
  }
  lines.push("R — RECOMMENDATION");
  if (critical.length || session?.status === "escalate") lines.push("ESCALATE: stop routine investigation; follow the mission-approved emergency medical procedure and contact the designated medical authority.");
  else if (session?.nextCheck) lines.push(`Perform next check: ${session.nextCheck.label}. Reassess after result.`);
  else if (session) lines.push("Stopping rule reached. Review evidence with the flight surgeon and follow mission medical protocol.");
  else lines.push("Start an investigation to obtain a recommended next check.");
  lines.push("");
  lines.push("Limitations: illustrative likelihoods; simulated data; not clinically validated; prototype only.");
  return lines.join("\n");
}
