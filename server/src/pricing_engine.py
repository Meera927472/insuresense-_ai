from __future__ import annotations

from typing import Any, Dict, List


DEFAULT_RULE = {
    "version": "2026.Q1.demo",
    "base_rate": 12000.0,
    "vehicle_factor": 1.0,
    "age_factor": 1.0,
    "claims_factor": 1.0,
    "min_adjustment": -35.0,
    "max_adjustment": 25.0,
}


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(value, maximum))


def compute_driving_score(data: Dict[str, Any]) -> Dict[str, Any]:
    speeding = clamp(float(data.get("speeding_events", 0.0)) * 11.0, 0.0, 100.0)
    harsh_braking = clamp(float(data.get("harsh_braking", 0.0)) * 14.0, 0.0, 100.0)
    rapid_acceleration = clamp(float(data.get("rapid_acceleration", 0.0)) * 15.0, 0.0, 100.0)
    consistency = float(data.get("driving_consistency", 80.0))
    completeness = float(data.get("data_completeness", 80.0))
    annual_distance = float(data.get("annual_distance_km", 8000.0))

    usage_penalty = clamp((annual_distance / 30000.0) * 18.0, 0.0, 25.0)
    score = (
        100
        - (speeding * 0.25)
        - (harsh_braking * 0.2)
        - (rapid_acceleration * 0.2)
        - ((100 - consistency) * 0.6)
        - usage_penalty
    )
    score = clamp(score * (0.8 + (completeness / 100.0) * 0.4), 0.0, 100.0)

    indicator_scores = {
        "speeding": round(100 - speeding, 1),
        "braking": round(100 - harsh_braking, 1),
        "acceleration": round(100 - rapid_acceleration, 1),
        "consistency": round(consistency, 1),
        "usage": round(100 - usage_penalty, 1),
    }

    data_quality = clamp((completeness * 0.7) + (consistency * 0.3), 0.0, 100.0)

    suggestions = []
    if indicator_scores["speeding"] < 75:
        suggestions.append("Reduce speeding events by maintaining a steady pace and using cruise control where appropriate.")
    if indicator_scores["braking"] < 75:
        suggestions.append("Practise smoother braking and leave more following distance to reduce harsh braking incidents.")
    if indicator_scores["acceleration"] < 75:
        suggestions.append("Accelerate more gradually and avoid rapid starts in dense traffic or urban routes.")
    if indicator_scores["consistency"] < 80:
        suggestions.append("Improve route consistency by reducing high-variance driving patterns across your frequent trips.")
    if not suggestions:
        suggestions.append("Your illustrative driving profile is strong. Maintain stable driving behaviour and keep telemetry complete.")

    return {
        "driving_score": round(score, 1),
        "data_quality": round(data_quality, 1),
        "indicator_scores": indicator_scores,
        "suggestions": suggestions,
    }


def calculate_quote(data: Dict[str, Any], rule: Dict[str, Any] | None = None) -> Dict[str, Any]:
    rule = rule or DEFAULT_RULE
    vehicle_type = str(data.get("vehicle_type", "Sedan")).lower()
    vehicle_age = max(0, int(data.get("vehicle_age", 3)))
    vehicle_value = float(data.get("vehicle_value", 1200000.0))
    annual_distance = float(data.get("annual_distance_km", 8000.0))
    previous_claims = max(0, int(data.get("previous_claims", 0)))
    completeness = float(data.get("data_completeness", 80.0))

    vehicle_multiplier = {
        "sedan": 1.0,
        "suv": 1.18,
        "hatchback": 0.92,
        "bike": 0.74,
        "truck": 1.42,
        "ev": 1.1,
    }.get(vehicle_type, 1.0)

    vehicle_age_factor = max(0.72, 1.15 - (vehicle_age * 0.03))
    value_factor = 1 + (vehicle_value / 1000000.0) * 0.14
    distance_factor = 1 + min(annual_distance / 30000.0, 2.0) * 0.12
    claims_factor = 1 + previous_claims * 0.08

    base_premium = (
        float(rule["base_rate"])
        * float(rule["vehicle_factor"]) * vehicle_multiplier
        * vehicle_age_factor
        * value_factor * distance_factor * claims_factor
    )

    score_data = compute_driving_score(data)
    score = score_data["driving_score"]

    if completeness < 50:
        behaviour_adjustment_pct = 0.0
        explanation = "No behavioural adjustment was applied because the available data was insufficient for a validated assessment."
    else:
        adjustment = clamp((100 - score) * 0.6, float(rule["min_adjustment"]), float(rule["max_adjustment"]))
        behaviour_adjustment_pct = round(adjustment, 2)
        explanation = "Your eligible driving behaviour qualified for an illustrative premium adjustment."

    behaviour_adjustment_value = base_premium * (behaviour_adjustment_pct / 100.0)
    final_premium = base_premium + behaviour_adjustment_value
    final_premium = round(final_premium, 2)

    breakdown = [
        {"label": "Base premium", "value": round(base_premium, 2), "detail": "Configured base rate aligned with approved rules."},
        {"label": "Behavioural adjustment", "value": round(behaviour_adjustment_value, 2), "detail": explanation},
        {"label": "Other adjustments", "value": 0.0, "detail": "No extra approved policy surcharges applied in this demo."},
        {"label": "Final estimated premium", "value": final_premium, "detail": "Illustrative premium for demonstration only."},
    ]

    return {
        "base_premium": round(base_premium, 2),
        "behaviour_adjustment_pct": behaviour_adjustment_pct,
        "behaviour_adjustment_value": round(behaviour_adjustment_value, 2),
        "final_premium": final_premium,
        "driving_score": round(score, 1),
        "data_quality": score_data["data_quality"],
        "rule_version": rule["version"],
        "explanation": explanation,
        "breakdown": breakdown,
        "indicator_scores": score_data["indicator_scores"],
        "suggestions": score_data["suggestions"],
    }
