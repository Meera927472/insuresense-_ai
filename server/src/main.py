from __future__ import annotations

import base64
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine
from .models import AuditLog, ClaimCase, ConsentRecord, EmergencyEvent, InsuranceQuote, PassportVerification, PricingRule, QuoteBreakdown, ReviewRequest, TripPacket, User, Vehicle
from .pricing_engine import DEFAULT_RULE, calculate_quote
from .schemas import ClaimInput, ClaimStageInput, ConsentInput, OfflineTripPacketInput, PolicyQuestionInput, QuoteInput, ReviewInput, SettingsInput, SOSInput

app = FastAPI(title="InsureSense AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    seed_demo_data()


def seed_demo_data():
    db = SessionLocal()
    try:
        if not db.query(PricingRule).first():
            db.add(
                PricingRule(
                    version=DEFAULT_RULE["version"],
                    base_rate=DEFAULT_RULE["base_rate"],
                    vehicle_factor=DEFAULT_RULE["vehicle_factor"],
                    age_factor=DEFAULT_RULE["age_factor"],
                    claims_factor=DEFAULT_RULE["claims_factor"],
                    min_adjustment=DEFAULT_RULE["min_adjustment"],
                    max_adjustment=DEFAULT_RULE["max_adjustment"],
                )
            )
        if not db.query(User).first():
            user = User(email="driver@drivewise.ai", name="Demo Driver", role="customer")
            db.add(user)
            db.flush()
            vehicle = Vehicle(
                user_id=user.id,
                make="Hyundai",
                model="Verna",
                year=2022,
                type="Sedan",
                value=1400000.0,
            )
            db.add(vehicle)
            db.flush()
            consent = ConsentRecord(
                user_id=user.id,
                consent_for_optional_data=True,
                consent_for_telemetry=True,
                consent_for_analytics=True,
                purpose="Illustrative pricing demo",
                consent_status="active",
                retention_period_days=365,
            )
            db.add(consent)
        db.commit()
    finally:
        db.close()


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _trip_hash(packet: OfflineTripPacketInput, timestamp_text: str) -> str:
    content = {
        "deviceId": packet.device_id,
        "payload": packet.payload.model_dump(),
        "previousHash": packet.previous_hash,
        "timestamp": timestamp_text,
        "tripId": packet.trip_id,
    }
    return hashlib.sha256(_canonical_json(content)).hexdigest()


def _trip_score(payload: dict) -> float:
    if payload.get("isPassenger"):
        return 0.0
    speeding = max(0.0, min(100.0, float(payload.get("speedingEvents", 0)) * 11))
    braking = 0.0 if payload.get("roadHazard") else max(0.0, min(100.0, float(payload.get("harshBraking", 0)) * 14))
    acceleration = max(0.0, min(100.0, float(payload.get("rapidAcceleration", 0)) * 15))
    score = 100 - speeding * 0.25 - braking * 0.2 - acceleration * 0.2
    return round(max(0.0, min(100.0, score)), 1)


def _verify_trip_signature(packet: OfflineTripPacketInput, timestamp_text: str) -> None:
    envelope = {
        "currentHash": packet.current_hash,
        "deviceId": packet.device_id,
        "payload": packet.payload.model_dump(),
        "previousHash": packet.previous_hash,
        "timestamp": timestamp_text,
        "tripId": packet.trip_id,
    }
    try:
        public_key_der = base64.b64decode(packet.public_key, validate=True)
        signature = base64.b64decode(packet.signature, validate=True)
        public_key = serialization.load_der_public_key(public_key_der)
        if not isinstance(public_key, ec.EllipticCurvePublicKey) or not isinstance(public_key.curve, ec.SECP256R1):
            raise ValueError("Unsupported signing key.")
        if len(signature) != 64:
            raise ValueError("Invalid ECDSA signature length.")
        r = int.from_bytes(signature[:32], "big")
        s = int.from_bytes(signature[32:], "big")
        from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

        public_key.verify(encode_dss_signature(r, s), _canonical_json(envelope), ec.ECDSA(hashes.SHA256()))
    except (ValueError, TypeError, InvalidSignature) as exc:
        raise HTTPException(status_code=400, detail="Trip signature could not be verified.") from exc


@app.get("/api/health")
def health():
    return {"status": "ok", "message": "InsureSense AI backend is running"}


@app.post("/api/offline/trips")
def sync_offline_trip(packet: OfflineTripPacketInput, db: Session = Depends(get_db)):
    try:
        parsed_timestamp = datetime.fromisoformat(packet.timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Trip timestamp must be a valid ISO-8601 value.") from exc
    timestamp_aware = parsed_timestamp.replace(tzinfo=timezone.utc) if parsed_timestamp.tzinfo is None else parsed_timestamp.astimezone(timezone.utc)
    if timestamp_aware > datetime.now(timezone.utc).replace(microsecond=0) + timedelta(minutes=5):
        raise HTTPException(status_code=400, detail="Trip timestamp is too far in the future.")
    timestamp_utc = timestamp_aware.replace(tzinfo=None)

    if _trip_hash(packet, packet.timestamp) != packet.current_hash:
        raise HTTPException(status_code=400, detail="Trip hash does not match its signed payload.")
    _verify_trip_signature(packet, packet.timestamp)

    existing = db.query(TripPacket).filter(TripPacket.trip_id == packet.trip_id).first()
    if existing:
        if existing.current_hash != packet.current_hash or existing.device_id != packet.device_id:
            raise HTTPException(status_code=409, detail="This trip ID already exists with different signed data.")
        return {
            "tripId": existing.trip_id,
            "status": existing.integrity_status,
            "verifiedScore": existing.verified_score,
            "idempotent": True,
        }

    latest = db.query(TripPacket).filter(TripPacket.device_id == packet.device_id).order_by(TripPacket.created_at.desc()).first()
    if latest and packet.previous_hash != latest.current_hash:
        raise HTTPException(status_code=409, detail="Trip chain conflict: the previous trip hash does not match the server record.")
    if not latest and packet.previous_hash is not None:
        raise HTTPException(status_code=409, detail="Trip chain conflict: this device's first trip must not reference an unknown trip.")
    if latest and latest.public_key != packet.public_key:
        raise HTTPException(status_code=409, detail="Trip signing key changed. This trip needs manual integrity review.")
    if latest and timestamp_utc < latest.timestamp:
        raise HTTPException(status_code=409, detail="Trip timestamp is earlier than the previous synchronized trip.")

    trip_payload = packet.payload.model_dump()
    verified_score = _trip_score(trip_payload)
    score_mismatch = (
        (not trip_payload["isPassenger"] and not trip_payload["driverConfirmed"])
        or (not trip_payload["isPassenger"] and abs(verified_score - packet.provisional_score) > 5)
    )
    road_context = "possible_road_hazard_no_penalty" if trip_payload["roadHazard"] else "none"
    is_passenger = trip_payload["isPassenger"]
    integrity_status = "needs_review" if score_mismatch else "verified"

    record = TripPacket(
        trip_id=packet.trip_id,
        device_id=packet.device_id,
        timestamp=timestamp_utc,
        previous_hash=packet.previous_hash,
        current_hash=packet.current_hash,
        payload=json.dumps(trip_payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False),
        public_key=packet.public_key,
        signature=packet.signature,
        provisional_score=packet.provisional_score,
        verified_score=verified_score,
        integrity_status=integrity_status,
        is_passenger=is_passenger,
        road_context=road_context,
        verified_at=datetime.utcnow(),
    )
    db.add(record)
    db.add(AuditLog(
        user_id=1,
        event_type="offline_trip_verified" if integrity_status == "verified" else "offline_trip_review",
        summary=f"Offline trip {packet.trip_id} integrity {integrity_status}; server score {verified_score}.",
    ))
    db.commit()
    return {
        "tripId": packet.trip_id,
        "status": integrity_status,
        "verifiedScore": verified_score,
        "roadContext": road_context,
        "isPassenger": is_passenger,
        "idempotent": False,
    }


@app.get("/api/offline/trips")
def read_offline_trips(db: Session = Depends(get_db)):
    trips = db.query(TripPacket).order_by(TripPacket.created_at.desc()).limit(100).all()
    return [{
        "tripId": trip.trip_id,
        "deviceId": trip.device_id,
        "timestamp": trip.timestamp.isoformat(),
        "score": trip.verified_score if trip.verified_score is not None else trip.provisional_score,
        "integrityStatus": trip.integrity_status,
        "roadContext": trip.road_context,
        "isPassenger": trip.is_passenger,
        "currentHash": trip.current_hash,
    } for trip in trips]


@app.get("/api/sync/queue")
def read_sync_queue(db: Session = Depends(get_db)):
    trips = db.query(TripPacket).order_by(TripPacket.created_at.desc()).limit(100).all()
    counts = {
        "synced": sum(trip.integrity_status == "verified" for trip in trips),
        "needsReview": sum(trip.integrity_status == "needs_review" for trip in trips),
        "pending": 0,
        "failed": 0,
    }
    return {
        "status": "online",
        "counts": counts,
        "items": [{
            "tripId": trip.trip_id,
            "timestamp": trip.timestamp.isoformat(),
            "status": trip.integrity_status,
            "score": trip.verified_score,
            "roadContext": trip.road_context,
        } for trip in trips],
        "note": "Pending and failed packets remain in the browser's local IndexedDB queue until received by this server.",
    }


def _passport_summary(db: Session) -> dict:
    trips = db.query(TripPacket).filter(
        TripPacket.integrity_status == "verified",
        TripPacket.is_passenger.is_(False),
    ).order_by(TripPacket.created_at.asc()).all()
    scores = [trip.verified_score for trip in trips if trip.verified_score is not None]
    return {
        "score": round(sum(scores) / len(scores), 1) if scores else None,
        "verifiedTrips": len(trips),
        "integrity": "Verified" if trips else "No verified trips yet",
        "issuedAt": datetime.utcnow().isoformat() + "Z",
        "disclaimer": "Portable demonstration summary only; it does not expose raw telemetry or establish insurance eligibility.",
    }


@app.get("/api/driving-passport")
def read_driving_passport(db: Session = Depends(get_db)):
    user = db.query(User).first()
    if user is None:
        raise HTTPException(status_code=404, detail="A demo driver profile is not available.")
    return _passport_summary(db)


@app.post("/api/driving-passport")
def issue_driving_passport(db: Session = Depends(get_db)):
    user = db.query(User).first()
    if user is None:
        raise HTTPException(status_code=404, detail="A demo driver profile is not available.")
    token = secrets.token_urlsafe(32)
    verification = PassportVerification(token=token, user_id=user.id)
    db.add(verification)
    db.add(AuditLog(user_id=user.id, event_type="driving_passport_issued", summary="Privacy-minimal driving passport verification link issued."))
    db.commit()
    db.refresh(verification)
    return {
        **_passport_summary(db),
        "token": verification.token,
    }


@app.get("/api/driving-passport/verify/{token}")
def verify_driving_passport(token: str, db: Session = Depends(get_db)):
    verification = db.query(PassportVerification).filter(PassportVerification.token == token).first()
    if verification is None or verification.revoked_at is not None:
        raise HTTPException(status_code=404, detail="This passport verification link is not valid.")
    summary = _passport_summary(db)
    return {
        "status": "verified",
        "score": summary["score"],
        "verifiedTrips": summary["verifiedTrips"],
        "integrity": summary["integrity"],
        "issuedAt": verification.created_at.isoformat(),
        "privacy": "No name, contact information, location history or raw trip telemetry is shared.",
    }


@app.get("/api/trips/{trip_id}/verify")
def verify_trip_status(trip_id: str, db: Session = Depends(get_db)):
    trip = db.query(TripPacket).filter(TripPacket.trip_id == trip_id).first()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip was not found.")
    return {
        "tripId": trip.trip_id,
        "integrityStatus": trip.integrity_status,
        "verifiedScore": trip.verified_score,
        "roadContext": trip.road_context,
        "verifiedAt": trip.verified_at.isoformat() if trip.verified_at else None,
    }


DEMO_ROAD_HAZARDS = [
    {
        "id": "hazard-chennai-01",
        "area": "Anna Salai, Chennai",
        "type": "Pothole reports",
        "reports": 8,
        "severity": "moderate",
        "updated": "Demo data",
    },
    {
        "id": "hazard-coimbatore-02",
        "area": "Avinashi Road, Coimbatore",
        "type": "Speed breaker",
        "reports": 5,
        "severity": "low",
        "updated": "Demo data",
    },
    {
        "id": "hazard-madurai-03",
        "area": "Ring Road, Madurai",
        "type": "High braking activity",
        "reports": 11,
        "severity": "high",
        "updated": "Demo data",
    },
]


@app.get("/api/road-hazards")
def read_road_hazards():
    return {"source": "Synthetic, anonymized demonstration data; not a live map.", "hazards": DEMO_ROAD_HAZARDS}


@app.get("/api/black-spots")
def read_black_spots():
    return {
        "source": "Synthetic demonstration zones; not an accident prediction.",
        "spots": [
            {"area": "Demo intersection A", "risk": "moderate", "reason": "Illustrative repeated braking reports"},
            {"area": "Demo highway segment B", "risk": "high", "reason": "Illustrative mixed traffic and road hazard reports"},
        ],
    }


@app.get("/api/road-context")
def read_road_context():
    return {
        "source": "Synthetic demo context",
        "fairnessRule": "A simulated road-hazard event is excluded from the provisional braking penalty; human review may still be required.",
        "weather": "Clear (simulated)",
        "traffic": "Moderate (simulated)",
        "hazardReports": len(DEMO_ROAD_HAZARDS),
        "communityReports": sum(item["reports"] for item in DEMO_ROAD_HAZARDS),
    }


@app.get("/api/safety/pre-trip")
def pre_trip_safety():
    return {
        "source": "Synthetic demo data; check current local conditions before travel.",
        "weather": {"condition": "Light rain possible", "status": "simulated"},
        "road": {"knownHazards": 2, "status": "cached demo data"},
        "traffic": {"level": "Moderate", "status": "simulated"},
        "time": {"period": "Day", "status": "local device time"},
        "riskPreview": "Moderate",
        "routePreference": ["Fastest", "Safest"],
        "advice": "Allow extra stopping distance and follow local traffic rules.",
    }


@app.post("/api/sos")
def create_sos(payload: SOSInput, db: Session = Depends(get_db)):
    user = db.query(User).first()
    if user is None:
        raise HTTPException(status_code=404, detail="A demo driver profile is not available.")
    location = payload.approximate_location or "Not available; this demo does not collect GPS."
    message = (
        f"InsureSense AI demo {payload.emergency_type}. "
        f"Driver: {user.name}. Vehicle: {payload.vehicle_label}. "
        f"Time: {datetime.utcnow().isoformat()}Z. Location: {location}. "
        "No emergency service or SMS provider is connected."
    )
    emergency = EmergencyEvent(
        user_id=user.id,
        vehicle_label=payload.vehicle_label,
        emergency_type=payload.emergency_type,
        approximate_location=payload.approximate_location,
        message=message,
        delivery_status="delivery_unavailable",
    )
    db.add(emergency)
    db.add(AuditLog(user_id=user.id, event_type="sos_prepared", summary=f"User-confirmed demo SOS prepared; delivery unavailable ({payload.emergency_type})."))
    db.commit()
    db.refresh(emergency)
    return {
        "id": emergency.id,
        "status": "queued",
        "deliveryStatus": "delivery_unavailable",
        "message": emergency.message,
        "notice": "Emergency details were recorded in this demo only. No SMS was sent and no emergency service was contacted.",
    }


DEMO_FAMILY_DRIVERS = [
    {"id": "driver-father", "name": "Father", "relationship": "Parent", "score": 91, "exposure": 0.6, "recentTrips": 18, "safetyEvents": 1},
    {"id": "driver-mother", "name": "Mother", "relationship": "Parent", "score": 88, "exposure": 0.3, "recentTrips": 11, "safetyEvents": 2},
    {"id": "driver-son", "name": "Son", "relationship": "Teen driver", "score": 76, "exposure": 0.1, "recentTrips": 6, "safetyEvents": 3},
]

DEMO_FLEET_VEHICLES = [
    {"id": "vehicle-car-01", "label": "Family Car", "type": "Car", "driverCount": 3, "tripsThisMonth": 35, "dataQuality": 94, "maintenance": "Service due in 24 days"},
    {"id": "vehicle-bike-02", "label": "Fleet Bike 02", "type": "Motorcycle", "driverCount": 2, "tripsThisMonth": 42, "dataQuality": 88, "maintenance": "PUC reminder in 12 days"},
    {"id": "vehicle-scooter-03", "label": "Fleet Scooter 03", "type": "Scooter", "driverCount": 1, "tripsThisMonth": 29, "dataQuality": 91, "maintenance": "No upcoming reminder"},
]


@app.get("/api/fleet")
def read_fleet():
    exposure_total = sum(driver["exposure"] for driver in DEMO_FAMILY_DRIVERS)
    vehicle_score = round(sum(driver["score"] * driver["exposure"] for driver in DEMO_FAMILY_DRIVERS) / exposure_total, 1)
    return {
        "source": "Synthetic demonstration fleet. Not linked to real drivers or vehicles.",
        "vehicleRiskScore": vehicle_score,
        "driverExposureTotal": round(exposure_total, 3),
        "drivers": DEMO_FAMILY_DRIVERS,
        "vehicles": DEMO_FLEET_VEHICLES,
        "fairnessExplanation": "Vehicle risk is the sum of each demo driver's score multiplied by that driver's configured exposure share. One driver's score does not replace another driver's profile.",
        "privacy": "No trip location history is shown. Family safety information requires appropriate consent in a real deployment.",
    }


@app.get("/api/fleet/vehicles")
def read_fleet_vehicles():
    return {
        "source": "Synthetic demonstration vehicles.",
        "vehicles": DEMO_FLEET_VEHICLES,
    }


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    quotes = db.query(InsuranceQuote).order_by(InsuranceQuote.created_at.desc()).limit(5).all()
    total_drivers = db.query(User).count()
    total_quotes = db.query(InsuranceQuote).count()
    avg_score = round(sum(q.driving_score for q in quotes) / len(quotes), 1) if quotes else 82.3
    avg_premium = round(sum(q.final_premium for q in quotes) / len(quotes), 2) if quotes else 12650.0
    risk_distribution = {"Low": 42, "Moderate": 31, "High": 17, "Review": 10}
    recent_quotes = [
        {
            "id": quote.id,
            "driver": quote.user.name if quote.user else "Demo Driver",
            "premium": quote.final_premium,
            "score": quote.driving_score,
            "created_at": quote.created_at.strftime("%Y-%m-%d"),
        }
        for quote in quotes
    ]
    alerts = [
        {
            "title": "Data quality warning",
            "description": "Two driving sessions contained incomplete sensor measurements and were flagged for review.",
            "severity": "medium",
        },
        {
            "title": "Unusual premium change",
            "description": "A quote exceeded the standard band due to a single high-risk braking event.",
            "severity": "high",
        },
    ]
    return {
        "title": "InsureSense AI",
        "demonstrationLabel": "Demonstration data only — not a real insurer decision.",
        "kpis": {
            "totalDrivers": total_drivers,
            "totalQuotes": total_quotes,
            "averageDrivingScore": avg_score,
            "averagePremium": avg_premium,
        },
        "riskDistribution": risk_distribution,
        "recentQuotes": recent_quotes,
        "alerts": alerts,
        "monthlyTrend": [
            {"month": "Jan", "quotes": 18, "premium": 10200},
            {"month": "Feb", "quotes": 24, "premium": 10850},
            {"month": "Mar", "quotes": 20, "premium": 11040},
            {"month": "Apr", "quotes": 29, "premium": 11900},
            {"month": "May", "quotes": 31, "premium": 12700},
            {"month": "Jun", "quotes": 34, "premium": 13350},
        ],
    }


@app.get("/api/analytics")
def analytics(db: Session = Depends(get_db)):
    quote = db.query(InsuranceQuote).order_by(InsuranceQuote.created_at.desc()).first()
    if not quote:
        quote = InsuranceQuote(
            user_id=1,
            vehicle_id=1,
            pricing_rule_id=1,
            vehicle_type="Sedan",
            vehicle_age=3,
            vehicle_value=1400000,
            annual_distance_km=9000,
            previous_claims=0,
            speeding_events=1.2,
            harsh_braking=0.7,
            rapid_acceleration=0.8,
            driving_consistency=82,
            data_completeness=86,
            driving_score=81.4,
            base_premium=12500,
            behaviour_adjustment_pct=-10.0,
            final_premium=11250,
            data_quality=86,
            explanation="Demo quote",
        )
    chart_data = [
        {"name": "Speeding", "score": 78},
        {"name": "Braking", "score": 72},
        {"name": "Acceleration", "score": 75},
        {"name": "Consistency", "score": 82},
        {"name": "Usage", "score": 88},
    ]
    return {
        "overallDrivingScore": quote.driving_score,
        "indicatorScores": chart_data,
        "dataQuality": quote.data_quality,
        "confidence": max(60, min(95, quote.data_quality)),
        "suggestions": [
            "Maintain lower speed variance to improve your risk score.",
            "Reduce harsh braking events by noticing road conditions sooner.",
            "Keep your telematics feed complete for stronger premium transparency.",
        ],
    }


@app.get("/api/privacy")
def privacy(db: Session = Depends(get_db)):
    consent = db.query(ConsentRecord).filter(ConsentRecord.user_id == 1).first()
    if not consent:
        consent = ConsentRecord(
            user_id=1,
            consent_for_optional_data=True,
            consent_for_telemetry=True,
            consent_for_analytics=True,
            purpose="Illustrative pricing",
            consent_status="active",
            retention_period_days=365,
        )
        db.add(consent)
        db.commit()
    return {
        "status": consent.consent_status,
        "consentedAt": consent.consented_at.isoformat() if consent.consented_at else None,
        "withdrawnAt": consent.withdrawn_at.isoformat() if consent.withdrawn_at else None,
        "permissions": {
            "optionalData": consent.consent_for_optional_data,
            "telemetry": consent.consent_for_telemetry,
            "analytics": consent.consent_for_analytics,
        },
        "retentionDays": consent.retention_period_days,
        "purpose": consent.purpose,
        "history": [
            {
                "date": "2026-01-18",
                "action": "Consent granted",
                "details": "Optional driving data and analytics were enabled for demonstration pricing.",
            },
            {
                "date": "2026-01-20",
                "action": "Data export requested",
                "details": "Customer requested a copy of their stored data.",
            },
        ],
    }


@app.post("/api/privacy")
def update_privacy(payload: ConsentInput, db: Session = Depends(get_db)):
    consent = db.query(ConsentRecord).filter(ConsentRecord.user_id == payload.user_id).first()
    if consent is None:
        consent = ConsentRecord(user_id=payload.user_id)
        db.add(consent)
    consent.consent_for_optional_data = payload.consent_for_optional_data
    consent.consent_for_telemetry = payload.consent_for_telemetry
    consent.consent_for_analytics = payload.consent_for_analytics
    consent.purpose = payload.purpose
    consent.retention_period_days = payload.retention_period_days
    consent.notes = payload.notes
    consent.consent_status = payload.status
    if payload.status == "withdrawn":
        consent.withdrawn_at = datetime.utcnow()
    else:
        consent.withdrawn_at = None
        consent.consented_at = datetime.utcnow()
    db.add(AuditLog(user_id=payload.user_id, event_type="consent_update", summary=f"Consent updated: {payload.status}"))
    db.commit()
    return {"success": True, "status": payload.status}


@app.get("/api/quotes")
def read_quotes(db: Session = Depends(get_db)):
    quotes = db.query(InsuranceQuote).order_by(InsuranceQuote.created_at.desc()).all()
    return [{
        "id": q.id,
        "driver": q.user.name if q.user else "Demo Driver",
        "vehicle_type": q.vehicle_type,
        "driving_score": q.driving_score,
        "final_premium": q.final_premium,
        "created_at": q.created_at.strftime("%Y-%m-%d %H:%M:%S"),
    } for q in quotes]


@app.get("/api/quotes/{quote_id}/explanation")
def explain_quote(quote_id: int, db: Session = Depends(get_db)):
    quote = db.query(InsuranceQuote).filter(InsuranceQuote.id == quote_id).first()
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote was not found.")

    comparison_input = {
        "vehicle_type": quote.vehicle_type,
        "vehicle_age": quote.vehicle_age,
        "vehicle_value": quote.vehicle_value,
        "annual_distance_km": quote.annual_distance_km,
        "previous_claims": quote.previous_claims,
        "speeding_events": 0,
        "harsh_braking": 0,
        "rapid_acceleration": 0,
        "driving_consistency": 100,
        "data_completeness": quote.data_completeness,
    }
    comparison_rule = {
        "version": quote.pricing_rule.version,
        "base_rate": quote.pricing_rule.base_rate,
        "vehicle_factor": quote.pricing_rule.vehicle_factor,
        "age_factor": quote.pricing_rule.age_factor,
        "claims_factor": quote.pricing_rule.claims_factor,
        "min_adjustment": quote.pricing_rule.min_adjustment,
        "max_adjustment": quote.pricing_rule.max_adjustment,
    }
    improved_behaviour = calculate_quote(comparison_input, comparison_rule)["final_premium"]
    factors = [
        {
            "name": "Vehicle type and insured value",
            "category": "Mostly fixed",
            "detail": f"{quote.vehicle_type} cover and an insured value of ₹{quote.vehicle_value:,.0f} are included in the estimate.",
        },
        {
            "name": "Annual distance",
            "category": "Partly controllable",
            "detail": f"The estimate uses {quote.annual_distance_km:,.0f} km per year. Update this if your actual expected usage differs.",
        },
        {
            "name": "Previous claims",
            "category": "Not controllable for this quote",
            "detail": f"{quote.previous_claims} previous claim(s) were included as provided. The score does not decide claim outcomes.",
        },
        {
            "name": "Measured driving behaviour",
            "category": "May improve over time",
            "detail": f"Score {quote.driving_score}/100 produced a {quote.behaviour_adjustment_pct:+.1f}% illustrative behaviour adjustment.",
        },
    ]
    if quote.data_quality < 60:
        factors.append({
            "name": "Data quality",
            "category": "Review recommended",
            "detail": "Some telemetry is incomplete. Ask for a human review before relying on this estimate.",
        })

    return {
        "quoteId": quote.id,
        "ruleVersion": quote.pricing_rule.version,
        "basePremium": quote.base_premium,
        "behaviourAdjustmentPct": quote.behaviour_adjustment_pct,
        "behaviourAdjustmentValue": round(quote.base_premium * quote.behaviour_adjustment_pct / 100, 2),
        "finalPremium": quote.final_premium,
        "drivingScore": quote.driving_score,
        "dataQuality": quote.data_quality,
        "factors": factors,
        "potentialBehaviourComparison": {
            "estimatedPremium": improved_behaviour,
            "difference": round(quote.final_premium - improved_behaviour, 2),
            "explanation": "Illustrative comparison only. It assumes improved behaviour indicators and does not promise savings.",
        },
        "claimBoundary": "A driving score or premium estimate does not determine coverage, claim eligibility, or claim settlement.",
    }


@app.post("/api/quotes")
def create_quote(payload: QuoteInput, db: Session = Depends(get_db)):
    if payload.csv_data:
        lines = [line.strip() for line in payload.csv_data.splitlines() if line.strip()]
        if len(lines) > 1:
            header = [item.strip().lower() for item in lines[0].split(",")]
            if "speeding_events" not in header or "harsh_braking" not in header:
                raise HTTPException(status_code=400, detail="Uploaded CSV is missing required behaviour columns.")

    rule = db.query(PricingRule).order_by(PricingRule.created_at.desc()).first()
    if not rule:
        rule = PricingRule(
            version=DEFAULT_RULE["version"],
            base_rate=DEFAULT_RULE["base_rate"],
            vehicle_factor=DEFAULT_RULE["vehicle_factor"],
            age_factor=DEFAULT_RULE["age_factor"],
            claims_factor=DEFAULT_RULE["claims_factor"],
            min_adjustment=DEFAULT_RULE["min_adjustment"],
            max_adjustment=DEFAULT_RULE["max_adjustment"],
        )
        db.add(rule)
        db.flush()

    quote_data = payload.model_dump()
    result = calculate_quote(
        quote_data,
        {
            "version": rule.version,
            "base_rate": rule.base_rate,
            "vehicle_factor": rule.vehicle_factor,
            "age_factor": rule.age_factor,
            "claims_factor": rule.claims_factor,
            "min_adjustment": rule.min_adjustment,
            "max_adjustment": rule.max_adjustment,
        },
    )

    user = db.query(User).first()
    if not user:
        user = User(email="driver@drivewise.ai", name="Demo Driver", role="customer")
        db.add(user)
        db.flush()
    vehicle = db.query(Vehicle).filter(Vehicle.user_id == user.id).first()
    if not vehicle:
        vehicle = Vehicle(user_id=user.id, make="Hyundai", model="Verna", year=2022, type=payload.vehicle_type, value=payload.vehicle_value)
        db.add(vehicle)
        db.flush()

    quote = InsuranceQuote(
        user_id=user.id,
        vehicle_id=vehicle.id,
        pricing_rule_id=rule.id,
        vehicle_type=payload.vehicle_type,
        vehicle_age=payload.vehicle_age,
        vehicle_value=payload.vehicle_value,
        annual_distance_km=payload.annual_distance_km,
        previous_claims=payload.previous_claims,
        speeding_events=payload.speeding_events,
        harsh_braking=payload.harsh_braking,
        rapid_acceleration=payload.rapid_acceleration,
        driving_consistency=payload.driving_consistency,
        data_completeness=payload.data_completeness,
        driving_score=result["driving_score"],
        base_premium=result["base_premium"],
        behaviour_adjustment_pct=result["behaviour_adjustment_pct"],
        final_premium=result["final_premium"],
        data_quality=result["data_quality"],
        explanation=result["explanation"],
    )
    db.add(quote)
    db.flush()

    for item in result["breakdown"]:
        db.add(QuoteBreakdown(quote_id=quote.id, label=item["label"], value=float(item["value"]), detail=item["detail"]))
    db.add(AuditLog(user_id=user.id, event_type="quote_generated", summary=f"Quote generated: ₹{result['final_premium']:.2f} with score {result['driving_score']}"))
    db.commit()
    db.refresh(quote)

    return {
        "id": quote.id,
        "driving_score": quote.driving_score,
        "base_premium": quote.base_premium,
        "behaviour_adjustment_pct": quote.behaviour_adjustment_pct,
        "final_premium": quote.final_premium,
        "data_quality": quote.data_quality,
        "explanation": quote.explanation,
        "rule_version": rule.version,
        "breakdown": result["breakdown"],
    }


@app.get("/api/reviews")
def read_reviews(db: Session = Depends(get_db)):
    reviews = db.query(ReviewRequest).order_by(ReviewRequest.created_at.desc()).all()
    return [{
        "id": review.id,
        "reason": review.reason,
        "status": review.status,
        "decision": review.decision,
        "reviewerNotes": review.reviewer_notes,
        "created_at": review.created_at.strftime("%Y-%m-%d"),
    } for review in reviews]


@app.post("/api/reviews")
def create_review(payload: ReviewInput, db: Session = Depends(get_db)):
    review = ReviewRequest(
        user_id=payload.user_id,
        quote_id=payload.quote_id,
        reason=payload.reason,
        status=payload.status,
    )
    db.add(review)
    db.add(AuditLog(user_id=payload.user_id, event_type="review_requested", summary=f"Review requested: {payload.reason}"))
    db.commit()
    return {"success": True, "id": review.id}


CLAIM_STAGES = [
    "claim_intimated",
    "documents_submitted",
    "assessment",
    "under_review",
    "approved",
    "further_information",
    "settled",
]


def _claim_response(claim: ClaimCase) -> dict:
    return {
        "id": claim.id,
        "reference": claim.claim_reference,
        "tripId": claim.trip_id,
        "incidentType": claim.incident_type,
        "description": claim.description,
        "status": claim.status,
        "createdAt": claim.created_at.isoformat(),
        "hasEvidencePack": bool(claim.evidence_pack),
    }


@app.get("/api/claims")
def read_claims(db: Session = Depends(get_db)):
    claims = db.query(ClaimCase).order_by(ClaimCase.created_at.desc()).all()
    return [_claim_response(claim) for claim in claims]


@app.post("/api/claims")
def create_claim(payload: ClaimInput, db: Session = Depends(get_db)):
    user = db.query(User).first()
    if user is None:
        raise HTTPException(status_code=404, detail="A demo customer profile is not available.")
    if payload.trip_id and db.query(TripPacket).filter(TripPacket.trip_id == payload.trip_id).first() is None:
        raise HTTPException(status_code=404, detail="The selected trip is not available on the server yet.")
    claim = ClaimCase(
        claim_reference=f"IS-{datetime.utcnow():%y%m%d}-{datetime.utcnow().microsecond:06d}",
        user_id=user.id,
        trip_id=payload.trip_id,
        incident_type=payload.incident_type,
        description=payload.description,
        status="claim_intimated",
    )
    db.add(claim)
    db.add(AuditLog(user_id=user.id, event_type="claim_intimated", summary=f"Demo claim {claim.claim_reference} was intimated."))
    db.commit()
    db.refresh(claim)
    return _claim_response(claim)


@app.post("/api/claims/{claim_id}/stage")
def update_claim_stage(claim_id: int, payload: ClaimStageInput, db: Session = Depends(get_db)):
    claim = db.query(ClaimCase).filter(ClaimCase.id == claim_id).first()
    if claim is None:
        raise HTTPException(status_code=404, detail="Claim was not found.")
    claim.status = payload.status
    db.add(AuditLog(
        user_id=claim.user_id,
        event_type="claim_stage_updated",
        summary=f"Demo claim {claim.claim_reference} moved to {payload.status}.",
    ))
    db.commit()
    db.refresh(claim)
    return _claim_response(claim)


@app.post("/api/claims/{claim_id}/evidence-pack")
def create_claim_evidence_pack(claim_id: int, db: Session = Depends(get_db)):
    claim = db.query(ClaimCase).filter(ClaimCase.id == claim_id).first()
    if claim is None:
        raise HTTPException(status_code=404, detail="Claim was not found.")

    user = db.query(User).filter(User.id == claim.user_id).first()
    trip = db.query(TripPacket).filter(TripPacket.trip_id == claim.trip_id).first() if claim.trip_id else None
    trip_payload = json.loads(trip.payload) if trip else {}
    vehicle = db.query(Vehicle).filter(Vehicle.user_id == claim.user_id).first()
    evidence = {
        "product": "InsureSense AI prototype",
        "claimReference": claim.claim_reference,
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "incidentType": claim.incident_type,
        "description": claim.description,
        "driver": trip_payload.get("driver", user.name if user else "Not available"),
        "vehicle": f"{vehicle.make} {vehicle.model}" if vehicle else "Not available",
        "trip": {
            "tripId": trip.trip_id if trip else None,
            "timestamp": trip.timestamp.isoformat() if trip else None,
            "approximateLocation": "Not available; location was not collected in this demo.",
            "telemetry": {
                "speedingEvents": trip_payload.get("speedingEvents"),
                "harshBraking": trip_payload.get("harshBraking"),
                "rapidAcceleration": trip_payload.get("rapidAcceleration"),
            } if trip else None,
            "roadContext": trip.road_context if trip else "Not available",
            "integrityStatus": trip.integrity_status if trip else "No linked trip",
            "hash": trip.current_hash if trip else None,
        },
        "disclaimer": "Evidence summary generated from available application data. Final claim assessment remains subject to policy terms, investigation, and applicable law. Driving score is not used to calculate claim settlement.",
    }
    claim.evidence_pack = json.dumps(evidence, ensure_ascii=False, sort_keys=True)
    db.add(AuditLog(user_id=claim.user_id, event_type="claim_evidence_generated", summary=f"Evidence pack generated for demo claim {claim.claim_reference}."))
    db.commit()
    return evidence


DEMO_POLICY = {
    "policyId": "DEMO-MOTOR-2026",
    "kind": "Illustrative comprehensive motor policy",
    "expiresOn": "2026-12-31",
    "coverage": [
        "Third-party liability, subject to the policy terms",
        "Accidental damage to the insured vehicle, subject to the policy terms",
    ],
    "exclusions": [
        "Normal wear and tear",
        "Driving without a valid licence",
    ],
    "addons": [
        {"name": "Zero depreciation", "price": 1800, "purpose": "May reduce depreciation deductions for eligible repairs, subject to terms."},
        {"name": "Roadside assistance", "price": 650, "purpose": "May provide eligible roadside support; check the policy terms and service limits."},
    ],
    "source": "Synthetic demo policy data; not an issued insurance contract.",
}


@app.get("/api/policy")
def read_demo_policy():
    return DEMO_POLICY


@app.post("/api/policy/explain")
def explain_policy(payload: PolicyQuestionInput):
    question = payload.question.casefold()
    language = payload.language
    excluded_question = any(term in question for term in ("not cover", "not covered", "exclude", "exclusion", "cover aagaadhu", "கவர் ஆகாது", "விலக்கு"))
    coverage_question = any(term in question for term in ("cover", "coverage", "covered", "கவர்"))
    expiry_question = any(term in question for term in ("expire", "expiry", "renew", "valid until", "காலாவதி", "எப்போ"))
    addon_question = any(term in question for term in ("add-on", "addon", "zero depreciation", "roadside", "தேவையா"))

    if excluded_question:
        answer = (
            "இந்த demo policy தரவில் குறிப்பிடப்பட்ட விலக்குகள்: சாதாரண தேய்மானம் மற்றும் செல்லுபடியாகும் உரிமம் இல்லாமல் வாகனம் ஓட்டுதல். முழு விதிமுறைகளையும் policy ஆவணத்தில் சரிபார்க்கவும்."
            if language == "ta" else
            "The demo policy lists normal wear and tear and driving without a valid licence as exclusions. Check the full policy wording for conditions and exceptions."
        )
    elif expiry_question:
        answer = (
            f"இந்த demo policy-யின் காலாவதி தேதி {DEMO_POLICY['expiresOn']}. இது மாதிரி தரவு; உங்கள் உண்மையான policy ஆவணத்தைச் சரிபார்க்கவும்."
            if language == "ta" else
            f"The demo policy expiry date is {DEMO_POLICY['expiresOn']}. This is sample data; check your actual policy document."
        )
    elif addon_question:
        answer = (
            "Zero depreciation மற்றும் roadside assistance என்ற add-ons இந்த demo தரவில் உள்ளன. உங்கள் பயணம், வாகன வயது மற்றும் policy விதிமுறைகளைப் பார்த்து தேர்வு செய்யுங்கள்; இங்கு தனிப்பட்ட பரிந்துரை உறுதி செய்யப்படவில்லை."
            if language == "ta" else
            "The demo data lists zero depreciation and roadside assistance add-ons. Consider your vehicle, travel needs, price and policy limits; this demo cannot confirm a personal recommendation."
        )
    elif coverage_question:
        answer = (
            "இந்த demo policy-யில் third-party liability மற்றும் policy விதிமுறைகளுக்கு உட்பட்ட வாகன விபத்து சேதம் குறிப்பிடப்பட்டுள்ளன. முழு காப்பீடு அல்லது claim approval என்று இதை கருத வேண்டாம்."
            if language == "ta" else
            "The demo policy lists third-party liability and accidental damage to the insured vehicle, both subject to policy terms. This does not mean all losses are covered or that a claim is approved."
        )
    else:
        answer = (
            "கிடைக்கும் demo policy தகவலில் இதற்கு போதுமான விவரம் இல்லை. முழு policy ஆவணத்தைச் சரிபார்க்கவும்."
            if language == "ta" else
            "The available demo policy information does not provide enough detail to answer that. Please check the full policy document."
        )

    return {"answer": answer, "language": language, "source": DEMO_POLICY["source"], "confirmedFromAvailableData": excluded_question or expiry_question or addon_question or coverage_question}


@app.get("/api/settings")
def settings(db: Session = Depends(get_db)):
    rule = db.query(PricingRule).order_by(PricingRule.created_at.desc()).first()
    if not rule:
        return {
            "version": DEFAULT_RULE["version"],
            "baseRate": DEFAULT_RULE["base_rate"],
            "vehicleFactor": DEFAULT_RULE["vehicle_factor"],
            "minAdjustment": DEFAULT_RULE["min_adjustment"],
            "maxAdjustment": DEFAULT_RULE["max_adjustment"],
        }
    return {
        "version": rule.version,
        "baseRate": rule.base_rate,
        "vehicleFactor": rule.vehicle_factor,
        "minAdjustment": rule.min_adjustment,
        "maxAdjustment": rule.max_adjustment,
        "weights": {
            "speeding": 0.25,
            "braking": 0.2,
            "acceleration": 0.2,
            "consistency": 0.2,
            "usage": 0.15,
        },
    }


@app.post("/api/settings")
def update_settings(payload: SettingsInput, db: Session = Depends(get_db)):
    if payload.min_adjustment >= 0:
        raise HTTPException(status_code=400, detail="Minimum adjustment must be negative or zero.")
    if payload.max_adjustment <= payload.min_adjustment:
        raise HTTPException(status_code=400, detail="Maximum adjustment must be greater than the minimum adjustment.")

    rule = db.query(PricingRule).order_by(PricingRule.created_at.desc()).first()
    if rule is None:
        rule = PricingRule(
            version=payload.version,
            base_rate=payload.base_rate,
            min_adjustment=payload.min_adjustment,
            max_adjustment=payload.max_adjustment,
            vehicle_factor=DEFAULT_RULE["vehicle_factor"],
            age_factor=DEFAULT_RULE["age_factor"],
            claims_factor=DEFAULT_RULE["claims_factor"],
        )
        db.add(rule)
    else:
        rule.version = payload.version
        rule.base_rate = payload.base_rate
        rule.min_adjustment = payload.min_adjustment
        rule.max_adjustment = payload.max_adjustment

    db.add(AuditLog(
        user_id=1,
        event_type="pricing_rule_updated",
        summary=f"Pricing rule updated to version {payload.version} with base rate ₹{payload.base_rate:.2f}",
    ))
    db.commit()
    return {
        "success": True,
        "version": rule.version,
        "baseRate": rule.base_rate,
        "minAdjustment": rule.min_adjustment,
        "maxAdjustment": rule.max_adjustment,
    }


@app.get("/")
def root():
    return {"message": "InsureSense AI backend is running"}
