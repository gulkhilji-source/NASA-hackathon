// Tamper-evident (hash-chained) activity log helpers. Newest entry first; each entry commits to the previous hash.
export const GENESIS = "GENESIS";

export async function sha256(text) {
  if (!globalThis.crypto?.subtle) return null; // insecure context: chain cannot be computed
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const payload = (e, prev) => JSON.stringify({ id: e.id, at: e.at, action: e.action, detail: e.detail, prev });

export async function appendEntry(audit, { id, at, action, detail }) {
  const prev = audit[0]?.hash || GENESIS;
  const entry = { id, at, action, detail, prev };
  const hash = await sha256(payload(entry, prev));
  if (hash) entry.hash = hash;
  return [entry, ...audit];
}

export async function verifyChain(audit) {
  for (let i = 0; i < audit.length; i++) {
    const e = audit[i];
    if (!e.hash) return { ok: true, legacyFrom: i, checked: i }; // older unchained entries
    const expected = await sha256(payload(e, e.prev));
    if (expected === null) return { ok: false, reason: "WebCrypto unavailable in this context (use https or localhost).", checked: i };
    if (expected !== e.hash) return { ok: false, reason: `Entry ${i + 1} (${e.action}) was altered.`, checked: i };
    const older = audit[i + 1];
    if (older?.hash && older.hash !== e.prev) return { ok: false, reason: `Link between entries ${i + 1} and ${i + 2} is broken (entry removed or reordered).`, checked: i };
  }
  return { ok: true, checked: audit.length };
}
