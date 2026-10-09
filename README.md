# 🚢 NAVDRISHTI — Maritime Domain Awareness (MDA) Platform

An AI-powered Maritime Domain Awareness platform for real-time vessel tracking, multi-sensor kinematic fusion, and automated anomaly detection (Dark vessels, Ship-to-Ship transfers, position spoofing, route deviation, and loitering).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5.0+-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)

---

## 🧭 Executive Summary

**NAVDRISHTI** provides next-generation coastal and maritime surveillance by bridging raw Automatic Identification System (AIS) sensor streams with state-of-the-art Machine Learning models. The platform enables defense and maritime operators to detect suspicious maritime behaviors in real-time across the Indian Ocean Region (IOR).

### Key Operational Capabilities
- 🛰️ **Real-Time AIS Ingestion & Kinematic Smoothing**: High-frequency AIS telemetry broadcasting over WebSockets with Extended Kalman Filtering (EKF).
- 🚨 **AI Anomaly Detection Suite**: Detects dark vessels (transponder dropouts), erratic course deviations, loitering patterns, and suspicious proximity events.
- 🗺️ **Tactical Command & Control (C2) Map**: Interactive geospatial map powered by Leaflet, displaying live vessel markers, historical trajectory breadcrumbs, and risk heat maps.
- 🔐 **Tactical Clearance Lock Screen**: PIN-protected operational authentication for command-grade situational access.
- 📊 **Risk Scoring & Automated Profiling**: Dynamic multi-factor risk engine computing vessel risk indices from 0 to 100.

---

## 🏗️ System Architecture & Code Flow

The application follows a decoupled, high-performance architecture separating data streaming, asynchronous ML inference, and reactive frontend visualization.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        React Tactical Frontend                         │
│   Leaflet Geospatial Map  ───  Alert Feed  ───  Vessel Telemetry Card  │
│                WebSocket Live Stream ↕ REST API (/api/*)               │
├────────────────────────────────────────────────────────────────────────┤
│                         FastAPI Backend (:8000)                        │
│   ┌──────────────┐       ┌─────────────────┐       ┌────────────────┐  │
│   │ Vessels API  │       │  Anomalies API  │       │ Risk Profiles  │  │
│   └──────┬───────┘       └────────┬────────┘       └───────┬────────┘  │
│          └────────────────────────┼────────────────────────┘           │
│                    Detection Service Orchestrator                      │
│   ┌────────────────────┬─────────────────────┬─────────────────────┐   │
│   │ Extended Kalman    │ PyTorch Autoencoder │ Spatial DBSCAN      │   │
│   │ Filter (Tracking)  │ (Trajectory Deviat) │ (Loitering Clusters)│   │
│   └────────────────────┴─────────────────────┴─────────────────────┘   │
├────────────────────────────────────────────────────────────────────────┤
│                       Telemetry Engine & Bridge                        │
│             Synthetic AIS Generator / Live Feed Broadcaster            │
└────────────────────────────────────────────────────────────────────────┘
```

### End-to-End Data Pipeline Flow:
1. **Kinematic Telemetry Stream**: The AIS simulation engine (`indian/simulation/ais_simulator.py`) generates high-fidelity vessel trajectories with realistic speed, heading, draught, and MMSI tags.
2. **State Estimation & Noise Reduction**: An Extended Kalman Filter (`indian/ml_engine/kalman_filter.py`) estimates vessel coordinates, smoothing sensor noise and detecting dead-reckoning divergence during transponder blackouts.
3. **Deep Anomaly Scoring**: Normalized trajectory vectors pass through a deep Autoencoder (`indian/ml_engine/autoencoder.py`) calculating reconstruction loss to score deviation anomalies.
4. **Spatial Density Clustering**: Spatial DBSCAN (`indian/ml_engine/clustering.py`) detects localized vessel loitering and illegal Ship-to-Ship (STS) rendezvous outside registered shipping lanes.
5. **Real-time Broadcaster**: The FastAPI backend pushes updates over WebSocket (`/ws/live-feed`) to the React tactical map dashboard.

---

## 🔒 Security & Access Control

NAVDRISHTI enforces tactical access control upon startup:
- **Clearance Lock Screen**: Operators must authenticate before accessing live intelligence feeds.
- **Default Clearance Passcode**: `NAVY2026`
- **Session Locking**: Operators can click the red **Lock** icon in the dashboard header at any time to immediately lock the terminal.

---

## 🚀 Getting Started

### Prerequisites
- **Python**: `3.10` or higher (`python3 --version`)
- **Node.js**: `v18` or higher (`node -v` & `npm -v`)
- **Docker & Docker Compose** *(Optional, for containerized run)*

---

### Option 1: Automated Local Launch (Recommended)

Run the included automated launcher which creates an isolated virtual environment, installs dependencies, builds the frontend, and launches the server:

```bash
# 1. Clone the repository
git clone https://github.com/VishalGupta6/NAVDRISHTI.git
cd NAVDRISHTI

# 2. Execute the local deployment runner
bash run_local.sh
```

The system will be accessible at: **[http://localhost:8000](http://localhost:8000)**

---

### Option 2: Step-by-Step Manual Setup

#### 1. Setup Backend
```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install backend dependencies
pip install -r requirements.txt

# Start FastAPI server
cd indian/backend
python3 main.py
```

#### 2. Setup Frontend (New Terminal)
```bash
cd indian/frontend
npm install
npm run dev
```

Visit the frontend at **[http://localhost:5173](http://localhost:5173)** or the backend at **[http://localhost:8000](http://localhost:8000)**.

---

### Option 3: Docker Containerized Deployment

Deploy the entire stack with a single command:

```bash
# Build and run containers in detached mode
docker compose up --build -d
```

To stop:
```bash
docker compose down
```

---

## 🌐 API Reference & Access Points

| Endpoint | Protocol | Description |
|---|---|---|
| **`http://localhost:8000`** | HTTP | Tactical Command & Control (C2) Web Interface |
| **`http://localhost:8000/docs`** | HTTP | Interactive OpenAPI / Swagger Documentation |
| **`http://localhost:8000/redoc`** | HTTP | ReDoc Technical API Specification |
| **`http://localhost:8000/api/health`** | HTTP | Real-time health check & telemetry statistics |
| **`ws://localhost:8000/ws/live-feed`** | WebSocket | High-frequency AIS vessel broadcast stream |

### Primary API Route Groups:
- **`/api/vessels`**: Vessel registry, historical breadcrumbs, track interpolation, and communication status.
- **`/api/anomalies`**: Live and historical anomaly detection alerts with severity classification.
- **`/api/risk`**: Quantitative vessel risk profiles with breakdown of individual ML signal factors.

---

## 📁 Repository Directory Structure

```
NAVDRISHTI/
├── README.md               # Master system documentation & architecture guide
├── LICENSE                 # Open-source MIT License
├── requirements.txt        # Top-level Python dependencies
├── Dockerfile              # Multi-stage container build definition
├── docker-compose.yml      # Multi-container orchestration spec
├── render.yaml             # Render cloud deployment specification
├── vercel.json             # Vercel frontend routing configuration
├── run_local.sh            # Automated local runner with virtualenv isolation
├── run_mda.sh              # One-click Docker stack runner
├── .github/
│   └── workflows/
│       └── ci.yml          # GitHub Actions CI pipeline (Backend test + Vite build)
└── indian/
    ├── backend/            # FastAPI core application & WebSocket bridge
    │   ├── main.py         # App initialization & WebSocket manager
    │   ├── models.py       # Pydantic data schemas
    │   ├── auth.py         # Passcode clearance authentication
    │   ├── routes/         # REST API routers (vessels, anomalies, risk)
    │   └── services/       # Detection orchestrator & live streaming bridge
    ├── frontend/           # Tactical React C2 dashboard
    │   ├── src/
    │   │   ├── components/ # Leaflet Map, AlertSidebar, RiskPanel, LockScreen
    │   │   ├── App.jsx     # Main tactical application state controller
    │   │   └── index.css   # Dark military-grade UI styling tokens
    │   └── package.json    # Frontend dependency manifests
    ├── ml_engine/          # Machine Learning algorithms & models
    │   ├── autoencoder.py  # PyTorch reconstruction anomaly detector
    │   ├── kalman_filter.py# Extended Kalman Filter trajectory estimator
    │   ├── clustering.py   # DBSCAN loitering & rendezvous clustering
    │   └── anomaly_scorer.py# Multi-model anomaly fusion engine
    └── simulation/         # Synthetic AIS generation
        ├── ais_simulator.py# Kinematic vessel motion generator
        └── data/           # AIS feeds and vessel registry
```

---

## 🤝 Contributing & Code of Conduct

Contributions from the open-source community are warmly welcomed!

1. **Fork** the repository: `https://github.com/VishalGupta6/NAVDRISHTI`
2. **Create a Feature Branch**: `git checkout -b feat/your-feature-name`
3. **Commit your changes**: `git commit -m "feat: description of changes"`
4. **Push to branch**: `git push origin feat/your-feature-name`
5. **Open a Pull Request** describing your additions and linking relevant issues.

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.
