const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(value, maximum));

export function calculateOfflineQuote(data, rule) {
  if (!rule || !Number.isFinite(Number(rule.baseRate))) {
    throw new Error("No cached verified pricing rules are available. Reconnect before generating an estimate.");
  }

  const vehicleType = String(data.vehicle_type || "Sedan").toLowerCase();
  const vehicleAge = Math.max(0, Number(data.vehicle_age));
  const vehicleValue = Number(data.vehicle_value);
  const annualDistance = Number(data.annual_distance_km);
  const previousClaims = Math.max(0, Number(data.previous_claims));
  const completeness = Number(data.data_completeness);
  const vehicleMultiplier = {
    sedan: 1,
    suv: 1.18,
    hatchback: 0.92,
    bike: 0.74,
    truck: 1.42,
    ev: 1.1,
  }[vehicleType] ?? 1;

  const basePremium = Number(rule.baseRate)
    * Number(rule.vehicleFactor ?? 1)
    * vehicleMultiplier
    * Math.max(0.72, 1.15 - vehicleAge * 0.03)
    * (1 + vehicleValue / 1000000 * 0.14)
    * (1 + Math.min(annualDistance / 30000, 2) * 0.12)
    * (1 + previousClaims * 0.08);

  const speeding = clamp(Number(data.speeding_events) * 11, 0, 100);
  const braking = clamp(Number(data.harsh_braking) * 14, 0, 100);
  const acceleration = clamp(Number(data.rapid_acceleration) * 15, 0, 100);
  const usagePenalty = clamp(annualDistance / 30000 * 18, 0, 25);
  const drivingScore = clamp(
    (100 - speeding * 0.25 - braking * 0.2 - acceleration * 0.2
      - (100 - Number(data.driving_consistency)) * 0.6 - usagePenalty)
      * (0.8 + completeness / 100 * 0.4),
    0,
    100
  );
  const behaviorAdjustmentPct = completeness < 50
    ? 0
    : Number(clamp((100 - drivingScore) * 0.6, Number(rule.minAdjustment), Number(rule.maxAdjustment)).toFixed(2));
  const adjustmentValue = basePremium * behaviorAdjustmentPct / 100;
  const finalPremium = Number((basePremium + adjustmentValue).toFixed(2));
  const roundedBase = Number(basePremium.toFixed(2));

  return {
    source: "offline",
    driving_score: Number(drivingScore.toFixed(1)),
    base_premium: roundedBase,
    behaviour_adjustment_pct: behaviorAdjustmentPct,
    final_premium: finalPremium,
    data_quality: Number((completeness * 0.7 + Number(data.driving_consistency) * 0.3).toFixed(1)),
    explanation: "Offline estimate from cached demo pricing rules. It is provisional and not a server-authorized quote.",
    rule_version: rule.version,
    breakdown: [
      { label: "Base premium", value: roundedBase, detail: `Cached pricing rules ${rule.version}.` },
      { label: "Behavioural adjustment", value: Number(adjustmentValue.toFixed(2)), detail: completeness < 50 ? "No behavioural adjustment: data completeness is below the configured threshold." : "Illustrative adjustment calculated locally from the driving score." },
      { label: "Other adjustments", value: 0, detail: "No extra approved policy surcharges applied in this demo." },
      { label: "Offline estimated premium", value: finalPremium, detail: "Local calculation only; reconnect to request server validation." },
    ],
  };
}
