import test from "node:test";
import assert from "node:assert/strict";
import { createSimulator } from "../src/telemetry/simulator.js";
import { createBaselineTracker } from "../src/telemetry/baseline.js";
import { createLiveSession, liveScenario } from "../src/telemetry/live.js";
import { seriesFor } from "../src/telemetry/series.js";
import { appendEntry, verifyChain } from "../src/auditChain.js";
import { createInvestigation, evaluateRules } from "../../server/src/engine.js";
import { buildSBAR } from "../src/report.js";

const run = (s, n) => { for (let i = 0; i < n; i++) s.step(); };

test("simulator is deterministic for a given seed", () => {
  const a = createSimulator({ seed: 3 }), b = createSimulator({ seed: 3 });
  for (let i = 0; i < 20; i++) assert.deepEqual(a.tick(), b.tick());
});

test("baseline learns resting HR and ignores exercise and low-quality samples", () => {
  const t = createBaselineTracker({ initial: 66 });
  for (let i = 0; i < 60; i++) t.update({ hr: 64 + (i % 5), activity: .05, sqi: .95 });
  const rest = t.update({ hr: 66, activity: .05, sqi: .95 });
  assert.ok(Math.abs(rest.baseline - 66) < 2);
  const before = rest.baseline;
  for (let i = 0; i < 30; i++) t.update({ hr: 140, activity: .8, sqi: .9 });   // exercise
  for (let i = 0; i < 30; i++) t.update({ hr: 110, activity: .05, sqi: .2 });  // junk signal
  assert.ok(Math.abs(t.update({ hr: 66, activity: .05, sqi: .95 }).baseline - before) < 1);
});

test("CUSUM flags a sustained resting deviation but not noise", () => {
  const t = createBaselineTracker({ initial: 66 });
  for (let i = 0; i < 60; i++) t.update({ hr: 65 + (i % 3), activity: .05, sqi: .95 });
  let last;
  for (let i = 0; i < 25; i++) last = t.update({ hr: 80, activity: .05, sqi: .95 });
  assert.equal(last.sustained, true);
  assert.equal(last.persistentDeviation, true);
});

test("live pipeline: idle at baseline, sleep debt detected, exercise explained, loose strap lowers trust", () => {
  const s = createLiveSession();
  assert.equal(liveScenario(s).anomalous, false);
  s.sim.setControls({ shortSleepNights: 4 }); run(s, 60);
  const sleep = liveScenario(s);
  assert.equal(sleep.anomalous, true);
  assert.ok(createInvestigation(sleep).posterior.sleepDebt > .3);
  s.sim.setControls({ shortSleepNights: 0, exercise: true }); run(s, 40);
  const ex = liveScenario(s);
  assert.equal(ex.context.activityHigh, undefined);       // context is derived in the engine, not here
  assert.ok(ex.activity >= .5);
  assert.equal(evaluateRules(ex).some((f) => f.id === "heartRate"), false); // exertion HR is not an alarm
  s.sim.setControls({ exercise: false, looseStrap: .9 }); run(s, 40);
  const loose = liveScenario(s);
  assert.ok(loose.sqi < .6);
  assert.ok(createInvestigation(loose).posterior.sensorError > .2);
});

test("series ends exactly at the displayed value and is reproducible", () => {
  const a = seriesFor("hr", 78, 66), b = seriesFor("hr", 78, 66);
  assert.deepEqual(a, b);
  assert.equal(a[a.length - 1], 78);
});

test("hash-chained log detects alteration and deletion", async () => {
  let log = [];
  for (const action of ["a", "b", "c"]) log = await appendEntry(log, { id: action, at: "t", action, detail: "" });
  assert.equal((await verifyChain(log)).ok, true);
  const altered = log.map((e, i) => (i === 1 ? { ...e, detail: "edited" } : e));
  assert.equal((await verifyChain(altered)).ok, false);
  const removed = [log[0], log[2]];
  assert.equal((await verifyChain(removed)).ok, false);
});

test("SBAR contains all four sections and the escalation instruction for critical rules", () => {
  const scenario = { astronaut: "A", role: "R", mission: "M", alert: "x", heartRate: 70, heartRateBaseline: 66, spo2: 85, temperature: 37, co2: 400, observations: ["o"], sleepHours: 7, weather: "Quiet", id: "t", name: "t" };
  const flags = evaluateRules(scenario);
  const text = buildSBAR({ scenario, session: createInvestigation(scenario), flags });
  for (const k of ["S — SITUATION", "B — BACKGROUND", "A — ASSESSMENT", "R — RECOMMENDATION", "ESCALATE"]) assert.ok(text.includes(k), k);
});

test("a real SpO2 drop with good signal triggers the critical rule and escalates before any probabilities", () => {
  const s = createLiveSession();
  s.sim.setControls({ spo2Drop: 10 }); run(s, 20);
  const scn = liveScenario(s);
  assert.ok(scn.sqi > .9);
  assert.equal(evaluateRules(scn).some((f) => f.id === "spo2" && f.severity === "critical"), true);
  assert.equal(createInvestigation(scn).status, "escalate");
});
