#!/usr/bin/env python3
"""
Spatial-Temporal Clustering — Maritime Domain Awareness System
Uses DBSCAN to establish baseline shipping lanes from normal AIS trajectories.
Anomalous routes (low-density clusters) are flagged.
"""

import json
import math
from pathlib import Path
from typing import List, Dict, Tuple

import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler

FEED_PATH   = Path(__file__).parent.parent / "simulation" / "data" / "ais_feed.json"
OUTPUT_PATH = Path(__file__).parent / "data" / "cluster_results.json"
OUTPUT_PATH.parent.mkdir(exist_ok=True)


def haversine_distance(lat1, lon1, lat2, lon2) -> float:
    """Great-circle distance in nautical miles."""
    R = 3440.065  # Earth radius in nm
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi  = math.radians(lat2 - lat1)
    dlam  = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def extract_trajectory_features(pings: List[Dict]) -> np.ndarray:
    """
    Convert a vessel's ping sequence into feature vectors.
    Features: [mean_lat, mean_lon, mean_sog, mean_cog, std_lat, std_lon, path_length_nm]
    """
    lats = np.array([p["lat"] for p in pings])
    lons = np.array([p["lon"] for p in pings])
    sogs = np.array([p["sog"] for p in pings])
    cogs = np.array([p["cog"] for p in pings])

    # Path length
    path_len = sum(
        haversine_distance(pings[i]["lat"], pings[i]["lon"],
                           pings[i + 1]["lat"], pings[i + 1]["lon"])
        for i in range(len(pings) - 1)
    )

    return np.array([
        lats.mean(), lons.mean(),
        sogs.mean(), cogs.mean(),
        lats.std(), lons.std(),
        path_len,
    ])


def run_dbscan_clustering(feed_path: Path) -> Dict:
    print("[DBSCAN] Loading AIS feed...")
    with open(feed_path) as f:
        messages = json.load(f)

    # Group pings by MMSI
    pings_by_mmsi: Dict[str, List[Dict]] = {}
    for msg in messages:
        pid = msg["mmsi"]
        if pid not in pings_by_mmsi:
            pings_by_mmsi[pid] = []
        pings_by_mmsi[pid].append(msg)

    # Extract features per vessel
    mmsi_list = list(pings_by_mmsi.keys())
    features  = []
    for mmsi in mmsi_list:
        pings = sorted(pings_by_mmsi[mmsi], key=lambda x: x["timestamp"])
        if len(pings) < 5:
            continue
        feat = extract_trajectory_features(pings)
        features.append(feat)

    X = np.array(features)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # DBSCAN — eps tuned to data, min_samples = 2 (small fleet)
    db = DBSCAN(eps=1.2, min_samples=2, metric="euclidean")
    labels = db.fit_predict(X_scaled)

    results = []
    for idx, mmsi in enumerate(mmsi_list[:len(labels)]):
        label = int(labels[idx])
        is_noise = label == -1  # DBSCAN labels outliers as -1
        results.append({
            "mmsi":              mmsi,
            "cluster_id":        label,
            "is_route_anomaly":  is_noise,
            "features":          X[idx].tolist(),
        })

    noise_count   = sum(1 for r in results if r["is_route_anomaly"])
    cluster_count = len(set(labels)) - (1 if -1 in labels else 0)
    print(f"[DBSCAN] Vessels: {len(results)} | Clusters: {cluster_count} | Route Anomalies: {noise_count}")

    output = {
        "algorithm":     "DBSCAN",
        "eps":           1.2,
        "min_samples":   2,
        "cluster_count": cluster_count,
        "noise_vessels": noise_count,
        "results":       results,
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)
    print(f"[DBSCAN] Saved → {OUTPUT_PATH}")
    return output


if __name__ == "__main__":
    run_dbscan_clustering(FEED_PATH)
