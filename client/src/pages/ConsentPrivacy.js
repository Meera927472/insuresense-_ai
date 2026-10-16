import React, { useEffect, useState } from "react";

export default function ConsentPrivacy() {
  const [consent, setConsent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8000/api/privacy")
      .then((res) => res.json())
      .then((data) => {
        setConsent(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !consent) {
    return <div className="page-card">Loading consent settings…</div>;
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Privacy controls</p>
          <h1>Consent & Privacy</h1>
        </div>
        <div className="tag-badge demo-tag">Current status: {consent.status}</div>
      </div>

      <div className="two-column-grid">
        <div className="page-card">
          <h3>Permission summary</h3>
          <ul className="bullet-list">
            <li>Optional data: {consent.permissions.optionalData ? "Enabled" : "Disabled"}</li>
            <li>Telemetry: {consent.permissions.telemetry ? "Enabled" : "Disabled"}</li>
            <li>Analytics: {consent.permissions.analytics ? "Enabled" : "Disabled"}</li>
            <li>Retention: {consent.retentionDays} days</li>
          </ul>
        </div>

        <div className="page-card">
          <h3>Consent history</h3>
          <div className="list-stack">
            {consent.history.map((item) => (
              <div key={item.date} className="list-row small-row">
                <div>
                  <strong>{item.action}</strong>
                  <small>{item.date}</small>
                </div>
                <span>{item.details}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="page-card">
        <h3>Privacy actions</h3>
        <div className="action-row">
          <button className="secondary-btn">Request data export</button>
          <button className="secondary-btn">Request deletion</button>
          <button className="primary-btn danger-btn">Withdraw consent</button>
        </div>
      </div>
    </div>
  );
}
