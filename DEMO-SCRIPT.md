# 3-minute demo script (rehearse to 3:00; cut the exercise step first if you run long)

**0:00 Problem.** Crews are far from Earth, communication is delayed, and a raised heart rate has many benign and serious causes. Plain dashboards show numbers; AstraVitals says what to check next.

**0:25 Baseline.** Live wearable (simulated). "At baseline the engine says: nothing to investigate."

**0:40 Sleep debt.** Click *Sleep debt (4 nights)*. Deviation appears (z-score and CUSUM). Start Investigation: next best check, probabilities, reasoning trail.

**1:15 Exercise.** Click *Exercise*. Heart rate doubles, but the IMU explains it: no alarm. "A raw threshold would have cried wolf."

**1:35 Loose strap.** Click *Loose strap*. Signal quality drops, Sensor Error rises; optical alerts are marked unverified. "The wearable tells the engine how much to trust it."

**1:55 CO2 rise.** Click *CO₂ rise*. The sensor answers the CO2 check by itself (0 crew minutes); engine converges on Cabin CO₂.

**2:15 Safety.** Click *Low SpO₂ (critical)*. A red escalation banner appears and routine investigation stops: critical limits fire before any probability is shown.

**2:20 Your own data (guide requirement).** Trends tab: *Load 14-day synthetic demo history*. Sleep, mood, exercise flagged against the astronaut's own baseline. Check-in tab: guidance cards tagged with the NASA hazard they address. Body map: tap Eyes, Mild (SANS watch). "The crew's typed-in mood answers the engine's mood check at zero crew time."

**2:20 Crew input + trends.** Check-in tab: enter BP and mood, tap the eyes on the body map. Trends tab: load the 14-day synthetic history; sleep, mood and exercise drift is flagged against the crew member's own baseline, with the five NASA hazards mapped to live data. Guidance appears with a hazard tag.

**2:30 Handoff + trust.** Mission Reports: SBAR for delayed ground contact. Settings: hash-chained log, Verify.

**2:50 Honest limits.** Simulated data and wearable, illustrative likelihoods, not clinically validated. Next: physical bench build and public-dataset replay.
