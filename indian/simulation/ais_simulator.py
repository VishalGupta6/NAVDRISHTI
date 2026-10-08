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

# India-Centric Traffic (Coastal Sea Lanes & EEZ Patrols)
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

# Global Transit (International Shipping SLOCs)
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


# Targeted Anomalous Vessels (All in open sea / maritime anchorages)
ANOMALIES = [
    {"mmsi": "419004001", "name": "SHADOW TANKER ALPHA", "type": "Tanker", "length": 280, "flag": "XX", "speed_kts": 12.0, "anomaly": "sts_source", "region": "ARABIAN_SEA_STS"},
    {"mmsi": "419004002", "name": "SHADOW TANKER BETA",  "type": "Tanker", "length": 270, "flag": "XX", "speed_kts": 12.0, "anomaly": "sts_receiver", "region": "ARABIAN_SEA_STS"},
    {"mmsi": "419005001", "name": "GHOST FREIGHTER",     "type": "Cargo",  "length": 198, "flag": "KP", "speed_kts": 14.0, "anomaly": "dark_vessel", "region": "ARABIAN_SEA_DARK"},
    {"mmsi": "419005002", "name": "LOITER VESSEL",       "type": "Cargo",  "length": 145, "flag": "CN", "speed_kts":  8.0, "anomaly": "loitering", "region": "ARABIAN_SEA_LOITER"},
    {"mmsi": "419005003", "name": "SPOOF MASTER",        "type": "Tanker", "length": 260, "flag": "XX", "speed_kts": 11.0, "anomaly": "spoofed", "region": "ARABIAN_SEA_SPOOF"},
]

VESSEL_TEMPLATES = GLOBAL_FLEET + ANOMALIES

# ─── Maritime Corridors & Land Mask ──────────────────────────────────────────

# Polygon of the Indian Subcontinent landmass to guarantee no ship enters land
INDIA_LAND_POLYGON = [
    (24.5, 68.2), (24.0, 68.8), (23.5, 68.6),
    (23.0, 70.1), (22.8, 69.8), (22.3, 68.95), (21.6, 69.6), (20.7, 70.9), (20.85, 71.6), (21.75, 72.2),
    (22.2, 72.6), (21.2, 72.85), (20.4, 72.85),
    (19.5, 72.82), (18.95, 72.82), (18.0, 73.0), (17.0, 73.3), (16.0, 73.5),
    (15.5, 73.8), (14.5, 74.3), (13.5, 74.7), (12.8, 74.85),
    (11.5, 75.6), (10.0, 76.2), (9.0, 76.6), (8.1, 77.55),
    (8.8, 78.15), (9.25, 79.2), (10.3, 79.85), (10.8, 79.85), (11.5, 79.8), (13.1, 80.3),
    (14.5, 80.1), (15.8, 80.4), (16.2, 81.3), (17.0, 82.3), (17.7, 83.35),
    (19.3, 85.0), (20.3, 86.7), (21.5, 87.2),
    (21.7, 87.9), (22.2, 88.9),
    (24.0, 89.0), (26.5, 89.0), (28.0, 88.0), (30.0, 81.0), (32.0, 78.0), (35.0, 75.0),
    (34.0, 73.5), (30.0, 70.5), (27.0, 69.0), (25.0, 68.0), (24.5, 68.2)
]

SRI_LANKA_LAND_POLYGON = [
    (9.8, 80.2), (9.0, 79.8), (8.5, 79.8), (7.5, 79.8), (6.0, 80.2), (5.9, 80.5),
    (6.0, 81.0), (6.8, 81.8), (8.5, 81.3), (9.8, 80.2)
]

def point_in_polygon(lat: float, lon: float, poly: List[tuple]) -> bool:
    """Ray casting algorithm to check if (lat, lon) is inside a polygon."""
    inside = False
    n = len(poly)
    for i in range(n):
        lat1, lon1 = poly[i]
        lat2, lon2 = poly[(i + 1) % n]
        if ((lat1 > lat) != (lat2 > lat)) and (lon < (lon2 - lon1) * (lat - lat1) / (lat2 - lat1) + lon1):
            inside = not inside
    return inside

def is_in_water(lat: float, lon: float) -> bool:
    """Returns True if coordinate is strictly in water (outside Indian & Sri Lankan land)."""
    if point_in_polygon(lat, lon, INDIA_LAND_POLYGON):
        return False
    if point_in_polygon(lat, lon, SRI_LANKA_LAND_POLYGON):
        return False
    return True

# Standard Sea Lanes (all waypoints are strictly in water 15-40nm offshore)
WEST_COAST_LANE = [
    (22.30, 68.80), # Okha / Dwarka offshore
    (21.50, 69.35), # Porbandar offshore
    (20.65, 70.10), # Veraval offshore
    (20.30, 71.00), # Diu offshore
    (19.50, 72.00), # Gujarat / Maharashtra offshore
    (18.95, 72.35), # Mumbai High / Outer approaches
    (18.10, 72.55), # Murud offshore
    (16.90, 72.95), # Ratnagiri offshore
    (15.40, 73.45), # Goa (Mormugao) offshore
    (14.20, 74.05), # Karwar offshore
    (12.85, 74.45), # Mangalore offshore
    (11.25, 75.30), # Kozhikode offshore
    (9.90, 75.85),  # Kochi offshore
    (8.50, 76.55),  # Kollam offshore
    (7.75, 77.20),  # Kanyakumari SW offshore
]

EAST_COAST_LANE = [
    (7.75, 77.80),  # Kanyakumari SE offshore
    (8.70, 78.50),  # Tuticorin offshore
    (5.80, 80.50),  # South of Sri Lanka (Dondra Head)
    (7.50, 82.20),  # East of Sri Lanka
    (10.50, 80.30), # Nagapattinam offshore
    (13.10, 80.50), # Chennai offshore
    (15.50, 80.80), # Andhra coast offshore
    (17.65, 83.50), # Visakhapatnam offshore
    (19.80, 86.20), # Puri offshore
    (20.30, 87.00), # Paradip offshore
    (21.20, 88.30), # Kolkata Approaches / Sandheads
]

HORMUZ_TO_MUMBAI = [
    (26.40, 56.45), # Strait of Hormuz
    (24.80, 58.50), # Gulf of Oman
    (23.20, 60.50), # Ras al Hadd offshore
    (21.50, 64.00), # North Arabian Sea
    (19.80, 68.50), # Mumbai Approaches West
    (18.95, 72.35), # Mumbai Outer Anchorage
]

RED_SEA_TO_MUMBAI = [
    (12.60, 43.40), # Bab-el-Mandeb
    (13.00, 48.00), # Gulf of Aden
    (14.00, 54.00), # Socotra North
    (15.80, 62.00), # Central Arabian Sea
    (17.80, 68.00), # East Arabian Sea
    (18.95, 72.35), # Mumbai Outer Anchorage
]

MIDDLE_EAST_TO_MALACCA = [
    (24.00, 59.00), # Gulf of Oman exit
    (16.00, 64.00), # Arabian Sea
    (9.50, 71.50),  # Lakshadweep Sea
    (6.50, 76.50),  # South of Kanyakumari
    (5.60, 80.50),  # South of Sri Lanka
    (5.70, 87.00),  # South Bay of Bengal
    (5.80, 95.00),  # Malacca Strait Entrance (Great Channel)
]

RED_SEA_TO_MALACCA = [
    (12.60, 43.40), # Bab-el-Mandeb
    (11.50, 51.00), # Guardafui Channel
    (7.50, 65.00),  # Central Indian Ocean
    (5.80, 75.00),  # South of Maldives
    (5.60, 80.50),  # South of Sri Lanka
    (5.70, 88.00),  # Bay of Bengal South
    (5.80, 95.00),  # Great Channel
]

LAKSHADWEEP_LANE = [
    (10.57, 72.64), # Kavaratti
    (10.85, 72.18), # Agatti
    (10.20, 74.00), # Central Channel
    (9.90, 75.85),  # Kochi Outer Harbor
]

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

def safe_water_point(lat: float, lon: float) -> tuple:
    """Ensures a point stays in open water by adjusting westward/southward away from land if needed."""
    if is_in_water(lat, lon):
        return lat, lon
    # Push point westward into Arabian Sea or southward into Indian Ocean
    for step in range(1, 30):
        test_lon = lon - 0.2 * step
        if is_in_water(lat, test_lon):
            return lat, test_lon
    return lat, 70.0  # Fallback to Arabian Sea open water

def generate_waypoints(vessel: Dict) -> List[Dict]:
    """Generate a realistic set of lat/lon waypoints based on vessel group, strictly in maritime waters."""
    v_region = vessel.get("region", "INDIA_COASTAL")
    
    if v_region == "INDIA_COASTAL":
        # Pick a coastal corridor (West coast, East coast, or Lakshadweep)
        corridor_type = random.choice(["WEST", "WEST", "EAST", "LAKSHADWEEP", "PATROL"])
        if corridor_type == "WEST":
            base = WEST_COAST_LANE
            start_idx = random.randint(0, len(base) - 5)
            end_idx = min(len(base), start_idx + random.randint(4, 7))
            slice_pts = base[start_idx:end_idx]
            if random.random() < 0.5:
                slice_pts = list(reversed(slice_pts))
        elif corridor_type == "EAST":
            base = EAST_COAST_LANE
            start_idx = random.randint(0, len(base) - 5)
            end_idx = min(len(base), start_idx + random.randint(4, 6))
            slice_pts = base[start_idx:end_idx]
            if random.random() < 0.5:
                slice_pts = list(reversed(slice_pts))
        elif corridor_type == "LAKSHADWEEP":
            slice_pts = LAKSHADWEEP_LANE if random.random() < 0.5 else list(reversed(LAKSHADWEEP_LANE))
        else:
            # Arabian Sea Offshore EEZ Patrol (Naval Escorts)
            lat_base = random.uniform(14.0, 19.5)
            lon_base = random.uniform(69.0, 71.5)
            slice_pts = [
                (lat_base, lon_base),
                (lat_base + random.uniform(-1.0, 1.0), lon_base + random.uniform(-1.0, 0.8)),
                (lat_base + random.uniform(-1.5, 1.5), lon_base + random.uniform(-1.5, 0.5)),
                (lat_base, lon_base + 0.5)
            ]
        
        # Apply small lateral noise (±0.04 deg ~2.5 nm) to create parallel shipping traffic
        wps = []
        for p in slice_pts:
            lat_n = p[0] + random.uniform(-0.04, 0.04)
            lon_n = p[1] + random.uniform(-0.04, 0.04)
            lat_s, lon_s = safe_water_point(lat_n, lon_n)
            wps.append({"lat": lat_s, "lon": lon_s})
        return wps

    elif v_region == "GLOBAL_INDIAN_OCEAN":
        # Global transit through Indian Ocean SLOCs
        slocs = [
            HORMUZ_TO_MUMBAI,
            list(reversed(HORMUZ_TO_MUMBAI)),
            RED_SEA_TO_MUMBAI,
            list(reversed(RED_SEA_TO_MUMBAI)),
            MIDDLE_EAST_TO_MALACCA,
            list(reversed(MIDDLE_EAST_TO_MALACCA)),
            RED_SEA_TO_MALACCA,
            list(reversed(RED_SEA_TO_MALACCA)),
        ]
        chosen_sloc = random.choice(slocs)
        wps = []
        for p in chosen_sloc:
            lat_n = p[0] + random.uniform(-0.08, 0.08)
            lon_n = p[1] + random.uniform(-0.08, 0.08)
            lat_s, lon_s = safe_water_point(lat_n, lon_n)
            wps.append({"lat": lat_s, "lon": lon_s})
        return wps

    elif v_region == "ARABIAN_SEA_STS":
        # STS transfer route in international waters 200+ nm west of Mumbai
        return [
            {"lat": 17.20, "lon": 67.50},
            {"lat": 17.35, "lon": 67.85},
            {"lat": 17.50, "lon": 68.20},
            {"lat": 17.65, "lon": 68.55}
        ]

    elif v_region == "ARABIAN_SEA_DARK":
        # Dark vessel route in open Arabian Sea
        return [
            {"lat": 14.80, "lon": 62.50},
            {"lat": 15.60, "lon": 64.50},
            {"lat": 16.50, "lon": 66.50},
            {"lat": 17.20, "lon": 68.00}
        ]

    elif v_region == "ARABIAN_SEA_LOITER":
        # Loitering outside Mumbai Port anchorage (18 nm offshore in deep water)
        return [
            {"lat": 18.82, "lon": 72.35},
            {"lat": 18.83, "lon": 72.36},
            {"lat": 18.81, "lon": 72.34},
            {"lat": 18.82, "lon": 72.35}
        ]

    elif v_region == "ARABIAN_SEA_SPOOF":
        # Spoofing vessel route in open Arabian Sea
        return [
            {"lat": 16.00, "lon": 64.00},
            {"lat": 16.40, "lon": 64.80},
            {"lat": 16.80, "lon": 65.60},
            {"lat": 17.20, "lon": 66.40}
        ]

    else:
        # Default open Arabian Sea
        lat_s = random.uniform(13.0, 19.0)
        lon_s = random.uniform(62.0, 69.0)
        return [
            {"lat": lat_s, "lon": lon_s},
            {"lat": lat_s + random.uniform(-0.8, 0.8), "lon": lon_s + random.uniform(0.5, 1.5)},
            {"lat": lat_s + random.uniform(-1.2, 1.2), "lon": lon_s + random.uniform(1.5, 2.5)}
        ]

def interpolate_route(waypoints: List[Dict], speed_kts: float, step_sec: int, total_steps: int) -> List[Dict]:
    """Interpolate along waypoints at constant speed, keeping all coordinates strictly in water."""
    points = []
    cur_lat = waypoints[0]["lat"]
    cur_lon = waypoints[0]["lon"]
    wp_idx = 1

    for step in range(total_steps):
        if wp_idx >= len(waypoints):
            # Reverse or wrap along route
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

        # Validate against land
        safe_lat, safe_lon = safe_water_point(cur_lat, cur_lon)

        sog = speed_kts + np.random.normal(0, 0.3)
        cog = bearing + np.random.normal(0, 1.5)
        rot = np.random.normal(0, 0.5)
        draught = round(random.uniform(8.0, 14.0), 1)

        points.append({
            "lat": round(add_noise(safe_lat, 0.0001), 6),
            "lon": round(add_noise(safe_lon, 0.0001), 6),
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
    Make vessel B shadow vessel A at ~300m offset for 30 steps (1 hour) in open sea,
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
    then reappear significantly off the predicted course in open water.
    """
    end_step = min(start_step + gap_steps, len(points))
    for i in range(start_step, end_step):
        points[i]["lat"]        = None
        points[i]["lon"]        = None
        points[i]["sog"]        = None
        points[i]["cog"]        = None
        points[i]["rot"]        = None
        points[i]["nav_status"] = "AIS_DROPOUT"

    # Reappear shifted in open ocean (hidden maneuver occurred)
    if end_step < len(points) and start_step > 0:
        last_known = points[start_step - 1]
        reappear_lat = last_known["lat"] + random.uniform(0.5, 0.9)
        reappear_lon = last_known["lon"] + random.uniform(-0.8, -0.4)
        safe_lat, safe_lon = safe_water_point(reappear_lat, reappear_lon)
        points[end_step]["lat"] = round(safe_lat, 6)
        points[end_step]["lon"] = round(safe_lon, 6)
        points[end_step]["nav_status"] = "Under Way Using Engine"

    return points


def inject_loitering(points: List[Dict], center_step: int, duration_steps: int = 90) -> List[Dict]:
    """
    Vessel circles slowly at < 2 kts around a fixed point in offshore anchorage for duration_steps.
    """
    if center_step >= len(points):
        return points
    anchor_lat = points[center_step]["lat"]
    anchor_lon = points[center_step]["lon"]
    radius_deg = 0.015  # ~1.5 km radius

    for i in range(center_step, min(center_step + duration_steps, len(points))):
        angle = (i - center_step) * (2 * math.pi / duration_steps)
        pt_lat = anchor_lat + radius_deg * math.sin(angle) + np.random.normal(0, 0.0002)
        pt_lon = anchor_lon + radius_deg * math.cos(angle) + np.random.normal(0, 0.0002)
        safe_lat, safe_lon = safe_water_point(pt_lat, pt_lon)
        points[i]["lat"] = round(safe_lat, 6)
        points[i]["lon"] = round(safe_lon, 6)
        points[i]["sog"] = round(max(0.1, 1.2 + np.random.normal(0, 0.2)), 2)
        points[i]["cog"] = round(math.degrees(angle) % 360, 1)
        points[i]["nav_status"] = "Restricted Maneuverability"

    return points


def inject_spoofed_position(points: List[Dict], spoof_step: int) -> List[Dict]:
    """
    Teleport the vessel to an impossible position in open ocean — catches physics-based validators.
    """
    if spoof_step >= len(points):
        return points
    # Jump ~3 degrees westward/southward into open ocean
    spoof_lat = points[spoof_step]["lat"] + random.uniform(2.0, 3.0)
    spoof_lon = points[spoof_step]["lon"] - random.uniform(3.0, 4.0)
    safe_lat, safe_lon = safe_water_point(spoof_lat, spoof_lon)
    points[spoof_step]["lat"] = round(safe_lat, 6)
    points[spoof_step]["lon"] = round(safe_lon, 6)
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

