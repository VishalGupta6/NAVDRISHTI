# 🚢 Strategic Deployment Guide — Indian Navy NMDA

This system is now configured for a **"full-fledge"** deployment using industry-standard containerization and process management.

## 🏗️ Technical Architecture
- **Frontend**: React 18 (Vite, Leaflet, Lucide, Recharts)
- **Backend**: FastAPI (Python 3.11+)
- **Analysis**: ML Engine (DBSCAN, LSTM Autoencoders, Kalman Filters)
- **Persistence**: JSON-based tactical feeds (Prototype Mode)

## 🐳 Step 1: Containerized Deployment (Recommended)
The most robust way to deploy is using **Docker**. This ensures the ML environment (TensorFlow, Scikit-learn) is identical across all systems.

### Launch the Full Stack:
```bash
docker-compose up --build -d
```
This performs a multi-stage build:
1.  **Stage 1**: Compiles the React frontend into optimized static assets.
2.  **Stage 2**: Sets up the Python environment and integrates the frontend.
3.  **Result**: Serves the entire application on **port 8000**.

---

## 🛠️ Step 2: Deployment Platforms

### Option A: Render / Railway (Fastest)
1.  **Dashboard**: Create a "New Service" from your GitHub repo.
2.  **Environment**: Choose `Dockerfile` as the deployment method.
3.  **Port**: Set to `8000`.
4.  **Region**: Choose a region close to your target operational area (e.g., Mumbai, Singapore).

### Option B: Private VPS (Nginx + Systemd)
1.  **Cloning**: Clone repo to `/opt/indian-navy-mda`.
2.  **Environment**: Create a Python virtualenv and install `requirements.txt`.
3.  **Frontend**: Run `npm install && npm run build` in `indian/frontend`.
4.  **Service**: Create a systemd unit for `uvicorn main:app` in `indian/backend`.

---

## 📡 Networking & Access
- **Local Access**: [http://localhost:8000](http://localhost:8000)
- **API Status**: [http://localhost:8000/api/anomalies/stats](http://localhost:8000/api/anomalies/stats)
- **Real-time**: WebSocket `/ws/live-feed` must be enabled in proxy settings.

---
*Classification: RESTRICTED — Strategic Asset Deployment documentation*