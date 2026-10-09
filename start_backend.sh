#!/bin/bash

# Navigate to the backend directory
cd "$(dirname "$0")/indian/backend" || exit 1

# Check if port 8000 is already in use
if lsof -i :8000 > /dev/null; then
  echo "Port 8000 is already in use. Attempting to restart..."
  kill -9 $(lsof -t -i :8000)
fi

# Start the backend
echo "🚀 Starting Indian Navy Maritime Domain Awareness (MDA) Backend..."
python3 main.py
