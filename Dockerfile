# 🚢 Indian Navy - MDA Production Container
# Multi-stage build to keep the image slim, secure, and production-ready.

# --- Stage 1: Build the Frontend ---
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend

# Install dependencies (only copy package files first for caching)
COPY indian/frontend/package.json ./
RUN npm install

# Copy source and build
COPY indian/frontend/ ./
RUN npm run build

# --- Stage 2: Final Production Image ---
FROM python:3.11-slim
WORKDIR /app

# Set classification environment
ENV SYSTEM_STATUS="PRODUCTION"
ENV CLASSIFICATION="RESTRICTED"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies for ML libraries and OS-level operations
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    curl \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Project
COPY . .

# Copy the built frontend from Stage 1 into the backend's static directory
# We'll serve this via FastAPI (multi-service integration)
COPY --from=frontend-build /app/frontend/dist /app/indian/frontend/dist

# Expose the tactical port (Used by FastAPI/WebSocket)
EXPOSE 8000

# Metadata
LABEL maintainer="Indian Navy - NMDA Division"
LABEL version="1.0.0"

# Start the application using Uvicorn (Production mode)
# Serving from the 'indian/backend' directory
WORKDIR /app/indian/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
