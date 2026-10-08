#!/bin/bash
# 🚢 NAVDRISHTI - Local Automated Runner with VirtualEnv Isolation

echo "--------------------------------------------------------"
echo "🚀 INITIALIZING LOCAL DEPLOYMENT: NAVDRISHTI"
echo "--------------------------------------------------------"

cd "$(dirname "$0")"

# Ensure macOS Homebrew and standard system paths are accessible
export PATH=$PATH:/opt/homebrew/bin:/usr/local/bin

# 1. Automatically create and activate .venv if missing
if [ ! -d ".venv" ]; then
  echo "📦 Creating isolated Python virtual environment (.venv)..."
  python3 -m venv .venv
fi

echo "⚡ Activating virtual environment..."
source .venv/bin/activate

echo "📦 1/3: Installing Backend Dependencies..."
pip install -r requirements.txt --quiet

echo "🏗️  2/3: Building Frontend tactical dashboard..."
cd indian/frontend
npm install --silent
npm run build
cd ../..

echo "🌐 3/3: Starting System on Port 8000..."
cd indian/backend

# Free up port 8000 if occupied
if lsof -i :8000 > /dev/null 2>&1; then
  echo "⚠️ Port 8000 is occupied. Terminating old process..."
  kill -9 $(lsof -t -i :8000) 2>/dev/null || true
fi

export SYSTEM_STATUS="PRODUCTION"
export CLASSIFICATION="RESTRICTED"

python3 main.py
