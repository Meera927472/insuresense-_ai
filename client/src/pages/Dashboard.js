import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const formatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8000/api/dashboard")
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return <div className="page-card">Loading dashboard...</div>;
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Insurance that understands Indian roads</p>
          <h1>InsureSense AI</h1>
        </div>
        <div className="tag-badge demo-tag">{data.demonstrationLabel}</div>
      </div>

      <section className="story-card">
        <p className="eyebrow">A fairer question</p>
        <h2>Traditional insurance asks, “How risky are you?”</h2>
        <p>InsureSense asks, “Was it actually your fault?” Driving behaviour is considered alongside road hazards, context, consent and data integrity.</p>
        <div className="story-links">
          <Link to="/offline">Record an offline trip</Link>
          <Link to="/premium">Understand a premium</Link>
          <Link to="/claims">Prepare claim evidence</Link>
        </div>
      </section>

      <section className="india-road-section">
        <div>
          <p className="eyebrow">India-first · privacy-first · offline-ready</p>
          <h2>Built for real Indian roads</h2>
          <p>From patchy highway connectivity to family vehicles and two-wheelers, the prototype is designed to explain context rather than punish a single event.</p>
        </div>
        <div className="feature-tile-grid">
          <Link to="/offline" className="feature-tile"><strong>Offline ready</strong><span>Local trips and queued sync</span></Link>
          <Link to="/offline" className="feature-tile"><strong>Road context</strong><span>Pothole event · no automatic penalty</span></Link>
          <Link to="/claims" className="feature-tile"><strong>Claim ready</strong><span>Evidence summary from available data</span></Link>
          <Link to="/policy" className="feature-tile"><strong>Tamil assist</strong><span>Policy explanations with a text fallback</span></Link>
          <Link to="/consent" className="feature-tile"><strong>Data receipt</strong><span>See what a trip records and why</span></Link>
          <Link to="/analytics" className="feature-tile"><strong>Driver profiles</strong><span>Separate driver and passenger trips</span></Link>
          <Link to="/road-safety" className="feature-tile"><strong>Road safety</strong><span>See anonymized demo hazard context</span></Link>
          <Link to="/two-wheeler" className="feature-tile"><strong>Two-wheeler mode</strong><span>Helmet and lean indicators, simulated</span></Link>
          <Link to="/passport" className="feature-tile"><strong>Driving passport</strong><span>Share a privacy-minimal verification</span></Link>
          <Link to="/family-fleet" className="feature-tile"><strong>Family & fleet</strong><span>Exposure-weighted profiles with clear math</span></Link>
          <Link to="/documents" className="feature-tile"><strong>Document wallet</strong><span>Policy and vehicle documents available offline</span></Link>
        </div>
      </section>

      <div className="kpi-grid">
        <div className="metric-card">
          <span>Total drivers</span>
          <strong>{data.kpis.totalDrivers}</strong>
        </div>
        <div className="metric-card">
          <span>Total quotes generated</span>
          <strong>{data.kpis.totalQuotes}</strong>
        </div>
        <div className="metric-card">
          <span>Average illustrative driving score</span>
          <strong>{data.kpis.averageDrivingScore}</strong>
        </div>
        <div className="metric-card">
          <span>Average estimated premium</span>
          <strong>{formatter.format(data.kpis.averagePremium)}</strong>
        </div>
      </div>

      <div className="two-column-grid">
        <div className="page-card chart-card">
          <div className="card-header">
            <h3>Monthly quote trends</h3>
          </div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <AreaChart data={data.monthlyTrend}>
                <defs>
                  <linearGradient id="colorPremium" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#22c1c3" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#22c1c3" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#dfe5ef" />
                <XAxis dataKey="month" stroke="#415273" />
                <YAxis stroke="#415273" />
                <Tooltip formatter={(value) => formatter.format(value)} />
                <Area type="monotone" dataKey="premium" stroke="#22c1c3" fill="url(#colorPremium)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="page-card chart-card">
          <div className="card-header">
            <h3>Driving risk distribution</h3>
          </div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={Object.entries(data.riskDistribution).map(([name, value]) => ({ name, value }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dfe5ef" />
                <XAxis dataKey="name" stroke="#415273" />
                <YAxis stroke="#415273" />
                <Tooltip />
                <Bar dataKey="value" fill="#1c7ee6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="three-column-grid">
        <div className="page-card">
          <div className="card-header">
            <h3>Recent quotes</h3>
          </div>
          <div className="list-stack">
            {data.recentQuotes.length ? (
              data.recentQuotes.map((quote) => (
                <div key={quote.id} className="list-row">
                  <div>
                    <strong>{quote.driver}</strong>
                    <small>{quote.created_at}</small>
                  </div>
                  <div className="quote-meta">
                    <span>{quote.score} score</span>
                    <strong>{formatter.format(quote.premium)}</strong>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No recent quotes yet.</p>
            )}
          </div>
        </div>

        <div className="page-card">
          <div className="card-header">
            <h3>Data quality alerts</h3>
          </div>
          <div className="alert-list">
            <div className="alert-row warning">
              <span>Incomplete telemetry</span>
              <small>2 sessions flagged</small>
            </div>
            <div className="alert-row info">
              <span>Sensor drift</span>
              <small>1 anomaly reviewed</small>
            </div>
          </div>
        </div>

        <div className="page-card">
          <div className="card-header">
            <h3>Unusual premium change alerts</h3>
          </div>
          <div className="alert-list">
            {data.alerts.map((alert) => (
              <div key={alert.title} className={`alert-row ${alert.severity}`}>
                <span>{alert.title}</span>
                <small>{alert.description}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
