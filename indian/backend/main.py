"""
Maritime Domain Awareness — FastAPI Backend
Main application entry point.

Endpoints:
  GET  /api/vessels            — list all vessels with risk scores
  GET  /api/vessels/{mmsi}     — vessel detail + track history
  GET  /api/anomalies          — all anomaly alerts
  GET  /api/anomalies/stats    — aggregate stats
  POST /api/detect             — trigger ML detection pipeline
  GET  /api/risk/{mmsi}        — detailed risk profile
  GET  /api/feed               — latest AIS messages (paginated)
  WS   /ws/live-feed           — real-time AIS message stream
  GET  /docs                   — Swagger UI
  GET  /redoc                  — ReDoc

Run with: uvicorn main:app --reload --port 8000
"""

import asyncio
import json
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
import logging
import os
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("main")

from routes.vessels   import router as vessels_router
from routes.anomalies import router as anomalies_router
from routes.risk      import router as risk_router
from services.detection_service import get_ais_feed, get_summary_stats
from services.live_bridge import AISLiveBridge
from contextlib import asynccontextmanager

# ─── Live Simulator & Satellite Bridge Setup ──────────────────────────────────
live_bridge = AISLiveBridge()
SIM_STEP = 0

async def live_fleet_simulator_loop():
    """
    Continuous real-time AIS tactical fleet simulator.
    Advances all 105 vessels synchronously along their navigational waypoints,
    updating the shared LIVE_BUFFER and broadcasting real-time updates to all clients.
    """
    global SIM_STEP
    from services.detection_service import FEED_PATH, LIVE_BUFFER, get_alert_by_mmsi, _load_list
    
    feed = _load_list(FEED_PATH)
    if not feed:
        logger.warning("No AIS feed found for live fleet simulator.")
        return

    # Count distinct vessels in feed to establish step size
    seen = set()
    for m in feed:
        seen.add(m.get("mmsi"))
    num_vessels = len(seen) or 105
    steps_total = max(1, len(feed) // num_vessels)

    logger.info(f"⚓ Live Fleet Simulator initialized: {num_vessels} vessels across {steps_total} steps.")

    while True:
        try:
            start_idx = (SIM_STEP % steps_total) * num_vessels
            end_idx = start_idx + num_vessels
            batch_pings = feed[start_idx:end_idx]
            now_iso = datetime.now(timezone.utc).isoformat()
            
            live_updates = []
            for ping in batch_pings:
                mmsi = str(ping.get("mmsi"))
                alert = get_alert_by_mmsi(mmsi)

                v_live = {
                    "mmsi": mmsi,
                    "name": ping.get("name") or f"UNIT {mmsi}",
                    "type": ping.get("type", "Cargo"),
                    "flag": ping.get("flag", "UN"),
                    "lat": ping.get("lat"),
                    "lon": ping.get("lon"),
                    "sog": ping.get("sog", 0.0),
                    "cog": ping.get("cog", 0.0),
                    "rot": ping.get("rot", 0),
                    "draught": ping.get("draught", 10.0),
                    "nav_status": ping.get("nav_status", "Under way using engine"),
                    "length_m": ping.get("length_m", 150),
                    "timestamp": now_iso,
                    "is_live": True,
                    "severity": alert.get("severity", "NORMAL") if alert else "NORMAL",
                    "risk_score": alert.get("risk_score", 0.0) if alert else 0.0,
                    "is_anomalous": alert.get("is_anomalous", False) if alert else False,
                    "anomaly_types": alert.get("anomaly_types", []) if alert else [],
                    "risk_categories": alert.get("risk_categories", []) if alert else [],
                }

                # Update backend LIVE_BUFFER so /api/vessels is always synchronized
                if mmsi not in LIVE_BUFFER:
                    LIVE_BUFFER[mmsi] = dict(v_live)
                    LIVE_BUFFER[mmsi]["trail"] = []
                else:
                    LIVE_BUFFER[mmsi].update(v_live)
                
                LIVE_BUFFER[mmsi]["last_lat"] = v_live["lat"]
                LIVE_BUFFER[mmsi]["last_lon"] = v_live["lon"]
                LIVE_BUFFER[mmsi]["last_sog"] = v_live["sog"]
                LIVE_BUFFER[mmsi]["last_cog"] = v_live["cog"]

                live_updates.append(v_live)

            # Broadcast batch update to all connected WebSocket tactical dashboards
            if manager.active and live_updates:
                batch_payload = json.dumps({
                    "type": "BATCH_UPDATE",
                    "step": SIM_STEP,
                    "count": len(live_updates),
                    "vessels": live_updates,
                    "timestamp": now_iso,
                })
                await manager.broadcast(batch_payload)

            SIM_STEP += 1
            await asyncio.sleep(1.5)  # 1.5 second tick interval for smooth glide
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Live simulation error: {e}")
            await asyncio.sleep(2.0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start live satellite feed and synchronized fleet simulator in background
    sim_task = asyncio.create_task(live_fleet_simulator_loop())
    bridge_task = asyncio.create_task(live_bridge.start())
    yield
    # Cleanup
    sim_task.cancel()
    live_bridge.stop()

# ─── App Setup ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Maritime Domain Awareness API",
    lifespan=lifespan,
    description="""
## 🛡️ Indian Navy — Maritime Domain Awareness (MDA) System

AI-powered REST API for real-time anomaly detection in maritime AIS data.

### Key Capabilities
- **Multi-sensor fusion**: AIS + SAR + RF + Optical data streams
- **DBSCAN clustering**: Unsupervised baseline shipping lane extraction
- **LSTM Autoencoder**: Kinematic anomaly detection via reconstruction error
- **Extended Kalman Filter**: Trajectory prediction and dropout divergence detection
- **Risk scoring**: Fused 0–100 risk score per vessel

### Anomaly Types Detected
| Type | Description |
|------|-------------|
| `DARK_VESSEL` | AIS dropout with trajectory divergence on reappearance |
| `STS_TRANSFER` | Parallel movement at <4 kts for >30 min (ship-to-ship transfer) |
| `PORT_LOITERING` | Circling at <2 kts outside anchorage zone |
| `POSITION_SPOOFING` | Physically impossible position jump between pings |
| `KINEMATIC_ANOMALY` | High LSTM Autoencoder reconstruction error |
| `ROUTE_DEVIATION` | Outside all DBSCAN normal shipping lane clusters |

### References
- Report: *Advanced Maritime Domain Awareness: AI-Driven Anomaly Detection*
- Indian Navy NMDA Project (BEL, 2025)
- NavIC / VCSS Integration (ISRO)
    """,
    version="1.0.0",
    contact={
        "name": "Indian Navy MDA Division",
        "url":  "https://indiannavy.nic.in",
    },
    license_info={
        "name": "Restricted — Government of India",
    },
    openapi_tags=[
        {"name": "Vessels",          "description": "Vessel registry and track history"},
        {"name": "Anomaly Detection","description": "ML-powered anomaly alerts and detection pipeline"},
        {"name": "Risk Profiles",    "description": "Detailed per-vessel risk analysis"},
        {"name": "Live Feed",        "description": "Real-time AIS data stream"},
        {"name": "Health",           "description": "System health and status endpoint"},
    ],
)

# CORS — allow the React dashboard on localhost / 127.0.0.1
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Include Routers ──────────────────────────────────────────────────────────
app.include_router(vessels_router)
app.include_router(anomalies_router)
app.include_router(risk_router)

# Direct fallback for mapping layers to resolve intermittent 404s

# ─── Root / Health ────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["Health"], summary="System health check")
def health_check():
    stats = get_summary_stats()
    return {
        "system":    "Maritime Domain Awareness API",
        "status":    "operational",
        "version":   "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "stats":     stats,
        "docs_url":  "/docs",
        "redoc_url": "/redoc",
    }


@app.get("/api/feed", tags=["Live Feed"], summary="Get latest AIS messages")
def get_feed(
    mmsi:   str = Query(None,  description="Filter by specific MMSI"),
    last_n: int = Query(100,   description="Number of recent messages to return", ge=1, le=2000),
):
    """Returns the most recent N AIS messages, optionally filtered by MMSI."""
    messages = get_ais_feed(mmsi=mmsi, last_n=last_n)
    return {"count": len(messages), "messages": messages}


# ─── WebSocket Manager ────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws) if hasattr(self.active, "discard") else None
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, msg: str):
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


@app.websocket("/ws/live-feed")
async def websocket_live_feed(websocket: WebSocket):
    """
    Real-time AIS tactical stream via WebSocket.
    Transmits initial live fleet state upon connection, and receives real-time 
    synchronized broadcast ticks from the background simulator.
    """
    await manager.connect(websocket)
    try:
        from services.detection_service import get_vessel_registry_enhanced
        initial_fleet = get_vessel_registry_enhanced()
        await websocket.send_text(json.dumps({
            "type": "BATCH_UPDATE",
            "step": SIM_STEP,
            "count": len(initial_fleet),
            "vessels": initial_fleet,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }))

        # Keep connection open for broadcasts; listen for client heartbeats or messages
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


# ─── Static Frontend Serving ──────────────────────────────────────────────────
# This serves the React 'dist' folder built with Vite.
# The search order is important: API routes -> Static Files -> 404 Fallback
frontend_path = Path(__file__).parent.parent / "frontend" / "dist"

if frontend_path.exists():
    logger.info(f"⚓ System: Mapping frontend assets from {frontend_path}")
    app.mount("/assets", StaticFiles(directory=frontend_path / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        # Prevent API routes from being swallowed by the frontend fallback
        if full_path.startswith("api/") or full_path.startswith("ws/"):
             return {"error": "Strategic API endpoint not found", "path": full_path}
             
        # Check if the requested file exists (e.g. logo, manifest)
        file_path = frontend_path / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        
        # SPA Fallback: Default to index.html for all React routes
        return FileResponse(frontend_path / "index.html")
else:
    logger.warning("⚠️ Warning: Frontend 'dist' directory not found. Proceeding in API-only mode.")


# ─── Entry Point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
