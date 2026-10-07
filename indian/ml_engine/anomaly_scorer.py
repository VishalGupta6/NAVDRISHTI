#!/usr/bin/env python3
"""
Anomaly Scorer — Maritime Domain Awareness System
Fuses outputs from DBSCAN, LSTM Autoencoder, and Strategic Loitering Detection
into a unified risk score and anomaly alert for each vessel.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

CLUSTER_PATH = Path(__file__).parent / "data" / "cluster_results.json"
AE_PATH      = Path(__file__).parent / "data" / "autoencoder_results.json"
LOITER_PATH  = Path(__file__).parent / "data" / "loitering_results.json"
KALMAN_PATH  = Path(__file__).parent / "data" / "kalman_results.json"
FEED_PATH    = Path(__file__).parent.parent / "simulation" / "data" / "ais_feed.json"
OUTPUT_PATH  = Path(__file__).parent / "data" / "anomaly_alerts.json"
OUTPUT_PATH.parent.mkdir(exist_ok=True)


def load_json(path: Path) -> Dict:
    if not path.exists():
        return {}
    with open(path) as f:
        try:
            return json.load(f)
        except:
            return {}


def normalize(value: float, min_v: float, max_v: float) -> float:
    if max_v <= min_v:
        return 0.0
    return max(0.0, min(1.0, (value - min_v) / (max_v - min_v)))


def detect_sts_heuristic(pings_by_mmsi: Dict[str, List[Dict]]) -> Dict[str, bool]:
    sts_flags: Dict[str, bool] = {}
    mmsi_list = list(pings_by_mmsi.keys())
    pings_all = {mmsi: sorted(p, key=lambda x: x["timestamp"]) for mmsi, p in pings_by_mmsi.items()}

    for i in range(len(mmsi_list)):
        for j in range(i + 1, len(mmsi_list)):
            mmsi_a, mmsi_b = mmsi_list[i], mmsi_list[j]
            pings_a = {p["timestamp"]: p for p in pings_all[mmsi_a]}
            pings_b = {p["timestamp"]: p for p in pings_all[mmsi_b]}
            common_ts = sorted(set(pings_a.keys()) & set(pings_b.keys()))

            consec = 0
            for ts in common_ts:
                pa, pb = pings_a[ts], pings_b[ts]
                dist = ((pa["lat"] - pb["lat"])**2 + (pa["lon"] - pb["lon"])**2)**0.5
                if dist < 0.005 and (pa.get("sog") or 0) < 4 and (pb.get("sog") or 0) < 4:
                    consec += 1
                else:
                    consec = 0
                if consec >= 20:
                    sts_flags[mmsi_a] = True
                    sts_flags[mmsi_b] = True
                    break
    return sts_flags


def detect_spoof_heuristic(pings_by_mmsi: Dict[str, List[Dict]]) -> Dict[str, bool]:
    spoof_flags: Dict[str, bool] = {}
    for mmsi, pings in pings_by_mmsi.items():
        sorted_pings = sorted(pings, key=lambda x: x["timestamp"])
        for k in range(1, len(sorted_pings)):
            pa, pb = sorted_pings[k - 1], sorted_pings[k]
            if abs(pa["lat"] - pb["lat"]) > 3.0 or abs(pa["lon"] - pb["lon"]) > 3.0:
                spoof_flags[mmsi] = True
                break
    return spoof_flags


def run_anomaly_scorer() -> List[Dict]:
    print("[Scorer] Fusing AI/ML outputs for MDA...")

    cluster_data = load_json(CLUSTER_PATH)
    ae_data      = load_json(AE_PATH)
    loiter_data  = load_json(LOITER_PATH)
    kf_data      = load_json(KALMAN_PATH)
    feed_data    = load_json(FEED_PATH) if FEED_PATH.exists() else []

    cluster_map: Dict[str, Dict] = {r["mmsi"]: r for r in cluster_data.get("results", [])}
    ae_results   = ae_data.get("results", {})
    loiter_map   = loiter_data.get("results", {})
    kf_results   = kf_data.get("results", {})

    pings_by_mmsi: Dict[str, List[Dict]] = {}
    if isinstance(feed_data, list):
        for msg in feed_data:
            mmsi = msg["mmsi"]
            if mmsi not in pings_by_mmsi: pings_by_mmsi[mmsi] = []
            pings_by_mmsi[mmsi].append(msg)

    sts_flags    = detect_sts_heuristic(pings_by_mmsi)
    spoof_flags  = detect_spoof_heuristic(pings_by_mmsi)

    ae_errors = [r.get("mean_reconstruction_error", 0.0) for r in ae_results.values() if isinstance(r, dict)]
    max_ae = max(ae_errors, default=1.0)
    min_ae = min(ae_errors, default=0.0)

    all_mmsi = set(cluster_map) | set(ae_results) | set(kf_results) | set(pings_by_mmsi) | set(loiter_map)
    alerts = []

    for mmsi in all_mmsi:
        route_flag   = cluster_map.get(mmsi, {}).get("is_route_anomaly", False)
        ae_r         = ae_results.get(mmsi, {})
        ae_error     = ae_r.get("mean_reconstruction_error", 0.0) if isinstance(ae_r, dict) else 0.0
        kinematic_flag = ae_r.get("is_kinematic_anomaly", False) if isinstance(ae_r, dict) else False
        
        kf_r         = kf_results.get(mmsi, {})
        dark_flag    = kf_r.get("has_dark_maneuver", False) if isinstance(kf_r, dict) else False

        sts_flag     = sts_flags.get(mmsi, False)
        spoof_flag   = spoof_flags.get(mmsi, False)
        
        # New Loitering result from ML Detector
        loiter_r     = loiter_map.get(mmsi, {})
        loiter_flag  = loiter_r.get("is_loitering", False)
        loiter_score = loiter_r.get("loiter_score", 0.0)

        # Fused risk score
        ae_norm = normalize(ae_error, min_ae, max_ae)
        score_raw = (
            0.15 * int(route_flag) + 
            0.25 * ae_norm + 
            0.20 * int(dark_flag) + 
            0.15 * int(sts_flag) + 
            0.20 * (loiter_score / 100.0) +
            0.05 * int(spoof_flag)
        )
        risk_score = round(score_raw * 100, 1)

        anomaly_types = []
        risk_categories = []
        if dark_flag:    anomaly_types.append("DARK_VESSEL")
        if sts_flag:     
            anomaly_types.append("STS_TRANSFER")
            risk_categories.append("Smuggling")
        if loiter_flag:  anomaly_types.append("LOITERING_ANOMALY")
        if spoof_flag:   anomaly_types.append("POSITION_SPOOFING")
        if kinematic_flag: anomaly_types.append("KINEMATIC_ANOMALY")
        if route_flag:   anomaly_types.append("ROUTE_DEVIATION")

        pings = pings_by_mmsi.get(mmsi, [])
        v_name = pings[0]["name"] if pings else "UNKNOWN"
        v_type = pings[0]["type"] if pings else "UNKNOWN"
        v_flag = pings[0]["flag"] if pings else "XX"

        if v_type == "Fishing" and (loiter_flag or route_flag): risk_categories.append("IUU_Fishing")
        if v_flag in ["KP", "IR", "CN"] and dark_flag: risk_categories.append("Military_Affiliation")

        has_real_anomalies = len(anomaly_types) > 0
        if not anomaly_types:
            anomaly_types = ["NORMAL"]

        severity = "NORMAL"
        if risk_score >= 75: severity = "CRITICAL"
        elif risk_score >= 50: severity = "HIGH"
        elif risk_score >= 30: severity = "MEDIUM"
        elif risk_score >= 15: severity = "LOW"

        # A vessel is marked anomalous if it has a specific anomaly type or elevated risk
        is_anomalous_vessel = has_real_anomalies or severity in ["CRITICAL", "HIGH", "MEDIUM"]

        last_ping = sorted(pings, key=lambda x: x["timestamp"])[-1] if pings else {}

        alerts.append({
            "alert_id": f"ALT-{mmsi[-4:]}",
            "mmsi": mmsi,
            "vessel_name": v_name,
            "vessel_type": v_type,
            "flag": v_flag,
            "risk_score": risk_score,
            "severity": severity,
            "anomaly_types": anomaly_types,
            "risk_categories": list(set(risk_categories)),
            "is_anomalous": is_anomalous_vessel,
            "last_lat": last_ping.get("lat"),
            "last_lon": last_ping.get("lon"),
            "loitering": loiter_flag,
            "generated_at": datetime.now(timezone.utc).isoformat()
        })

    alerts.sort(key=lambda x: x["risk_score"], reverse=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump({"alerts": alerts, "generated_at": datetime.now(timezone.utc).isoformat()}, f, indent=2)
    return alerts

if __name__ == "__main__":
    run_anomaly_scorer()
