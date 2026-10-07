#!/usr/bin/env python3
"""
AIS Data Simulator — Maritime Domain Awareness System
Generates realistic AIS time-series data for multiple vessels with injected anomalies.

Anomaly Types Injected:
  1. STS Transfer (parallel movement) — two ships rendezvous, synchronize speed < 4 kts
  2. Dark Vessel / AIS Dropout — vessel stops transmitting for 2-6 hours, reappears off course
  3. Port Loitering — vessel circles at < 2 kts for 3+ hours outside anchorage
  4. Spoofed Position — AIS position teleports impossibly fast
"""

import json
import math
import random
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any

import numpy as np

random.seed(42)
np.random.seed(42)

# ─── Config ──────────────────────────────────────────────────────────────────
OUTPUT_DIR = Path(__file__).parent / "data"
OUTPUT_DIR.mkdir(exist_ok=True)

START_TIME = datetime(2026, 3, 22, 0, 0, 0)
STEP_SECONDS = 300   # 5 min pings for high volume
TOTAL_HOURS  = 12    # simulation window

# Broad Indian Ocean / Arabian Sea / North Indian Ocean
LAT_CENTER = 15.0
LON_CENTER = 70.0
LAT_SPAN   = 30.0   # Expanded: -5 to 35
LON_SPAN   = 50.0   # Expanded: 40 to 90

# ─── Vessel Registry ─────────────────────────────────────────────────────────
# Generating a large fleet of background global traffic
GLOBAL_FLEET = []

INDIAN_WARSHIPS = [
    "INS Vikrant", "INS Vikramaditya", "INS Visakhapatnam", "INS Surat",
    "INS Kolkata", "INS Chennai", "INS Arihant", "INS Trikand",
    "INS Talwar", "INS Tabar", "INS Shivalik", "INS Sahyadri",
    "INS Satpura", "INS Kamorta", "INS Kadmatt", "INS Kiltan",
    "INS Kavaratti", "INS Sumitra", "INS Saryu", "INS Sunayna",
    "INS Sagardhwani", "INS Deepak", "INS Shakti", "INS Delhi",
    "INS Mysore", "INS Mumbai", "INS Rana", "INS Ranvir"
]

INDIAN_COMMERCIAL = [
    "SCI Ratna", "Swarna Mala", "Swarna Pushp", "Swarna Jayanti",
    "Swarna Kamal", "SCI Kundan", "SCI Yamuna", "SCI Narmada",
    "m.v. Kavaratti", "m.v. Swaraj Dweep", "m.v. Corals", "SCI Ahimsa",
    "SCI Mukta", "SCI Saraswati", "Desh Bhakta", "Desh Shanti",
    "Desh Gaurav", "Desh Prem", "Desh Vishal", "SCI Alaknanda"
]

# India-Centric Traffic (Near Coast)
for i in range(40):
    v_name = INDIAN_WARSHIPS[i] if i < len(INDIAN_WARSHIPS) else f"{INDIAN_COMMERCIAL[i % len(INDIAN_COMMERCIAL)]} (IN)"
    v_type = "Naval Escort" if i < len(INDIAN_WARSHIPS) else random.choice(["Cargo", "Tanker", "Bulk"])
    GLOBAL_FLEET.append({
        "mmsi": f"41910{i:03d}",
        "name": v_name,
        "type": v_type,
        "flag": "IN",
        "length": random.randint(150, 280),
        "speed_kts": random.uniform(8, 14),
        "anomaly": None,
        "region": "INDIA_COASTAL"
    })

# Global Transit (Passing Through)
for i in range(60):
    c_name = INDIAN_COMMERCIAL[i % len(INDIAN_COMMERCIAL)]
    GLOBAL_FLEET.append({
        "mmsi": f"99800{i:03d}",
        "name": f"{c_name} #{i+1}",
        "type": random.choice(["Cargo", "Tanker", "Bulk"]),
        "flag": random.choice(["PA", "MH", "SG", "LR", "HK"]),
        "length": random.randint(200, 320),
        "speed_kts": random.uniform(12, 18),
        "anomaly": None,
        "region": "GLOBAL_INDIAN_OCEAN"
    })


# Current Anomalous Templates
ANOMALIES = [
    {"mmsi": "419004001", "name": "SHADOW TANKER ALPHA", "type": "Tanker", "length": 280, "flag": "XX", "speed_kts": 12.0, "anomaly": "sts_source", "region": "ARABIAN_SEA"},
    {"mmsi": "419004002", "name": "SHADOW TANKER BETA",  "type": "Tanker", "length": 270, "flag": "XX", "speed_kts": 12.0, "anomaly": "sts_receiver", "region": "ARABIAN_SEA"},
    {"mmsi": "419005001", "name": "GHOST FREIGHTER",     "type": "Cargo",  "length": 198, "flag": "KP", "speed_kts": 14.0, "anomaly": "dark_vessel", "region": "ARABIAN_SEA"},
    {"mmsi": "419005002", "name": "LOITER VESSEL",       "type": "Cargo",  "length": 145, "flag": "CN", "speed_kts":  8.0, "anomaly": "loitering", "region": "ARABIAN_SEA"},
    {"mmsi": "419005003", "name": "SPOOF MASTER",        "type": "Tanker", "length": 260, "flag": "XX", "speed_kts": 11.0, "anomaly": "spoofed", "region": "ARABIAN_SEA"},
]

VESSEL_TEMPLATES = GLOBAL_FLEET + ANOMALIES

# ─── Helper functions ─────────────────────────────────────────────────────────
def kts_to_deg_per_sec(kts: float) -> float:
    """Convert knots to approximate degrees per second (rough equirectangular)."""
    return kts * 0.000514444 / 111320  # 1 deg lat ≈ 111320 m

def bearing_to_delta(bearing_deg: float, speed_kts: float, dt_sec: float):
    """Convert bearing + speed to (dlat, dlon) displacement."""
    dist_m = speed_kts * 0.514444 * dt_sec
    dist_deg = dist_m / 111320
    rad = math.radians(bearing_deg)
    dlat = dist_deg * math.cos(rad)
    dlon = dist_deg * math.sin(rad)
    return dlat, dlon

def add_noise(value: float, sigma: float) -> float:
    return value + np.random.normal(0, sigma)

def generate_waypoints(vessel: Dict) -> List[Dict]:
    """Generate a realistic set of lat/lon waypoints based on vessel group."""
    v_type = vessel["type"]
    v_region = vessel.get("region", "ARABIAN_SEA")
    
    if v_region == "INDIA_COASTAL":
        # Near coast of India (68-75 Lon, 8-22 Lat)
        lat_s = random.uniform(8.0, 22.0)
        lon_s = random.uniform(70.0, 76.0)
        n_wps = random.randint(4, 8)
        wps = [{"lat": lat_s, "lon": lon_s}]
        for _ in range(n_wps):
            wps.append({
                "lat": wps[-1]["lat"] + random.uniform(-1.0, 1.0),
                "lon": wps[-1]["lon"] + random.uniform(-1.0, 1.0),
            })
    elif v_region == "GLOBAL_INDIAN_OCEAN":
        # Broad SLOC Transits (passing through)
        # Entry points: Hormuz (26, 56), Bab-el-Mandeb (12, 43), Malacca (5, 95)
        entry = random.choice([[26, 56], [12, 43], [5, 60]]) 
        exit_pt = random.choice([[20, 72], [10, 80], [-5, 75]]) # Towards India or Sunda
        
        wps = [{"lat": entry[0], "lon": entry[1]}]
        n_steps = 4
        for i in range(1, n_steps):
            frac = i / n_steps
            wps.append({
                "lat": entry[0] + (exit_pt[0] - entry[0]) * frac + random.uniform(-2, 2),
                "lon": entry[1] + (exit_pt[1] - entry[1]) * frac + random.uniform(-2, 2),
            })
        wps.append({"lat": exit_pt[0], "lon": exit_pt[1]})
    else:
        # Default Arabian Sea
        lat_s = LAT_CENTER + random.uniform(-LAT_SPAN/4, LAT_SPAN/4)
        lon_s = LON_CENTER + random.uniform(-LON_SPAN/4, LON_SPAN/4)
        wps = [{"lat": lat_s, "lon": lon_s}]
        n_wps = random.randint(3, 6)
        for _ in range(n_wps):
            wps.append({
                "lat": wps[-1]["lat"] + random.uniform(-1.5, 2.0),
                "lon": wps[-1]["lon"] + random.uniform(1.5, 3.5),
            })
    return wps

def interpolate_route(waypoints: List[Dict], speed_kts: float, step_sec: int, total_steps: int) -> List[Dict]:
    """Interpolate along waypoints at constant speed."""
    points = []
    cur_lat = waypoints[0]["lat"]
    cur_lon = waypoints[0]["lon"]
    wp_idx = 1

    for step in range(total_steps):
        if wp_idx >= len(waypoints):
            # Hold at last point or wrap
            wp_idx = len(waypoints) - 1

        target_lat = waypoints[wp_idx]["lat"]
        target_lon = waypoints[wp_idx]["lon"]
        dlat = target_lat - cur_lat
        dlon = target_lon - cur_lon
        dist = math.sqrt(dlat**2 + dlon**2)

        # Bearing
        bearing = math.degrees(math.atan2(dlon, dlat)) % 360

        # Move
        step_dist = kts_to_deg_per_sec(speed_kts) * step_sec
        if dist < step_dist:
            cur_lat, cur_lon = target_lat, target_lon
            wp_idx = min(wp_idx + 1, len(waypoints) - 1)
        else:
            ratio = step_dist / dist
            cur_lat += dlat * ratio
            cur_lon += dlon * ratio

        sog = speed_kts + np.random.normal(0, 0.3)
        cog = bearing + np.random.normal(0, 1.5)
        rot = np.random.normal(0, 0.5)
        draught = round(random.uniform(8.0, 14.0), 1)

        points.append({
            "lat": round(add_noise(cur_lat, 0.0001), 6),
            "lon": round(add_noise(cur_lon, 0.0001), 6),
            "sog": round(max(0, sog), 2),
            "cog": round(cog % 360, 1),
            "rot": round(rot, 2),
            "draught": draught,
            "nav_status": "Under Way Using Engine",
        })

    return points

# ─── Anomaly Injectors ────────────────────────────────────────────────────────

def inject_sts_transfer(points_a: List[Dict], points_b: List[Dict], start_step: int) -> tuple:
    """
    Make vessel B shadow vessel A at ~300m offset for 30 steps (1 hour),
    both drop to < 4 kts.
    """
    OFFSET_DEG = 0.003  # ~333m
    for i in range(start_step, min(start_step + 30, len(points_a))):
        ref = points_a[i]
        # Synchronize speed
        synced_sog = 2.5 + np.random.normal(0, 0.2)
        points_a[i]["sog"] = max(0, synced_sog)
        points_b[i]["lat"]  = round(ref["lat"] + OFFSET_DEG + np.random.normal(0, 0.0001), 6)
        points_b[i]["lon"]  = round(ref["lon"] + np.random.normal(0, 0.0001), 6)
        points_b[i]["sog"]  = max(0, synced_sog + np.random.normal(0, 0.1))
        points_b[i]["cog"]  = round(ref["cog"] + np.random.normal(0, 1), 1)
        points_b[i]["nav_status"] = "Moored"  # suspicious nav status
    return points_a, points_b


def inject_dark_vessel(points: List[Dict], start_step: int, gap_steps: int = 60) -> List[Dict]:
    """
    Remove AIS pings for gap_steps steps (dark period),
    then reappear significantly off the predicted course.
    """
    end_step = min(start_step + gap_steps, len(points))
    for i in range(start_step, end_step):
        points[i]["lat"]        = None
        points[i]["lon"]        = None
        points[i]["sog"]        = None
        points[i]["cog"]        = None
        points[i]["rot"]        = None
        points[i]["nav_status"] = "AIS_DROPOUT"

    # Reappear shifted (hidden maneuver occurred)
    if end_step < len(points) and start_step > 0:
        last_known = points[start_step - 1]
        points[end_step]["lat"] = round(last_known["lat"] + random.uniform(0.8, 1.5), 6)
        points[end_step]["lon"] = round(last_known["lon"] + random.uniform(-1.0, -0.5), 6)
        points[end_step]["nav_status"] = "Under Way Using Engine"

    return points


def inject_loitering(points: List[Dict], center_step: int, duration_steps: int = 90) -> List[Dict]:
    """
    Vessel circles slowly at < 2 kts around a fixed point for duration_steps.
    """
    if center_step >= len(points):
        return points
    anchor_lat = points[center_step]["lat"]
    anchor_lon = points[center_step]["lon"]
    radius_deg = 0.015  # ~1.5 km radius

    for i in range(center_step, min(center_step + duration_steps, len(points))):
        angle = (i - center_step) * (2 * math.pi / duration_steps)
        points[i]["lat"] = round(anchor_lat + radius_deg * math.sin(angle) + np.random.normal(0, 0.0002), 6)
        points[i]["lon"] = round(anchor_lon + radius_deg * math.cos(angle) + np.random.normal(0, 0.0002), 6)
        points[i]["sog"] = round(max(0.1, 1.2 + np.random.normal(0, 0.2)), 2)
        points[i]["cog"] = round(math.degrees(angle) % 360, 1)
        points[i]["nav_status"] = "Restricted Maneuverability"

    return points


def inject_spoofed_position(points: List[Dict], spoof_step: int) -> List[Dict]:
    """
    Teleport the vessel to an impossible position — catches physics-based validators.
    """
    if spoof_step >= len(points):
        return points
    # Jump ~4 degrees in one ping (physically impossible at any ship speed)
    points[spoof_step]["lat"] = round(points[spoof_step]["lat"] + random.uniform(3.5, 4.5), 6)
    points[spoof_step]["lon"] = round(points[spoof_step]["lon"] + random.uniform(-4.0, -3.0), 6)
    # Claim impossibly high speed
    points[spoof_step]["sog"] = round(random.uniform(45, 65), 2)
    points[spoof_step]["nav_status"] = "Under Way Using Engine"
    return points

# ─── Main Generator ───────────────────────────────────────────────────────────

def generate_vessel_track(vessel: Dict, total_steps: int) -> Dict:
    waypoints = generate_waypoints(vessel)
    points = interpolate_route(waypoints, vessel["speed_kts"], STEP_SECONDS, total_steps)
    return {
        "mmsi":     vessel["mmsi"],
        "name":     vessel["name"],
        "type":     vessel["type"],
        "flag":     vessel["flag"],
        "length_m": vessel["length"],
        "anomaly":  vessel["anomaly"],
        "points":   points,
    }


def main():
    total_steps = int(TOTAL_HOURS * 3600 / STEP_SECONDS)
    print(f"[AIS Simulator] Generating {TOTAL_HOURS}h of data → {total_steps} steps per vessel")

    # Build tracks for all vessels
    tracks_by_mmsi = {}
    for v in VESSEL_TEMPLATES:
        tracks_by_mmsi[v["mmsi"]] = generate_vessel_track(v, total_steps)

    # ── Inject Anomalies ──────────────────────────────────────────
    sts_start = int(total_steps * 0.35)  # around hour 4
    pts_a = tracks_by_mmsi["419004001"]["points"]
    pts_b = tracks_by_mmsi["419004002"]["points"]
    pts_a, pts_b = inject_sts_transfer(pts_a, pts_b, sts_start)
    tracks_by_mmsi["419004001"]["points"] = pts_a
    tracks_by_mmsi["419004002"]["points"] = pts_b
    print(f"  ✓  STS Transfer injected at step {sts_start}")

    dark_start = int(total_steps * 0.40)
    tracks_by_mmsi["419005001"]["points"] = inject_dark_vessel(
        tracks_by_mmsi["419005001"]["points"], dark_start, gap_steps=60
    )
    print(f"  ✓  Dark vessel dropout injected at step {dark_start}")

    loiter_start = int(total_steps * 0.25)
    tracks_by_mmsi["419005002"]["points"] = inject_loitering(
        tracks_by_mmsi["419005002"]["points"], loiter_start, duration_steps=90
    )
    print(f"  ✓  Port loitering injected at step {loiter_start}")

    spoof_step = int(total_steps * 0.55)
    tracks_by_mmsi["419005003"]["points"] = inject_spoofed_position(
        tracks_by_mmsi["419005003"]["points"], spoof_step
    )
    print(f"  ✓  AIS position spoof injected at step {spoof_step}")

    # ── Build AIS feed (flat time-indexed messages) ───────────────
    ais_messages = []
    for mmsi, track in tracks_by_mmsi.items():
        for step_idx, pt in enumerate(track["points"]):
            ts = START_TIME + timedelta(seconds=step_idx * STEP_SECONDS)
            if pt["lat"] is None:
                continue  # Simulate missing ping (dark period)
            ais_messages.append({
                "id":         str(uuid.uuid4()),
                "timestamp":  ts.isoformat() + "Z",
                "mmsi":       mmsi,
                "name":       track["name"],
                "type":       track["type"],
                "flag":       track["flag"],
                "length_m":   track["length_m"],
                "lat":        pt["lat"],
                "lon":        pt["lon"],
                "sog":        pt["sog"],
                "cog":        pt["cog"],
                "rot":        pt["rot"],
                "draught":    pt["draught"],
                "nav_status": pt["nav_status"],
                "anomaly_ground_truth": track["anomaly"],
            })

    # Sort by time
    ais_messages.sort(key=lambda x: x["timestamp"])

    # ── Write vessel registry ─────────────────────────────────────
    vessels_out = []
    for mmsi, track in tracks_by_mmsi.items():
        non_null = [p for p in track["points"] if p["lat"] is not None]
        vessels_out.append({
            "mmsi":     mmsi,
            "name":     track["name"],
            "type":     track["type"],
            "flag":     track["flag"],
            "length_m": track["length_m"],
            "anomaly_type": track["anomaly"],
            "total_pings":  len(non_null),
            "start_lat":    non_null[0]["lat"] if non_null else None,
            "start_lon":    non_null[0]["lon"] if non_null else None,
        })

    # ── Output JSON ───────────────────────────────────────────────
    vessels_path = OUTPUT_DIR / "vessels.json"
    feed_path    = OUTPUT_DIR / "ais_feed.json"

    with open(vessels_path, "w") as f:
        json.dump(vessels_out, f, indent=2)

    with open(feed_path, "w") as f:
        json.dump(ais_messages, f, indent=2)

    print(f"\n[AIS Simulator] ✅ Done!")
    print(f"  → vessels.json    : {len(vessels_out)} vessels")
    print(f"  → ais_feed.json   : {len(ais_messages):,} AIS messages")
    print(f"  → Saved to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
