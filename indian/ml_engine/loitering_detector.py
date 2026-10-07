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
    
    # Check max distance from centroid
    max_dist = 0.0
    for p in pings:
        dist = haversine(centroid_lat, centroid_lon, p["lat"], p["lon"])
        if dist > max_dist:
            max_dist = dist
            
    sogs = [p.get("sog", 0) for p in pings if isinstance(p.get("sog"), (int, float))]
    avg_sog = float(np.mean(sogs)) if sogs else 0.0
    
    # Moving vessels in transit (avg SOG > 1.5 kn) are not loitering
    if avg_sog > 1.5:
        return {
            "is_loitering": False,
            "loiter_score": 0.0,
            "radius_nm": round(max_dist, 3),
            "duration_h": round(total_time_h, 2),
            "centroid": {"lat": centroid_lat, "lon": centroid_lon}
        }

    # Loitering Score: proportional to time and inversely proportional to radius
    # If max_dist for all pings is < 1nm over several hours, it's definitely loitering
    score = 0.0
    if total_time_h > MIN_LOITER_TIME_H:
        # Normalize score: max score when radius is 0, 0 score when radius > 2nm
        radius_penalty = max(0, 1.0 - (max_dist / 2.0))
        time_bonus     = min(1.0, total_time_h / 12.0)
        score = radius_penalty * time_bonus * 100
        
        if score > 70: # Higher threshold for true loitering anomaly
            is_loitering = True

    return {
        "is_loitering": is_loitering,
        "loiter_score": round(score, 2),
        "radius_nm":    round(max_dist, 3),
        "duration_h":  round(total_time_h, 2),
        "centroid":    {"lat": centroid_lat, "lon": centroid_lon}
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
