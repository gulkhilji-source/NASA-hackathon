import React, { useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Info, Siren, Watch, X } from "lucide-react";
import BodyMap from "./BodyMap.jsx";
import {
  FIELD_SPECS, MOOD_LABELS, REGIONS, SEVERITY_LABELS, completeness, validateEntry, summarizeEntry
} from "../../../server/src/vitals.js";
import "./wearable.css";
import "./checkin.css";

export const HAZARD_LABELS = {
  radiation: "Space radiation", isolation: "Isolation & confinement", distance: "Distance from Earth",
  gravity: "Altered gravity", environment: "Closed environment"
};

const EMPTY = {
  hr: "", sys: "", dia: "", glucose: "", glucoseContext: "fasting", temp: "", spo2: "",
  sleepHours: "", mood: "", exerciseMin: "", radiationMsv: "", note: ""
};

// hint = the NASA hazard the indicator mainly helps monitor
const FIELDS = [
  { key: "hr", hint: "Altered gravity", step: "1" },
  { key: "spo2", hint: "Closed environment", step: "1" },
  { key: "temp", hint: "Closed environment", step: "0.1" },
  { key: "glucose", hint: "Metabolic", step: "1" },
  { key: "sleepHours", hint: "Isolation", step: "0.1" },
  { key: "exerciseMin", hint: "Altered gravity", step: "5" },
  { key: "radiationMsv", hint: "Space radiation", step: "0.01" }
];

export function GuidanceCard({ g }) {
  const Icon = g.tone === "urgent" ? Siren : g.tone === "review" ? AlertTriangle : Info;
  return (
    <article className={`ci-guide ${g.tone}`}>
      <header><Icon size={16} /><h4>{g.title}</h4>{g.hazard && <span className="ci-chip">{HAZARD_LABELS[g.hazard]}</span>}</header>
      <p className="ci-because">{g.because}</p>
      <ol>{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
    </article>
  );
}

export default function CheckInView({ latest, latestFlags = [], guidance = [], reminders = [], wearable, onSave }) {
  const [form, setForm] = useState(EMPTY);
  const [symptoms, setSymptoms] = useState([]);
  const [active, setActive] = useState(null);
  const [sev, setSev] = useState(1);
  const [symNote, setSymNote] = useState("");
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("");

  // Editing a field clears its own error (and the generic form error) so stale messages never linger.
  const clearErrors = (keys) => setErrors((old) => {
    const next = { ...old }; delete next.form; keys.forEach((k) => delete next[k]);
    if (keys.includes("sys") || keys.includes("dia")) { delete next.sys; delete next.dia; }
    return next;
  });
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setStatus(""); clearErrors(Object.keys(patch)); };
  const filled = completeness(validateEntry({ ...form, symptoms }).entry);

  function pickRegion(id) {
    setActive(id);
    const existing = symptoms.find((s) => s.region === id);
    setSev(existing?.severity || 1);
    setSymNote(existing?.note || "");
  }
  function saveSymptom() {
    if (!active) return;
    setSymptoms((old) => [...old.filter((s) => s.region !== active), { region: active, severity: sev, note: symNote.trim() }]);
    clearErrors(["symptoms"]);
    setActive(null); setSymNote(""); setStatus("");
  }
  function removeSymptom(region) { setSymptoms((old) => old.filter((s) => s.region !== region)); if (active === region) setActive(null); }
  function fillFromWearable() {
    if (!wearable) return;
    set({ hr: String(wearable.hr), spo2: String(wearable.spo2) });
  }
  function submit(e) {
    e.preventDefault();
    const result = validateEntry({ ...form, symptoms });
    setErrors(result.errors);
    if (!result.valid) { setStatus(""); return; }
    onSave(result.entry);
    setForm(EMPTY); setSymptoms([]); setActive(null);
    setStatus("Check-in saved on this device. Guidance below is updated.");
  }

  return (
    <>
      {reminders.length > 0 && (
        <section className="ci-reminders" aria-label="Reminders">
          {reminders.map((r) => <div key={r.id} className="ci-reminder"><Bell size={14} /><b>{r.label}</b><span>{r.detail}</span></div>)}
        </section>
      )}

      <div className="ci-layout">
        <form className="panel ci-form" onSubmit={submit} noValidate>
          <div className="panel-title"><div><CheckCircle2 size={19} /><h2>Daily Check-in</h2></div><span>{Math.round(filled * 100)}% of core indicators</span></div>
          <div className="ci-progress" aria-hidden="true"><i style={{ width: `${filled * 100}%` }} /></div>
          <p className="sim-note">Enter what you measured. Every field is optional, but at least one value is needed. Readings are checked for plausibility and against review limits (illustrative demo limits, not clinical).</p>

          <div className="ci-wearable-row">
            <button type="button" className="preset-chip" onClick={fillFromWearable} disabled={!wearable}
              title={wearable ? "Copy resting HR and SpO₂ from the wearable" : "Needs the live wearable, good signal quality and a resting crew member"}>
              <Watch size={12} /> Fill HR and SpO₂ from wearable
            </button>
            {!wearable && <small>Available when the live wearable has good signal quality and you are at rest.</small>}
          </div>

          <div className="ci-grid">
            <div className="ci-field ci-bp">
              <label htmlFor="ci-sys">Blood pressure <small>mmHg · Altered gravity</small></label>
              <div className="ci-bp-pair">
                <input id="ci-sys" inputMode="numeric" placeholder="Systolic" value={form.sys} onChange={(e) => set({ sys: e.target.value })} aria-invalid={Boolean(errors.sys)} />
                <span>/</span>
                <input id="ci-dia" inputMode="numeric" placeholder="Diastolic" aria-label="Diastolic" value={form.dia} onChange={(e) => set({ dia: e.target.value })} aria-invalid={Boolean(errors.dia)} />
              </div>
              {(errors.sys || errors.dia) && <em className="ci-error" role="alert">{errors.sys || errors.dia}</em>}
            </div>

            {FIELDS.map((f) => {
              const spec = FIELD_SPECS[f.key];
              return (
                <div className="ci-field" key={f.key}>
                  <label htmlFor={`ci-${f.key}`}>{spec.label} <small>{spec.unit} · {f.hint}</small></label>
                  <input id={`ci-${f.key}`} inputMode="decimal" value={form[f.key]} onChange={(e) => set({ [f.key]: e.target.value })} aria-invalid={Boolean(errors[f.key])} />
                  {f.key === "glucose" && (
                    <select aria-label="Glucose context" value={form.glucoseContext} onChange={(e) => set({ glucoseContext: e.target.value })}>
                      <option value="fasting">Fasting</option><option value="postMeal">About 2 h after a meal</option><option value="unsure">Not sure</option>
                    </select>
                  )}
                  {errors[f.key] && <em className="ci-error" role="alert">{errors[f.key]}</em>}
                </div>
              );
            })}
          </div>

          <div className="ci-field">
            <label id="ci-mood-label">Mood today <small>Isolation &amp; confinement</small></label>
            <div className="ci-mood" role="radiogroup" aria-labelledby="ci-mood-label">
              {MOOD_LABELS.map((label, i) => (
                <button type="button" key={label} role="radio" aria-checked={form.mood === String(i + 1)}
                  className={form.mood === String(i + 1) ? "on" : ""} onClick={() => set({ mood: form.mood === String(i + 1) ? "" : String(i + 1) })}>
                  <b>{i + 1}</b><span>{label}</span>
                </button>
              ))}
            </div>
            {errors.mood && <em className="ci-error" role="alert">{errors.mood}</em>}
          </div>

          <div className="ci-field">
            <label htmlFor="ci-note">Note <small>optional, stored with this check-in</small></label>
            <textarea id="ci-note" rows="2" maxLength={500} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="Anything that might explain today's numbers (caffeine, workload, EVA, a bad night…)" />
          </div>

          {errors.symptoms && <em className="ci-error" role="alert">{errors.symptoms}</em>}
          {errors.form && <em className="ci-error" role="alert">{errors.form}</em>}
          <button className="primary-button" type="submit">Save check-in</button>
          {status && <p className="ci-status" role="status" aria-live="polite"><CheckCircle2 size={14} /> {status}</p>}
        </form>

        <section className="panel ci-body">
          <div className="panel-title"><div><AlertTriangle size={19} /><h2>Body Map</h2></div><span>{symptoms.length} logged</span></div>
          <p className="sim-note">Select where you feel discomfort, choose how strong it is, then add it to this check-in.</p>
          <BodyMap symptoms={symptoms} active={active} onSelect={pickRegion} />
          {active ? (
            <div className="ci-symptom-editor">
              <b>{REGIONS[active]}</b>
              <div className="seg-toggle" role="group" aria-label="Severity">
                {[1, 2, 3].map((n) => <button type="button" key={n} className={sev === n ? "active" : ""} onClick={() => setSev(n)}>{SEVERITY_LABELS[n]}</button>)}
              </div>
              <input aria-label="Symptom note" maxLength={200} placeholder="What does it feel like? (optional)" value={symNote} onChange={(e) => setSymNote(e.target.value)} />
              <div className="btn-row"><button type="button" className="preset-chip" onClick={saveSymptom}>Add to check-in</button>
                <button type="button" className="skip-button" onClick={() => setActive(null)}>Cancel</button></div>
            </div>
          ) : <p className="sim-note">No region selected.</p>}
          {symptoms.length > 0 && (
            <ul className="ci-symptom-list">
              {symptoms.map((s) => (
                <li key={s.region} className={`sev-${s.severity}`}>
                  <span><b>{REGIONS[s.region]}</b> · {SEVERITY_LABELS[s.severity]}{s.note ? ` · ${s.note}` : ""}</span>
                  <button type="button" aria-label={`Remove ${REGIONS[s.region]}`} onClick={() => removeSymptom(s.region)}><X size={12} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel view-panel ci-guidance">
        <h2>Guidance{latest ? <small> · from your latest check-in ({new Date(latest.at).toLocaleString()})</small> : null}</h2>
        {latest && <p className="sim-note">{summarizeEntry(latest)}</p>}
        {latestFlags.filter((f) => f.severity !== "notice").length > 0 && <p className="sim-note"><b>{latestFlags.filter((f) => f.severity !== "notice").length}</b> value(s) crossed a review limit.</p>}
        {latest ? <div className="ci-guide-grid">{guidance.map((g) => <GuidanceCard key={g.id} g={g} />)}</div>
          : <p className="sim-note">Save your first check-in to receive guidance. Until then there is nothing to assess.</p>}
        <p className="ci-disclaimer"><AlertTriangle size={12} /> Decision support only. This is not a diagnosis and does not replace the flight surgeon or mission medical procedures. Limits shown are illustrative.</p>
      </section>
    </>
  );
}
