// Transparent, intentionally simple mission-watch heuristic. Not a clinical model.
export function buildMissionWatch({ measurements = [], wellbeing = [], symptoms = [] } = {}) {
  const latest = measurements[0];
  const factors = [];
  let score = 0;
  const add = (points, code, label, detail) => {
    score += points;
    factors.push({ code, label, detail, points });
  };
  if (latest?.alerts?.length) add(Math.min(35, latest.alerts.length * 10), "latest-alerts", "Recent screening alerts", `${latest.alerts.length} alert(s) on the latest reading`);
  const recentSleep = measurements.slice(0, 3).map((record) => record.values?.sleepHours).filter(Number.isFinite);
  if (recentSleep.length >= 2 && recentSleep.every((hours) => hours < 6)) add(15, "sleep-pattern", "Repeated short sleep", "At least two recent sleep entries were under six hours");
  if (wellbeing[0]?.stress >= 4) add(10, "stress", "High recent stress rating", "Latest self-reported stress was 4 or 5 out of 5");
  if (wellbeing[0]?.mood <= 2) add(10, "mood", "Low recent mood rating", "Latest self-reported mood was 1 or 2 out of 5");
  if (symptoms[0]?.severity >= 4) add(15, "symptoms", "High-severity symptom report", "Latest symptom report was rated 4 or 5 out of 5");
  const radiation = Number(latest?.values?.radiation);
  if (Number.isFinite(radiation) && radiation >= 0.5) add(10, "radiation-context", "Radiation context flag", "Latest recorded radiation value is at or above the prototype review marker");
  score = Math.min(100, score);
  const level = score >= 50 ? "priority-review" : score >= 25 ? "review" : "routine-monitoring";
  const recommendations = factors.length
    ? ["Review the underlying records and measurement quality.", "Discuss concerning changes with the authorised flight medical officer.", "Follow mission-specific emergency and escalation procedures."]
    : ["Continue scheduled monitoring and routine wellbeing check-ins."];
  return {
    score, level, factors, recommendations,
    disclaimer: "Rule-based mission-watch prioritisation only. Not a diagnosis, prediction of disease, or substitute for mission medical authority."
  };
}
