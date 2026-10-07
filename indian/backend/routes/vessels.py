import html
import json
import math
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Query, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from auth import require_vessel_authorization, require_hq_clearance
from services.detection_service import (
    get_all_alerts, get_vessel_registry_enhanced, get_vessel_track, get_alert_by_mmsi,
    get_summary_stats, get_global_history, get_vessel_operational_history,
    get_search_criteria_stats, get_map_layers
)

router = APIRouter(prefix="/api/vessels", tags=["Vessels"])

def sanitize_text(text: Optional[str], max_len: int = 500) -> str:
    """Sanitizes user-provided string to prevent HTML/XSS injection attacks."""
    if not text:
        return ""
    cleaned = str(text).strip()[:max_len]
    return html.escape(cleaned)

@router.get("/layers")
async def fetch_layers():
    """Retrieve tactical map layers (Shoreline, IUU, etc.)."""
    layers = get_map_layers()
    return layers if layers else []

@router.get("/search-stats")
async def fetch_search_stats():
    """Retrieve tactical activity criteria counts for the search engine."""
    return get_search_criteria_stats()

@router.get("/history")
async def get_traffic_history(hours: int = 1):
    return {"history": get_global_history(hours=hours)}

@router.get("/history/{mmsi}")
async def fetch_vessel_history(
    mmsi: str,
    hours: int = 24,
    _auth: dict = Depends(require_vessel_authorization)
):
    """Retrieve detailed history for a specific vessel (requires vessel authorization or HQ clearance)."""
    return get_vessel_operational_history(mmsi, hours)

@router.get("")
async def list_vessels(
    anomalous_only: bool = Query(False),
    vessel_type: Optional[str] = Query(None)
):
    """Returns the fleet vessel registry."""
    vessels = get_vessel_registry_enhanced()
    
    if anomalous_only or vessel_type:
        filtered = []
        for v in vessels:
            if anomalous_only and v.get("severity") == "NORMAL": continue
            if vessel_type and v.get("type", "").lower() != vessel_type.lower(): continue
            filtered.append(v)
        return {"vessels": filtered}
    
    return {"vessels": vessels}

# In-memory store for shipboard control states & bridge log entries
SHIP_CONTROLS = {}

class ShipControlAction(BaseModel):
    action: str  # 'TOGGLE_AIS', 'TRIGGER_DISTRESS', 'ADD_LOG', 'SET_NAV_STATUS'
    ais_mode: Optional[str] = None
    distress_reason: Optional[str] = None
    log_msg: Optional[str] = None
    nav_status: Optional[str] = None

@router.get("/{mmsi}/ship-status")
def get_ship_status(
    mmsi: str,
    _auth: dict = Depends(require_vessel_authorization)
):
    alert = get_alert_by_mmsi(mmsi)
    vessel_data = alert or {"mmsi": mmsi, "vessel_name": f"UNIT {mmsi}", "vessel_type": "Naval Escort"}
    
    state = SHIP_CONTROLS.get(mmsi, {
        "ais_mode": "TRANSMITTING",
        "distress_active": False,
        "nav_status_override": None,
        "fuel_pct": 87,
        "engine_power": 92,
        "navic_lock": "LOCKED_STRONG",
        "bridge_logs": [
            {"time": "08:30:00", "author": "Bridge Watch", "msg": "Routine watch initiated. NavIC satellite lock confirmed."},
            {"time": "09:15:00", "author": "Nav Officer", "msg": "Course adjusted +012 deg. Engine RPM steady at 85%."}
        ]
    })
    
    return {
        "mmsi": mmsi,
        "vessel_info": vessel_data,
        "control_state": state
    }

@router.post("/{mmsi}/control")
def update_ship_control(
    mmsi: str,
    body: ShipControlAction,
    _auth: dict = Depends(require_vessel_authorization)
):
    if mmsi not in SHIP_CONTROLS:
        SHIP_CONTROLS[mmsi] = {
            "ais_mode": "TRANSMITTING",
            "distress_active": False,
            "nav_status_override": None,
            "fuel_pct": 87,
            "engine_power": 92,
            "navic_lock": "LOCKED_STRONG",
            "bridge_logs": []
        }
    
    state = SHIP_CONTROLS[mmsi]
    
    if body.action == "TOGGLE_AIS":
        state["ais_mode"] = body.ais_mode or ("STEALTH_SILENT" if state["ais_mode"] == "TRANSMITTING" else "TRANSMITTING")
    elif body.action == "TRIGGER_DISTRESS":
        state["distress_active"] = not state["distress_active"]
        reason = sanitize_text(body.distress_reason, 200) or "Urgent Assistance Requested"
        state["bridge_logs"].insert(0, {
            "time": "NOW",
            "author": "TACTICAL COMMAND",
            "msg": f"⚠️ EMERGENCY DISTRESS {'ACTIVATED' if state['distress_active'] else 'DEACTIVATED'}: {reason}"
        })
    elif body.action == "ADD_LOG":
        if body.log_msg:
            state["bridge_logs"].insert(0, {
                "time": "NOW",
                "author": "Deck Officer",
                "msg": sanitize_text(body.log_msg, 300)
            })
    elif body.action == "SET_NAV_STATUS":
        if body.nav_status:
            state["nav_status_override"] = sanitize_text(body.nav_status, 100)
            
    return {"status": "success", "mmsi": mmsi, "control_state": state}

# In-memory store for HQ <-> Ship 2-way tactical comms
SHIP_COMMS = {}

class MessagePayload(BaseModel):
    sender: str   # 'HQ' or 'SHIP'
    text: str
    priority: Optional[str] = "NORMAL"

@router.get("/{mmsi}/comms")
def get_ship_comms(
    mmsi: str,
    _auth: dict = Depends(require_vessel_authorization)
):
    if mmsi not in SHIP_COMMS:
        SHIP_COMMS[mmsi] = [
            {"id": 1, "mmsi": mmsi, "time": "08:15:00", "sender": "HQ", "text": "TACTICAL DIRECTIVE: Maintain DBSCAN spatial corridor 4B.", "priority": "ROUTINE"},
            {"id": 2, "mmsi": mmsi, "time": "09:30:00", "sender": "SHIP", "text": "NavIC Satellite Lock 100% steady. Proceeding at 14 kts.", "priority": "ROUTINE"}
        ]
    return JSONResponse(
        content={"mmsi": mmsi, "messages": SHIP_COMMS[mmsi]},
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"}
    )

@router.post("/{mmsi}/comms/send")
async def send_ship_message(
    mmsi: str,
    body: MessagePayload,
    _auth: dict = Depends(require_vessel_authorization)
):
    if mmsi not in SHIP_COMMS:
        SHIP_COMMS[mmsi] = [
            {"id": 1, "mmsi": mmsi, "time": "08:15:00", "sender": "HQ", "text": "TACTICAL DIRECTIVE: Maintain DBSCAN spatial corridor 4B.", "priority": "ROUTINE"},
            {"id": 2, "mmsi": mmsi, "time": "09:30:00", "sender": "SHIP", "text": "NavIC Satellite Lock 100% steady. Proceeding at 14 kts.", "priority": "ROUTINE"}
        ]
    
    # Sanitize inputs before storing and broadcasting to prevent XSS / script injection
    sanitized_text = sanitize_text(body.text, 500)
    sanitized_sender = sanitize_text(body.sender, 50)
    sanitized_priority = sanitize_text(body.priority or "ROUTINE", 20)

    new_msg = {
        "type": "COMMS_MESSAGE",
        "id": len(SHIP_COMMS[mmsi]) + 1,
        "mmsi": mmsi,
        "time": datetime.now(timezone.utc).strftime("%H:%M:%S"),
        "sender": sanitized_sender,
        "text": sanitized_text,
        "priority": sanitized_priority
    }
    SHIP_COMMS[mmsi].insert(0, new_msg)
    
    # Broadcast to all active WebSocket clients for instant live update
    try:
        from main import manager
        await manager.broadcast(json.dumps(new_msg))
    except Exception as e:
        print("Comms WS broadcast error:", e)
        
    return {"status": "success", "message": new_msg}

def calculate_haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R_nm = 3440.065  # Earth radius in nautical miles
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    return round(2 * R_nm * math.asin(math.sqrt(max(0, min(1, a)))), 1)

def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlambda = math.radians(lon2 - lon1)
    y = math.sin(dlambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda)
    bearing = math.degrees(math.atan2(y, x))
    return int((bearing + 360) % 360)

@router.get("/{mmsi}/convoy")
def get_convoy_radar(
    mmsi: str,
    _auth: dict = Depends(require_vessel_authorization)
):
    vessels = get_vessel_registry_enhanced()
    current = next((v for v in vessels if str(v.get("mmsi")) == mmsi), None)
    
    c_lat = current.get("last_lat") or current.get("lat") if current else 18.92
    c_lon = current.get("last_lon") or current.get("lon") if current else 72.83
    
    if c_lat is None or c_lon is None:
        c_lat, c_lon = 18.92, 72.83
        
    nearby_units = []
    
    for v in vessels:
        v_mmsi = str(v.get("mmsi"))
        v_lat = v.get("last_lat") if v.get("last_lat") is not None else v.get("lat")
        v_lon = v.get("last_lon") if v.get("last_lon") is not None else v.get("lon")
        
        if v_mmsi != mmsi and v_lat is not None and v_lon is not None:
            dist_nm = calculate_haversine_nm(c_lat, c_lon, v_lat, v_lon)
            bearing = calculate_bearing(c_lat, c_lon, v_lat, v_lon)
            
            nearby_units.append({
                "mmsi": v_mmsi,
                "name": v.get("name") or f"UNIT {v_mmsi}",
                "type": v.get("type", "Vessel"),
                "distance_nm": dist_nm,
                "bearing": bearing,
                "sog": v.get("last_sog") or v.get("sog") or 12.0,
                "severity": v.get("severity", "NORMAL"),
                "lat": v_lat,
                "lon": v_lon
            })
    
    nearby_units.sort(key=lambda x: x["distance_nm"])
    return {"mmsi": mmsi, "convoy_units": nearby_units[:12]}

@router.get("/{mmsi}")
def get_vessel(
    mmsi: str,
    _auth: dict = Depends(require_vessel_authorization)
):
    alert = get_alert_by_mmsi(mmsi)
    if not alert:
        raise HTTPException(status_code=404, detail=f"Vessel {mmsi} not found")

    track = get_vessel_track(mmsi)
    return {
        **alert,
        "track_history": track
    }




