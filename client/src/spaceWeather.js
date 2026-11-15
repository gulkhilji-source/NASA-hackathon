// Optional live space-weather context from NASA DONKI (solar flares, M/X class only).
// Falls back to the last cached value when offline. Uses NASA's public DEMO_KEY unless you pass your own.
const CACHE_KEY = "astravitals.spaceweather.v1";
const fmt = (d) => new Date(d).toISOString().slice(0, 10);

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; }
}

export async function fetchSpaceWeather({ apiKey = "DEMO_KEY", days = 3, now = Date.now() } = {}) {
  const url = `https://api.nasa.gov/DONKI/FLR?startDate=${fmt(now - days * 864e5)}&endDate=${fmt(now)}&api_key=${apiKey}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`DONKI HTTP ${response.status}`);
    const events = await response.json();
    const strong = (Array.isArray(events) ? events : []).filter((e) => /^[MX]/i.test(e.classType || ""));
    const peaks = strong.map((e) => Date.parse(e.peakTime)).filter(Number.isFinite);
    const result = {
      hoursAgo: peaks.length ? Math.max(0, Math.round((now - Math.max(...peaks)) / 36e5)) : null,
      detail: peaks.length ? `${strong.length} M/X-class flare(s) in last ${days} days` : `No M/X-class flares in last ${days} days`,
      source: "NASA DONKI", fetchedAt: new Date(now).toISOString(), cached: false
    };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch { /* storage unavailable */ }
    return result;
  } catch (error) {
    const cached = readCache();
    if (cached) return { ...cached, cached: true, detail: `${cached.detail} (cached — feed unreachable)` };
    return { hoursAgo: null, detail: "Feed unreachable and no cached value; using simulated setting", source: "none", cached: false, error: error.message };
  }
}
