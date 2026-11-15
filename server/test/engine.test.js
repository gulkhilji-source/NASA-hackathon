import test from "node:test";
import assert from "node:assert/strict";
import {
  CHECKS, buildPriors, entropy, updatePosterior, chooseNextCheck,
  validateMeasurement, createInvestigation, recordCheck, skipCheck,
  deriveContext, resolveContext, evaluateRules, autoResults, shouldStop, escalateInvestigation
} from "../src/engine.js";
import { getScenario } from "../src/scenarios.js";

test("priors are normalized", () => {
  const priors = buildPriors({ spaceWeatherRecent: true, shortSleepNights: 3 });
  const sum = Object.values(priors).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-10);
});

test("entropy is positive for a non-certain distribution", () => {
  assert.ok(entropy({ a: .5, b: .5 }) > 0.99);
});

test("Bayesian update returns normalized posterior", () => {
  const prior = buildPriors({});
  const posterior = updatePosterior(prior, CHECKS.find((c) => c.id === "co2"), "abnormal");
  assert.ok(Math.abs(Object.values(posterior).reduce((a, b) => a + b, 0) - 1) < 1e-10);
});

test("elevated CO2 makes cabin reading the mandatory first check", () => {
  const next = chooseNextCheck(buildPriors({ elevatedCO2: true }), [], { elevatedCO2: true });
  assert.equal(next.id, "co2");
  assert.equal(next.mandatory, true);
});

test("measurement validation rejects impossible values", () => {
  assert.equal(validateMeasurement(5000).valid, false);
  assert.equal(validateMeasurement(72).valid, true);
});

test("investigation accepts the recommended check and updates evidence", () => {
  const scenario = getScenario("night-41");
  const investigation = createInvestigation(scenario);
  const updated = recordCheck(investigation, investigation.nextCheck.id, "abnormal", scenario.context);
  assert.equal(updated.checks.length, 1);
  assert.ok(Math.abs(Object.values(updated.posterior).reduce((a, b) => a + b, 0) - 1) < 1e-10);
});

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test("context is derived from measurements, not hand-typed flags", () => {
  const c = deriveContext({ co2: 1850, sleepHistory: [8, 7, 5, 5, 4], activity: .7, sqi: .4, spaceWeatherHoursAgo: 20 });
  assert.equal(c.elevatedCO2, true);
  assert.equal(c.shortSleepNights, 3);
  assert.equal(c.activityHigh, true);
  assert.equal(c.sqi, .4);
  assert.equal(c.spaceWeatherRecent, true);
  assert.equal(deriveContext({ co2: 412 }).elevatedCO2, false);
});

test("measured CO2 overrides a contradictory hand-typed flag", () => {
  const ctx = resolveContext({ context: { elevatedCO2: true }, co2: 412 });
  assert.equal(ctx.elevatedCO2, false);
});

test("poor signal quality raises the sensor-error prior; good quality lowers it", () => {
  assert.ok(buildPriors({ sqi: .3 }).sensorError > buildPriors({}).sensorError);
  assert.ok(buildPriors({ sqi: .95 }).sensorError < buildPriors({}).sensorError);
  assert.ok(Math.abs(sum(buildPriors({ sqi: .3, activityHigh: true })) - 1) < 1e-10);
});

test("recent exertion raises the exertion hypothesis", () => {
  assert.ok(buildPriors({ activityHigh: true }).exertion > buildPriors({}).exertion * 3);
});

test("rules tier: critical SpO2 stops routine investigation and escalates", () => {
  const scenario = { id: "t", spo2: 85, heartRate: 70, observations: [] };
  const inv = createInvestigation(scenario);
  assert.equal(inv.status, "escalate");
  assert.equal(inv.complete, true);
  assert.equal(inv.nextCheck, null);
  assert.throws(() => recordCheck(inv, "remeasure", "normal", {}), /already complete/);
});

test("rules tier: poor signal quality downgrades a critical optical reading to unverified warning", () => {
  const flags = evaluateRules({ spo2: 85, sqi: .3 });
  assert.equal(flags.find((f) => f.id === "spo2").severity, "warning");
  assert.ok(flags.some((f) => f.id === "signalQuality"));
});

test("rules tier: high heart rate during exercise is not flagged as resting tachycardia", () => {
  assert.equal(evaluateRules({ heartRate: 150, activity: .8 }).length, 0);
  assert.equal(evaluateRules({ heartRate: 150, activity: .1 })[0].severity, "critical");
});

test("skin temperature uses a delta vs personal baseline when provided", () => {
  assert.equal(evaluateRules({ temperature: 34.0, temperatureBaseline: 33.4 }).length, 0);
  assert.equal(evaluateRules({ temperature: 35.1, temperatureBaseline: 33.4 })[0].severity, "warning");
});

test("sensor answers the CO2 check automatically at zero crew time", () => {
  const s = getScenario("co2-rise");
  const inv = createInvestigation(s);
  const co2 = inv.checks.find((c) => c.checkId === "co2");
  assert.equal(co2.result, "abnormal");
  assert.equal(co2.source, "sensor");
  assert.equal(co2.duration, 0);
  assert.ok(inv.posterior.cabinCO2 > .5);
});

test("normal CO2 reading cannot be contradicted by a stale hand-typed flag", () => {
  assert.equal(autoResults({ co2: 412 }).co2, "normal");
  const inv = createInvestigation(getScenario("night-41"));
  assert.notEqual(inv.nextCheck?.mandatory, true);
});

test("recordCheck error paths", () => {
  const s = getScenario("night-41");
  const inv = createInvestigation(s);
  assert.throws(() => recordCheck(inv, "nope", "normal", {}), /Unknown check/);
  assert.throws(() => recordCheck(inv, inv.nextCheck.id, "maybe", {}), /normal or abnormal/);
  const other = CHECKS.find((c) => c.id !== inv.nextCheck.id).id;
  assert.throws(() => recordCheck(inv, other, "normal", {}), /recommended next check/);
});

test("skipping the recommended check re-ranks without it; a mandatory check cannot be skipped", () => {
  const s = getScenario("night-41");
  const inv = createInvestigation(s);
  const skipped = skipCheck(inv, inv.nextCheck.id, resolveContext(s));
  assert.notEqual(skipped.nextCheck?.id, inv.nextCheck.id);
  assert.ok(skipped.skipped.includes(inv.nextCheck.id));
  assert.throws(() => skipCheck({ ...inv, nextCheck: { id: "co2", mandatory: true } }, "co2", {}), /cannot be skipped/);
});

test("stop rule: red flag, five checks, or a clear leader", () => {
  const flat = buildPriors({});
  assert.equal(shouldStop(flat, 0, false), false);
  assert.equal(shouldStop(flat, 0, true), true);
  assert.equal(shouldStop(flat, 5, false), true);
  assert.equal(shouldStop({ a: .7, b: .2, c: .1 }, 1, false), true);
  assert.equal(shouldStop({ a: .5, b: .45, c: .05 }, 1, false), false);
});

test("validateMeasurement rejects null, empty string and booleans", () => {
  for (const bad of [null, "", true, undefined, NaN, "abc"]) assert.equal(validateMeasurement(bad).valid, false);
});

test("a critical rule firing mid-investigation stops routine checks", () => {
  const s = getScenario("night-41");
  const inv = createInvestigation(s);
  assert.equal(inv.status, "investigating");
  const escalated = escalateInvestigation(inv, evaluateRules({ spo2: 85 }));
  assert.equal(escalated.status, "escalate");
  assert.equal(escalated.complete, true);
  assert.equal(escalated.nextCheck, null);
  assert.throws(() => recordCheck(escalated, "remeasure", "normal", {}), /already complete/);
  assert.equal(escalateInvestigation(inv, evaluateRules({ spo2: 96 })).status, "investigating"); // no critical flag, no change
});
