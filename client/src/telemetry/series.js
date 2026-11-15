// Deterministic illustrative 24h trace for the scenario (non-live) view, so charts are scaled to real values.
import { mulberry32, gaussian } from "./prng.js";

export function seriesFor(key, current, baseline, { points = 96, noise = 1.5, seed = 1 } = {}) {
  const rand = mulberry32([...String(key)].reduce((a, c) => a * 31 + c.charCodeAt(0), seed));
  const out = [];
  let ar = 0;
  for (let i = 0; i < points; i++) {
    ar = 0.85 * ar + gaussian(rand) * noise;
    const ramp = Math.max(0, (i - points * 0.7) / (points * 0.3)); // deviation develops over the last ~30%
    out.push(baseline + (current - baseline) * ramp * ramp + ar * (1 - 0.5 * ramp));
  }
  out[points - 1] = current; // last point is the displayed value
  return out;
}
