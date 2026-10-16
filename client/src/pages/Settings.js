import React, { useEffect, useState } from "react";

export default function Settings() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    fetch("http://localhost:8000/api/settings")
      .then((res) => res.json())
      .then(setSettings)
      .catch(() => setSettings({ version: "2026.Q1.demo", baseRate: 12000, minAdjustment: -35, maxAdjustment: 25 }));
  }, []);

  if (!settings) return <div className="page-card">Loading settings…</div>;

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Policy controls</p>
          <h1>Settings</h1>
        </div>
      </div>

      <div className="two-column-grid">
        <div className="page-card">
          <h3>Pricing rule configuration</h3>
          <ul className="bullet-list">
            <li>Version: {settings.version}</li>
            <li>Base rate: ₹{settings.baseRate}</li>
            <li>Minimum adjustment: {settings.minAdjustment}%</li>
            <li>Maximum adjustment: {settings.maxAdjustment}%</li>
          </ul>
        </div>

        <div className="page-card">
          <h3>Scoring assumptions</h3>
          <ul className="bullet-list">
            <li>Speeding events: 25% weight</li>
            <li>Harsh braking: 20% weight</li>
            <li>Rapid acceleration: 20% weight</li>
            <li>Driving consistency: 20% weight</li>
            <li>Vehicle usage: 15% weight</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
