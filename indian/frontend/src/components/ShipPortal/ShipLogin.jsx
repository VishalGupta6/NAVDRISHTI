import React, { useState, useEffect } from 'react';
import { Anchor, Search, Lock, Eye, EyeOff, Shield, CheckCircle2, Ship } from 'lucide-react';
import './ShipPortal.css';

const DEFAULT_SHIP_PINS = ['SHIP2026', '0210', 'NAVY2026', '1234'];

function ShipLogin({ onLogin, onLoginSuccess, onSwitchToMain, onSwitchToMainCommand }) {
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [customMmsi, setCustomMmsi] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [vesselsList, setVesselsList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleBackToMain = onSwitchToMain || onSwitchToMainCommand || (() => {});
  const handleSuccess = onLogin || onLoginSuccess || (() => {});

  useEffect(() => {
    fetch('/api/vessels')
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (Array.isArray(data?.vessels) ? data.vessels : []);
        if (list.length > 0) {
          setVesselsList(list);
          setSelectedVessel(list[0]);
        }
      })
      .catch(() => {
        const fallbacks = [
          { mmsi: '419000101', name: 'INS Vikrant', type: 'Aircraft Carrier', severity: 'NORMAL' },
          { mmsi: '419000105', name: 'INS Chennai', type: 'Guided Missile Destroyer', severity: 'NORMAL' },
          { mmsi: '419000204', name: 'INS Kolkata', type: 'Stealth Destroyer', severity: 'NORMAL' },
          { mmsi: '419000123', name: 'INS Trikand', type: 'Guided Missile Frigate', severity: 'NORMAL' }
        ];
        setVesselsList(fallbacks);
        setSelectedVessel(fallbacks[0]);
      });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const activeMmsi = customMmsi.trim() || selectedVessel?.mmsi;
    
    if (!activeMmsi) {
      setError('Please select or enter a valid vessel MMSI');
      return;
    }
    if (!pin) {
      setError('Please enter Ship Access Key');
      return;
    }

    setIsLoading(true);
    setError('');

    setTimeout(() => {
      if (DEFAULT_SHIP_PINS.includes(pin.trim().toUpperCase()) || pin.trim() === activeMmsi.toString()) {
        sessionStorage.setItem('ship_authenticated', 'true');
        sessionStorage.setItem('ship_mmsi', activeMmsi.toString());
        sessionStorage.setItem('ship_key', pin.trim().toUpperCase());
        setIsLoading(false);
        const vesselObj = selectedVessel || { mmsi: activeMmsi, name: `SHIP ${activeMmsi}`, type: 'Naval Unit' };
        handleSuccess(activeMmsi.toString(), vesselObj);
      } else {
        setIsLoading(false);
        setError('Invalid Security Access Key');
        setPin('');
      }
    }, 350);
  };

  const filteredVessels = vesselsList.filter(v => 
    (v.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (v.mmsi || '').toString().includes(searchQuery)
  );

  return (
    <div className="clean-ship-login-wrapper">
      <div className="clean-ship-card">
        {/* Switch back to Main Command */}
        <div className="top-switch-bar">
          <span className="badge-title">⚓ SHIP OPERATIONS TERMINAL</span>
          <button type="button" className="btn-link-switch" onClick={handleBackToMain}>
            <Shield size={13} /> Main Command
          </button>
        </div>

        {/* Header */}
        <div className="ship-login-head">
          <h2>Shipboard Terminal Access</h2>
          <p>Indian Navy Onboard Tactical Operational System</p>
        </div>

        <form onSubmit={handleSubmit} className="clean-ship-form">
          {/* Step 1: Select Vessel Unit (Openly Displayed List) */}
          <div className="form-group">
            <label className="group-label">1. SELECT REGISTERED VESSEL UNIT ({vesselsList.length} UNITS)</label>
            
            <div className="search-box">
              <Search size={14} color="#64748b" />
              <input 
                type="text" 
                placeholder="Search naval unit by name or MMSI..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Scrollable Vessel List Openly Displayed */}
            <div className="vessels-select-list custom-scrollbar">
              {filteredVessels.length > 0 ? (
                filteredVessels.map(v => (
                  <div 
                    key={v.mmsi} 
                    className={`vessel-select-item ${selectedVessel?.mmsi === v.mmsi && !customMmsi ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedVessel(v);
                      setCustomMmsi('');
                    }}
                  >
                    <div className="v-info">
                      <strong>{v.name || `UNIT ${v.mmsi}`}</strong>
                      <span>MMSI: {v.mmsi} • {v.type || 'Vessel'}</span>
                    </div>
                    {selectedVessel?.mmsi === v.mmsi && !customMmsi && (
                      <CheckCircle2 size={16} color="#38bdf8" />
                    )}
                  </div>
                ))
              ) : (
                <div className="no-vessels-found">No matching naval units found</div>
              )}
            </div>

            <div className="or-divider"><span>OR ENTER CUSTOM MMSI</span></div>

            <input 
              type="text" 
              className="custom-mmsi-input"
              placeholder="Enter Custom MMSI..."
              value={customMmsi}
              onChange={(e) => {
                setCustomMmsi(e.target.value);
                if (e.target.value) {
                  setSelectedVessel(null);
                }
              }}
            />
          </div>

          {/* Step 2: Access Key */}
          <div className="form-group">
            <label className="group-label">2. SHIP SECURITY ACCESS KEY</label>
            <div className="clean-input-box">
              <input
                type={showPin ? 'text' : 'password'}
                placeholder="Enter Security Access Key..."
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  if (error) setError('');
                }}
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowPin(!showPin)}
                tabIndex={-1}
              >
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>


          {error && <div className="clean-error">{error}</div>}

          <button type="submit" className="clean-submit-btn" disabled={isLoading}>
            {isLoading ? 'CONNECTING...' : 'CONNECT TO SHIP TERMINAL'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ShipLogin;
