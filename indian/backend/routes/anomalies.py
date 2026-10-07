"""
Anomaly Detection endpoints — /api/anomalies and /api/detect
"""
from typing import Optional
from fastapi import APIRouter, Query, Depends
from auth import require_hq_clearance
from services.detection_service import (
    get_all_alerts, run_detection_pipeline, get_summary_stats
)

router = APIRouter(tags=["Anomaly Detection"])


@router.get(
    "/api/anomalies",
    summary="Get all current anomaly alerts",
    description=(
        "Returns all anomaly alerts sorted by risk score descending. "
        "Each alert includes the fused risk score from DBSCAN clustering, "
        "LSTM Autoencoder reconstruction error, Kalman Filter trajectory divergence, "
        "and kinematic heuristics. Requires tactical clearance."
    ),
)
def list_anomalies(
    severity: Optional[str] = Query(None, description="Filter: CRITICAL | HIGH | MEDIUM | LOW"),
    anomaly_type: Optional[str] = Query(None, description="Filter: DARK_VESSEL | STS_TRANSFER | PORT_LOITERING | POSITION_SPOOFING | KINEMATIC_ANOMALY | ROUTE_DEVIATION"),
    anomalous_only: bool = Query(True, description="Only return anomalous vessels"),
    _auth: dict = Depends(require_hq_clearance)
):
    alerts = get_all_alerts()
    results = []
    for a in alerts:
        if anomalous_only and not a.get("is_anomalous"):
            continue
        if severity and a.get("severity") != severity.upper():
            continue
        if anomaly_type and anomaly_type.upper() not in a.get("anomaly_types", []):
            continue
        results.append(a)

    return {"count": len(results), "alerts": results}


@router.get(
    "/api/anomalies/stats",
    summary="Get anomaly summary statistics",
    description="Returns aggregate counts by severity and anomaly type across all vessels.",
)
def anomaly_stats():
    return get_summary_stats()


@router.post(
    "/api/detect",
    summary="Run anomaly detection pipeline",
    description=(
        "Triggers the full ML detection pipeline: re-runs the anomaly scorer "
        "fusing DBSCAN, LSTM Autoencoder, and Kalman Filter outputs. "
        "Returns fresh anomaly alerts for all vessels. Requires tactical clearance."
    ),
)
def run_detection(
    _auth: dict = Depends(require_hq_clearance)
):
    result = run_detection_pipeline()
    return {
        "status":            result.get("status"),
        "vessels_processed": result.get("vessels_processed"),
        "anomalies_found":   result.get("anomalies_found"),
        "alerts":            result.get("alerts", []),
    }

