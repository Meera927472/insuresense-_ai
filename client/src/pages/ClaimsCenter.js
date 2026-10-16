import React, { useEffect, useState } from "react";

const API = "http://localhost:8000";
const stages = [
  ["claim_intimated", "Claim intimated"],
  ["documents_submitted", "Documents submitted"],
  ["assessment", "Surveyor / assessment"],
  ["under_review", "Under review"],
  ["approved", "Approved"],
  ["further_information", "Further information"],
  ["settled", "Settlement"],
];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

export default function ClaimsCenter() {
  const [claims, setClaims] = useState([]);
  const [trips, setTrips] = useState([]);
  const [incidentType, setIncidentType] = useState("Road incident");
  const [description, setDescription] = useState("");
  const [tripId, setTripId] = useState("");
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = async () => {
    setError("");
    try {
      const [claimResponse, tripResponse] = await Promise.all([
        fetch(`${API}/api/claims`),
        fetch(`${API}/api/offline/trips`),
      ]);
      const [claimData, tripData] = await Promise.all([claimResponse.json(), tripResponse.json()]);
      if (!claimResponse.ok) throw new Error(claimData.detail || "Claims could not be loaded.");
      if (!tripResponse.ok) throw new Error(tripData.detail || "Trip list could not be loaded.");
      setClaims(claimData);
      setTrips(tripData);
      setSelectedClaim((current) => current || claimData[0]?.id || null);
    } catch (loadError) {
      setError(loadError.message || "Claims service is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const submitClaim = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API}/api/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident_type: incidentType, description, trip_id: tripId || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Claim intimation could not be submitted.");
      setSelectedClaim(data.id);
      setDescription("");
      setEvidence(null);
      setMessage(`Demo claim ${data.reference} has been recorded. No insurer is connected to this prototype.`);
      await loadData();
    } catch (submitError) {
      setError(submitError.message || "Claim intimation could not be submitted.");
    } finally {
      setBusy(false);
    }
  };

  const updateStage = async (claim, status) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/claims/${claim.id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Claim stage could not be updated.");
      setClaims((current) => current.map((item) => item.id === data.id ? data : item));
      setMessage("Demo claim tracker updated. This is not a real insurer status.");
    } catch (updateError) {
      setError(updateError.message || "Claim stage could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  const generateEvidence = async (claim) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/claims/${claim.id}/evidence-pack`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Evidence pack could not be generated.");
      setEvidence(data);
      setMessage("Evidence summary prepared from application data. Final assessment remains subject to policy terms and investigation.");
      await loadData();
    } catch (evidenceError) {
      setError(evidenceError.message || "Evidence pack could not be generated.");
    } finally {
      setBusy(false);
    }
  };

  const downloadEvidence = () => {
    if (!evidence) return;
    const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `claim-evidence-${evidence.claimReference}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printEvidence = () => {
    if (!evidence) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("The print window was blocked. Allow pop-ups, then choose Print / Save as PDF.");
      return;
    }
    const trip = evidence.trip;
    printWindow.document.write(`<!doctype html><html><head><title>Claim evidence ${escapeHtml(evidence.claimReference)}</title>
      <style>body{font:15px Arial,sans-serif;color:#172033;max-width:760px;margin:40px auto;line-height:1.5}
      h1{color:#12324a}h2{margin-top:28px;border-bottom:1px solid #ccd6e1;padding-bottom:8px}
      .tag{background:#eaf6f6;padding:10px;border-radius:8px}.disclaimer{margin-top:32px;font-size:12px;color:#566477}
      table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #e2e8f0}td:first-child{font-weight:bold}
      </style></head><body><h1>InsureSense AI · Claim Evidence Summary</h1>
      <p>Reference: <strong>${escapeHtml(evidence.claimReference)}</strong></p>
      <p>Prepared: ${escapeHtml(evidence.generatedAt)}</p>
      <h2>Incident</h2><p>${escapeHtml(evidence.incidentType)}</p><p>${escapeHtml(evidence.description)}</p>
      <h2>Trip evidence</h2><table><tr><td>Driver</td><td>${escapeHtml(evidence.driver)}</td></tr>
      <tr><td>Vehicle</td><td>${escapeHtml(evidence.vehicle)}</td></tr><tr><td>Trip ID</td><td>${escapeHtml(trip.tripId || "Not linked")}</td></tr>
      <tr><td>Time</td><td>${escapeHtml(trip.timestamp || "Not available")}</td></tr>
      <tr><td>Approximate location</td><td>${escapeHtml(trip.approximateLocation)}</td></tr>
      <tr><td>Road context</td><td>${escapeHtml(trip.roadContext)}</td></tr>
      <tr><td>Integrity</td><td>${escapeHtml(trip.integrityStatus)}</td></tr></table>
      <p class="tag">Driving score is not used to calculate claim settlement.</p>
      <p class="disclaimer">${escapeHtml(evidence.disclaimer)}</p>
      <script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  };

  const activeClaim = claims.find((claim) => claim.id === selectedClaim);
  const activeStageIndex = activeClaim ? stages.findIndex(([status]) => status === activeClaim.status) : -1;

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Assistance, not insurer processing</p>
          <h1>Claims Center</h1>
          <p className="page-subtitle">Prepare a claim record and evidence summary. Claim coverage and settlement remain separate from driving scores.</p>
        </div>
        <span className="tag-badge info-tag">Prototype workflow</span>
      </div>

      <div className="two-column-grid">
        <section className="page-card">
          <div className="card-header"><h3>Claim intimation</h3></div>
          <form className="quote-form" onSubmit={submitClaim}>
            <label>
              Incident type
              <select value={incidentType} onChange={(event) => setIncidentType(event.target.value)}>
                <option>Road incident</option>
                <option>Vehicle damage</option>
                <option>Theft report</option>
                <option>Glass damage</option>
                <option>Other</option>
              </select>
            </label>
            <label>
              Link a verified trip (optional)
              <select value={tripId} onChange={(event) => setTripId(event.target.value)}>
                <option value="">No trip linked</option>
                {trips.map((trip) => <option key={trip.tripId} value={trip.tripId}>{trip.tripId.slice(0, 12)} · {trip.integrityStatus}</option>)}
              </select>
            </label>
            <label>
              Incident notes
              <textarea value={description} minLength={10} maxLength={2000} required rows={4} onChange={(event) => setDescription(event.target.value)} placeholder="Describe what happened using details you can confirm." />
            </label>
            <button className="primary-btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Record demo claim"}</button>
          </form>
        </section>

        <section className="page-card">
          <div className="card-header"><h3>Claim tracker</h3></div>
          {loading && <p className="muted-copy">Loading claims…</p>}
          {activeClaim ? (
            <>
              <label>
                Select claim
                <select value={activeClaim.id} onChange={(event) => { setSelectedClaim(Number(event.target.value)); setEvidence(null); }}>
                  {claims.map((claim) => <option key={claim.id} value={claim.id}>{claim.reference} · {claim.incidentType}</option>)}
                </select>
              </label>
              <div className="claim-timeline">
                {stages.map(([status, label], index) => (
                  <div className={`claim-stage ${index <= activeStageIndex ? "complete" : ""}`} key={status}>
                    <span>{index + 1}</span><strong>{label}</strong>
                  </div>
                ))}
              </div>
              <label>
                Update demo stage
                <select value={activeClaim.status} disabled={busy} onChange={(event) => updateStage(activeClaim, event.target.value)}>
                  {stages.map(([status, label]) => <option value={status} key={status}>{label}</option>)}
                </select>
              </label>
              <button type="button" className="secondary-btn" disabled={busy} onClick={() => generateEvidence(activeClaim)}>Generate claim evidence pack</button>
            </>
          ) : !loading ? <p className="empty-state">No claims yet. Recording an intimation will create a demo tracker.</p> : null}
        </section>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {message && <div className="explanation-box" role="status">{message}</div>}
      {evidence && (
        <section className="page-card evidence-card">
          <div className="card-header"><h3>Evidence pack · {evidence.claimReference}</h3><span className="rule-badge">Available application data only</span></div>
          <div className="two-column-grid">
            <div><strong>Incident</strong><p>{evidence.incidentType}: {evidence.description}</p><p>Driver: {evidence.driver} · Vehicle: {evidence.vehicle}</p></div>
            <div><strong>Trip integrity</strong><p>{evidence.trip.integrityStatus} · Road context: {evidence.trip.roadContext}</p><p>Location: {evidence.trip.approximateLocation}</p></div>
          </div>
          <div className="explanation-box">{evidence.disclaimer}</div>
          <div className="action-row">
            <button className="secondary-btn" type="button" onClick={downloadEvidence}>Download evidence JSON</button>
            <button className="primary-btn" type="button" onClick={printEvidence}>Print / Save as PDF</button>
          </div>
        </section>
      )}
    </div>
  );
}
