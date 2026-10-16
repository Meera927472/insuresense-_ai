from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    role = Column(String(50), default="customer")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vehicles = relationship("Vehicle", back_populates="owner")
    quotes = relationship("InsuranceQuote", back_populates="user")
    reviews = relationship("ReviewRequest", back_populates="user")


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    make = Column(String(100), default="Toyota")
    model = Column(String(100), default="Corolla")
    year = Column(Integer, default=2022)
    type = Column(String(50), default="Sedan")
    value = Column(Float, default=1200000)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="vehicles")
    quotes = relationship("InsuranceQuote", back_populates="vehicle")


class DrivingSession(Base):
    __tablename__ = "driving_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    session_date = Column(DateTime, default=datetime.utcnow)
    annual_distance_km = Column(Float, default=8000)
    data_quality_score = Column(Float, default=90.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    measurements = relationship("BehaviourMeasurement", back_populates="session")


class BehaviourMeasurement(Base):
    __tablename__ = "behaviour_measurements"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("driving_sessions.id"), nullable=False)
    speeding_events = Column(Float, default=1.0)
    harsh_braking = Column(Float, default=0.5)
    rapid_acceleration = Column(Float, default=0.7)
    driving_consistency = Column(Float, default=82.0)
    data_completeness = Column(Float, default=85.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("DrivingSession", back_populates="measurements")


class ConsentRecord(Base):
    __tablename__ = "consent_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    consent_for_optional_data = Column(Boolean, default=False)
    consent_for_telemetry = Column(Boolean, default=False)
    consent_for_analytics = Column(Boolean, default=False)
    purpose = Column(String(255), default="Illustrative pricing")
    consent_status = Column(String(50), default="active")
    consented_at = Column(DateTime, default=datetime.utcnow)
    withdrawn_at = Column(DateTime, nullable=True)
    retention_period_days = Column(Integer, default=365)
    notes = Column(Text, default="")


class PricingRule(Base):
    __tablename__ = "pricing_rules"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(50), unique=True, nullable=False)
    base_rate = Column(Float, default=12000.0)
    vehicle_factor = Column(Float, default=1.0)
    age_factor = Column(Float, default=1.0)
    claims_factor = Column(Float, default=1.0)
    min_adjustment = Column(Float, default=-35.0)
    max_adjustment = Column(Float, default=25.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    quotes = relationship("InsuranceQuote", back_populates="pricing_rule")


class InsuranceQuote(Base):
    __tablename__ = "insurance_quotes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    pricing_rule_id = Column(Integer, ForeignKey("pricing_rules.id"), nullable=False)
    vehicle_type = Column(String(100), nullable=False)
    vehicle_age = Column(Integer, default=3)
    vehicle_value = Column(Float, default=1200000)
    annual_distance_km = Column(Float, default=6000)
    previous_claims = Column(Integer, default=0)
    speeding_events = Column(Float, default=1.0)
    harsh_braking = Column(Float, default=0.5)
    rapid_acceleration = Column(Float, default=0.8)
    driving_consistency = Column(Float, default=82.0)
    data_completeness = Column(Float, default=85.0)
    driving_score = Column(Float, nullable=False)
    base_premium = Column(Float, nullable=False)
    behaviour_adjustment_pct = Column(Float, nullable=False)
    final_premium = Column(Float, nullable=False)
    data_quality = Column(Float, default=85.0)
    explanation = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="quotes")
    vehicle = relationship("Vehicle", back_populates="quotes")
    pricing_rule = relationship("PricingRule", back_populates="quotes")
    breakdowns = relationship("QuoteBreakdown", back_populates="quote")
    reviews = relationship("ReviewRequest", back_populates="quote")


class QuoteBreakdown(Base):
    __tablename__ = "quote_breakdowns"

    id = Column(Integer, primary_key=True, index=True)
    quote_id = Column(Integer, ForeignKey("insurance_quotes.id"), nullable=False)
    label = Column(String(200), nullable=False)
    value = Column(Float, nullable=False)
    detail = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    quote = relationship("InsuranceQuote", back_populates="breakdowns")


class ReviewRequest(Base):
    __tablename__ = "review_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    quote_id = Column(Integer, ForeignKey("insurance_quotes.id"), nullable=True)
    reason = Column(String(255), nullable=False)
    status = Column(String(50), default="open")
    reviewer_notes = Column(Text, default="")
    decision = Column(String(50), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="reviews")
    quote = relationship("InsuranceQuote", back_populates="reviews")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    event_type = Column(String(100), nullable=False)
    summary = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class TripPacket(Base):
    __tablename__ = "trip_packets"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(String(80), unique=True, nullable=False, index=True)
    device_id = Column(String(100), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False)
    previous_hash = Column(String(64), nullable=True)
    current_hash = Column(String(64), nullable=False)
    payload = Column(Text, nullable=False)
    public_key = Column(Text, nullable=False)
    signature = Column(Text, nullable=False)
    provisional_score = Column(Float, nullable=False)
    verified_score = Column(Float, nullable=True)
    integrity_status = Column(String(30), default="pending")
    is_passenger = Column(Boolean, default=False)
    road_context = Column(String(80), default="none")
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ClaimCase(Base):
    __tablename__ = "claim_cases"

    id = Column(Integer, primary_key=True, index=True)
    claim_reference = Column(String(40), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    trip_id = Column(String(80), ForeignKey("trip_packets.trip_id"), nullable=True)
    incident_type = Column(String(80), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(40), default="claim_intimated")
    evidence_pack = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PassportVerification(Base):
    __tablename__ = "passport_verifications"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(80), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    revoked_at = Column(DateTime, nullable=True)


class EmergencyEvent(Base):
    __tablename__ = "emergency_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    vehicle_label = Column(String(120), nullable=False)
    emergency_type = Column(String(80), nullable=False)
    approximate_location = Column(String(255), nullable=True)
    message = Column(Text, nullable=False)
    delivery_status = Column(String(40), default="delivery_unavailable")
    created_at = Column(DateTime, default=datetime.utcnow)
