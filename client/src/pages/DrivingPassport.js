import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";

const API = "http://localhost:8000";

export function PassportVerification() {
  const { token } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/driving-passport/verify/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Passport could not be verified.");
        setResult(data);
      })
      .catch((requestError) => setError(requestError.message || "Passport could not be verified."))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="page-shell">
      <section className="page-card passport-verify-card">
        <p className="eyebrow">Minimal public verification</p>
        <h1>Driving Passport Verification</h1>
        {loading && <p className="muted-copy">Checking this verification link…</p>}
        {error && <div className="error-banner" role="alert">{error}</div>}
        {result && (
          <>
            <span className="status-pill">{result.status}</span>
            <div className="pricing-summary">
              <div><span>Verified trip score</span><strong>{result.score ?? "Not available"}</strong></div>
              <div><span>Verified trips</span><strong>{result.verifiedTrips}</strong></div>
            </div>
            <p><strong>Integrity:</strong> {result.integrity}</p>
            <p className="privacy-note">{result.privacy}</p>
            <p className="legal-note">This summary is not an insurer decision or proof of claim eligibility.</p>
          </>
        )}
      </section>
    </div>
  );
}

export default function DrivingPassport() {
  const [summary, setSummary] = useState(null);
  const [passport, setPassport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${API}/api/driving-passport`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Driving Passport could not be loaded.");
        setSummary(data);
      })
      .catch((requestError) => setError(requestError.message || "Driving Passport could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const issuePassport = async () => {
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/driving-passport`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Passport link could not be issued.");
      setPassport(data);
      setSummary(data);
    } catch (requestError) {
      setError(requestError.message || "Passport link could not be issued.");
    } finally {
      setBusy(false);
    }
  };

  const verifyUrl = passport
    ? `${window.location.origin}/passport/verify/${encodeURIComponent(passport.token)}`
    : "";

  const copyVerificationLink = async () => {
    setError("");
    setMessage("");
    if (!navigator.clipboard?.writeText) {
      setError("Clipboard access is unavailable in this browser. Copy the displayed link manually.");
      return;
    }
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setMessage("Verification link copied.");
    } catch {
      setError("The verification link could not be copied. Copy it manually.");
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Your score belongs to you</p>
          <h1>Driving Passport</h1>
          <p className="page-subtitle">Share a minimal verification summary without sharing personal details or raw trip telemetry.</p>
        </div>
        <span className="tag-badge info-tag">Privacy-minimal</span>
      </div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {message && <div className="explanation-box" role="status">{message}</div>}
      <div className="two-column-grid">
        <section className="page-card">
          <div className="card-header"><h3>Verified driving summary</h3><span className="status-pill">{summary?.integrity || "Loading"}</span></div>
          {loading ? <p className="muted-copy">Loading verified trip summary…</p> : (
            <>
              <div className="pricing-summary">
                <div><span>Average verified score</span><strong>{summary?.score ?? "Not available"}</strong></div>
                <div><span>Verified driving trips</span><strong>{summary?.verifiedTrips ?? 0}</strong></div>
              </div>
              <p className="muted-copy">Passenger trips and trips requiring review are excluded. Provisional scores are not presented as verified.</p>
              <p className="legal-note">{summary?.disclaimer}</p>
              <button type="button" className="primary-btn" onClick={issuePassport} disabled={busy}>
                {busy ? "Preparing…" : passport ? "Refresh verification QR" : "Generate verification QR"}
              </button>
            </>
          )}
        </section>

        <section className="page-card passport-qr-card">
          <h3>Shareable verification</h3>
          {passport ? (
            <>
              <div className="passport-qr"><QRCodeSVG value={verifyUrl} size={208} level="M" includeMargin /></div>
              <p>Scan to view only the verified score summary, trip count and integrity status.</p>
              <code className="passport-link">{verifyUrl}</code>
              <button type="button" className="secondary-btn" onClick={copyVerificationLink}>Copy verification link</button>
            </>
          ) : (
            <p className="empty-state">Generate a time-independent demo verification link to create a QR code. Avoid sharing it with anyone you do not trust.</p>
          )}
        </section>
      </div>
      <section className="page-card">
        <div className="card-header"><h3>What verification reveals</h3></div>
        <ul className="bullet-list">
          <li>Aggregate score from server-verified, non-passenger demo trips</li>
          <li>Number of verified trips and the overall integrity label</li>
          <li>No name, phone, email, location history or raw telemetry</li>
        </ul>
      </section>
    </div>
  );
}
