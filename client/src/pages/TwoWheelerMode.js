import React, { useState } from "react";

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export default function TwoWheelerMode() {
  const [vehicleType, setVehicleType] = useState("Motorcycle");
  const [helmetDetected, setHelmetDetected] = useState(true);
  const [speedingEvents, setSpeedingEvents] = useState(0.5);
  const [harshBraking, setHarshBraking] = useState(0.5);
  const [rapidAcceleration, setRapidAcceleration] = useState(0.4);
  const [nightRides, setNightRides] = useState(0);
  const [averageLean, setAverageLean] = useState(18);
  const [maxLean, setMaxLean] = useState(32);
  const [roadContext, setRoadContext] = useState("clear");

  const score = Math.round(clamp(
    100
      - Math.min(100, speedingEvents * 11) * 0.25
      - Math.min(100, roadContext === "hazard" ? 0 : harshBraking * 14) * 0.2
      - Math.min(100, rapidAcceleration * 15) * 0.2
      - Math.max(0, nightRides - 3) * 1.5,
    0,
    100
  ) * 10) / 10;

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Dedicated ride intelligence</p>
          <h1>Two-Wheeler Mode</h1>
          <p className="page-subtitle">Motorcycle and scooter indicators with simulated helmet and lean telemetry. No hardware or camera is required.</p>
        </div>
        <span className="tag-badge demo-tag">Illustrative ride score</span>
      </div>

      <div className="two-column-grid">
        <section className="page-card">
          <div className="card-header"><h3>Ride profile</h3><span className="pill">Demo simulator</span></div>
          <label>
            Vehicle type
            <select value={vehicleType} onChange={(event) => setVehicleType(event.target.value)}>
              <option>Motorcycle</option>
              <option>Scooter</option>
              <option>Electric scooter</option>
              <option>Other two-wheeler</option>
            </select>
          </label>
          <label className="consent-check helmet-toggle">
            <input type="checkbox" checked={helmetDetected} onChange={(event) => setHelmetDetected(event.target.checked)} />
            Simulate Bluetooth helmet sensor detected
          </label>
          <p className={`helmet-status ${helmetDetected ? "detected" : "not-detected"}`}>
            Helmet sensor: {helmetDetected ? "Detected (simulated)" : "Not detected (simulated)"}
          </p>
          <label>
            Road context
            <select value={roadContext} onChange={(event) => setRoadContext(event.target.value)}>
              <option value="clear">Clear road (simulated)</option>
              <option value="hazard">Pothole / rough road event</option>
              <option value="rain">Rain context</option>
            </select>
          </label>
          <label>
            Speeding indicators
            <input type="range" min="0" max="6" step="0.1" value={speedingEvents} onChange={(event) => setSpeedingEvents(Number(event.target.value))} />
            <span>{speedingEvents.toFixed(1)} illustrative events</span>
          </label>
          <label>
            Sudden braking indicators
            <input type="range" min="0" max="6" step="0.1" value={harshBraking} onChange={(event) => setHarshBraking(Number(event.target.value))} />
            <span>{harshBraking.toFixed(1)} illustrative events</span>
          </label>
          <label>
            Acceleration indicators
            <input type="range" min="0" max="6" step="0.1" value={rapidAcceleration} onChange={(event) => setRapidAcceleration(Number(event.target.value))} />
            <span>{rapidAcceleration.toFixed(1)} illustrative events</span>
          </label>
        </section>

        <section className="page-card">
          <div className="card-header"><h3>Ride safety summary</h3><span className="tag-badge info-tag">No real sensor connected</span></div>
          <div className="twowheel-score"><span>Provisional ride score</span><strong>{score}</strong><small>out of 100 · illustrative only</small></div>
          <div className="metric-card lean-card">
            <span>Simulated lean-angle intelligence</span>
            <div className="lean-values">
              <label>Average lean (°)<input type="number" min="0" max="60" value={averageLean} onChange={(event) => setAverageLean(clamp(Number(event.target.value), 0, 60))} /></label>
              <label>Maximum lean (°)<input type="number" min="0" max="70" value={maxLean} onChange={(event) => setMaxLean(clamp(Number(event.target.value), 0, 70))} /></label>
            </div>
            <p className="muted-copy">{maxLean > 45 ? "Higher lean angle is a context signal, not a danger label by itself. Speed, curvature, braking and road surface are not measured here." : "Lean values are shown as telemetry context only; they are not independently classified as unsafe."}</p>
          </div>
          <label>
            Night riding (demo trips)
            <input type="number" min="0" max="30" value={nightRides} onChange={(event) => setNightRides(clamp(Number(event.target.value), 0, 30))} />
          </label>
          {roadContext !== "clear" && <div className="offline-banner">{roadContext === "hazard" ? "Road-context event detected — sudden braking is excluded from this provisional score." : "Rain context selected — allow extra stopping distance; this prototype does not validate weather."}</div>}
          <div className="explanation-box">This ride score is a coaching demonstration. It does not determine insurance eligibility, premium discounts or claim settlement.</div>
        </section>
      </div>
    </div>
  );
}
