import React, { useEffect, useState } from "react";
import "./resilience-center.css";

const KEY = "astravitals.resilience.v1";
const EMPTY = { notes: [], audit: [], localOnlyAcknowledged: false };
const now = () => new Date().toISOString();
const uid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);

function load() {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return EMPTY; }
}

export default function ResilienceCenter() {
  const [data, setData] = useState(load);
  const [entry, setEntry] = useState("");
  const [kind, setKind] = useState("Observation");
  const [showEmergency, setShowEmergency] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(data)); }, [data]);

  function record(action, detail) {
    setData(old => ({ ...old, audit: [{ id: uid(), at: now(), action, detail }, ...old.audit].slice(0, 100) }));
  }
  function addNote(e) {
    e.preventDefault();
    if (!entry.trim()) return;
    const note = { id: uid(), at: now(), kind, text: entry.trim() };
    setData(old => ({ ...old, notes: [note, ...old.notes] }));
    record("Crew context added", kind);
    setEntry("");
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify({ product: "AstraVitals", exportedAt: now(), data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "astravitals-local-data.json"; a.click();
    URL.revokeObjectURL(url);
    setNotice("JSON export created.");
    record("Local data exported", "JSON");
  }
  function clearLocal() {
    if (!window.confirm("Delete this module's notes and activity history from this browser?")) return;
    localStorage.removeItem(KEY);
    setData(EMPTY);
    setNotice("Local module data deleted.");
  }
  function acknowledge(e) {
    const checked = e.target.checked;
    setData(old => ({ ...old, localOnlyAcknowledged: checked }));
    record("Storage preference changed", checked ? "Local storage acknowledged" : "Acknowledgement withdrawn");
  }

  return <main className="av-resilience">
    <header className="av-r-head">
      <div><span className="av-r-kicker">MISSION ASSURANCE / ADDITIVE MODULE</span>
        <h2>Resilience Center</h2>
        <p>Additional safeguards for data quality, crew context, emergency awareness and transparency.</p></div>
      <span className="av-r-pill">LOCAL-FIRST DEMO</span>
    </header>

    <section className="av-r-grid">
      <article className="av-r-card av-r-emergency">
        <div className="av-r-meta"><span>INDEPENDENT SAFETY PATH</span><b>GUARDRAIL</b></div>
        <h3>Emergency pathway</h3>
        <p>Urgent symptoms should never wait for a hypothesis ranking or routine check sequence.</p>
        <button className="av-r-danger" onClick={() => setShowEmergency(v => !v)}>
          {showEmergency ? "Hide emergency reminder" : "Show emergency reminder"}
        </button>
        {showEmergency && <div className="av-r-alert" role="alert">
          <strong>Stop routine investigation.</strong> Follow the mission-approved emergency medical procedure and contact the designated medical authority immediately. This prototype does not assess medical urgency.
        </div>}
      </article>

      <article className="av-r-card">
        <div className="av-r-meta"><span>INPUT INTEGRITY</span><b>QUALITY GATE</b></div>
        <h3>Measurement data quality</h3>
        <ul><li>Validate numeric format and configured plausibility bounds.</li>
          <li>Check timestamp freshness and out-of-order readings.</li>
          <li>Flag suspect readings while preserving original values.</li>
          <li>Do not silently replace missing readings with zero.</li></ul>
        <p className="av-r-muted">These are integration requirements, not a connected production ingestion validator. Demo bounds are not clinical reference ranges.</p>
      </article>

      <article className="av-r-card">
        <div className="av-r-meta"><span>CREW CONTEXT</span><b>HEALTH MEMORY</b></div>
        <h3>Observation & intervention notes</h3>
        <form className="av-r-form" onSubmit={addNote}>
          <select value={kind} onChange={e => setKind(e.target.value)} aria-label="Note type">
            <option>Observation</option><option>Symptom</option><option>Intervention</option><option>Equipment</option>
          </select>
          <textarea rows="3" value={entry} onChange={e => setEntry(e.target.value)} placeholder="Add a timestamped crew-entered note…" />
          <button className="av-r-primary" type="submit">Save local note</button>
        </form>
        <div className="av-r-scroll">{data.notes.length ? data.notes.slice(0, 6).map(n =>
          <div className="av-r-note" key={n.id}><div><b>{n.kind}</b><time>{new Date(n.at).toLocaleString()}</time></div><p>{n.text}</p></div>
        ) : <p className="av-r-muted">No notes recorded yet.</p>}</div>
        <p className="av-r-muted">Notes preserve context; they do not establish causation or clinical fact.</p>
      </article>

      <article className="av-r-card">
        <div className="av-r-meta"><span>TRANSPARENCY</span><b>ACTIVITY HISTORY</b></div>
        <h3>Local activity trail</h3>
        <p className="av-r-muted">A browser-local record of actions in this module. It is not tamper-proof and is not a regulated medical audit log.</p>
        <div className="av-r-scroll">{data.audit.length ? data.audit.slice(0, 8).map(a =>
          <div className="av-r-audit" key={a.id}><time>{new Date(a.at).toLocaleString()}</time><b>{a.action}</b><span>{a.detail}</span></div>
        ) : <p className="av-r-muted">No activity recorded.</p>}</div>
      </article>

      <article className="av-r-card av-r-wide">
        <div className="av-r-meta"><span>DATA SOVEREIGNTY</span><b>PRIVACY & SYNC</b></div>
        <h3>Storage and synchronization controls</h3>
        <label className="av-r-consent"><input type="checkbox" checked={data.localOnlyAcknowledged} onChange={acknowledge} />
          I understand this module stores its notes and activity history locally in this browser.</label>
        <div className="av-r-actions"><button className="av-r-primary" onClick={exportJson}>Export local JSON</button>
          <button className="av-r-secondary" onClick={clearLocal}>Delete local module data</button></div>
        {notice && <p className="av-r-muted" aria-live="polite">{notice}</p>}
        <div className="av-r-sync"><b>Sync status</b><span>Offline queue placeholder — no remote sync endpoint is configured.</span>
          <small>Production synchronization requires authenticated encrypted transport, device identity, access controls, key management and conflict resolution.</small></div>
      </article>
    </section>

    <footer className="av-r-footer"><b>Prototype limitations</b>
      <p>AstraVitals is a decision-support prototype, not a diagnostic device. Hypothesis rankings and suggested checks require clinical validation. Emergency response remains governed by mission-approved procedures and qualified human authority.</p>
    </footer>
  </main>;
}
