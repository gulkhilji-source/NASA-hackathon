import test from "node:test";
import assert from "node:assert/strict";
import {
  CHECKS, buildPriors, entropy, updatePosterior, chooseNextCheck,
  validateMeasurement, createInvestigation, recordCheck
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

test("recent wellbeing concerns increase the psychological-strain prior", () => {
  const standard = buildPriors({});
  const wellbeing = buildPriors({ highStressRecent: true });
  assert.ok(wellbeing.psychologicalStrain > standard.psychologicalStrain);
});

test("investigation retains the health context used to initialize its reasoning", () => {
  const scenario = getScenario("night-41");
  const investigation = createInvestigation(scenario, { highStressRecent: true, elevatedCO2: false });
  assert.equal(investigation.context.highStressRecent, true);
  assert.equal(investigation.context.elevatedCO2, false);
});
