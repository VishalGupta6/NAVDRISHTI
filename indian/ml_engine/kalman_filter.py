#!/usr/bin/env python3
"""
Extended Kalman Filter — Maritime Domain Awareness System
Tracks vessel position, smooths noisy AIS data, predicts position during dropout gaps,
and flags large divergence between predicted and actual reappearance position.
"""

import json
import math
from pathlib import Path
from typing import List, Dict, Optional

import numpy as np

FEED_PATH   = Path(__file__).parent.parent / "simulation" / "data" / "ais_feed.json"
OUTPUT_PATH = Path(__file__).parent / "data" / "kalman_results.json"
OUTPUT_PATH.parent.mkdir(exist_ok=True)

# State vector: [lat, lon, vlat, vlon]  (position + velocity)
# Velocity in deg/sec
DT = 120.0         # 2-minute ping interval (seconds)
DROPOUT_THRESHOLD_NM = 5.0   # Flag dropout divergence > 5 nautical miles


def deg_to_nm(lat_diff: float, lon_diff: float) -> float:
    """Approximate displacement in nautical miles."""
    nm_per_deg_lat = 60.0
    nm_per_deg_lon = 60.0 * math.cos(math.radians(17.5))  # Arabian Sea latitude
    return math.sqrt((lat_diff * nm_per_deg_lat)**2 + (lon_diff * nm_per_deg_lon)**2)


class ExtendedKalmanFilter:
    """
    4-state EKF: [lat, lon, v_lat, v_lon]

    State transition: constant velocity model.
    Observation: [lat, lon] from AIS pings.
    """

    def __init__(self, dt: float = DT):
        self.dt = dt
        # State vector
        self.x = np.zeros((4, 1))  # [lat, lon, vlat, vlon]

        # State transition matrix (constant velocity)
        self.F = np.array([
            [1, 0, dt, 0],
            [0, 1, 0,  dt],
            [0, 0, 1,  0],
            [0, 0, 0,  1],
        ], dtype=float)

        # Observation matrix (we observe lat, lon only)
        self.H = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0],
        ], dtype=float)

        # State covariance matrix
        self.P = np.eye(4) * 1.0

        # Process noise covariance (tuned for vessel dynamics)
        q = 1e-6
        self.Q = np.eye(4) * q
        self.Q[2, 2] = q * 10  # velocity uncertainty higher
        self.Q[3, 3] = q * 10

        # Measurement noise covariance (AIS GPS noise)
        r = 1e-5
        self.R = np.eye(2) * r

        self.initialized = False

    def initialize(self, lat: float, lon: float, vlat: float = 0, vlon: float = 0):
        self.x = np.array([[lat], [lon], [vlat], [vlon]], dtype=float)
        self.initialized = True

    def predict(self) -> np.ndarray:
        """Predict next state."""
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q
        return self.x[:2].flatten()  # predicted [lat, lon]

    def update(self, z_lat: float, z_lon: float) -> np.ndarray:
        """Update with AIS observation."""
        z = np.array([[z_lat], [z_lon]], dtype=float)
        y = z - self.H @ self.x                         # innovation
        S = self.H @ self.P @ self.H.T + self.R         # innovation covariance
        K = self.P @ self.H.T @ np.linalg.inv(S)       # Kalman gain
        self.x = self.x + K @ y
        self.P = (np.eye(4) - K @ self.H) @ self.P
        return self.x[:2].flatten()


def process_vessel_track(pings: List[Dict]) -> Dict:
    """Apply EKF to a vessel's ping sequence, detect dropout divergence."""
    kf = ExtendedKalmanFilter()
    results = []

    dropout_start_idx: Optional[int] = None
    pred_position_on_dropout: Optional[np.ndarray] = None

    divergence_events = []

    for i, ping in enumerate(pings):
        is_dropout = ping.get("nav_status") == "AIS_DROPOUT" or ping.get("lat") is None

        if is_dropout:
            if dropout_start_idx is None:
                dropout_start_idx = i
                if kf.initialized:
                    pred_position_on_dropout = kf.predict()
                else:
                    pred_position_on_dropout = None
            else:
                if kf.initialized:
                    kf.predict()  # advance filter through gap
            results.append({"step": i, "status": "dropout", "estimated_lat": None, "estimated_lon": None})
            continue

        lat, lon = ping["lat"], ping["lon"]

        if not kf.initialized:
            sog = ping.get("sog") or 0.0
            cog_rad = math.radians(ping.get("cog") or 0.0)
            speed_deg_s = sog * 0.514444 / 111320
            vlat = speed_deg_s * math.cos(cog_rad)
            vlon = speed_deg_s * math.sin(cog_rad)
            kf.initialize(lat, lon, vlat, vlon)
            results.append({"step": i, "status": "init", "estimated_lat": lat, "estimated_lon": lon})
            continue

        # Check dropout reappearance
        if dropout_start_idx is not None and pred_position_on_dropout is not None:
            pred_lat, pred_lon = pred_position_on_dropout
            divergence_nm = deg_to_nm(lat - pred_lat, lon - pred_lon)
            if divergence_nm > DROPOUT_THRESHOLD_NM:
                divergence_events.append({
                    "dropout_start_step": dropout_start_idx,
                    "reappear_step":      i,
                    "predicted_lat":      float(pred_lat),
                    "predicted_lon":      float(pred_lon),
                    "actual_lat":         lat,
                    "actual_lon":         lon,
                    "divergence_nm":      round(divergence_nm, 2),
                    "verdict":            "HIDDEN_MANEUVER_DETECTED",
                })
            dropout_start_idx = None
            pred_position_on_dropout = None

        # EKF predict + update
        kf.predict()
        estimated = kf.update(lat, lon)
        innov_nm = deg_to_nm(lat - estimated[0], lon - estimated[1])

        results.append({
            "step":          i,
            "status":        "tracked",
            "estimated_lat": round(float(estimated[0]), 6),
            "estimated_lon": round(float(estimated[1]), 6),
            "innovation_nm": round(innov_nm, 4),
        })

    return {
        "track_points":     results,
        "divergence_events": divergence_events,
        "has_dark_maneuver": len(divergence_events) > 0,
    }


def run_kalman_filter(feed_path: Path) -> Dict:
    print("[Kalman] Loading AIS feed...")
    with open(feed_path) as f:
        messages = json.load(f)

    pings_by_mmsi: Dict[str, List[Dict]] = {}
    for msg in messages:
        mmsi = msg["mmsi"]
        if mmsi not in pings_by_mmsi:
            pings_by_mmsi[mmsi] = []
        pings_by_mmsi[mmsi].append(msg)

    for mmsi in pings_by_mmsi:
        pings_by_mmsi[mmsi].sort(key=lambda x: x["timestamp"])

    vessel_results = {}
    dark_maneuver_count = 0
    for mmsi, pings in pings_by_mmsi.items():
        result = process_vessel_track(pings)
        vessel_results[mmsi] = {
            "mmsi":              mmsi,
            "divergence_events": result["divergence_events"],
            "has_dark_maneuver": result["has_dark_maneuver"],
            "total_pings":       len(pings),
            "dropout_pings":     sum(1 for p in pings if p.get("nav_status") == "AIS_DROPOUT"),
        }
        if result["has_dark_maneuver"]:
            dark_maneuver_count += 1
            print(f"  🚨 [{mmsi}] Hidden maneuver detected! Divergence: "
                  f"{result['divergence_events'][0]['divergence_nm']} nm")

    print(f"[Kalman] ✅ Processed {len(vessel_results)} vessels | Dark maneuvers: {dark_maneuver_count}")

    output = {
        "algorithm":          "Extended_Kalman_Filter",
        "dropout_threshold_nm": DROPOUT_THRESHOLD_NM,
        "dark_maneuvers_found": dark_maneuver_count,
        "results":            vessel_results,
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)
    print(f"[Kalman] Saved → {OUTPUT_PATH}")
    return output


if __name__ == "__main__":
    run_kalman_filter(FEED_PATH)
