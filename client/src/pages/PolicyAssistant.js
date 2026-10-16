import React, { useEffect, useState } from "react";
import { getSetting, saveSetting } from "../services/offlineStorage";

const API = "http://localhost:8000";
const fallbackPolicy = {
  policyId: "DEMO-MOTOR-2026",
  kind: "Illustrative comprehensive motor policy",
  expiresOn: "2026-12-31",
  coverage: [
    "Third-party liability, subject to the policy terms",
    "Accidental damage to the insured vehicle, subject to the policy terms",
  ],
  exclusions: ["Normal wear and tear", "Driving without a valid licence"],
  addons: [
    { name: "Zero depreciation", price: 1800, purpose: "May reduce depreciation deductions for eligible repairs, subject to terms." },
    { name: "Roadside assistance", price: 650, purpose: "May provide eligible roadside support; check the policy terms and service limits." },
  ],
  source: "Synthetic demo policy data; not an issued insurance contract.",
};

function localAnswer(question, language, policy) {
  const query = question.toLocaleLowerCase();
  const excluded = ["not cover", "not covered", "exclude", "cover aagaadhu", "கவர் ஆகாது", "விலக்கு"].some((term) => query.includes(term));
  const coverage = ["cover", "coverage", "covered", "கவர்"].some((term) => query.includes(term));
  const expiry = ["expire", "expiry", "renew", "காலாவதி", "எப்போ"].some((term) => query.includes(term));
  const addon = ["add-on", "addon", "zero depreciation", "roadside", "தேவையா"].some((term) => query.includes(term));
  if (excluded) {
    return language === "ta"
      ? `இந்த demo policy தரவில் குறிப்பிடப்பட்ட விலக்குகள்: ${policy.exclusions.join(" மற்றும் ")}. முழு விதிமுறைகளையும் சரிபார்க்கவும்.`
      : `The demo policy lists these exclusions: ${policy.exclusions.join("; ")}. Check the full policy wording for conditions and exceptions.`;
  }
  if (expiry) {
    return language === "ta"
      ? `இந்த demo policy-யின் காலாவதி தேதி ${policy.expiresOn}. இது மாதிரி தரவு; உங்கள் உண்மையான policy ஆவணத்தைச் சரிபார்க்கவும்.`
      : `The demo policy expiry date is ${policy.expiresOn}. This is sample data; check your actual policy document.`;
  }
  if (addon) {
    return language === "ta"
      ? "இந்த demo தரவில் Zero depreciation மற்றும் roadside assistance உள்ளன. உங்கள் தேவைகள், விலை மற்றும் policy வரம்புகளை ஒப்பிட்டு முடிவு செய்யுங்கள்."
      : "The demo lists zero depreciation and roadside assistance. Compare your needs, price and policy limits; this does not confirm a personal recommendation.";
  }
  if (coverage) {
    return language === "ta"
      ? `இந்த demo policy-யில் ${policy.coverage.join(" மற்றும் ")} குறிப்பிடப்பட்டுள்ளன. முழு policy விதிமுறைகள் பொருந்தும்.`
      : `The demo policy lists ${policy.coverage.join(" and ")}. Full policy terms apply.`;
  }
  return language === "ta"
    ? "கிடைக்கும் policy தகவலில் இதற்கு போதுமான விவரம் இல்லை. முழு policy ஆவணத்தைச் சரிபார்க்கவும்."
    : "The available policy information does not provide enough detail to answer that. Please check the full policy document.";
}

export default function PolicyAssistant() {
  const [language, setLanguage] = useState("en");
  const [question, setQuestion] = useState("");
  const [policy, setPolicy] = useState(fallbackPolicy);
  const [answer, setAnswer] = useState("");
  const [source, setSource] = useState(fallbackPolicy.source);
  const [isCached, setIsCached] = useState(true);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);

  useEffect(() => {
    getSetting("demo-policy").then((cached) => {
      if (cached?.policy) {
        setPolicy(cached.policy);
        setSource(cached.policy.source);
        setIsCached(true);
      }
    }).catch((storageError) => setError(storageError.message));
    fetch(`${API}/api/policy`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Policy data could not be loaded.");
        setPolicy(data);
        setSource(data.source);
        setIsCached(false);
        return saveSetting({ key: "demo-policy", policy: data, savedAt: new Date().toISOString() });
      })
      .catch((fetchError) => {
        if (navigator.onLine) setError(fetchError.message || "Policy service is unavailable; cached sample information remains available.");
      });
  }, []);

  const submitQuestion = async (event) => {
    event.preventDefault();
    setError("");
    if (!question.trim()) {
      setError("Enter a policy question first.");
      return;
    }
    if (!navigator.onLine) {
      setAnswer(localAnswer(question, language, policy));
      setSource(`${policy.source} · cached on this device`);
      setIsCached(true);
      return;
    }
    try {
      const response = await fetch(`${API}/api/policy/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, language }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Policy explanation is unavailable.");
      setAnswer(data.answer);
      setSource(data.source);
      setIsCached(false);
    } catch (requestError) {
      setError(requestError.message || "Policy explanation is unavailable.");
    }
  };

  const askByVoice = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Voice recognition is not available in this browser. Type your question instead.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = language === "ta" ? "ta-IN" : "en-IN";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const voiceQuestion = event.results?.[0]?.[0]?.transcript || "";
      setQuestion(voiceQuestion);
      setListening(false);
    };
    recognition.onerror = () => {
      setListening(false);
      setError("Voice input was not understood. Please type your question.");
    };
    recognition.onend = () => setListening(false);
    setError("");
    setListening(true);
    recognition.start();
  };

  const speakAnswer = () => {
    if (!answer || !("speechSynthesis" in window)) {
      setError("Text-to-speech is not available in this browser; the written answer is shown.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.lang = language === "ta" ? "ta-IN" : "en-IN";
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Explain only what the document says</p>
          <h1>Policy Assistant</h1>
          <p className="page-subtitle">Ask about the available demo policy in English or Tamil. Unknown details are not guessed.</p>
        </div>
        <span className={`tag-badge ${isCached ? "info-tag" : "demo-tag"}`}>{isCached ? "Cached information" : "Server data"}</span>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="two-column-grid">
        <section className="page-card">
          <div className="card-header">
            <h3>Ask about your policy</h3>
            <select aria-label="Answer language" value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="en">English</option>
              <option value="ta">தமிழ்</option>
            </select>
          </div>
          <form className="quote-form" onSubmit={submitQuestion}>
            <label>
              Your question
              <textarea value={question} rows={3} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder={language === "ta" ? "இந்த policy-ல என்ன cover ஆகும்?" : "What does this policy cover?"} />
            </label>
            <div className="action-row">
              <button type="button" className="secondary-btn" onClick={askByVoice} disabled={listening}>{listening ? "Listening…" : "Ask by voice"}</button>
              <button type="submit" className="primary-btn">Explain</button>
            </div>
          </form>
          {answer && (
            <div className="policy-answer" aria-live="polite">
              <strong>{language === "ta" ? "விளக்கம்" : "Explanation"}</strong>
              <p lang={language === "ta" ? "ta" : "en"}>{answer}</p>
              <small>Source: {source}</small>
              <button type="button" className="text-button" onClick={speakAnswer}>Read aloud</button>
            </div>
          )}
        </section>

        <section className="page-card">
          <div className="card-header"><h3>Available policy information</h3><span className="rule-badge">{policy.policyId}</span></div>
          <p><strong>{policy.kind}</strong></p>
          <p className="muted-copy">Expiry date: {policy.expiresOn}</p>
          <h4>Listed coverage (subject to terms)</h4>
          <ul className="bullet-list">{policy.coverage.map((item) => <li key={item}>{item}</li>)}</ul>
          <h4>Listed exclusions</h4>
          <ul className="bullet-list">{policy.exclusions.map((item) => <li key={item}>{item}</li>)}</ul>
          <p className="legal-note">{policy.source}</p>
        </section>
      </div>

      <section className="page-card">
        <div className="card-header"><h3>Smart add-on information</h3><span className="tag-badge info-tag">Illustrative only</span></div>
        <div className="two-column-grid">
          {policy.addons.map((addon) => (
            <article className="factor-row" key={addon.name}>
              <div><strong>{addon.name}</strong><span>₹{addon.price.toLocaleString("en-IN")}</span></div>
              <p>{addon.purpose}</p>
              <p className="muted-copy">Based on information provided; compare the exact exclusions and limits in the issued policy.</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
