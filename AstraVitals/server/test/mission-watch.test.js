import test from "node:test";
import assert from "node:assert/strict";
import { buildMissionWatch } from "../src/mission-watch.js";

test("mission watch remains routine when no review factors exist", () => {
  const result = buildMissionWatch();
  assert.equal(result.score, 0);
  assert.equal(result.level, "routine-monitoring");
  assert.equal(result.factors.length, 0);
});

test("mission watch explains factors from telemetry, wellbeing, and symptoms", () => {
  const result = buildMissionWatch({
    measurements: [
      { alerts: [{}, {}], values: { sleepHours: 5.2, radiation: 0.7 } },
      { alerts: [], values: { sleepHours: 5.5 } }
    ],
    wellbeing: [{ mood: 2, stress: 4 }],
    symptoms: [{ severity: 5 }]
  });
  assert.equal(result.score, 80);
  assert.equal(result.level, "priority-review");
  assert.ok(result.factors.some((factor) => factor.code === "sleep-pattern"));
  assert.ok(result.factors.some((factor) => factor.code === "symptoms"));
  assert.match(result.disclaimer, /not a diagnosis/i);
});

test("mission watch score is capped at 100", () => {
  const result = buildMissionWatch({
    measurements: [{ alerts: Array(20).fill({}), values: { sleepHours: 4, radiation: 2 } }, { values: { sleepHours: 4 } }],
    wellbeing: [{ mood: 1, stress: 5 }], symptoms: [{ severity: 5 }]
  });
  assert.ok(result.score <= 100);
});
