import React, { useEffect, useState } from "react";

const API = "http://localhost:8000";

export default function RoadSafety() {
  const [hazardData, setHazardData] = useState(null);
  const [blackSpotData, setBlackSpotData] = useState(null);
  const [preTrip, setPreTrip] = useState(null);
  const [roadContext, setRoadContext] = useState(null);
  const [routePreference, setRoutePreference] = useState("Safest");
  const [sosCountdown, setSosCountdown] = useState(null);
  const [sosStatus, setSosStatus] = useState("");
  const [sosError, setSosError] = useState("");
  const [sendingSos, setSendingSos] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/road-hazards`).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Road hazards could not be loaded.");
        return data;
      }),
      fetch(`${API}/api/black-spots`).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Road safety zones could not be loaded.");
        return data;
      }),
      fetch(`${API}/api/safety/pre-trip`).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Pre-trip information could not be loaded.");
        return data;
      }),
      fetch(`${API}/api/road-context`).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Road context could not be loaded.");
        return data;
      }),
    ])
      .then(([hazards, spots, safety, context]) => {
        setHazardData(hazards);
        setBlackSpotData(spots);
        setPreTrip(safety);
        setRoadContext(context);
      })
      .catch((fetchError) => setError(fetchError.message || "Road safety services are unavailable."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (sosCountdown === null || sosCountdown <= 0) return undefined;
    const timer = window.setTimeout(() => setSosCountdown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [sosCountdown]);

  const sendDemoSOS = async () => {
    setSendingSos(true);
    setSosError("");
    setSosStatus("");
    try {
      const response = await fetch(`${API}/api/sos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emergency_type: "possible_crash", vehicle_label: "Family Car", confirmation: "user_confirmed" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "SOS could not be prepared.");
      setSosStatus(`${data.status.toUpperCase()} · ${data.deliveryStatus.replaceAll("_", " ")}. ${data.notice}`);
    } catch (requestError) {
      setSosError(requestError.message || "SOS could not be prepared.");
    } finally {
      setSendingSos(false);
      setSosCountdown(null);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Context before scoring</p>
          <h1>Road Safety & Pre-Trip</h1>
          <p className="page-subtitle">Road context helps explain events. It is not a live map, route guarantee or accident prediction.</p>
        </div>
        <span className="tag-badge info-tag">Demo road data</span>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {loading && <div className="page-card">Loading road context…</div>}

      {preTrip && (
        <>
          <section className="page-card">
            <div className="card-header"><h3>Pre-trip safety card</h3><strong>Trip risk preview: {preTrip.riskPreview}</strong></div>
            <div className="kpi-grid safety-kpis">
              <div className="metric-card"><span>Weather</span><strong>{preTrip.weather.condition}</strong><small>{preTrip.weather.status}</small></div>
              <div className="metric-card"><span>Road hazards</span><strong>{preTrip.road.knownHazards}</strong><small>{preTrip.road.status}</small></div>
              <div className="metric-card"><span>Traffic</span><strong>{preTrip.traffic.level}</strong><small>{preTrip.traffic.status}</small></div>
              <div className="metric-card"><span>Time context</span><strong>{preTrip.time.period}</strong><small>{preTrip.time.status}</small></div>
            </div>
            <p className="muted-copy">{preTrip.advice}</p>
            <label className="route-select">
              Route preference
              <select value={routePreference} onChange={(event) => setRoutePreference(event.target.value)}>
                {preTrip.routePreference.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <p className="legal-note">{preTrip.source} “{routePreference}” is a preference demonstration; this prototype does not calculate live routes.</p>
          </section>

          <div className="two-column-grid">
            <section className="page-card">
              <div className="card-header"><h3>Community road alerts</h3><span className="rule-badge">{roadContext?.communityReports || 0} anonymous demo reports</span></div>
              <p className="muted-copy">{hazardData?.source}</p>
              <div className="list-stack">
                {hazardData?.hazards.map((hazard) => (
                  <article className={`hazard-card ${hazard.severity}`} key={hazard.id}>
                    <div><strong>{hazard.area}</strong><span>{hazard.type}</span></div>
                    <span>{hazard.reports} reports · {hazard.severity}</span>
                  </article>
                ))}
              </div>
            </section>

            <section className="page-card">
              <div className="card-header"><h3>Safety zones</h3><span className="tag-badge info-tag">Illustrative zones</span></div>
              <p className="muted-copy">{blackSpotData?.source}</p>
              <div className="list-stack">
                {blackSpotData?.spots.map((spot) => (
                  <article className="hazard-card" key={spot.area}>
                    <div><strong>{spot.area}</strong><span>{spot.reason}</span></div>
                    <span>{spot.risk} context</span>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <section className="page-card">
            <div className="card-header"><h3>Fairness rule</h3><span className="status-pill">Road-aware scoring</span></div>
            <p>{roadContext?.fairnessRule}</p>
            <p className="legal-note">Repeated community reports are anonymized in this demo. A road event is not proof that a driver event was harmless; it is a context signal for explanation and review.</p>
          </section>

          <section className="page-card sos-card">
            <div className="card-header"><h3>Emergency SOS prototype</h3><span className="tag-badge info-tag">No emergency service connected</span></div>
            <p className="muted-copy">Simulate a crash alert to preview the confirmation countdown. The demo never contacts emergency services automatically.</p>
            {sosCountdown === null ? (
              <button type="button" className="secondary-btn" onClick={() => { setSosError(""); setSosStatus(""); setSosCountdown(30); }}>
                Simulate possible crash
              </button>
            ) : (
              <div className="offline-banner" role="alert">
                <strong>Possible crash detected — confirm you're OK</strong>
                <span>{sosCountdown > 0 ? `Preparing an emergency message in ${sosCountdown} seconds. No message will be sent automatically.` : "Countdown ended. Waiting for your confirmation; nothing has been sent."}</span>
                <div className="action-row">
                  <button type="button" className="secondary-btn" onClick={() => { setSosCountdown(null); setSosStatus("Alert dismissed. No emergency message was prepared."); }}>I'm OK</button>
                  <button type="button" className="primary-btn" onClick={sendDemoSOS} disabled={sendingSos}>{sendingSos ? "Preparing…" : "Prepare SOS message"}</button>
                </div>
              </div>
            )}
            {sosError && <div className="error-banner" role="alert">{sosError}</div>}
            {sosStatus && <div className="explanation-box" role="status">{sosStatus}</div>}
            <p className="legal-note">If you need emergency assistance, contact your local emergency services directly. This prototype does not deliver SMS.</p>
          </section>
        </>
      )}
    </div>
  );
}
