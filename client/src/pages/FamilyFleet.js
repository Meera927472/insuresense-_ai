import React, { useEffect, useState } from "react";

const API = "http://localhost:8000";

export default function FamilyFleet() {
  const [data, setData] = useState(null);
  const [vehicles, setVehicles] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/fleet`).then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "Family profile data could not be loaded.");
        return result;
      }),
      fetch(`${API}/api/fleet/vehicles`).then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "Fleet vehicle data could not be loaded.");
        return result;
      }),
    ])
      .then(([family, fleet]) => {
        setData(family);
        setVehicles(fleet.vehicles);
      })
      .catch((requestError) => setError(requestError.message || "Family and fleet data are unavailable."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Separate people, fairer vehicle context</p>
          <h1>Family & Fleet</h1>
          <p className="page-subtitle">Each demo driver keeps an independent profile. Vehicle exposure aggregation is shown transparently.</p>
        </div>
        <span className="tag-badge info-tag">Synthetic profiles</span>
      </div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {loading && <div className="page-card">Loading family and fleet data…</div>}
      {data && (
        <>
          <section className="family-summary">
            <div><span>Vehicle risk score</span><strong>{data.vehicleRiskScore}</strong></div>
            <div><span>Driver profiles</span><strong>{data.drivers.length}</strong></div>
            <div><span>Fleet vehicles</span><strong>{vehicles.length}</strong></div>
          </section>

          <section className="page-card">
            <div className="card-header"><h3>Family vehicle · independent driver profiles</h3><span className="rule-badge">Risk aggregation</span></div>
            <div className="driver-list">
              {data.drivers.map((driver) => (
                <article className="driver-row" key={driver.id}>
                  <div className="driver-identity">
                    <strong>{driver.name}</strong>
                    <span>{driver.relationship} · {driver.recentTrips} illustrative trips</span>
                  </div>
                  <div className="exposure-meter">
                    <div><span>Driving exposure</span><strong>{Math.round(driver.exposure * 100)}%</strong></div>
                    <div className="meter-track"><span style={{ width: `${driver.exposure * 100}%` }} /></div>
                  </div>
                  <div><span className="metric-label">Score</span><strong>{driver.score}</strong></div>
                  <div><span className="metric-label">Safety events</span><strong>{driver.safetyEvents}</strong></div>
                </article>
              ))}
            </div>
            <div className="explanation-box">
              <strong>How vehicle risk was calculated</strong>
              <p>{data.fairnessExplanation}</p>
              <p>Exposure shares total {Math.round(data.driverExposureTotal * 100)}%: {data.drivers.map((driver) => `${driver.name} ${Math.round(driver.exposure * 100)}%`).join(" · ")}.</p>
            </div>
          </section>

          <section className="page-card">
            <div className="card-header"><h3>Small fleet overview</h3><span className="tag-badge info-tag">Demo data only</span></div>
            <div className="fleet-grid">
              {vehicles.map((vehicle) => (
                <article className="fleet-card" key={vehicle.id}>
                  <div className="card-header"><h4>{vehicle.label}</h4><span className="pill">{vehicle.type}</span></div>
                  <div className="fleet-stats"><span>Drivers</span><strong>{vehicle.driverCount}</strong></div>
                  <div className="fleet-stats"><span>Trips this month</span><strong>{vehicle.tripsThisMonth}</strong></div>
                  <div className="fleet-stats"><span>Data quality</span><strong>{vehicle.dataQuality}%</strong></div>
                  <p className="muted-copy">{vehicle.maintenance}</p>
                </article>
              ))}
            </div>
          </section>
          <p className="legal-note">{data.source} {data.privacy}</p>
        </>
      )}
    </div>
  );
}
