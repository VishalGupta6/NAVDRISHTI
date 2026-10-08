import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import 'leaflet/dist/leaflet.css'

// Global tactical authentication & clearance header interceptor
const originalFetch = window.fetch;
window.fetch = (url, options = {}) => {
  if (typeof url === 'string' && url.startsWith('/api/')) {
    const headers = new Headers(options.headers || {});
    const clearance = sessionStorage.getItem('mda_clearance') || 'NAVY2026';
    const shipKey = sessionStorage.getItem('ship_key') || '';
    const shipMmsi = sessionStorage.getItem('ship_mmsi') || '';
    if (!headers.has('X-Tactical-Clearance')) {
      headers.set('X-Tactical-Clearance', clearance);
    }
    if (shipKey && !headers.has('X-Ship-Key')) {
      headers.set('X-Ship-Key', shipKey);
    }
    if (shipMmsi && !headers.has('X-Ship-MMSI')) {
      headers.set('X-Ship-MMSI', shipMmsi);
    }
    return originalFetch(url, { ...options, headers });
  }
  return originalFetch(url, options);
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
