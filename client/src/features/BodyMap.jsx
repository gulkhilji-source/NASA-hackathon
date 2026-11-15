import React from "react";
import { REGIONS, SEVERITY_LABELS } from "../../../server/src/vitals.js";

// Front-view figure. In a front view the person's LEFT side is on the viewer's RIGHT.
const SHAPES = [
  { id: "head", t: "circle", cx: 100, cy: 36, r: 24 },
  { id: "eyes", t: "rect", x: 82, y: 28, w: 36, h: 13, rx: 6 },
  { id: "chest", t: "rect", x: 64, y: 68, w: 72, h: 58, rx: 14 },
  { id: "abdomen", t: "rect", x: 68, y: 130, w: 64, h: 50, rx: 12 },
  { id: "rightArm", t: "rect", x: 30, y: 74, w: 28, h: 116, rx: 14 },
  { id: "leftArm", t: "rect", x: 142, y: 74, w: 28, h: 116, rx: 14 },
  { id: "rightLeg", t: "rect", x: 68, y: 186, w: 30, h: 140, rx: 14 },
  { id: "leftLeg", t: "rect", x: 102, y: 186, w: 30, h: 140, rx: 14 }
];

export default function BodyMap({ symptoms = [], active, onSelect }) {
  const sev = Object.fromEntries(symptoms.map((s) => [s.region, s.severity]));
  const press = (id) => (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } };
  const label = (id) => `${REGIONS[id]}${sev[id] ? `, ${SEVERITY_LABELS[sev[id]].toLowerCase()} symptom logged` : ""}`;
  const common = (id) => ({
    role: "button", tabIndex: 0, "aria-label": label(id), "aria-pressed": active === id,
    className: `ci-region sev-${sev[id] || 0}${active === id ? " active" : ""}`,
    onClick: () => onSelect(id), onKeyDown: press(id)
  });
  return (
    <div className="ci-bodymap">
      <svg viewBox="0 0 200 330" role="group" aria-label="Interactive body map. Select a region to log a symptom.">
        {SHAPES.map((s) => (
          <g key={s.id} {...common(s.id)}>
            <title>{REGIONS[s.id]}</title>
            {s.t === "circle" ? <circle cx={s.cx} cy={s.cy} r={s.r} /> : <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} />}
          </g>
        ))}
      </svg>
      <button type="button" {...common("back")} className={`ci-back-chip sev-${sev.back || 0}${active === "back" ? " active" : ""}`}>
        Back (not visible from the front)
      </button>
    </div>
  );
}
