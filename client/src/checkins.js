// Browser-local persistence for crew check-ins. Corrupt or foreign data is dropped, never trusted.
const KEY = "astravitals.checkins.v1";
const MAX = 400;

export function loadEntries() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((e) => e && typeof e.at === "string" && Number.isFinite(Date.parse(e.at))) : [];
  } catch { return []; }
}

export function saveEntries(entries) {
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX))); } catch { /* storage unavailable */ }
}
