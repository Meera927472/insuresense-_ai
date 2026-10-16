import React, { useEffect, useState } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";

export default function DrivingAnalytics() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("http://localhost:8000/api/analytics")
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData({ overallDrivingScore: 82, indicatorScores: [], dataQuality: 85, confidence: 85, suggestions: [] }));
  }, []);

  if (!data) return <div className="page-card">Loading analytics…</div>;

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Behaviour scoring</p>
          <h1>Driving Analytics</h1>
        </div>
        <div className="tag-badge info-tag">Data quality: {data.dataQuality}/100</div>
      </div>

      <div className="two-column-grid">
        <div className="page-card stats-panel">
          <h3>Overall driving score</h3>
          <div className="big-score">{data.overallDrivingScore}</div>
          <p>Illustrative score from 0 to 100. Higher scores indicate safer measured behaviour.</p>
        </div>

        <div className="page-card chart-card">
          <h3>Indicator scores</h3>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <RadarChart data={data.indicatorScores}>
                <PolarGrid />
                <PolarAngleAxis dataKey="name" />
                <PolarRadiusAxis domain={[0, 100]} />
                <Radar dataKey="score" stroke="#1c7ee6" fill="#66d9cf" fillOpacity={0.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="page-card">
        <h3>Improvement suggestions</h3>
        <ul className="bullet-list">
          {data.suggestions.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
    </div>
  );
}
