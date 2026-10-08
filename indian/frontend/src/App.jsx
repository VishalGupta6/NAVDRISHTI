import React, { useState, useEffect } from 'react';
import Map from './components/Map/Map';
import AlertSidebar from './components/AlertSidebar/AlertSidebar';
import LinkAnalysis from './components/LinkAnalysis/LinkAnalysis';
import VesselDetail from './components/VesselDetail/VesselDetail';
import LockScreen from './components/LockScreen/LockScreen';
import ShipPortal from './components/ShipPortal/ShipPortal';
import {
  Map as MapIcon, Share2, ScanEye, Menu, ShieldAlert, Volume2,
  VolumeX, Clock, Search, List, AlertTriangle, Shield, ChevronRight, ChevronLeft,
  Layers as LayersIcon, Filter as FilterIcon, Settings, Target, Eye, Lock, Anchor, MessageSquare,
  Radio, Server
} from 'lucide-react';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('mda_authenticated') === 'true';
  });
  const [portalMode, setPortalMode] = useState('MAIN'); // 'MAIN' | 'SHIP'
  const [vessels, setVessels] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [selectedMmsi, setSelectedMmsi] = useState(null);
  const [stats, setStats] = useState(null);
  const [wsStatus, setWsStatus] = useState('Connecting');

  const [historyHours, setHistoryHours] = useState(0);
  const [historyData, setHistoryData] = useState([]);
  const [viewMode, setViewMode] = useState('MAP');
  const [isScanning, setIsScanning] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [hasCriticalThreat, setHasCriticalThreat] = useState(false);
  const [isAlarmSilenced, setIsAlarmSilenced] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [mapLayers, setMapLayers] = useState([]);
  const [activeLayers, setActiveLayers] = useState(['shoreline', 'maritime_region']);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCommsDrawerOpen, setIsCommsDrawerOpen] = useState(false);


  const searchResults = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];

    const allVessels = Object.values(vessels || {});
    return allVessels.filter(v =>
      (v.name && v.name.toLowerCase().includes(term)) ||
      (v.mmsi && v.mmsi.toString().includes(term))
    ).slice(0, 10);
  }, [searchTerm, vessels]);

  useEffect(() => {
    const fetchLiveData = () => {
      const ts = Date.now();
      fetch(`/api/anomalies/stats?_t=${ts}`, { cache: 'no-store' }).then(res => res.json()).then(setStats).catch(() => { });
      fetch(`/api/anomalies?_t=${ts}`, { cache: 'no-store' }).then(res => res.json()).then(data => setAlerts(data.alerts || [])).catch(() => { });
      fetch(`/api/vessels?_t=${ts}`, { cache: 'no-store' }).then(res => res.json()).then(data => {
        const vesselMap = {};
        const vesselList = Array.isArray(data) ? data : (Array.isArray(data?.vessels) ? data.vessels : []);
        vesselList.forEach(v => { if (v?.mmsi) vesselMap[v.mmsi] = v; });
        setVessels(prev => ({ ...vesselMap, ...prev }));
      }).catch(() => { });
    };

    fetchLiveData();
    const timer = setInterval(fetchLiveData, 3000);

    fetch('/api/vessels/layers').then(res => res.json()).then(data => {
      setMapLayers(Array.isArray(data) ? data : []);
    }).catch(e => console.error("Layers fetch:", e));

    return () => clearInterval(timer);
  }, []);


  useEffect(() => {
    const vesselList = vessels ? Object.values(vessels) : [];
    const critical = vesselList.some(v => v && v.severity === 'CRITICAL');
    setHasCriticalThreat(critical);
    if (!critical) setIsAlarmSilenced(false);
  }, [vessels]);

  useEffect(() => {
    if (historyHours > 0) {
      fetch(`/api/vessels/history?hours=${historyHours}`)
        .then(res => res.json())
        .then(data => setHistoryData(data.history || []));
    } else setHistoryData([]);
  }, [historyHours]);

  useEffect(() => {
    let ws;
    try {
      ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/live-feed`);
      ws.onopen = () => {
        // Show connecting animation for ~1 second before indicating Connected
        setWsStatus('Connecting');
        setTimeout(() => setWsStatus('Connected'), 1000);
      };
      ws.onclose = () => setWsStatus('Disconnected');
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg && msg.mmsi && msg.lat && msg.lon) {
            setVessels(prev => ({
              ...prev,
              [msg.mmsi]: { ...(prev?.[msg.mmsi] || {}), ...msg, is_live: true }
            }));
          }
        } catch (err) {
          console.warn("Tactical feed parse error:", err);
        }
      };
      ws.onerror = (err) => console.error("WS Tactical Error:", err);
    } catch (e) { console.error("WS Connection Failed:", e); }
    return () => ws?.close();
  }, []);


  const runDeepScan = async () => {
    setIsScanning(true);
    try {
      await fetch('/api/detect', { method: 'POST' });
      const statRes = await fetch('/api/anomalies/stats');
      setStats(await statRes.json());
    } finally {
      setTimeout(() => setIsScanning(false), 1200);
    }
  };

  const toggleLayer = (id) => {
    setActiveLayers(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleFleetExport = () => {
    setIsExporting(false); // Close Modal
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFillColor(11, 19, 30);
    doc.rect(0, 0, 297, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text("STRATEGIC FLEET INTELLIGENCE REPORT", 15, 25);
    const tableData = Object.values(vessels).map(v => [
      v.name || 'UNIT ' + v.mmsi, v.mmsi, v.imo || '---', v.type || '---', v.flag || '---',
      v.length ? `${v.length}m` : '---', v.dwt ? `${v.dwt}MT` : '---', v.year_build || '---', v.severity || 'NORMAL'
    ]);
    doc.autoTable({
      startY: 50,
      head: [["Name", "MMSI", "IMO", "Type", "Flag", "Length", "DWT", "Built", "Risk"]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [11, 19, 30] },
      styles: { fontSize: 8 }
    });
    doc.save(`Fleet_Strategic_Export.pdf`);
  };

  const [mapSideTab, setMapSideTab] = useState('LAYERS');
  const [layerOpacity, setLayerOpacity] = useState(0.6);

  const [isDetailVisible, setIsDetailVisible] = useState(true);

  if (portalMode === 'SHIP') {
    return <ShipPortal onSwitchToMainPortal={() => setPortalMode('MAIN')} />;
  }

  if (!isAuthenticated) {
    return (
      <LockScreen
        onUnlock={() => setIsAuthenticated(true)}
        onOpenShipPortal={() => setPortalMode('SHIP')}
      />
    );
  }

  return (
    <div className={`app-container ${isSidebarOpen ? '' : 'sidebar-closed'} ${hasCriticalThreat && !isAlarmSilenced ? 'alarm-active' : ''}`}>
      {/* HQ Comms Fleet Drawer Modal */}
      {isCommsDrawerOpen && (
        <div className="modal-overlay" onClick={() => setIsCommsDrawerOpen(false)}>
          <div className="tactical-modal glass-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px', width: '90%' }}>
            <div className="modal-header">
              <MessageSquare size={22} color="#38bdf8" />
              <h3>HQ Fleet Tactical Comms & Directives Console</h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Select any registered naval unit to open 2-way direct encrypted link and transmit tactical HQ directives:
              </p>

              <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                {Object.values(vessels || {}).slice(0, 15).map(v => (
                  <div
                    key={v.mmsi}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)',
                      padding: '10px 14px', borderRadius: '8px', cursor: 'pointer'
                    }}
                    onClick={() => {
                      setSelectedMmsi(v.mmsi);
                      setIsDetailVisible(true);
                      setIsCommsDrawerOpen(false);
                      setViewMode('MAP');
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.88rem', color: '#f8fafc', display: 'block' }}>{v.name || `UNIT ${v.mmsi}`}</strong>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>MMSI: {v.mmsi} • {v.type || 'Naval Unit'}</span>
                    </div>
                    <button style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid #38bdf8', color: '#38bdf8', padding: '4px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                      Open Comms Link
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setIsCommsDrawerOpen(false)}>CLOSE</button>
            </div>
          </div>
        </div>
      )}


      <header className="app-header glass-panel">
        <div className="header-left">
          <button className="icon-btn sidebar-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)}><Menu size={20} /></button>
          <h1 className="text-gradient">Indian Navy - NMDA</h1>
          <span className={`ws-status indicator-${wsStatus.toLowerCase()}`}><span className="dot"></span> {wsStatus}</span>
        </div>

        <div className="header-search">
          <div className="search-input-wrapper">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search Vessels (Name/MMSI)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setSearchTerm(''); }}
            />
          </div>
          {searchTerm && (
            <div className="search-results-dropdown glass-panel">
              {searchResults.length > 0 ? (
                searchResults.map(v => (
                  <div key={v.mmsi} className="search-result-item" onClick={() => {
                    setSelectedMmsi(v.mmsi);
                    setIsDetailVisible(true);
                    setSearchTerm('');
                    setViewMode('MAP');
                  }}>
                    <div className="res-info">
                      <span className="res-name">{v.name || 'UNIT ' + v.mmsi}</span>
                      <span className="res-mmsi">MMSI: {v.mmsi}</span>
                    </div>
                    <span className={`sev-dot ${v.severity}`}></span>
                    <ChevronRight size={14} />
                  </div>
                ))
              ) : (
                <div className="no-results">No vessels found matching "{searchTerm}"</div>
              )}
            </div>
          )}
        </div>

        <div className="view-toggle">
          <button className={`toggle-btn ${viewMode === 'MAP' ? 'active' : ''}`} onClick={() => setViewMode('MAP')}><MapIcon size={16} /> Geospatial</button>
          <button className={`toggle-btn ${viewMode === 'SEARCH' ? 'active' : ''}`} onClick={() => setViewMode('SEARCH')}><Search size={16} /> Search Engine</button>
          <button className={`toggle-btn ${viewMode === 'LINK' ? 'active' : ''}`} onClick={() => setViewMode('LINK')}><Share2 size={16} /> Analysis</button>
          <button
            className={`toggle-btn comms-btn ${isCommsDrawerOpen ? 'active' : ''}`}
            onClick={() => setIsCommsDrawerOpen(!isCommsDrawerOpen)}
            style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)', background: 'rgba(56, 189, 248, 0.1)' }}
          >
            <MessageSquare size={16} /> HQ Comms
          </button>
          <button className="toggle-btn ship-portal-btn" onClick={() => setPortalMode('SHIP')} style={{ color: '#00f2fe', borderColor: 'rgba(0,242,254,0.3)', background: 'rgba(0,242,254,0.08)' }}>
            <Anchor size={16} /> Ship Terminal
          </button>
        </div>



        <div className="header-stats">
          <button className="scan-btn" onClick={runDeepScan} disabled={isScanning}><ScanEye size={18} /> SCAN</button>
          {stats && (
            <React.Fragment>
              <div className="stat-pill"><span className="stat-val">{stats.total}</span><span className="stat-label">Units</span></div>
              <div className="stat-pill critical"><span className="stat-val">{stats.anomalous}</span><span className="stat-label">Risks</span></div>
            </React.Fragment>
          )}
          <button
            className="sidebar-toggle"
            onClick={() => {
              sessionStorage.removeItem('mda_authenticated');
              setIsAuthenticated(false);
            }}
            title="Lock Terminal"
            style={{ borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
          >
            <Lock size={18} />
          </button>
        </div>
      </header>

      <main className="app-content">
        {isScanning && <div className="scan-overlay"><div className="scan-line"></div></div>}
        <AlertSidebar alerts={alerts} selectedMmsi={selectedMmsi} onSelectAlert={(m) => { setSelectedMmsi(m); setIsDetailVisible(true); }} onClose={() => setIsSidebarOpen(false)} />

        <div className="main-view-area">
          {viewMode === 'MAP' ? (
            <div className="tactical-map-layout">
              <Map
                vessels={Object.values(vessels || {})}
                alerts={alerts}
                historyData={historyData}
                selectedMmsi={selectedMmsi}
                onSelectVessel={(m) => { setSelectedMmsi(m); setIsDetailVisible(true); }}
                activeLayers={activeLayers}
                layerOpacity={layerOpacity}
              />

              {/* Floating Restore Button - Only visible when tactical layers are hidden */}
              {!isSidebarOpen && (
                <button
                  className="sidebar-toggle-floating"
                  onClick={() => setIsSidebarOpen(true)}
                  title="Show Tactical Layers"
                >
                  <LayersIcon size={22} />
                </button>
              )}

              {/* Restore Vessel Detail Button */}
              {selectedMmsi && !isDetailVisible && (
                <button
                  className="detail-restore-btn"
                  onClick={() => setIsDetailVisible(true)}
                  title="Restore Vessel Intelligence"
                >
                  <Target size={22} />
                  <span style={{ fontSize: '0.65rem', fontWeight: 900, marginLeft: '6px' }}>SHOW</span>
                </button>
              )}

              <div className="tactical-sidebar glass-panel">
                <div className="sidebar-tabs">
                  <button className={mapSideTab === 'LAYERS' ? 'active' : ''} onClick={() => setMapSideTab('LAYERS')}><LayersIcon size={18} /><span>LAYERS</span></button>
                  <button className={mapSideTab === 'PATH' ? 'active' : ''} onClick={() => setMapSideTab('PATH')}><Target size={18} /><span>PATH</span></button>
                  <button className={mapSideTab === 'FILTER' ? 'active' : ''} onClick={() => setMapSideTab('FILTER')}><FilterIcon size={18} /><span>FILTER</span></button>

                  <div className="sidebar-hide-wrapper">
                    <button className="sidebar-hide-btn" onClick={() => setIsSidebarOpen(false)} title="Hide Layers Drawer">
                      <ChevronRight size={18} />
                      <span>HIDE</span>
                    </button>
                  </div>

                </div>

                <div className="tab-content custom-scrollbar">
                  {mapSideTab === 'LAYERS' && (
                    <React.Fragment>
                      <div className="tab-title">System Layers</div>
                      <div className="opacity-slider-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Layer Intensity</span>
                          <span style={{ fontSize: '0.65rem', color: '#38bdf8', fontWeight: 800 }}>{Math.round(layerOpacity * 100)}%</span>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.1"
                          value={layerOpacity}
                          onChange={(e) => setLayerOpacity(parseFloat(e.target.value))}
                          style={{ width: '100%', marginBottom: '1.5rem' }}
                        />
                      </div>
                      <div className="layer-list">
                        {(mapLayers || []).map(layer => (
                          <div key={layer.id} className={`layer-item ${activeLayers.includes(layer.id) ? 'active' : ''}`} onClick={() => toggleLayer(layer.id)}>
                            <div className="layer-dot" style={{ backgroundColor: layer.color }}></div>
                            <span>{layer.name}</span>
                            {layer.risk && <AlertTriangle size={12} color="#f59e0b" />}
                          </div>
                        ))}
                      </div>
                    </React.Fragment>
                  )}

                  {mapSideTab === 'PATH' && (
                    <div className="path-selection">
                      <div className="tab-title">Path Length</div>
                      <div className="radio-group">
                        {[
                          { label: '1 day', value: 24 },
                          { label: '7 days', value: 168 },
                          { label: '14 days', value: 336 },
                          { label: '30 days', value: 720 },
                          { label: '60 days', value: 1440 },
                          { label: '180 days', value: 4320 },
                          { label: '1 year', value: 8760 },
                          { label: 'Disable', value: 0 }
                        ].map(opt => (
                          <label key={opt.value} className="radio-item">
                            <input type="radio" name="pathlen" value={opt.value} checked={historyHours === opt.value} onChange={() => setHistoryHours(opt.value)} />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>

                      <div className="tab-title" style={{ marginTop: '1.2rem' }}>Route Layers</div>
                      <div className="layer-list">
                        {(mapLayers || [])
                          .filter(l => ['vessel_routes', 'maritime_region', 'strategic_corridors'].includes(l.id))
                          .map(layer => (
                            <div key={layer.id} className={`layer-item ${activeLayers.includes(layer.id) ? 'active' : ''}`} onClick={() => toggleLayer(layer.id)}>
                              <div className="layer-dot" style={{ backgroundColor: layer.color }}></div>
                              <span>{layer.name}</span>
                            </div>
                          ))
                        }
                      </div>

                      <div style={{ marginTop: '1rem', padding: '8px', background: 'rgba(56,189,248,0.07)', borderRadius: '6px', border: '1px solid rgba(56,189,248,0.15)', fontSize: '0.62rem', color: '#94a3b8', lineHeight: 1.7 }}>
                        <div style={{ color: '#38bdf8', fontWeight: 700, marginBottom: '4px' }}>PATH INTELLIGENCE</div>
                        <div>🛰️ Sat AIS window: <strong style={{ color: '#e2e8f0' }}>{historyHours}h</strong></div>
                        <div>🔁 Track refresh: <strong style={{ color: '#e2e8f0' }}>30s</strong></div>
                        <div>🎯 Prediction vector: <strong style={{ color: '#e2e8f0' }}>60 min</strong></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="playback-bar glass-panel">
                <div className="playback-info"><Clock size={16} color="#38bdf8" /><span>Mission Window: {historyHours}h Report</span></div>
              </div>
            </div>
          ) : viewMode === 'SEARCH' ? (
            <div className="search-engine-layout">
              <aside className="criteria-sidebar glass-panel">
                <div className="side-header"><h3>Query Configuration</h3></div>
                <div className="criteria-tabs"><button className="tab active">System Areas</button></div>
                <div className="side-filters custom-scrollbar">
                  <div className="filter-group">
                    <label>Vessel Technical Specs</label>
                    <div className="input-row">
                      <div className="input-group"><span>Length</span><input type="number" placeholder="Min" /></div>
                      <div className="input-group"><span>DWT</span><input type="number" placeholder="Min" /></div>
                    </div>
                  </div>
                  <button className="scan-btn" onClick={() => setIsExporting(true)} style={{ marginTop: '1rem', width: '100%', background: 'var(--accent-blue)', color: '#0b131e' }}>
                    <List size={16} /> EXPORT STRATEGIC DATA
                  </button>
                </div>
              </aside>

              <div className="search-results-main custom-scrollbar">
                <div className="search-header">
                  <h2>Strategic Fleet Scan: {Object.keys(vessels || {}).length} Targets</h2>
                </div>
                <div className="vessel-list-grid">
                  {Object.values(vessels || {}).map(v => (
                    <div key={v.mmsi} className="vessel-result-card" onClick={() => { setSelectedMmsi(v.mmsi); setIsDetailVisible(true); }}>
                      <div className="res-header">
                        <div className="name-box"><Target size={14} color="#38bdf8" /><strong>{v.name || 'UNIT ' + v.mmsi}</strong></div>
                        <span className={`sev-tag ${v.severity}`}>{v.severity}</span>
                      </div>
                      <div className="res-body">
                        <div className="spec-row"><span>IMO: {v.imo || '---'}</span><span>MMSI: {v.mmsi}</span><span>Length: {v.length}m</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="link-analysis-wrapper">
              <LinkAnalysis vessels={Object.values(vessels || {})} alerts={alerts} onSelectNode={(m) => { setSelectedMmsi(m); setIsDetailVisible(true); }} />
            </div>
          )}
        </div>

        {selectedMmsi && (
          <VesselDetail
            vessel={vessels[selectedMmsi]}
            alert={alerts.find(a => a.mmsi === selectedMmsi)}
            isVisible={isDetailVisible}
            onToggleVisible={() => setIsDetailVisible(!isDetailVisible)}
            onClose={() => { setSelectedMmsi(null); setIsDetailVisible(false); }}
          />
        )}
      </main>
    </div>
  );
}

export default App;
