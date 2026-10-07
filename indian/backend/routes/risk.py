"""
Risk Profile endpoints — /api/risk
"""
from fastapi import APIRouter, HTTPException, Depends
from auth import require_vessel_authorization
from services.detection_service import get_alert_by_mmsi, get_vessel_track

router = APIRouter(prefix="/api/risk", tags=["Risk Profiles"])


@router.get(
    "/{mmsi}",
    summary="Get vessel risk profile",
    description=(
        "Returns a comprehensive risk profile for a vessel identified by MMSI. "
        "Includes individual signal scores from each ML model, "
        "anomaly type breakdown, and full kinematic track history."
    ),
)
def get_risk_profile(
    mmsi: str,
    _auth: dict = Depends(require_vessel_authorization)
):
    alert = get_alert_by_mmsi(mmsi)
    if not alert:
        raise HTTPException(status_code=404, detail=f"No risk profile for MMSI {mmsi}")

    track = get_vessel_track(mmsi)
    track_condensed = [
        {
            "timestamp": p["timestamp"],
            "lat":  p["lat"],
            "lon":  p["lon"],
            "sog":  p.get("sog"),
            "cog":  p.get("cog"),
            "nav_status": p.get("nav_status"),
        }
        for p in track if p.get("lat") is not None
    ]

    # Build breakdown scores (normalized 0–10)
    def flag_to_score(flag, weight=10):
        return round(weight * flag, 1) if isinstance(flag, (int, float)) else (weight if flag else 0)

    breakdown = {
        "route_deviation_score":    flag_to_score(alert.get("route_anomaly", False), 4),
        "kinematic_anomaly_score":  round(min(10.0, alert.get("ae_reconstruction_error", 0) * 500), 2),
        "dark_vessel_score":        flag_to_score(alert.get("dark_vessel", False), 8),
        "sts_transfer_score":       flag_to_score(alert.get("sts_transfer", False), 7),
        "loitering_score":          flag_to_score(alert.get("loitering", False), 5),
        "spoofing_score":           flag_to_score(alert.get("position_spoofed", False), 6),
    }

    return {
        "mmsi":          mmsi,
        "vessel_name":   alert["vessel_name"],
        "vessel_type":   alert["vessel_type"],
        "flag":          alert["flag"],
        "risk_score":    alert["risk_score"],
        "severity":      alert["severity"],
        "anomaly_types": alert["anomaly_types"],
        "is_anomalous":  alert["is_anomalous"],
        "signal_breakdown": breakdown,
        "last_lat":   alert.get("last_lat"),
        "last_lon":   alert.get("last_lon"),
        "last_sog":   alert.get("last_sog"),
        "last_cog":   alert.get("last_cog"),
        "generated_at":  alert.get("generated_at"),
        "track_history": track_condensed,
    }
