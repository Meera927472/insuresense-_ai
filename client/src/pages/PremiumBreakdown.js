import React, { useEffect, useState } from "react";

export default function PremiumBreakdown() {
  const [quotes, setQuotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [explanationMode, setExplanationMode] = useState("");
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8000/api/quotes")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Quotes could not be loaded.");
        setQuotes(data);
        setSelectedId(data[0]?.id ?? null);
        setLoading(false);
      })
      .catch((fetchError) => {
        setError(fetchError.message || "Quotes could not be loaded.");
        setLoading(false);
      });
  }, []);

  const loadExplanation = async (mode) => {
    if (!selectedId) return;
    setError("");
    setExplanationMode(mode);
    setLoadingExplanation(true);
    try {
      const response = await fetch(`http://localhost:8000/api/quotes/${selectedId}/explanation`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Pricing explanation is unavailable.");
      setExplanation(data);
    } catch (fetchError) {
      setError(fetchError.message || "Pricing explanation is unavailable.");
    } finally {
      setLoadingExplanation(false);
    }
  };

  const selectedQuote = quotes.find((quote) => quote.id === selectedId);
  const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Explainable insurance estimate</p>
          <h1>Why This Price?</h1>
          <p className="page-subtitle">See the factors behind an illustrative premium, including what may change and what does not.</p>
        </div>
      </div>

      <div className="page-card">
        {loading && <p className="empty-state">Loading quote history…</p>}
        {error && <div className="error-banner" role="alert">{error}</div>}
        <table className="data-table">
          <thead>
            <tr>
              <th>Driver</th>
              <th>Vehicle</th>
              <th>Score</th>
              <th>Final premium</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => (
              <tr key={quote.id} className={quote.id === selectedId ? "selected-table-row" : ""}>
                <td><button type="button" className="text-button" onClick={() => { setSelectedId(quote.id); setExplanation(null); }}>{quote.driver}</button></td>
                <td>{quote.vehicle_type}</td>
                <td>{quote.driving_score}</td>
                <td>{money.format(quote.final_premium)}</td>
              </tr>
            ))}
            {!loading && !quotes.length && (
              <tr>
                <td colSpan="4" className="empty-state">No quotes available yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedQuote && (
        <div className="page-card">
          <div className="card-header">
            <h3>{selectedQuote.driver} · {selectedQuote.vehicle_type}</h3>
            <strong>{money.format(selectedQuote.final_premium)} / year</strong>
          </div>
          <div className="pricing-summary">
            <div><span>Driving score</span><strong>{selectedQuote.driving_score}/100</strong></div>
            <div><span>Estimated premium</span><strong>{money.format(selectedQuote.final_premium)}</strong></div>
          </div>
          <div className="action-row">
            <button type="button" className="secondary-btn" onClick={() => loadExplanation("price")} disabled={loadingExplanation}>
              Why this price?
            </button>
            <button type="button" className="primary-btn" onClick={() => loadExplanation("cheaper")} disabled={loadingExplanation}>
              Why not cheaper?
            </button>
          </div>
          {loadingExplanation && <p className="muted-copy">Preparing the explanation…</p>}
          {explanation && explanationMode && (
            <section className="explanation-panel" aria-live="polite">
              <h3>{explanationMode === "cheaper" ? "Why not cheaper?" : "How this estimate was formed"}</h3>
              <div className="pricing-row"><span>Base premium</span><strong>{money.format(explanation.basePremium)}</strong></div>
              <div className="pricing-row"><span>Behaviour adjustment</span><strong>{explanation.behaviourAdjustmentPct}% ({money.format(explanation.behaviourAdjustmentValue)})</strong></div>
              <div className="pricing-row accent-row"><span>Estimated premium</span><strong>{money.format(explanation.finalPremium)}</strong></div>
              <div className="factor-list">
                {explanation.factors.map((factor) => (
                  <article className="factor-row" key={factor.name}>
                    <div><strong>{factor.name}</strong><span>{factor.category}</span></div>
                    <p>{factor.detail}</p>
                  </article>
                ))}
              </div>
              <div className="explanation-box">
                <strong>What may improve?</strong>
                <p>With improved measured behaviour, this demo's counterfactual estimate is {money.format(explanation.potentialBehaviourComparison.estimatedPremium)} ({money.format(explanation.potentialBehaviourComparison.difference)} lower in this scenario).</p>
                <small>{explanation.potentialBehaviourComparison.explanation}</small>
              </div>
              <p className="legal-note">{explanation.claimBoundary}</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
