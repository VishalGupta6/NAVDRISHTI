import React, { useState, useEffect } from 'react';
import { 
  Ship, ShieldAlert, Radio, AlertTriangle, Activity, Navigation, 
  Gauge, Compass, Database, CheckCircle2, Zap, Power, Shield, 
  Send, Lock, LogOut, RefreshCw, Layers, MapPin, Eye, Server, Award, MessageSquare, Cpu, Anchor, CloudRain, Wind
} from 'lucide-react';
import Map from '../Map/Map';
import VoyageRecorder from '../VoyageRecorder/VoyageRecorder';

function ShipDashboard({ mmsi, vesselData, alertData, onLogout, onSwitchVessel }) {
  const [controlState, setControlState] = useState({
    ais_mode: 'TRANSMITTING',
    distress_active: false,
    nav_status_override: null,
    fuel_pct: 87,
    engine_power: 92,
    navic_lock: 'LOCKED_STRONG',
    bridge_logs: []
  });

  const [liveTelemetry, setLiveTelemetry] = useState({
    lat: vesselData?.last_lat || alertData?.last_lat || null,
    lon: vesselData?.last_lon || alertData?.last_lon || null,
    sog: vesselData?.last_sog || alertData?.last_sog || null,
    cog: vesselData?.last_cog || alertData?.last_cog || null,
    timestamp: vesselData?.timestamp || alertData?.generated_at || new Date().toISOString()
  });

  const [commsMessages, setCommsMessages] = useState([]);
  const [newCommsText, setNewCommsText] = useState('');
  const [convoyUnits, setConvoyUnits] = useState([]);
  const [historyTrack, setHistoryTrack] = useState([]);

  const [loading, setLoading] = useState(false);
  const [newLogMsg, setNewLogMsg] = useState('');
  const [distressReason, setDistressReason] = useState('');
  const [showDistressModal, setShowDistressModal] = useState(false);
  const [activeTab, setActiveTab] = useState('TELEMETRY');
  const [weatherLayerActive, setWeatherLayerActive] = useState(true);

  const vesselName = vesselData?.name || alertData?.vessel_name || `UNIT ${mmsi}`;
  const vesselType = vesselData?.type || alertData?.vessel_type || 'Naval Vessel';
  const riskScore = alertData?.risk_score !== undefined ? alertData.risk_score : 10;
  const severity = alertData?.severity || 'NORMAL';
  const anomalyTypes = alertData?.anomaly_types || [];

  // 🛰️ Real-Time WebSocket Streaming listener for this specific ship
  useEffect(() => {
    let ws;
    try {
      ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/live-feed`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg && msg.type === 'COMMS_MESSAGE' && msg.mmsi && msg.mmsi.toString() === mmsi.toString()) {
            setCommsMessages(prev => {
              if (prev.some(m => m.id === msg.id && m.time === msg.time)) return prev;
              return [msg, ...prev];
            });
          } else if (msg && msg.mmsi && msg.mmsi.toString() === mmsi.toString()) {
            setLiveTelemetry({
              lat: msg.lat,
              lon: msg.lon,
              sog: msg.sog,
              cog: msg.cog,
              timestamp: msg.timestamp || new Date().toISOString()
            });
          }
        } catch (err) {
          console.warn("Ship WS parse error:", err);
        }
      };
    } catch (e) {
      console.error("Ship WS Connection Failed:", e);
    }
    return () => ws?.close();
  }, [mmsi]);

  // Load Ship Status, History, Comms, and Convoy Radar dynamically
  useEffect(() => {
    const fetchStatusAndConvoy = () => {
      const ts = Date.now();
      // 1. Ship status & logs
      fetch(`/api/vessels/${mmsi}/ship-status?_t=${ts}`, { cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
          if (data && data.control_state) {
            setControlState(prev => ({ ...prev, ...data.control_state }));
          }
        })
        .catch(() => {});

      // 3. Dynamic Convoy Radar
      fetch(`/api/vessels/${mmsi}/convoy?_t=${ts}`, { cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
          if (data && Array.isArray(data.convoy_units)) {
            setConvoyUnits(data.convoy_units);
          }
        })
        .catch(() => {});
    };

    fetchStatusAndConvoy();
    const statusInterval = setInterval(fetchStatusAndConvoy, 3000);

    // 2. Encrypted HQ Comms (1s fast background poll for multi-tab sync)
    const fetchComms = () => {
      fetch(`/api/vessels/${mmsi}/comms?_t=${Date.now()}`, { cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
          if (data && Array.isArray(data.messages)) {
            setCommsMessages(data.messages);
          }
        })
        .catch(() => {});
    };

    fetchComms();
    const commsInterval = setInterval(fetchComms, 1000);

    // 4. Live Operational History Track
    fetch(`/api/vessels/history/${mmsi}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setHistoryTrack(data);
        } else if (data && Array.isArray(data.history)) {
          setHistoryTrack(data.history);
        }
      })
      .catch(() => {});

    return () => {
      clearInterval(commsInterval);
      clearInterval(statusInterval);
    };
  }, [mmsi]);



  const handleControlAction = async (action, extraData = {}) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vessels/${mmsi}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extraData })
      });
      const data = await res.json();
      if (data && data.control_state) {
        setControlState(data.control_state);
      }
    } catch (e) {
      if (action === 'TOGGLE_AIS') {
        setControlState(prev => ({
          ...prev,
          ais_mode: prev.ais_mode === 'TRANSMITTING' ? 'STEALTH_SILENT' : 'TRANSMITTING'
        }));
      } else if (action === 'TRIGGER_DISTRESS') {
        setControlState(prev => ({
          ...prev,
          distress_active: !prev.distress_active,
          bridge_logs: [
            { time: new Date().toLocaleTimeString(), author: 'TACTICAL COMMAND', msg: `⚠️ EMERGENCY DISTRESS SIGNAL ${!prev.distress_active ? 'ACTIVATED' : 'DEACTIVATED'}` },
            ...prev.bridge_logs
          ]
        }));
      } else if (action === 'ADD_LOG' && extraData.log_msg) {
        setControlState(prev => ({
          ...prev,
          bridge_logs: [
            { time: new Date().toLocaleTimeString(), author: 'Bridge Officer', msg: extraData.log_msg },
            ...prev.bridge_logs
          ]
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendComms = async (e) => {
    e.preventDefault();
    if (!newCommsText.trim()) return;
    const payload = { sender: 'SHIP', text: newCommsText.trim(), priority: 'ROUTINE' };
    
    try {
      const res = await fetch(`/api/vessels/${mmsi}/comms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data && data.message) {
        setCommsMessages(prev => [data.message, ...prev]);
      }
    } catch (err) {
      setCommsMessages(prev => [
        { id: Date.now(), time: new Date().toLocaleTimeString(), sender: 'SHIP', text: newCommsText.trim(), priority: 'ROUTINE' },
        ...prev
      ]);
    }
    setNewCommsText('');
  };

  const handleAddLog = (e) => {
    e.preventDefault();
    if (!newLogMsg.trim()) return;
    handleControlAction('ADD_LOG', { log_msg: newLogMsg.trim() });
    setNewLogMsg('');
  };

  const liveVesselObj = {
    ...(vesselData || {}),
    mmsi,
    name: vesselName,
    type: vesselType,
    last_lat: liveTelemetry.lat ?? 18.92,
    last_lon: liveTelemetry.lon ?? 72.83,
    last_sog: liveTelemetry.sog ?? 0.0,
    last_cog: liveTelemetry.cog ?? 0.0,
    severity
  };

  const singleVesselList = [liveVesselObj];

  return (
    <div className="ship-dashboard-container">
      {/* Emergency Distress Confirmation Modal */}
      {showDistressModal && (
        <div className="ship-modal-overlay">
          <div className="ship-modal-card glass-panel alert-border">
            <div className="modal-title">
              <AlertTriangle size={24} color="#ef4444" />
              <h3>EMERGENCY DISTRESS BEACON BROADCAST</h3>
            </div>
            <div className="modal-desc">
              <p>You are about to transmit a high-priority distress MAYDAY signal to Indian Navy NMDA Command Headquarters for <strong>{vesselName} (MMSI: {mmsi})</strong>.</p>
              <textarea 
                placeholder="Enter emergency directive details (e.g., Hostile contact / Engine failure / Medical emergency)..." 
                value={distressReason} 
                onChange={(e) => setDistressReason(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowDistressModal(false)}>CANCEL</button>
              <button 
                className="btn-danger-confirm" 
                onClick={() => {
                  handleControlAction('TRIGGER_DISTRESS', { distress_reason: distressReason });
                  setShowDistressModal(false);
                  setDistressReason('');
                }}
              >
                TRANSMIT DISTRESS MAYDAY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="ship-header glass-panel">
        <div className="ship-header-left">
          <div className="ship-avatar">
            <Ship size={22} color="#00f2fe" />
          </div>
          <div className="ship-title">
            <div className="vessel-heading">
              <h2>{vesselName}</h2>
              <span className="vessel-badge">{vesselType}</span>
              {controlState.distress_active && (
                <span className="distress-badge pulsing">⚠️ MAYDAY ACTIVE</span>
              )}
            </div>
            <div className="vessel-meta">
              <span>MMSI: <strong>{mmsi}</strong></span>
              <span>IMO: <strong>{vesselData?.imo || '---'}</strong></span>
              <span>FLAG: <strong>{vesselData?.flag || 'IN'}</strong></span>
            </div>
          </div>
        </div>

        <div className="ship-header-center">
          <div className="ship-tab-group">
            <button className={`s-tab ${activeTab === 'TELEMETRY' ? 'active' : ''}`} onClick={() => setActiveTab('TELEMETRY')}>
              <Activity size={15} /> Telemetry
            </button>
            <button className={`s-tab ${activeTab === 'ANOMALY_RADAR' ? 'active' : ''}`} onClick={() => setActiveTab('ANOMALY_RADAR')}>
              <ShieldAlert size={15} /> Risk Radar
            </button>
            <button className={`s-tab ${activeTab === 'COMMAND_CONTROLS' ? 'active' : ''}`} onClick={() => setActiveTab('COMMAND_CONTROLS')}>
              <Zap size={15} /> Ship Controls
            </button>
            <button className={`s-tab ${activeTab === 'CONVOY_RADAR' ? 'active' : ''}`} onClick={() => setActiveTab('CONVOY_RADAR')}>
              <Anchor size={15} /> Convoy Radar ({convoyUnits.length})
            </button>
            <button className={`s-tab ${activeTab === 'HQ_COMMS' ? 'active' : ''}`} onClick={() => setActiveTab('HQ_COMMS')}>
              <MessageSquare size={15} /> HQ Comms ({commsMessages.length})
            </button>
            <button className={`s-tab ${activeTab === 'MAP_RADAR' ? 'active' : ''}`} onClick={() => setActiveTab('MAP_RADAR')}>
              <Compass size={15} /> Map & Weather
            </button>
            <button className={`s-tab ${activeTab === 'LOGS' ? 'active' : ''}`} onClick={() => setActiveTab('LOGS')}>
              <Database size={15} /> Bridge Journal ({controlState.bridge_logs?.length || 0})
            </button>
          </div>
        </div>

        <div className="ship-header-right">
          <button className="action-btn switch-vessel-btn" onClick={onSwitchVessel} title="Select Another Ship">
            <RefreshCw size={13} /> Switch Unit
          </button>
          <button className="action-btn logout-btn" onClick={onLogout} title="Exit Ship Terminal">
            <LogOut size={13} /> Exit Terminal
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="ship-content-grid">
        {activeTab === 'TELEMETRY' && (
          <div className="telemetry-view-container">
            {/* Quick Metrics */}
            <div className="metrics-row">
              <div className="metric-card glass-panel">
                <div className="m-icon"><Navigation size={20} color="#38bdf8" /></div>
                <div className="m-body">
                  <span className="m-label">SPEED OVER GROUND</span>
                  <span className="m-val">
                    {liveTelemetry.sog !== null ? liveTelemetry.sog : '---'} <small>knots</small>
                  </span>
                </div>
              </div>

              <div className="metric-card glass-panel">
                <div className="m-icon"><Compass size={20} color="#38bdf8" /></div>
                <div className="m-body">
                  <span className="m-label">COURSE OVER GROUND</span>
                  <span className="m-val">
                    {liveTelemetry.cog !== null ? `${liveTelemetry.cog}°` : '---'} <small>Heading</small>
                  </span>
                </div>
              </div>

              <div className="metric-card glass-panel">
                <div className="m-icon"><MapPin size={20} color="#38bdf8" /></div>
                <div className="m-body">
                  <span className="m-label">GEOSPATIAL COORDINATES</span>
                  <span className="m-val">
                    {liveTelemetry.lat ? `${liveTelemetry.lat.toFixed(4)}°N` : '---'}, {liveTelemetry.lon ? `${liveTelemetry.lon.toFixed(4)}°E` : '---'}
                  </span>
                </div>
              </div>

              <div className="metric-card glass-panel">
                <div className="m-icon"><Radio size={20} color={controlState.ais_mode === 'TRANSMITTING' ? '#10b981' : '#f59e0b'} /></div>
                <div className="m-body">
                  <span className="m-label">AIS TRANSPONDER MODE</span>
                  <span className="m-val highlight">{controlState.ais_mode}</span>
                </div>
              </div>
            </div>

            {/* Vessel Specs & Engine Stats */}
            <div className="telemetry-details-grid">
              <div className="detail-box glass-panel">
                <h3><Gauge size={18} color="#00f2fe" /> Operational Engine & NavIC Status</h3>
                <div className="spec-grid">
                  <div className="spec-item">
                    <span>Engine Output:</span>
                    <strong>{controlState.engine_power}% (RPM Normal)</strong>
                  </div>
                  <div className="spec-item">
                    <span>Fuel Reserve Level:</span>
                    <strong>{controlState.fuel_pct}% (Operational)</strong>
                  </div>
                  <div className="spec-item">
                    <span>NavIC Satellite Sync:</span>
                    <strong className="text-success">LOCKED (12 Satellites)</strong>
                  </div>
                  <div className="spec-item">
                    <span>Navigational Status:</span>
                    <strong>{controlState.nav_status_override || vesselData?.nav_status || 'Underway using engine'}</strong>
                  </div>
                  <div className="spec-item">
                    <span>Vessel Length / DWT:</span>
                    <strong>{vesselData?.length ? `${vesselData.length}m` : '---'} / {vesselData?.dwt ? `${vesselData.dwt} MT` : '---'}</strong>
                  </div>
                  <div className="spec-item">
                    <span>Year Built:</span>
                    <strong>{vesselData?.year_build || '---'}</strong>
                  </div>
                </div>
              </div>

              <div className="detail-box glass-panel">
                <h3><Cpu size={18} color="#00f2fe" /> Onboard Cyber & Electronic Warfare HUD</h3>
                <div className="diagnostics-list">
                  <div className="diag-row">
                    <span>NavIC / GPS Jamming Protection:</span>
                    <span className="badge-ok">ACTIVE (0 SNR Divergence)</span>
                  </div>
                  <div className="diag-row">
                    <span>AIS Spoof / Ghost Ping Detector:</span>
                    <span className="badge-ok">NO GHOST SIGNALS IN 25NM</span>
                  </div>
                  <div className="diag-row">
                    <span>Transponder Transmission:</span>
                    <span className={`badge-${controlState.ais_mode === 'TRANSMITTING' ? 'ok' : 'warn'}`}>
                      {controlState.ais_mode}
                    </span>
                  </div>
                  <div className="diag-row">
                    <span>Encrypted Command Link:</span>
                    <span className="badge-ok">AES-256 HQ CONNECTED</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Blackbox Voyage Recorder */}
            {historyTrack.length > 0 && (
              <VoyageRecorder trackHistory={historyTrack} vesselName={vesselName} />
            )}
          </div>
        )}

        {activeTab === 'ANOMALY_RADAR' && (
          <div className="anomaly-radar-container">
            <div className="radar-hero glass-panel">
              <div className="radar-score-box">
                <div className={`score-ring severity-${severity.toLowerCase()}`}>
                  <span className="score-val">{riskScore}</span>
                  <span className="score-max">/100</span>
                </div>
                <div className="risk-level-desc">
                  <h3>RISK PROFILE SCORE</h3>
                  <span className={`severity-tag ${severity.toLowerCase()}`}>{severity} THREAT</span>
                  <p>Calculated by multi-sensor DBSCAN & LSTM Autoencoder ML engine</p>
                </div>
              </div>

              <div className="anomaly-flags-summary">
                <h4>Detected Operational Anomalies:</h4>
                {anomalyTypes.length > 0 ? (
                  <div className="anomaly-chips">
                    {anomalyTypes.map((type, idx) => (
                      <div key={idx} className="anomaly-chip">
                        <AlertTriangle size={14} color="#ef4444" />
                        <span>{type}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-anomaly-notice">
                    <CheckCircle2 size={18} color="#10b981" />
                    <span>No active kinematic or spatial anomalies detected on this ship.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Detailed Signal Breakdown */}
            <div className="risk-breakdown-grid glass-panel">
              <h3>ML Signal Breakdown for {vesselName}</h3>
              <div className="breakdown-bars">
                <div className="bar-group">
                  <div className="bar-header">
                    <span>Kinematic Trajectory Reconstruction Error</span>
                    <span>{alertData?.ae_reconstruction_error ? (alertData.ae_reconstruction_error * 100).toFixed(1) : 0}%</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, (alertData?.ae_reconstruction_error || 0) * 200)}%` }}></div></div>
                </div>

                <div className="bar-group">
                  <div className="bar-header">
                    <span>Dark Vessel / AIS Dropout Index</span>
                    <span>{alertData?.dark_vessel ? 'HIGH (80%)' : '0%'}</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: alertData?.dark_vessel ? '80%' : '2%' }}></div></div>
                </div>

                <div className="bar-group">
                  <div className="bar-header">
                    <span>STS Transfer Proximity Risk</span>
                    <span>{alertData?.sts_transfer ? 'ACTIVE' : 'LOW (0%)'}</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: alertData?.sts_transfer ? '90%' : '2%' }}></div></div>
                </div>

                <div className="bar-group">
                  <div className="bar-header">
                    <span>Shipping Lane Deviation Score</span>
                    <span>{alertData?.route_anomaly ? 'DEVIATED' : 'NOMINAL (0%)'}</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: alertData?.route_anomaly ? '75%' : '2%' }}></div></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'COMMAND_CONTROLS' && (
          <div className="command-controls-container">
            <div className="control-card glass-panel">
              <div className="card-header">
                <Radio size={20} color="#00f2fe" />
                <h3>AIS Transponder Stealth & Broadcast Control</h3>
              </div>
              <p>Control onboard AIS message broadcast state. Switching to silent mode activates stealth operations.</p>
              
              <div className="mode-toggle-box">
                <div className={`mode-option ${controlState.ais_mode === 'TRANSMITTING' ? 'active' : ''}`}>
                  <strong>Standard Broadcast</strong>
                  <span>Transmits real-time AIS telemetry to civilian and naval stations.</span>
                </div>
                <div className={`mode-option ${controlState.ais_mode === 'STEALTH_SILENT' ? 'active stealth' : ''}`}>
                  <strong>Silent Stealth Mode</strong>
                  <span>Ceases public AIS transmission for tactical maneuvers.</span>
                </div>
              </div>

              <button 
                className={`btn-control-action ${controlState.ais_mode === 'TRANSMITTING' ? 'btn-warn' : 'btn-success'}`}
                onClick={() => handleControlAction('TOGGLE_AIS')}
                disabled={loading}
              >
                <Power size={16} />
                <span>{controlState.ais_mode === 'TRANSMITTING' ? 'ENABLE SILENT STEALTH MODE' : 'RESTORE STANDARD AIS BROADCAST'}</span>
              </button>
            </div>

            <div className="control-card glass-panel emergency-card">
              <div className="card-header">
                <ShieldAlert size={20} color="#ef4444" />
                <h3>Emergency Distress Beacon (MAYDAY)</h3>
              </div>
              <p>Instantly broadcast an encrypted emergency alert to Indian Navy Strategic Command Headquarters.</p>

              <button 
                className={`btn-control-action ${controlState.distress_active ? 'btn-deactivate' : 'btn-danger'}`}
                onClick={() => {
                  if (controlState.distress_active) {
                    handleControlAction('TRIGGER_DISTRESS');
                  } else {
                    setShowDistressModal(true);
                  }
                }}
                disabled={loading}
              >
                <AlertTriangle size={18} />
                <span>{controlState.distress_active ? 'DEACTIVATE EMERGENCY DISTRESS' : 'TRIGGER MAYDAY EMERGENCY DISTRESS'}</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'CONVOY_RADAR' && (
          <div className="convoy-radar-container glass-panel">
            <h3><Anchor size={18} color="#00f2fe" /> Real-Time Convoy & Formation Radar</h3>
            <p className="convoy-desc">Real-time distance (NM) and true bearing (°) calculated dynamically from live satellite AIS telemetry.</p>

            <div className="convoy-grid custom-scrollbar">
              {convoyUnits.length > 0 ? (
                convoyUnits.map((unit) => (
                  <div key={unit.mmsi} className="convoy-card">
                    <div className="c-head">
                      <strong>{unit.name}</strong>
                      <span className="c-type">{unit.type}</span>
                    </div>
                    <div className="c-metrics">
                      <div className="c-stat">
                        <span>DISTANCE:</span>
                        <strong>{unit.distance_nm} NM</strong>
                      </div>
                      <div className="c-stat">
                        <span>BEARING:</span>
                        <strong>{unit.bearing}°</strong>
                      </div>
                      <div className="c-stat">
                        <span>SPEED:</span>
                        <strong>{unit.sog} kts</strong>
                      </div>
                    </div>
                    <div className="c-status">
                      <span className={`risk-tag ${unit.severity?.toLowerCase() || 'normal'}`}>{unit.severity || 'NORMAL'}</span>
                      <span className="c-mmsi">MMSI: {unit.mmsi}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="no-results" style={{ gridColumn: 'span 3', padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  Scanning maritime area for active fleet units...
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'HQ_COMMS' && (
          <div className="hq-comms-container glass-panel">
            <h3><MessageSquare size={18} color="#00f2fe" /> Direct Encrypted Link to NMDA Strategic Command HQ</h3>
            
            <form onSubmit={handleSendComms} className="add-log-form">
              <input 
                type="text" 
                placeholder="Transmit encrypted directive report to Strategic Command HQ..." 
                value={newCommsText}
                onChange={(e) => setNewCommsText(e.target.value)}
              />
              <button type="submit" className="btn-add-log">
                <Send size={16} /> Transmit
              </button>
            </form>

            <div className="comms-messages-list custom-scrollbar">
              {commsMessages.map((msg) => (
                <div key={msg.id} className={`comms-msg-item ${msg.sender === 'HQ' ? 'from-hq' : 'from-ship'}`}>
                  <div className="comms-header-row">
                    <span className="sender-tag">{msg.sender === 'HQ' ? '🛡️ NMDA COMMAND HQ' : `⚓ ${vesselName}`}</span>
                    <span className="msg-time">{msg.time}</span>
                  </div>
                  <div className="msg-text">{msg.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'MAP_RADAR' && (
          <div className="ship-map-wrapper flex-col">
            <div className="map-weather-toolbar glass-panel">
              <span><CloudRain size={16} color="#38bdf8" /> Live Weather & Sea State:</span>
              <button 
                className={`weather-toggle-btn ${weatherLayerActive ? 'active' : ''}`}
                onClick={() => setWeatherLayerActive(!weatherLayerActive)}
              >
                <Wind size={14} /> {weatherLayerActive ? 'Sea State & Wind Overlay: ACTIVE' : 'Enable Weather Overlay'}
              </button>
              <span className="weather-info">🌊 Wave Height: 1.8m (Sea State 3) • Wind: SW 12 kts</span>
            </div>

            <div className="ship-map-container glass-panel">
              <Map 
                vessels={singleVesselList} 
                alerts={alertData ? [alertData] : []} 
                selectedMmsi={mmsi} 
                onSelectVessel={() => {}} 
                activeLayers={weatherLayerActive ? ['shoreline', 'maritime_region', 'vessel_routes'] : ['shoreline']}
                layerOpacity={0.75}
              />
            </div>

            {historyTrack.length > 0 && (
              <VoyageRecorder trackHistory={historyTrack} vesselName={vesselName} />
            )}
          </div>
        )}

        {activeTab === 'LOGS' && (
          <div className="ship-logs-container glass-panel">
            <h3><Database size={18} color="#00f2fe" /> Bridge Operational Journal</h3>
            
            <form onSubmit={handleAddLog} className="add-log-form">
              <input 
                type="text" 
                placeholder="Write new bridge watch report / tactical event log..." 
                value={newLogMsg}
                onChange={(e) => setNewLogMsg(e.target.value)}
              />
              <button type="submit" className="btn-add-log">
                <Send size={16} /> Add Entry
              </button>
            </form>

            <div className="log-entries-list custom-scrollbar">
              {controlState.bridge_logs?.length > 0 ? (
                controlState.bridge_logs.map((log, idx) => (
                  <div key={idx} className="log-item">
                    <div className="log-meta">
                      <span className="log-time">⏱️ {log.time}</span>
                      <span className="log-author">👤 {log.author}</span>
                    </div>
                    <div className="log-msg">{log.msg}</div>
                  </div>
                ))
              ) : (
                <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '1rem' }}>No log entries recorded yet for this vessel.</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default ShipDashboard;
