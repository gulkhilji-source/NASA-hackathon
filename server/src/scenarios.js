export const scenarios = [
  {
    id: "night-41",
    name: "Night 41 · Space weather",
    mission: "Artemis-III",
    astronaut: "Alex Rivera",
    role: "Flight Engineer",
    sol: "41, 03:10",
    heartRate: 78,
    heartRateBaseline: 66,
    spo2: 96,
    temperature: 37.2,
    sleepHours: 5,
    co2: 412,
    radiation: 0.12,
    weather: "Active · 22h ago",
    alert: "Heart rate is 18% above personal baseline",
    context: { spaceWeatherRecent: true, shortSleepNights: 3, elevatedCO2: false },
    observations: ["Heart-rate deviation detected (+18% vs personal baseline)", "Space-weather event recorded 22 hours ago", "Three consecutive short-sleep nights"]
  },
  {
    id: "co2-rise",
    name: "Cabin CO₂ rise",
    mission: "Artemis-III",
    astronaut: "Maya Chen",
    role: "Mission Specialist",
    sol: "56, 14:25",
    heartRate: 82,
    heartRateBaseline: 68,
    spo2: 94,
    temperature: 37.0,
    sleepHours: 7,
    co2: 1850,
    radiation: 0.08,
    weather: "Quiet",
    alert: "Heart rate and oxygen saturation differ from baseline",
    context: { spaceWeatherRecent: false, shortSleepNights: 0, elevatedCO2: true },
    observations: ["CO₂ above configured cabin threshold", "SpO₂ below personal baseline"]
  },
  {
    id: "sleep-debt",
    name: "Sleep debt · Isolation",
    mission: "Transit Vehicle",
    astronaut: "Jordan Okafor",
    role: "Pilot",
    sol: "73, 06:40",
    heartRate: 75,
    heartRateBaseline: 64,
    spo2: 97,
    temperature: 36.9,
    sleepHours: 4.5,
    co2: 430,
    radiation: 0.10,
    weather: "Quiet",
    alert: "Resting heart rate trend is elevated",
    context: { spaceWeatherRecent: false, shortSleepNights: 4, elevatedCO2: false },
    observations: ["Four short-sleep nights", "Mood check-in trend is lower than baseline"]
  }
];

export function getScenario(id) {
  return scenarios.find((scenario) => scenario.id === id);
}
