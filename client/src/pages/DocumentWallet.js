import React, { useEffect, useRef, useState } from "react";
import { deleteDocument, getAllDocuments, saveDocument } from "../services/offlineStorage";

const documentTypes = ["Insurance policy", "Registration certificate (RC)", "Driving licence", "PUC certificate", "Claim document", "Emergency contact"];

function expiryMessage(dateValue) {
  if (!dateValue) return "No expiry date recorded";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${dateValue}T00:00:00`);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "Expired";
  if (days <= 7) return `Expires in ${days} day${days === 1 ? "" : "s"}`;
  if (days <= 15) return `Expires in ${days} days`;
  if (days <= 30) return `Expires in ${days} days`;
  return `Expires ${expiry.toLocaleDateString()}`;
}

export default function DocumentWallet() {
  const [documents, setDocuments] = useState([]);
  const [documentType, setDocumentType] = useState(documentTypes[0]);
  const [expiry, setExpiry] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef(null);

  const refreshDocuments = async () => {
    const items = await getAllDocuments();
    setDocuments(items.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
  };

  useEffect(() => {
    refreshDocuments()
      .catch((storageError) => setError(storageError.message || "Local document wallet is unavailable."))
      .finally(() => setLoading(false));
  }, []);

  const uploadDocument = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!file) {
      setError("Choose a document file first.");
      return;
    }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setError("Only PDF, JPEG and PNG files can be stored in this demo wallet.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Document must be 10 MB or smaller for local storage.");
      return;
    }
    try {
      const record = {
        id: crypto.randomUUID(),
        type: documentType,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        blob: file,
        expiry,
        savedAt: new Date().toISOString(),
      };
      await saveDocument(record);
      await refreshDocuments();
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setExpiry("");
      setMessage("Document saved locally on this device. It was not uploaded to the server.");
    } catch (saveError) {
      setError(saveError.message || "Document could not be stored locally. Check available device storage.");
    }
  };

  const openDocument = (document) => {
    if (!document.blob) {
      setError("The local document data is unavailable.");
      return;
    }
    const url = URL.createObjectURL(document.blob);
    const opened = window.open(url, "_blank");
    if (!opened) {
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.name;
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const removeDocument = async (document) => {
    setError("");
    try {
      await deleteDocument(document.id);
      await refreshDocuments();
      setMessage(`${document.name} was removed from this device.`);
    } catch (removeError) {
      setError(removeError.message || "Document could not be removed.");
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Private device storage</p>
          <h1>Document Wallet</h1>
          <p className="page-subtitle">Keep policy and vehicle documents available offline. Files remain in this browser's local storage.</p>
        </div>
        <span className="tag-badge info-tag">Local only</span>
      </div>

      <section className="page-card">
        <div className="card-header"><h3>Add a document</h3><span className="rule-badge">Max 10 MB · PDF/JPEG/PNG</span></div>
        <form className="document-form" onSubmit={uploadDocument}>
          <label>
            Document type
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
              {documentTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label>
            File
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </label>
          <label>
            Expiry date (optional)
            <input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} />
          </label>
          <button className="primary-btn" type="submit">Save to this device</button>
        </form>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {message && <div className="explanation-box" role="status">{message}</div>}
      </section>

      <section className="page-card">
        <div className="card-header"><h3>My documents</h3><span className="pill">{documents.length} stored locally</span></div>
        {loading && <p className="muted-copy">Loading local documents…</p>}
        {!loading && documents.length === 0 && <p className="empty-state">No documents are stored yet. Add a policy, RC, licence or PUC to access it offline.</p>}
        <div className="document-list">
          {documents.map((document) => (
            <article className="document-row" key={document.id}>
              <div>
                <strong>{document.type}</strong>
                <span>{document.name} · {(document.size / 1024).toFixed(0)} KB</span>
                <small className={document.expiry && expiryMessage(document.expiry) === "Expired" ? "error-copy" : "muted-copy"}>
                  {expiryMessage(document.expiry)}
                </small>
              </div>
              <div className="action-row">
                <button type="button" className="secondary-btn" onClick={() => openDocument(document)}>View offline</button>
                <button type="button" className="secondary-btn danger-btn" onClick={() => removeDocument(document)}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <p className="legal-note">Local browser data may be cleared by the user or browser. Keep your own secure backups; this prototype does not encrypt documents at rest.</p>
    </div>
  );
}
