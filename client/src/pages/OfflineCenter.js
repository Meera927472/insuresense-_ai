import React, { useCallback, useEffect, useState } from "react";
import {
  canonicalJson,
  getAllTrips,
  getDeviceIdentity,
  getSetting,
  saveSetting,
  saveTrip,
  sha256Hex,
  signTrip,
} from "../services/offlineStorage";

const API = "http://localhost:8000";

function localScore(metrics, isPassenger, roadHazard) {
  if (isPassenger) return null;
  const speeding = Math.min(100, metrics.speedingEvents * 11);
  const braking = roadHazard ? 0 : Math.min(100, metrics.harshBraking * 14);
  const acceleration = Math.min(100, metrics.rapidAcceleration * 15);
  return Math.round(Math.max(0, Math.min(100, 100 - speeding * 0.25 - braking * 0.2 - acceleration * 0.2)) * 10) / 10;
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

export default function OfflineCenter() {
  const [online, setOnline] = useState(navigator.onLine);
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [driver, setDriver] = useState("Son");
  const [isPassenger, setIsPassenger] = useState(false);
  const [roadHazard, setRoadHazard] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [ruleVersion, setRuleVersion] = useState("Not cached");
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refreshTrips = useCallback(async () => {
    const localTrips = await getAllTrips();
    setTrips(localTrips.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
  }, []);

  const syncPending = useCallback(async () => {
    if (!navigator.onLine) {
      setError("You're offline. Trips remain securely queued on this device.");
      return;
    }
    setSyncing(true);
    setError("");
    setMessage("");
    const localTrips = await getAllTrips();
    const queue = localTrips
      .filter((trip) => ["pending", "failed"].includes(trip.status))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let syncedCount = 0;
    let hadConflict = false;

    for (const trip of queue) {
      const syncingTrip = { ...trip, status: "syncing", error: "" };
      await saveTrip(syncingTrip);
      try {
        const response = await fetch(`${API}/api/offline/trips`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(trip.packet),
        });
        const data = await response.json();
        if (!response.ok) {
          const status = response.status === 409 ? "needs_review" : "failed";
          await saveTrip({ ...trip, status, error: data.detail || "Trip synchronization failed." });
          if (status === "needs_review") {
            hadConflict = true;
            setError(data.detail || "A trip needs review before it can sync.");
          }
          continue;
        }
        await saveTrip({
          ...trip,
          status: data.status === "verified" ? "verified" : "needs_review",
          verifiedScore: data.verifiedScore,
          serverRoadContext: data.roadContext,
          error: "",
        });
        syncedCount += 1;
      } catch (syncError) {
        await saveTrip({ ...trip, status: "failed", error: syncError.message || "Network unavailable; trip remains queued locally." });
      }
    }

    await refreshTrips();
    setSyncing(false);
    if (syncedCount) setMessage(`${syncedCount} trip${syncedCount === 1 ? "" : "s"} verified by the server.`);
    else if (!queue.length) setMessage("There are no trips waiting to sync.");
    else if (!hadConflict) setError("Trips are still queued. Check your network and retry.");
  }, [refreshTrips]);

  useEffect(() => {
    const updateNetwork = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) syncPending();
    };
    refreshTrips()
      .then(() => {
        if (navigator.onLine) syncPending();
      })
      .catch((storageError) => setError(storageError.message));
    getSetting("pricing-rules").then((cached) => {
      if (cached?.version) setRuleVersion(cached.version);
    }).catch((storageError) => setError(storageError.message));
    fetch(`${API}/api/settings`)
      .then((response) => {
        if (!response.ok) throw new Error("Pricing rules could not be refreshed.");
        return response.json();
      })
      .then((rules) => {
        setRuleVersion(rules.version);
        return saveSetting({ key: "pricing-rules", ...rules, savedAt: new Date().toISOString() });
      })
      .catch((rulesError) => {
        if (navigator.onLine) setError(rulesError.message || "Cached pricing rules could not be refreshed.");
      });
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    return () => {
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
    };
  }, [refreshTrips, syncPending]);

  const startTrip = () => {
    setError("");
    setMessage("");
    if (!consentConfirmed) {
      setError("Confirm local demo telematics consent before recording a trip.");
      return;
    }
    if (!isPassenger && !driver) {
      setError("Choose the driver before starting.");
      return;
    }
    setActiveTrip({ startedAt: new Date().toISOString() });
    setMessage(isPassenger ? "Passenger trip selected. It will not affect a driving score." : "Trip recording started on this device.");
  };

  const stopTrip = async () => {
    setError("");
    setMessage("");
    if (!activeTrip) return;
    try {
      const identity = await getDeviceIdentity();
      const timestamp = new Date().toISOString();
      const metrics = {
        speedingEvents: isPassenger ? 0 : 0.6,
        harshBraking: roadHazard ? 1.5 : 0.2,
        rapidAcceleration: isPassenger ? 0 : 0.3,
      };
      const tripPayload = {
        driver,
        driverConfirmed: !isPassenger,
        isPassenger,
        roadHazard: roadHazard || null,
        durationSeconds: Math.max(1, Math.round((Date.now() - new Date(activeTrip.startedAt).getTime()) / 1000)),
        speedingEvents: metrics.speedingEvents,
        harshBraking: metrics.harshBraking,
        rapidAcceleration: metrics.rapidAcceleration,
      };
      const tripId = crypto.randomUUID();
      const hashContent = {
        tripId,
        deviceId: identity.deviceId,
        timestamp,
        previousHash: identity.previousHash,
        payload: tripPayload,
      };
      const currentHash = await sha256Hex(hashContent);
      const unsignedPacket = { ...hashContent, currentHash };
      const signature = await signTrip(identity, unsignedPacket);
      const packet = {
        trip_id: tripId,
        device_id: identity.deviceId,
        timestamp,
        previous_hash: identity.previousHash,
        current_hash: currentHash,
        payload: tripPayload,
        public_key: identity.publicKey,
        signature,
        provisional_score: localScore(metrics, isPassenger, Boolean(roadHazard)) ?? 0,
      };
      const localTrip = {
        tripId,
        timestamp,
        driver,
        isPassenger,
        roadHazard: roadHazard || null,
        provisionalScore: packet.provisional_score,
        status: "pending",
        currentHash,
        packet,
      };
      await saveTrip(localTrip);
      await saveSetting({ ...identity, previousHash: currentHash });
      await refreshTrips();
      setActiveTrip(null);
      setMessage(online ? "Trip saved locally; syncing the signed packet now." : "You're offline. The signed trip is queued securely on this device.");
      if (online) await syncPending();
    } catch (tripError) {
      setError(tripError.message || "Trip could not be saved locally.");
    }
  };

  const downloadReceipt = (trip) => {
    const receipt = {
      product: "InsureSense AI demonstration",
      tripId: trip.tripId,
      collected: ["Trip time", "Driver confirmation", "Illustrative braking, acceleration and speeding indicators", "Optional road-context flag"],
      purpose: "Local driving analytics and illustrative coaching; not a claim decision.",
      retentionDays: 365,
      status: trip.status === "verified" ? "Server verified" : "Local / provisional",
      integrityStatus: trip.status,
      hash: trip.currentHash,
      score: trip.verifiedScore ?? trip.provisionalScore,
    };
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `insuresense-data-receipt-${trip.tripId}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const pendingCount = trips.filter((trip) => ["pending", "failed", "syncing"].includes(trip.status)).length;

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Offline-first trip intelligence</p>
          <h1>Offline & Sync Center</h1>
          <p className="page-subtitle">Record locally, score provisionally, then verify signed trip packets when connectivity returns.</p>
        </div>
        <span className={`network-indicator ${online ? "online" : "offline"}`}>
          {online ? "ONLINE" : "OFFLINE MODE"}
        </span>
      </div>

      {!online && <div className="offline-banner" role="status">You're offline. Your trip is being stored securely on this device.</div>}

      <div className="two-column-grid">
        <section className="page-card">
          <div className="card-header">
            <h3>Trip recording</h3>
            <span className="rule-badge">Cached rules {ruleVersion}</span>
          </div>
          <p className="muted-copy">This demo simulates trip telemetry. No continuous GPS tracking is used.</p>
          <label className="consent-check">
            <input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} />
            I consent to local demo telemetry for this trip.
          </label>
          <label>
            Driver profile
            <select value={driver} onChange={(event) => setDriver(event.target.value)} disabled={isPassenger}>
              <option>Father</option>
              <option>Mother</option>
              <option>Son</option>
            </select>
          </label>
          <div className="action-row">
            <button type="button" className={`secondary-btn ${!isPassenger ? "selected-choice" : ""}`} onClick={() => setIsPassenger(false)} disabled={Boolean(activeTrip)}>Yes, I'm driving</button>
            <button type="button" className={`secondary-btn ${isPassenger ? "selected-choice" : ""}`} onClick={() => setIsPassenger(true)} disabled={Boolean(activeTrip)}>I'm a passenger</button>
          </div>
          <label>
            Simulated road event
            <select value={roadHazard} onChange={(event) => setRoadHazard(event.target.value)} disabled={Boolean(activeTrip)}>
              <option value="">No hazard event</option>
              <option value="pothole">Pothole / rough road</option>
              <option value="speed_breaker">Speed breaker</option>
            </select>
          </label>
          {activeTrip ? (
            <div className="active-trip">
              <strong>Trip in progress</strong>
              <span>Started {formatDate(activeTrip.startedAt)}</span>
              <button type="button" className="primary-btn" onClick={stopTrip}>Stop trip & save locally</button>
            </div>
          ) : (
            <button type="button" className="primary-btn" onClick={startTrip}>Start trip</button>
          )}
          {error && <div className="error-banner" role="alert">{error}</div>}
          {message && <div className="explanation-box" role="status">{message}</div>}
        </section>

        <section className="page-card">
          <div className="card-header">
            <h3>Sync queue</h3>
            <span className="pill">{pendingCount} pending</span>
          </div>
          <p className="muted-copy">Packets are signed with a browser-held P-256 device key and hash-linked to the previous trip. Integrity checks are prototype tamper-evidence, not fraud-proofing.</p>
          <div className="sync-summary">
            <div><strong>{pendingCount}</strong><span>Pending</span></div>
            <div><strong>{trips.filter((trip) => trip.status === "verified").length}</strong><span>Verified</span></div>
            <div><strong>{trips.filter((trip) => trip.status === "needs_review").length}</strong><span>Needs review</span></div>
          </div>
          <button type="button" className="secondary-btn" onClick={syncPending} disabled={syncing || !online}>
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <p className="rule-badge">Local scoring and provisional estimates use cached Pricing Rules {ruleVersion}</p>
        </section>
      </div>

      <section className="page-card">
        <div className="card-header">
          <h3>Trip packets & data receipts</h3>
          <span className="muted-copy">Local storage stays on this device until synchronized.</span>
        </div>
        {trips.length ? (
          <div className="trip-list">
            {trips.map((trip) => (
              <article className="trip-row" key={trip.tripId}>
                <div className="trip-main">
                  <strong>{trip.isPassenger ? "Passenger trip" : `${trip.driver} — trip`}</strong>
                  <span>{formatDate(trip.timestamp)}</span>
                  {trip.roadHazard && <small className="hazard-note">Road-context event: {trip.roadHazard.replace("_", " ")} — no driver penalty</small>}
                  <small className="hash-preview">Integrity hash · {trip.currentHash.slice(0, 20)}…</small>
                </div>
                <div className="trip-meta">
                  <span className={`status-pill ${trip.status === "verified" ? "" : trip.status === "needs_review" ? "review-status" : "local-status"}`}>
                    {trip.status === "verified" ? "Verified Score" : trip.status === "needs_review" ? "Needs Review" : "Provisional Score"}
                  </span>
                  <strong>{trip.isPassenger ? "Not scored" : trip.verifiedScore ?? trip.provisionalScore}</strong>
                  <button type="button" className="secondary-btn" onClick={() => downloadReceipt(trip)}>Download data receipt</button>
                </div>
                {trip.error && <small className="error-copy">{trip.error}</small>}
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No locally recorded trips yet. Start a demo trip to create a signed, reviewable packet.</p>
        )}
      </section>
    </div>
  );
}
