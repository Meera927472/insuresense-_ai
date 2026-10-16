import React, { useEffect, useState } from "react";
import { getSetting, saveSetting } from "../services/offlineStorage";
import { calculateOfflineQuote } from "../services/offlinePricing";

const defaults = {
  vehicle_type: "Sedan",
  vehicle_age: 3,
  vehicle_value: 1400000,
  annual_distance_km: 9000,
  previous_claims: 0,
  speeding_events: 1.2,
  harsh_braking: 0.8,
  rapid_acceleration: 0.9,
  driving_consistency: 83,
  data_completeness: 86,
};

export default function QuoteForm() {
  const [form, setForm] = useState(defaults);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");

  useEffect(() => {
    fetch("http://localhost:8000/api/settings")
      .then(async (response) => {
        const rules = await response.json();
        if (!response.ok) throw new Error(rules.detail || "Pricing rules could not be cached.");
        return saveSetting({ key: "pricing-rules", ...rules, savedAt: new Date().toISOString() });
      })
      .catch((cacheError) => {
        const message = cacheError.message || "Pricing rules could not be cached on this device.";
        if (navigator.onLine) setUploadMessage(message);
        else setError(message);
      });
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: name === "vehicle_type" ? value : Number(value) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("http://localhost:8000/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Please check the form values.");
        return;
      }
      setResult({ ...data, source: "server" });
      setUploadMessage("Quote generated successfully.");
    } catch {
      try {
        const rules = await getSetting("pricing-rules");
        if (!rules) throw new Error("No cached pricing rules are available. Reconnect before generating an estimate.");
        const offlineResult = calculateOfflineQuote(form, rules);
        setResult(offlineResult);
        setUploadMessage(`Offline estimate only · cached rules ${rules.version} · last synced ${new Date(rules.savedAt).toLocaleString()}`);
      } catch (offlineError) {
        setError(offlineError.message || "Could not connect and no cached pricing rules are available.");
      }
    }
  };

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setUploadMessage(`Validated ${file.name}: ${text.length > 0 ? "CSV parsed successfully." : "No data found."}`);
    setForm((prev) => ({ ...prev, csv_data: text }));
  };

  const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

  return (
    <div className="page-shell quote-layout">
      <div className="page-card form-card">
        <div className="page-header compact-header">
          <div>
            <p className="eyebrow">Quote engine</p>
            <h1>Get Insurance Quote</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="quote-form">
          <div className="field-grid">
            <label>
              Vehicle type
              <select name="vehicle_type" value={form.vehicle_type} onChange={handleChange}>
                <option>Sedan</option>
                <option>SUV</option>
                <option>Hatchback</option>
                <option>Bike</option>
                <option>Truck</option>
                <option>EV</option>
              </select>
            </label>
            <label>
              Vehicle age (years)
              <input type="number" name="vehicle_age" min="0" max="30" value={form.vehicle_age} onChange={handleChange} />
            </label>
            <label>
              Vehicle value (₹)
              <input type="number" name="vehicle_value" min="100000" step="1000" value={form.vehicle_value} onChange={handleChange} />
            </label>
            <label>
              Annual distance travelled (km)
              <input type="number" name="annual_distance_km" min="1000" step="500" value={form.annual_distance_km} onChange={handleChange} />
            </label>
            <label>
              Previous claims
              <input type="number" name="previous_claims" min="0" value={form.previous_claims} onChange={handleChange} />
            </label>
            <label>
              Speeding event frequency
              <input type="number" step="0.1" name="speeding_events" value={form.speeding_events} onChange={handleChange} />
            </label>
            <label>
              Harsh braking
              <input type="number" step="0.1" name="harsh_braking" value={form.harsh_braking} onChange={handleChange} />
            </label>
            <label>
              Rapid acceleration
              <input type="number" step="0.1" name="rapid_acceleration" value={form.rapid_acceleration} onChange={handleChange} />
            </label>
            <label>
              Driving consistency (%)
              <input type="number" min="0" max="100" name="driving_consistency" value={form.driving_consistency} onChange={handleChange} />
            </label>
            <label>
              Data completeness (%)
              <input type="number" min="0" max="100" name="data_completeness" value={form.data_completeness} onChange={handleChange} />
            </label>
          </div>

          <div className="upload-zone">
            <label className="upload-box">
              <span>Upload sample driving CSV</span>
              <input type="file" accept=".csv" onChange={handleCsvUpload} />
            </label>
            <small>{uploadMessage || "Validate missing fields, suspicious measurements, and duplicate records before quoting."}</small>
          </div>

          {error && <div className="error-banner">{error}</div>}
          <button type="submit" className="primary-btn">Generate quote</button>
        </form>
      </div>

      <div className="page-card result-card">
        <div className="card-header">
          <h3>Quote summary</h3>
        </div>
        {result ? (
          <div className="quote-output">
            <span className={`tag-badge ${result.source === "offline" ? "offline-estimate-tag" : "demo-tag"}`}>
              {result.source === "offline" ? "OFFLINE ESTIMATE · NOT SERVER VERIFIED" : "SERVER-CALCULATED DEMO ESTIMATE"}
            </span>
            <div className="quote-output-header">
              <span className="pill">Driving score</span>
              <strong>{result.driving_score}</strong>
            </div>
            <div className="pricing-row">
              <span>Base premium</span>
              <strong>{money.format(result.base_premium)}</strong>
            </div>
            <div className="pricing-row">
              <span>Behavioural adjustment</span>
              <strong>{result.behaviour_adjustment_pct}%</strong>
            </div>
            <div className="pricing-row accent-row">
              <span>Final estimated premium</span>
              <strong>{money.format(result.final_premium)}</strong>
            </div>
            <div className="explanation-box">{result.explanation}</div>
            <div className="rule-badge">Pricing rule version: {result.rule_version}</div>
            {result.breakdown?.map((row) => (
              <div key={row.label} className="breakdown-row">
                <span>{row.label}</span>
                <strong>{money.format(row.value)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">No quote calculated yet. Fill in the form to see an illustrative premium.</div>
        )}
      </div>
    </div>
  );
}
