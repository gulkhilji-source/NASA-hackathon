import test from "node:test";
import assert from "node:assert/strict";
import {
  validateEntry, evaluateEntry, analyzeTrends, buildGuidance, computeStreak, computeBadges,
  dueReminders, hazardCoverage, engineEvidence, demoHistory, completeness, summarizeEntry, dayKey
} from "../src/vitals.js";
import { autoResults, createInvestigation, recordCheck, resolveContext } from "../src/engine.js";
import { getScenario } from "../src/scenarios.js";

const NOW = new Date("2026-11-14T12:00:00").getTime();
const at = (daysAgo, hour = 9) => { const d = new Date(NOW); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 0, 0, 0); return d.toISOString(); };

/* ---------- validation ---------- */
test("valid entry parses strings into numbers", () => {
  const r = validateEntry({ hr: "64", sys: "118", dia: "76", glucose: "90", glucoseContext: "fasting", temp: "36.7", spo2: "98", sleepHours: "7.5", mood: "4" });
  assert.equal(r.valid, true);
  assert.equal(r.entry.hr, 64);
  assert.equal(r.entry.sys, 118);
  assert.equal(r.entry.glucoseContext, "fasting");
  assert.equal(r.entry.mood, 4);
});

test("empty form is rejected, blank fields are ignored", () => {
  assert.equal(validateEntry({}).valid, false);
  assert.ok(validateEntry({ hr: "", sys: "  " }).errors.form);
  assert.equal(validateEntry({ hr: "", mood: "3" }).valid, true);
});

test("implausible and non-numeric values are rejected with field errors", () => {
  const r = validateEntry({ hr: "400", temp: "abc", spo2: "20" });
  assert.equal(r.valid, false);
  assert.ok(r.errors.hr && r.errors.temp && r.errors.spo2);
});

test("blood pressure must be a pair and systolic must exceed diastolic", () => {
  assert.ok(validateEntry({ sys: "120" }).errors.dia);
  assert.ok(validateEntry({ dia: "80" }).errors.sys);
  assert.ok(validateEntry({ sys: "70", dia: "90" }).errors.sys);
  assert.equal(validateEntry({ sys: "120", dia: "80" }).valid, true);
});

test("mood must be an integer 1-5; symptoms need a known region and severity 1-3", () => {
  assert.ok(validateEntry({ mood: "0" }).errors.mood);
  assert.ok(validateEntry({ mood: "3.5" }).errors.mood);
  assert.ok(validateEntry({ symptoms: [{ region: "elbow", severity: 1 }] }).errors.symptoms);
  assert.ok(validateEntry({ symptoms: [{ region: "chest", severity: 4 }] }).errors.symptoms);
  const ok = validateEntry({ symptoms: [{ region: "chest", severity: 2 }, { region: "chest", severity: 1, note: "x" }] });
  assert.equal(ok.valid, true);
  assert.equal(ok.entry.symptoms.length, 1, "one symptom per region (last wins)");
  assert.equal(ok.entry.symptoms[0].severity, 1);
});

test("completeness counts the 8 core indicators", () => {
  assert.equal(completeness({}), 0);
  assert.equal(completeness({ hr: 60, sys: 120, dia: 80, glucose: 90, temp: 36.6, spo2: 98, sleepHours: 7, mood: 4 }), 1);
  assert.equal(completeness({ hr: 60, mood: 4 }), 0.25);
});

/* ---------- rules ---------- */
test("normal values raise no flags", () => {
  assert.deepEqual(evaluateEntry({ hr: 64, sys: 118, dia: 76, glucose: 90, glucoseContext: "fasting", temp: 36.7, spo2: 98, sleepHours: 7.5, mood: 4, exerciseMin: 90 }), []);
});

test("critical rules fire and sort first", () => {
  const f = evaluateEntry({ spo2: 88, sys: 150, dia: 95, mood: 2 });
  assert.equal(f[0].severity, "critical");
  assert.equal(f[0].id, "ci-spo2");
  assert.ok(f.some((x) => x.id === "ci-bp" && x.severity === "warning"));
  assert.ok(f.some((x) => x.id === "ci-mood" && x.severity === "warning"));
});

test("blood pressure: critical high, critical low, warning low", () => {
  assert.equal(evaluateEntry({ sys: 185, dia: 100 })[0].severity, "critical");
  assert.equal(evaluateEntry({ sys: 75, dia: 50 })[0].severity, "critical");
  assert.equal(evaluateEntry({ sys: 88, dia: 58 })[0].severity, "warning");
});

test("glucose thresholds depend on context", () => {
  assert.equal(evaluateEntry({ glucose: 130, glucoseContext: "fasting" })[0].severity, "warning");
  assert.deepEqual(evaluateEntry({ glucose: 130, glucoseContext: "postMeal" }), []);
  assert.equal(evaluateEntry({ glucose: 50 })[0].severity, "critical");
  assert.equal(evaluateEntry({ glucose: 65 })[0].severity, "warning");
  assert.equal(evaluateEntry({ glucose: 320 })[0].severity, "critical");
});

test("symptoms: severe chest/head is critical, other severe is warning, eyes always at least warning", () => {
  assert.equal(evaluateEntry({ symptoms: [{ region: "chest", severity: 3 }] })[0].severity, "critical");
  assert.equal(evaluateEntry({ symptoms: [{ region: "head", severity: 3 }] })[0].severity, "critical");
  assert.equal(evaluateEntry({ symptoms: [{ region: "leftArm", severity: 3 }] })[0].severity, "warning");
  assert.equal(evaluateEntry({ symptoms: [{ region: "eyes", severity: 1 }] })[0].severity, "warning");
  assert.equal(evaluateEntry({ symptoms: [{ region: "back", severity: 1 }] })[0].severity, "notice");
});

/* ---------- trends ---------- */
test("trends need at least 8 values", () => {
  const entries = Array.from({ length: 5 }, (_, i) => ({ id: i, at: at(5 - i), sleepHours: 7 }));
  assert.equal(analyzeTrends(entries).find((t) => t.key === "sleepHours").ready, false);
});

test("a stable history is not flagged", () => {
  const entries = Array.from({ length: 12 }, (_, i) => ({ id: i, at: at(12 - i), sleepHours: 7.4 + (i % 2 ? 0.2 : -0.2), mood: 4, hr: 64 + (i % 3) }));
  assert.equal(analyzeTrends(entries).some((t) => t.flagged), false);
});

test("a developing decline is flagged in the unfavourable direction only", () => {
  const entries = demoHistory(NOW);
  const t = Object.fromEntries(analyzeTrends(entries).map((x) => [x.key, x]));
  assert.equal(t.sleepHours.flagged, true);
  assert.equal(t.mood.flagged, true);
  assert.equal(t.hr.flagged, true);
  assert.equal(t.exerciseMin.flagged, true);
  assert.ok(t.sleepHours.delta < 0 && t.hr.delta > 0);
});

test("improving values are not flagged (sleep going UP is not a problem)", () => {
  const entries = Array.from({ length: 12 }, (_, i) => ({ id: i, at: at(12 - i), sleepHours: i >= 9 ? 9.5 : 7 }));
  assert.equal(analyzeTrends(entries).find((t) => t.key === "sleepHours").flagged, false);
});

/* ---------- guidance ---------- */
test("critical flag produces an emergency item first and no home-remedy steps for it", () => {
  const g = buildGuidance({ flags: evaluateEntry({ spo2: 85, mood: 2 }) });
  assert.equal(g[0].tone, "urgent");
  assert.match(g[0].steps[0], /emergency/i);
  assert.ok(!g.some((x) => /SpO/.test(x.title)), "critical values are escalated, not self-managed");
});

test("guidance covers warnings and flagged trends, deduplicated", () => {
  const entries = demoHistory(NOW);
  const latest = entries[entries.length - 1];
  const g = buildGuidance({ flags: evaluateEntry(latest), trends: analyzeTrends(entries) });
  const titles = g.map((x) => x.title);
  assert.ok(titles.includes("Low mood"));
  assert.ok(titles.includes("Vision change reported"));
  assert.ok(titles.includes("Sleep is trending down"));
  assert.equal(new Set(g.map((x) => x.id)).size, g.length);
  assert.ok(g.every((x) => x.steps.length >= 1));
});

test("self-harm safety line is present in the low-mood guidance", () => {
  const g = buildGuidance({ flags: evaluateEntry({ mood: 1 }) });
  assert.ok(g.find((x) => x.title === "Low mood").steps.some((s) => /harming yourself/i.test(s)));
});

test("nothing flagged yields a single all-clear item", () => {
  const g = buildGuidance({ flags: [], trends: [] });
  assert.equal(g.length, 1);
  assert.equal(g[0].id, "all-clear");
});

/* ---------- streaks, badges, reminders ---------- */
test("streak counts consecutive days ending today or yesterday", () => {
  const now = new Date(NOW);
  assert.equal(computeStreak([], now).current, 0);
  const three = [at(0), at(1), at(2)].map((x, i) => ({ id: i, at: x }));
  assert.deepEqual([computeStreak(three, now).current, computeStreak(three, now).longest, computeStreak(three, now).todayDone], [3, 3, true]);
  const endedYesterday = [at(1), at(2)].map((x, i) => ({ id: i, at: x }));
  assert.equal(computeStreak(endedYesterday, now).current, 2);
  assert.equal(computeStreak(endedYesterday, now).todayDone, false);
  const broken = [at(0), at(3), at(4)].map((x, i) => ({ id: i, at: x }));
  assert.equal(computeStreak(broken, now).current, 1);
  assert.equal(computeStreak(broken, now).longest, 2);
});

test("multiple entries on the same day count once", () => {
  const e = [at(0, 8), at(0, 20)].map((x, i) => ({ id: i, at: x }));
  assert.equal(computeStreak(e, new Date(NOW)).current, 1);
});

test("badges reward consistency", () => {
  const b = Object.fromEntries(computeBadges(demoHistory(NOW), new Date(NOW)).map((x) => [x.id, x.earned]));
  assert.equal(b.first && b.streak3 && b.streak7 && b.complete && b.wellbeing && b.countermeasure, true);
  const none = Object.fromEntries(computeBadges([], new Date(NOW)).map((x) => [x.id, x.earned]));
  assert.equal(Object.values(none).some(Boolean), false);
});

test("reminders: none logged -> check-in due; recent full entry -> nothing; stale mood/exercise -> specific reminders", () => {
  assert.equal(dueReminders([], NOW)[0].id, "checkin");
  assert.equal(dueReminders([{ id: 1, at: new Date(NOW - 36e5).toISOString(), mood: 4, exerciseMin: 60 }], NOW).length, 0);
  const r = dueReminders([
    { id: 0, at: new Date(NOW - 30 * 36e5).toISOString(), mood: 4, exerciseMin: 60 },
    { id: 1, at: new Date(NOW - 36e5).toISOString(), hr: 64 }
  ], NOW);
  assert.deepEqual(r.map((x) => x.id).sort(), ["exercise", "mood"]);
  assert.equal(dueReminders([{ id: 2, at: new Date(NOW - 25 * 36e5).toISOString(), hr: 60 }], NOW)[0].id, "checkin");
});

/* ---------- hazard coverage ---------- */
test("hazard coverage reports nodata honestly and watch states", () => {
  const empty = Object.fromEntries(hazardCoverage([], { now: NOW }).map((r) => [r.id, r.status]));
  assert.deepEqual(empty, { radiation: "nodata", isolation: "nodata", distance: "ok", gravity: "nodata", environment: "nodata" });
  const full = Object.fromEntries(hazardCoverage(demoHistory(NOW), { co2: 1850, now: NOW }).map((r) => [r.id, r.status]));
  assert.equal(full.radiation, "ok");
  assert.equal(full.isolation, "watch");
  assert.equal(full.gravity, "watch");
  assert.equal(full.environment, "watch");
});

/* ---------- engine bridge ---------- */
test("mood auto-answers the mood check; symptoms only auto-answer when REPORTED", () => {
  assert.equal(autoResults({ moodScore: 2 }).mood, "abnormal");
  assert.equal(autoResults({ moodScore: 4 }).mood, "normal");
  assert.equal(autoResults({ symptomCount: 1 }).symptoms, "abnormal");
  assert.equal("symptoms" in autoResults({ symptomCount: 0 }), false, "no symptom typed must NOT become 'normal'");
});

test("engineEvidence ignores stale entries and does not invent symptom evidence", () => {
  const fresh = { at: new Date(NOW - 36e5).toISOString(), mood: 2, symptoms: [{ region: "head", severity: 1 }] };
  assert.deepEqual(engineEvidence(fresh, NOW), { moodScore: 2, symptomCount: 1 });
  assert.deepEqual(engineEvidence({ at: new Date(NOW - 30 * 36e5).toISOString(), mood: 2 }, NOW), {});
  assert.deepEqual(engineEvidence({ at: new Date(NOW - 36e5).toISOString(), mood: 4 }, NOW), { moodScore: 4 });
  assert.deepEqual(engineEvidence(null, NOW), {});
});

test("a low logged mood answers the engine's mood check at zero crew minutes (full investigation run)", () => {
  const base = getScenario("sleep-debt");
  const scenario = { ...base, moodScore: 2 };
  const ctx = resolveContext(base);
  const run = (sc) => {
    let inv = createInvestigation(sc);
    let guard = 0;
    while (!inv.complete && guard++ < 6) inv = recordCheck(inv, inv.nextCheck.id, "abnormal", ctx, sc);
    return inv;
  };
  const withMood = run(scenario);
  const moodCheck = withMood.checks.find((c) => c.checkId === "mood");
  assert.ok(moodCheck, "mood check must be reached in this scenario");
  assert.equal(moodCheck.source, "sensor");
  assert.equal(moodCheck.duration, 0);
  assert.equal(moodCheck.result, "abnormal");
  // Without a logged mood the crew would have had to answer it themselves.
  const without = run(base);
  const manual = without.checks.find((c) => c.checkId === "mood");
  assert.ok(!manual || manual.source === "crew");
});

/* ---------- misc ---------- */
test("demo history is deterministic, synthetic-tagged, valid and chronologically ordered", () => {
  const a = demoHistory(NOW), b = demoHistory(NOW);
  assert.deepEqual(a, b);
  assert.equal(a.length, 14);
  assert.ok(a.every((e) => e.source === "demo"));
  assert.ok(a.every((e) => validateEntry(e).valid), "every demo entry passes validation");
  assert.ok(a.every((e, i) => i === 0 || Date.parse(e.at) > Date.parse(a[i - 1].at)));
  assert.equal(new Set(a.map((e) => dayKey(e.at))).size, 14);
});

test("summarizeEntry renders a compact line", () => {
  const s = summarizeEntry({ hr: 64, sys: 118, dia: 76, mood: 4, symptoms: [{ region: "eyes", severity: 1 }] });
  assert.match(s, /HR 64 bpm/);
  assert.match(s, /BP 118\/76/);
  assert.match(s, /Eyes \/ vision \(mild\)/);
});
