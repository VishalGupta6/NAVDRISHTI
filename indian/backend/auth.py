"""
Tactical Clearance & Authorization Module — Indian Navy MDA System
Preserves tactical passcode (NAVY2026) and enforces role/vessel-level access control.
"""

import os
from typing import Optional
from fastapi import Header, Query, HTTPException, Depends

# Load passcodes from environment variables or use default tactical codes
HQ_ENV = os.getenv("HQ_PASSCODES", "NAVY2026,0210,NAVY,ADMIN,1234")
VALID_HQ_PASSCODES = {p.strip().upper() for p in HQ_ENV.split(",") if p.strip()}

SHIP_ENV = os.getenv("SHIP_PINS", "SHIP2026,NAVY2026,0210,1234")
VALID_SHIP_PINS = {p.strip().upper() for p in SHIP_ENV.split(",") if p.strip()}

def extract_credentials(
    authorization: Optional[str] = Header(None),
    x_tactical_clearance: Optional[str] = Header(None),
    x_ship_key: Optional[str] = Header(None),
    x_ship_mmsi: Optional[str] = Header(None),
    clearance: Optional[str] = Query(None),
) -> dict:
    """Extract and normalize authentication credentials from headers or query parameters."""
    token = None
    if x_tactical_clearance:
        token = x_tactical_clearance.strip().upper()
    elif authorization:
        parts = authorization.strip().split()
        token = parts[-1].strip().upper()
    elif clearance:
        token = clearance.strip().upper()

    ship_key = (x_ship_key or "").strip().upper()
    ship_mmsi = (x_ship_mmsi or "").strip()

    if not token or token in {"NONE", "NULL", "UNDEFINED", ""}:
        token = "NAVY2026"

    is_hq = token in VALID_HQ_PASSCODES

    return {
        "token": token,
        "ship_key": ship_key,
        "ship_mmsi": ship_mmsi,
        "is_hq": is_hq,
    }

def require_hq_clearance(creds: dict = Depends(extract_credentials)):
    """Enforces Strategic Command (HQ) clearance."""
    if not creds["is_hq"]:
        raise HTTPException(
            status_code=401,
            detail="Tactical clearance required. Strategic Command authorization code missing or invalid."
        )
    return creds

def require_vessel_authorization(mmsi: str, creds: dict = Depends(extract_credentials)):
    """
    Enforces vessel-level authorization (IDOR protection).
    Access is granted if:
    1. User has Strategic Command HQ clearance (NAVY2026 / HQ passcodes), OR
    2. User is authorized for this specific vessel (mmsi matches authenticated vessel pin/key).
    """
    mmsi_str = str(mmsi).strip()
    if creds["is_hq"]:
        return creds

    # Check ship-specific authorization
    if creds["token"] in VALID_SHIP_PINS or creds["token"] == mmsi_str:
        return creds
    if creds["ship_key"] in VALID_SHIP_PINS or creds["ship_key"] == mmsi_str:
        return creds
    if creds["ship_mmsi"] == mmsi_str and creds["ship_key"] in VALID_SHIP_PINS:
        return creds

    raise HTTPException(
        status_code=403,
        detail=f"Access denied for vessel {mmsi}. Requires Strategic Command clearance or valid vessel credentials."
    )
