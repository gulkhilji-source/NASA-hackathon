import test from "node:test";
import assert from "node:assert/strict";
import { validateHealthRecord, assessHealthRecord, createHealthRecord, validateBaseline, assessAgainstBaseline, summarizeMetricTrend } from "../src/health.js";

test("health record rejects out-of-range measurements", () => {
  const result = validateHealthRecord({ heartRate: 900 });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Heart rate/);
});

test("health record accepts partial valid measurements", () => {
  const result = validateHealthRecord({ heartRate: 72, mood: 4 });
  assert.equal(result.valid, true);
  assert.equal(result.values.heartRate, 72);
});

test("screening creates alerts for configured threshold crossings", () => {
  const alerts = assessHealthRecord({ spo2: 89, co2: 1600, mood: 2 });
  assert.ok(alerts.some((item) => item.metric === "spo2"));
  assert.ok(alerts.some((item) => item.metric === "co2"));
  assert.ok(alerts.some((item) => item.metric === "mood"));
});

test("trend alert compares a new record to the previous reading", () => {
  const alerts = assessHealthRecord({ heartRate: 90 }, { heartRate: 70 });
  assert.ok(alerts.some((item) => item.metric === "heartRate" && item.direction === "rising"));
});

test("record creation returns timestamped record with alerts", () => {
  const record = createHealthRecord({ heartRate: 70, source: "wearable" }, "crew-1");
  assert.equal(record.crewId, "crew-1");
  assert.equal(record.source, "wearable");
  assert.ok(Date.parse(record.recordedAt));
});


test("baseline validation accepts supported metrics and rejects unknown metrics", () => {
  const good = validateBaseline({ heartRate: 65, glucose: 90, systolic: 115 });
  assert.equal(good.valid, true);
  assert.equal(good.values.heartRate, 65);
  const bad = validateBaseline({ unknownSignal: 12 });
  assert.equal(bad.valid, false);
});

test("personal baseline deviations create review alerts", () => {
  const alerts = assessAgainstBaseline({ heartRate: 90, spo2: 96 }, { values: { heartRate: 70, spo2: 97 } });
  assert.ok(alerts.some((item) => item.metric === "heartRate" && item.direction === "above-baseline"));
  assert.ok(!alerts.some((item) => item.metric === "spo2"));
});

test("trend summary reports chronological points and direction", () => {
  const trend = summarizeMetricTrend([
    { recordedAt: "2026-01-02T00:00:00.000Z", values: { glucose: 110 }, source: "manual" },
    { recordedAt: "2026-01-01T00:00:00.000Z", values: { glucose: 90 }, source: "manual" }
  ], "glucose");
  assert.equal(trend.direction, "rising");
  assert.equal(trend.average, 100);
  assert.equal(trend.points[0].value, 90);
});

test("health record includes personalized baseline screening", () => {
  const record = createHealthRecord({ heartRate: 90 }, "crew-baseline", { heartRate: 70 }, { values: { heartRate: 70 } });
  assert.ok(record.alerts.some((item) => item.metric === "heartRate" && item.baseline === 70));
});
