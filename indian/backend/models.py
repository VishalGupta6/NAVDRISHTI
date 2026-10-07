"""
Pydantic Models — Maritime Domain Awareness Backend API
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class AISPing(BaseModel):
    id: Optional[str] = None
    timestamp: str
    mmsi: str
    name: str
    type: str
    flag: str
    length_m: int
    lat: float
    lon: float
    sog: float
    cog: float
    rot: Optional[float] = 0.0
    draught: Optional[float] = None
    nav_status: Optional[str] = "Under Way Using Engine"
    anomaly_ground_truth: Optional[str] = None


class VesselSummary(BaseModel):
    mmsi: str
    name: str
    type: str
    flag: str
    length_m: int
    risk_score: float
    severity: str
    anomaly_types: List[str]
    last_lat: Optional[float]
    last_lon: Optional[float]
    last_sog: Optional[float]
    last_cog: Optional[float]


class AnomalyAlert(BaseModel):
    alert_id: str
    mmsi: str
    vessel_name: str
    vessel_type: str
    flag: str
    risk_score: float
    severity: str
    anomaly_types: List[str]
    is_anomalous: bool
    last_lat: Optional[float]
    last_lon: Optional[float]
    last_sog: Optional[float]
    last_cog: Optional[float]
    route_anomaly: bool
    kinematic_anomaly: bool
    dark_vessel: bool
    sts_transfer: bool
    loitering: bool
    position_spoofed: bool
    ae_reconstruction_error: float
    generated_at: str


class RiskProfile(BaseModel):
    mmsi: str
    vessel_name: str
    vessel_type: str
    flag: str
    length_m: Optional[int]
    risk_score: float
    severity: str
    anomaly_types: List[str]
    is_anomalous: bool
    dark_vessel: bool
    sts_transfer: bool
    loitering: bool
    position_spoofed: bool
    kinematic_anomaly: bool
    route_anomaly: bool
    ae_reconstruction_error: float
    last_lat: Optional[float]
    last_lon: Optional[float]
    track_history: List[dict] = []


class DetectionRequest(BaseModel):
    mmsi: Optional[str] = None
    last_n_messages: Optional[int] = 360


class DetectionResponse(BaseModel):
    status: str
    vessels_processed: int
    anomalies_found: int
    alerts: List[AnomalyAlert]
