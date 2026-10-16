import React, { useEffect, useState } from "react";

export default function ReviewRequests() {
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    fetch("http://localhost:8000/api/reviews")
      .then((res) => res.json())
      .then(setReviews)
      .catch(() => setReviews([]));
  }, []);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Human review</p>
          <h1>Review Requests</h1>
        </div>
      </div>

      <div className="page-card">
        <div className="list-stack">
          {reviews.length ? reviews.map((review) => (
            <div key={review.id} className="list-row review-row">
              <div>
                <strong>{review.reason}</strong>
                <small>{review.created_at}</small>
              </div>
              <div className="review-meta">
                <span className="status-pill">{review.status}</span>
                <span>{review.decision}</span>
              </div>
            </div>
          )) : <p className="empty-state">No review requests queued.</p>}
        </div>
      </div>
    </div>
  );
}
