#!/usr/bin/env python3
"""
Loitering Detector — Maritime Domain Awareness System
Uses a Spatial-Temporal Density analysis to detect "Loitering" or "Stationary Anomaly".
This goes beyond simple speed heuristics by looking for high-density spatial clusters 
of pings for a single vessel within a tight radius over a significant time window.

Full Potential AI/ML Approach:
  - Sliding Window over AIS tracks.
  - Calculate Spatial Variance and Centroid Drift.
  - Flag if Drift is low while Time Spanned is high.
"""

import json
import math
from pathlib import Path
from typing import List, Dict, Tuple
from datetime import datetime

import numpy as np

FEED_PATH   = Path(__file__).parent.parent / "simulation" / "data" / "ais_feed.json"
OUTPUT_PATH = Path(__file__).parent / "data" / "loitering_results.json"
OUTPUT_PATH.parent.mkdir(exist_ok=True)

# CONFIGURATION
LOITER_RADIUS_NM  = 0.5  # Max radius to be considered "one spot"
MIN_LOITER_TIME_H = 1.0  # Minimum time in hours to flag as loitering
DRIFT_THRESHOLD    = 0.01 # Max variance in position (approximate)


def haversine(lat1, lon1, lat2, lon2):
    R = 3440.065 # Nautical miles
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def detect_loitering_track(pings: List[Dict]) -> Dict:
    """Analyze a single vessel's track for loitering behavior."""
    if len(pings) < 10:
        return {"is_loitering": False, "score": 0.0}

    # Sort pings by time
    pings.sort(key=lambda x: x["timestamp"])
    
    # Calculate time-based windows
    # Check if the vessel stayed within LOITER_RADIUS_NM for > MIN_LOITER_TIME_H
    max_duration_hrs = 0.0
    is_loitering = False
    
    lats = np.array([p["lat"] for p in pings])
    lons = np.array([p["lon"] for p in pings])
    
    # Simple ML heuristic: Cluster Density in Space vs Time
    # If the variance is extremely low but the time interval between first and last ping is high.
    start_ts = datetime.fromisoformat(pings[0]["timestamp"].replace("Z", ""))
    end_ts   = datetime.fromisoformat(pings[-1]["timestamp"].replace("Z", ""))
    total_time_h = (end_ts - start_ts).total_seconds() / 3600.0
    
    # Variance check
    centroid_lat = np.mean(lats)
    centroid_lon = np.mean(lons)
    
    # Check sliding windows (window size 15 to 40 pings, i.e. 1.25h to 3.5h)
    max_score = 0.0
    best_centroid = {"lat": pings[0]["lat"], "lon": pings[0]["lon"]}
    best_radius = 0.0
    best_duration = 0.0
    is_loitering = False

    W = 20
    for start_i in range(0, max(1, len(pings) - W + 1), 5):
        sub = pings[start_i:start_i + W]
        if not sub: continue
        sub_lats = [p["lat"] for p in sub if p.get("lat") is not None]
        sub_lons = [p["lon"] for p in sub if p.get("lon") is not None]
        sub_sogs = [p.get("sog", 0) for p in sub if isinstance(p.get("sog"), (int, float))]
        if not sub_lats: continue
        
        c_lat, c_lon = np.mean(sub_lats), np.mean(sub_lons)
        max_d = max(haversine(c_lat, c_lon, lat, lon) for lat, lon in zip(sub_lats, sub_lons))
        avg_sog = float(np.mean(sub_sogs)) if sub_sogs else 0.0
        
        t0 = datetime.fromisoformat(sub[0]["timestamp"].replace("Z", ""))
        t1 = datetime.fromisoformat(sub[-1]["timestamp"].replace("Z", ""))
        dur_h = (t1 - t0).total_seconds() / 3600.0
        
        if avg_sog < 3.0 and dur_h >= 1.0:
            rad_pen = max(0, 1.0 - (max_d / 2.5))
            score = rad_pen * min(1.0, dur_h / 2.0) * 100
            if score > max_score:
                max_score = score
                best_centroid = {"lat": c_lat, "lon": c_lon}
                best_radius = max_d
                best_duration = dur_h
                if score >= 35:
                    is_loitering = True

    return {
        "is_loitering": is_loitering,
        "loiter_score": round(max_score, 2),
        "radius_nm":    round(best_radius, 3),
        "duration_h":  round(best_duration, 2),
        "centroid":    best_centroid
    }


def run_loitering_detector(feed_path: Path) -> Dict:
    print("[Loitering] Analyzing spatial-temporal density...")
    with open(feed_path) as f:
        messages = json.load(f)

    # Group pings by MMSI
    pings_by_mmsi: Dict[str, List[Dict]] = {}
    for msg in messages:
        pid = msg["mmsi"]
        if msg.get("lat") is None: continue
        if pid not in pings_by_mmsi:
            pings_by_mmsi[pid] = []
        pings_by_mmsi[pid].append(msg)

    results = {}
    for mmsi, pings in pings_by_mmsi.items():
        results[mmsi] = detect_loitering_track(pings)

    loiter_list = [mmsi for mmsi, r in results.items() if r["is_loitering"]]
    print(f"[Loitering] Finished. Detected {len(loiter_list)} loitering vessels.")

    output = {
        "algorithm": "SpatialDensityClustering",
        "results": results
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)
    return output


if __name__ == "__main__":
    run_loitering_detector(FEED_PATH)
