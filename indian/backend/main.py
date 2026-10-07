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

# ─── Live Bridge Setup ────────────────────────────────────────────────────────
live_bridge = AISLiveBridge()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start live satellite feed in background
    asyncio.create_task(live_bridge.start())
    yield
    # Cleanup
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
    Real-time AIS message stream via WebSocket.
    Replays the pre-generated AIS feed at 1 message per 0.5 seconds,
    cycling through to simulate continuous live data.
    """
    await manager.connect(websocket)
    feed   = get_ais_feed(last_n=2000)
    if not feed:
        await websocket.send_text(json.dumps({"error": "No AIS data available. Run the simulator first."}))
        manager.disconnect(websocket)
        return

    idx = 0
    try:
        from services.detection_service import get_alert_by_mmsi
        while True:
            msg = feed[idx % len(feed)]
            mmsi = str(msg.get("mmsi"))
            
            # Enrich with real-time risk status from detection service
            alert = get_alert_by_mmsi(mmsi)
            
            # Stamp with current time for "live" feel and merge risk data
            msg_live = dict(msg)
            msg_live["timestamp"] = datetime.now(timezone.utc).isoformat()
            
            if alert:
                msg_live["severity"] = alert.get("severity", "NORMAL")
                msg_live["is_anomalous"] = alert.get("is_anomalous", False)
                msg_live["anomaly_types"] = alert.get("anomaly_types", [])

            await websocket.send_text(json.dumps(msg_live))
            idx += 1
            await asyncio.sleep(0.4)
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
