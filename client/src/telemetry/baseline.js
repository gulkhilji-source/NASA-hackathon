// Personal, activity-aware baseline with robust statistics and CUSUM change detection.
// Only trusted (good signal quality) resting samples train the baseline, and samples that
// already look abnormal are NOT absorbed, so a developing problem cannot "move the goalposts".
export const median = (arr) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function createBaselineTracker({ initial = 66, maxSamples = 180, minSamples = 20, restActivity = 0.3, minSqi = 0.6 } = {}) {
  const buffer = [];
  const recentZ = [];      // z-scores of the latest trusted resting samples
  let cusum = 0;

  function stats() {
    if (buffer.length < minSamples) return { baseline: initial, spread: 2.5, learned: false };
    const med = median(buffer);
    const mad = median(buffer.map((v) => Math.abs(v - med)));
    return { baseline: med, spread: Math.max(1.4826 * mad, 2), learned: true };
  }

  return {
    update({ hr, activity, sqi }) {
      const { baseline, spread, learned } = stats();
      const z = (hr - baseline) / spread;
      const resting = activity < restActivity;
      const trusted = sqi >= minSqi;
      if (resting && trusted) {
        if (Math.abs(z) < 2.5 || !learned) {
          buffer.push(hr);
          if (buffer.length > maxSamples) buffer.shift();
        }
        cusum = Math.max(0, cusum + z - 0.5);
        recentZ.push(z);
        if (recentZ.length > 10) recentZ.shift();
      }
      const persistent = recentZ.length >= 8 ? recentZ.filter((v) => v >= 2.5).length / recentZ.length >= 0.7 : null;
      const next = stats();
      return {
        baseline: next.baseline, spread: next.spread, learned: next.learned, z, resting, trusted,
        cusum, sustained: cusum > 6, persistentDeviation: trusted && resting ? persistent : null,
        sampleCount: buffer.length
      };
    }
  };
}
