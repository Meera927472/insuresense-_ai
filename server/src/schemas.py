from typing import Literal, Optional

from pydantic import BaseModel, Field


class QuoteInput(BaseModel):
    vehicle_type: str = Field(..., min_length=2)
    vehicle_age: int = Field(..., ge=0, le=30)
    vehicle_value: float = Field(..., gt=0)
    annual_distance_km: float = Field(..., gt=0)
    previous_claims: int = Field(default=0, ge=0)
    speeding_events: float = Field(default=0.0, ge=0)
    harsh_braking: float = Field(default=0.0, ge=0)
    rapid_acceleration: float = Field(default=0.0, ge=0)
    driving_consistency: float = Field(default=80.0, ge=0, le=100)
    data_completeness: float = Field(default=80.0, ge=0, le=100)
    csv_data: Optional[str] = None


class ConsentInput(BaseModel):
    user_id: int = 1
    consent_for_optional_data: bool = False
    consent_for_telemetry: bool = False
    consent_for_analytics: bool = False
    purpose: str = "Illustrative pricing"
    status: str = "active"
    retention_period_days: int = 365
    notes: str = ""


class SettingsInput(BaseModel):
    version: str = "2026.Q1.demo"
    base_rate: float = Field(..., gt=0)
    min_adjustment: float = Field(..., le=0)
    max_adjustment: float = Field(..., gt=0)


class ReviewInput(BaseModel):
    user_id: int = 1
    quote_id: Optional[int] = None
    reason: str = Field(..., min_length=5)
    status: str = "open"


class QuoteRecord(BaseModel):
    id: int
    vehicle_type: str
    driving_score: float
    base_premium: float
    behaviour_adjustment_pct: float
    final_premium: float
    data_quality: float
    explanation: str
    created_at: str


class OfflineTripPayload(BaseModel):
    driver: str = Field(..., min_length=1, max_length=80)
    driverConfirmed: bool
    isPassenger: bool
    roadHazard: Optional[Literal["pothole", "speed_breaker"]] = None
    speedingEvents: float = Field(..., ge=0, le=100)
    harshBraking: float = Field(..., ge=0, le=100)
    rapidAcceleration: float = Field(..., ge=0, le=100)
    durationSeconds: int = Field(..., ge=0, le=86400)


class OfflineTripPacketInput(BaseModel):
    trip_id: str = Field(..., min_length=8, max_length=80)
    device_id: str = Field(..., min_length=8, max_length=100)
    timestamp: str
    previous_hash: Optional[str] = None
    current_hash: str = Field(..., min_length=64, max_length=64)
    payload: OfflineTripPayload
    public_key: str
    signature: str
    provisional_score: float = Field(..., ge=0, le=100)


class ClaimInput(BaseModel):
    trip_id: Optional[str] = None
    incident_type: str = Field(..., min_length=3, max_length=80)
    description: str = Field(..., min_length=10, max_length=2000)


class ClaimStageInput(BaseModel):
    status: Literal[
        "claim_intimated",
        "documents_submitted",
        "assessment",
        "under_review",
        "approved",
        "further_information",
        "settled",
    ]


class PolicyQuestionInput(BaseModel):
    question: str = Field(..., min_length=2, max_length=500)
    language: Literal["en", "ta"] = "en"


class SOSInput(BaseModel):
    emergency_type: Literal["possible_crash", "claim_intimation", "manual_sos"]
    vehicle_label: str = Field(..., min_length=1, max_length=120)
    approximate_location: Optional[str] = Field(default=None, max_length=255)
    confirmation: Literal["user_confirmed"] = "user_confirmed"
