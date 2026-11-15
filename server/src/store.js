import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data");
const file = path.join(directory, "astravitals-store.json");
const investigations = new Map();
const measurements = [];
const wellbeing = [];
const baselines = new Map();
const symptomReports = [];
const reminders = [];

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const item of saved.investigations || []) investigations.set(item.id, item);
    measurements.push(...(saved.measurements || []));
    wellbeing.push(...(saved.wellbeing || []));
    for (const item of saved.baselines || []) baselines.set(item.crewId, item);
    symptomReports.push(...(saved.symptomReports || []));
    reminders.push(...(saved.reminders || []));
  } catch (error) {
    if (error.code !== "ENOENT") console.error("AstraVitals store could not be loaded:", error.message);
  }
}
function persist() {
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({
    version: 3,
    updatedAt: new Date().toISOString(),
    investigations: [...investigations.values()],
    measurements: measurements.slice(-5000),
    wellbeing: wellbeing.slice(-2000),
    baselines: [...baselines.values()],
    symptomReports: symptomReports.slice(-2000),
    reminders: reminders.slice(-1000)
  }, null, 2));
  fs.renameSync(temporary, file);
}
load();

export function saveInvestigation(investigation) {
  investigations.set(investigation.id, investigation);
  persist();
  return investigation;
}
export function getInvestigation(id) { return investigations.get(id); }
export function updateInvestigation(investigation) {
  investigations.set(investigation.id, investigation);
  persist();
  return investigation;
}
export function addMeasurement(record) {
  measurements.push(record);
  if (measurements.length > 5000) measurements.splice(0, measurements.length - 5000);
  persist();
  return record;
}
export function listMeasurements({ crewId, limit = 100 } = {}) {
  return measurements.filter((item) => !crewId || item.crewId === crewId).slice(-Math.max(1, Math.min(Number(limit) || 100, 500))).reverse();
}
export function latestMeasurement(crewId) {
  return [...measurements].reverse().find((item) => !crewId || item.crewId === crewId) || null;
}
export function addWellbeing(record) {
  wellbeing.push(record);
  if (wellbeing.length > 2000) wellbeing.splice(0, wellbeing.length - 2000);
  persist();
  return record;
}
export function listWellbeing({ crewId, limit = 100 } = {}) {
  return wellbeing.filter((item) => !crewId || item.crewId === crewId).slice(-Math.max(1, Math.min(Number(limit) || 100, 500))).reverse();
}

export function getBaseline(crewId) { return baselines.get(String(crewId)) || null; }
export function saveBaseline(baseline) {
  baselines.set(baseline.crewId, baseline);
  persist();
  return baseline;
}


export function addSymptomReport(record) {
  symptomReports.push(record);
  if (symptomReports.length > 2000) symptomReports.splice(0, symptomReports.length - 2000);
  persist();
  return record;
}
export function listSymptomReports({ crewId, limit = 100 } = {}) {
  return symptomReports.filter((item) => !crewId || item.crewId === crewId).slice(-Math.max(1, Math.min(Number(limit) || 100, 500))).reverse();
}
export function addReminder(record) {
  reminders.push(record);
  if (reminders.length > 1000) reminders.splice(0, reminders.length - 1000);
  persist();
  return record;
}
export function listReminders({ crewId } = {}) {
  return reminders.filter((item) => !crewId || item.crewId === crewId).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}
export function updateReminder(id, patch) {
  const item = reminders.find((entry) => entry.id === id);
  if (!item) return null;
  Object.assign(item, patch, { updatedAt: new Date().toISOString() });
  persist();
  return item;
}
