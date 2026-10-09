import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, Activity, Info, Anchor, Users, Briefcase, 
  MapPin, Clock, AlertTriangle, ChevronLeft, ChevronRight, Search, List, MessageSquare, Send,
  Zap, Navigation, Compass, Radio, Plane, Crosshair
} from 'lucide-react';
import { calculateInterceptSolution } from '../../utils/interceptEngine';

const VesselDetail = ({ 
  vessel, 
  alert, 
  onClose, 
  isVisible, 
  onToggleVisible, 
  allVessels = [], 
  activeIntercept = null, 
  onSetIntercept = () => {} 
}) => {
  const [activeTab, setActiveTab] = useState('OVERVIEW'); // OVERVIEW | INTERCEPT | COMMS
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [commsMessages, setCommsMessages] = useState([]);
  const [newHqDirective, setNewHqDirective] = useState('');
  const [commsLoading, setCommsLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  // Compute AI Tactical Intercept Solution dynamically using active fleet positions
  const interceptSolution = useMemo(() => {
    return calculateInterceptSolution(vessel, allVessels);
  }, [vessel, allVessels]);

  const isInterceptActive = Boolean(
    activeIntercept && String(activeIntercept.targetMmsi) === String(vessel?.mmsi)
  );

  useEffect(() => {
    if (!vessel?.mmsi) return;

    setLoading(true);
    fetch(`/api/vessels/history/${vessel.mmsi}`)
      .then(res => res.json())
      .then(data => setHistory(data))
      .catch(err => console.error("History fetch error:", err))
      .finally(() => setLoading(false));

    const fetchComms = () => {
      fetch(`/api/vessels/${vessel.mmsi}/comms?_t=${Date.now()}`, { cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
          if (data && Array.isArray(data.messages)) {
            setCommsMessages(data.messages);
          }
        })
        .catch(() => {});
    };

    fetchComms();
    const timer = setInterval(fetchComms, 1500);

    let ws;
    try {
      ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/live-feed`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg && msg.type === 'COMMS_MESSAGE' && String(msg.mmsi) === String(vessel.mmsi)) {
            fetchComms();
          }
        } catch (err) {}
      };
    } catch (e) {}

    return () => {
      clearInterval(timer);
      ws?.close();
    };
  }, [vessel?.mmsi]);

  const handleToggleIntercept = () => {
    if (isInterceptActive) {
      onSetIntercept(null);
      setActionNotice('TACTICAL ORDER: Intercept mission cancelled. Units returning to standard patrol.');
    } else if (interceptSolution) {
      onSetIntercept(interceptSolution);
      setActionNotice(`⚡ ORDER DISPATCHED: ${interceptSolution.warshipName} assigned to intercept ${interceptSolution.targetName} at 26.0 kts.`);
    }
  };

  const handleScrambleAir = () => {
    setActionNotice(`✈️ AIR COMMAND: P-8I Poseidon MPA scrambled from INS Hansa (Goa) - ETA 22 mins to Target zone.`);
  };

  const handleBroadcastChallenge = () => {
    const warningText = `INDIAN NAVY TO VESSEL MMSI ${vessel.mmsi}: You are operating in Indian Sovereign EEZ without authorized declaration. Heave to and identify yourself immediately on VHF Channel 16.`;
    setCommsMessages(prev => [
      { id: Date.now(), time: new Date().toLocaleTimeString(), sender: 'HQ', text: warningText, priority: 'CRITICAL' },
      ...prev
    ]);
    setActiveTab('COMMS');
    setActionNotice(`📻 CHANNEL 16 WARNING BROADCAST: Maritime challenge issued to ${vessel.name || vessel.mmsi}.`);
  };

  const handleSendHqDirective = async (e) => {
    e.preventDefault();
    if (!newHqDirective.trim() || !vessel?.mmsi) return;
    setCommsLoading(true);
    const payload = { sender: 'HQ', text: newHqDirective.trim(), priority: 'ROUTINE' };

    try {
      const res = await fetch(`/api/vessels/${vessel.mmsi}/comms/send`, {
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
        { id: Date.now(), time: new Date().toLocaleTimeString(), sender: 'HQ', text: newHqDirective.trim(), priority: 'ROUTINE' },
        ...prev
      ]);
    } finally {
      setCommsLoading(false);
      setNewHqDirective('');
    }
  };

  if (!vessel) return null;

  const gridStats = [
    { label: 'Activity Baseline', count: history?.activity_baseline || 'NORMAL', icon: Activity },
    { label: 'Tactical Alerts', count: String(history?.tactical_alerts || '00').padStart(2, '0'), icon: Shield },
    { label: 'Ident Changes', count: history?.identity_changes || '0', icon: Info },
    { label: 'Port Entries', count: history?.port_entries || '0', icon: Anchor },
    { label: 'Log Records', count: history?.activity_count || '0', icon: Briefcase },
    { label: 'Meetings', count: '0', icon: Users },
  ];

  const timeline = history?.events || [];

  const handleExportPDF = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFillColor(11, 19, 30);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("TACTICAL VESSEL REPORT", 10, 25);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 150, 15);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.text(`Vessel Identity: ${vessel.name || 'UNKNOWN'}`, 10, 50);
    
    const details = [
      ["Parameter", "Value"],
      ["MMSI", vessel.mmsi],
      ["IMO", vessel.imo || '---'],
      ["Flag", vessel.flag || '---'],
      ["Length", `${vessel.length || '---'} m`],
      ["DWT", `${vessel.dwt || '---'} MT`],
      ["Built", vessel.year_build || '---'],
      ["Risk Level", alert?.severity || 'NORMAL']
    ];

    doc.autoTable({
      startY: 60,
      head: [details[0]],
      body: details.slice(1),
      theme: 'grid',
      headStyles: { fillColor: [56, 189, 248] }
    });

    doc.setFontSize(14);
    doc.text("MISSION ACTIVITY TIMELINE", 10, doc.lastAutoTable.finalY + 15);
    
    const events = timeline.map(e => [e.time, e.desc, e.loc]);
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 20,
      head: [["Time", "Activity Description", "Location/Sector"]],
      body: events,
      theme: 'striped'
    });

    doc.save(`Tactical_Report_${vessel.mmsi}.pdf`);
  };

  return (
    <div className={`premium-panel vessel-detail-panel custom-scrollbar ${!isVisible ? 'hidden' : ''}`}>
      {/* Tactical Header */}
      <div className="windward-header" style={{ 
        borderBottomColor: alert?.is_anomalous ? 'var(--accent-red)' : 'var(--accent-blue)',
        background: 'linear-gradient(to bottom, #0f172a, #0b131e)',
        height: '140px'
      }}>
        <div className="overlay">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
             <span className="windward-title" onClick={onToggleVisible} style={{ cursor: 'pointer' }}>
               <Shield size={20} color={alert?.is_anomalous ? "#ef4444" : "#38bdf8"} />
               {vessel.name?.toUpperCase() || 'UNKNOWN UNIT'}
             </span>
             <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={onToggleVisible} title="Minimize Panel" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '50%', padding: '4px', cursor: 'pointer' }}>
                  <ChevronRight size={20} />
                </button>
                <button onClick={onClose} title="Close Detail" style={{ background: 'rgba(239, 68, 68, 0.15)', border: 'none', color: '#ef4444', borderRadius: '50%', padding: '4px', cursor: 'pointer' }}>
                  <Info size={16} />
                </button>
             </div>
          </div>
          <p style={{ fontSize: '0.7rem', color: '#cbd5e1', fontWeight: 600 }}>IMO: {vessel.imo || '---'} | MMSI: {vessel.mmsi}</p>
          
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="risk-score-badge" style={{ 
              background: (history?.risk_score || alert?.risk_score || 0) > 70 ? 'rgba(239, 68, 68, 0.2)' : (history?.risk_score || alert?.risk_score || 0) > 40 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.2)',
              border: `1px solid ${(history?.risk_score || alert?.risk_score || 0) > 70 ? '#ef4444' : (history?.risk_score || alert?.risk_score || 0) > 40 ? '#f59e0b' : '#38bdf8'}`,
              padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, color: (history?.risk_score || alert?.risk_score || 0) > 70 ? '#ef4444' : (history?.risk_score || alert?.risk_score || 0) > 40 ? '#f59e0b' : '#38bdf8'
            }}>
              RISK: {Math.round(history?.risk_score || alert?.risk_score || 0)}%
            </div>
            
            {isInterceptActive && (
              <div style={{
                fontSize: '0.65rem',
                background: '#ef4444',
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 800,
                letterSpacing: '0.5px',
                boxShadow: '0 0 10px rgba(239, 68, 68, 0.6)'
              }}>
                ⚡ ACTIVE INTERCEPT ORDER
              </div>
            )}

            <div className="tactical-unit-label" style={{ 
              fontSize: '0.6rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '2px 8px', borderRadius: '4px', width: 'fit-content', color: '#38bdf8'
            }}>
               SYSTEM UNIT - {String(vessel.type || 'NAVY').toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Selector */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--panel-border)', background: 'rgba(15, 23, 42, 0.95)', alignItems: 'center' }}>
        <button 
          onClick={() => setActiveTab('OVERVIEW')} 
          style={{
            flex: 1, padding: '10px 6px', background: 'transparent', border: 'none',
            borderBottom: activeTab === 'OVERVIEW' ? '2px solid #38bdf8' : '2px solid transparent',
            color: activeTab === 'OVERVIEW' ? '#38bdf8' : '#94a3b8',
            fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer'
          }}
        >
          OVERVIEW
        </button>

        <button 
          onClick={() => setActiveTab('INTERCEPT')} 
          style={{
            flex: 1.2, padding: '10px 6px', background: 'transparent', border: 'none',
            borderBottom: activeTab === 'INTERCEPT' ? '2px solid #ef4444' : '2px solid transparent',
            color: activeTab === 'INTERCEPT' ? '#ef4444' : (isInterceptActive ? '#f87171' : '#cbd5e1'),
            fontWeight: 800, fontSize: '0.74rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
          }}
        >
          <Crosshair size={14} color={activeTab === 'INTERCEPT' || isInterceptActive ? "#ef4444" : "#94a3b8"} />
          <span>INTERCEPT</span>
          {isInterceptActive && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }}></span>}
        </button>

        <button 
          onClick={() => setActiveTab('COMMS')} 
          style={{
            flex: 1, padding: '10px 6px', background: 'transparent', border: 'none',
            borderBottom: activeTab === 'COMMS' ? '2px solid #38bdf8' : '2px solid transparent',
            color: activeTab === 'COMMS' ? '#38bdf8' : '#94a3b8',
            fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
          }}
        >
          <MessageSquare size={13} />
          <span>COMMS ({commsMessages.length})</span>
        </button>

        <button 
          onClick={onClose} 
          title="Hide Detail Panel"
          style={{
            padding: '10px 12px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: 'none',
            borderLeft: '1px solid var(--panel-border)',
            color: '#ef4444',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.72rem',
            fontWeight: 800
          }}
        >
          <span>HIDE</span>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div style={{
          background: 'rgba(34, 197, 94, 0.12)',
          borderBottom: '1px solid rgba(34, 197, 94, 0.3)',
          padding: '8px 12px',
          fontSize: '0.72rem',
          color: '#86efac',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>🛡️</span>
          <span>{actionNotice}</span>
          <button 
            onClick={() => setActionNotice(null)} 
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'OVERVIEW' && (
        <>
          <button className="scan-btn" onClick={handleExportPDF} style={{ margin: '1rem', width: 'calc(100% - 2rem)', background: 'var(--accent-blue)', color: '#0b131e', fontWeight: 700 }}>
             EXPORT TACTICAL REPORT
          </button>

          {/* Grid Stats */}
          <div className="operational-grid">
            {gridStats.map((stat, idx) => (
              <div key={idx} className="grid-item">
                <span className="count">{stat.count}</span>
                <span className="label">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Static Info Grid */}
          <div className="static-info-grid">
            <span className="info-label">FLAG</span> <span className="info-val">{vessel.flag || 'IN'}</span>
            <span className="info-label">IMO</span> <span className="info-val">{vessel.imo || '---'}</span>
            <span className="info-label">MMSI</span> <span className="info-val">{vessel.mmsi}</span>
            <span className="info-label">LENGTH</span> <span className="info-val">{vessel.length ? `${vessel.length}m` : '---'}</span>
            <span className="info-label">CLASS</span> <span className="info-val">{vessel.type || 'NAVAL'}</span>
            <span className="info-label">DWT</span> <span className="info-val">{vessel.dwt ? `${vessel.dwt} MT` : '---'}</span>
            <span className="info-label">SPEED</span> <span className="info-val">{vessel.sog || vessel.last_sog ? `${vessel.sog || vessel.last_sog} kts` : '---'}</span>
            <span className="info-label">COURSE</span> <span className="info-val">{vessel.cog || vessel.last_cog ? `${vessel.cog || vessel.last_cog}°` : '---'}</span>
          </div>

          {/* Mission Timeline */}
          <div className="timeline-container">
            <div className="timeline-header">
              <span className="timeline-title">MISSION ACTIVITY TIMELINE</span>
            </div>
            <div className="timeline-list">
              {timeline.length > 0 ? (
                timeline.map((event, idx) => (
                  <div key={idx} className="timeline-item">
                    <div className="timeline-time">{event.time}</div>
                    <div className="timeline-desc">{event.desc}</div>
                    <div className="timeline-loc">{event.loc}</div>
                  </div>
                ))
              ) : (
                <div style={{ color: '#64748b', fontSize: '0.75rem', padding: '10px 0' }}>
                  No anomalous mission events logged for this unit.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* TAB 2: AI TACTICAL INTERCEPT ENGINE */}
      {activeTab === 'INTERCEPT' && (
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {interceptSolution ? (
            <>
              {/* Target Header */}
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.68rem', color: '#fca5a5', fontWeight: 800 }}>DESIGNATED TARGET</span>
                  <span style={{ fontSize: '0.65rem', background: '#ef4444', color: '#fff', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                    {alert?.severity || 'ACTIVE THREAT'}
                  </span>
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>{vessel.name || `UNIT ${vessel.mmsi}`}</div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px', display: 'flex', gap: '12px' }}>
                  <span>SOG: <strong style={{ color: '#fff' }}>{vessel.sog || vessel.last_sog || 0} kts</strong></span>
                  <span>COG: <strong style={{ color: '#fff' }}>{vessel.cog || vessel.last_cog || 0}°</strong></span>
                  <span>MMSI: <strong style={{ color: '#fff' }}>{vessel.mmsi}</strong></span>
                </div>
              </div>

              {/* Nearest Interceptor Asset */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '8px',
                padding: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 800 }}>ASSIGNED NAVAL INTERCEPTOR</span>
                  <span style={{ fontSize: '0.65rem', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid #38bdf8', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                    NEAREST ASSET
                  </span>
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#e0f2fe' }}>⚓ {interceptSolution.warshipName}</div>
                
                {/* Tactical Metrics Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '10px' }}>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700 }}>DISTANCE TO TARGET</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8' }}>{interceptSolution.distanceNM} <span style={{ fontSize: '0.7rem' }}>NM</span></div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700 }}>INTERCEPT BEARING</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f59e0b' }}>{interceptSolution.bearingDeg}°</div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700 }}>INTERCEPT ETA</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ef4444' }}>{interceptSolution.etaFormatted}</div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700 }}>WARSHIP FLANK SPEED</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981' }}>{interceptSolution.flankSpeedKts} <span style={{ fontSize: '0.7rem' }}>kts</span></div>
                  </div>
                </div>

                {/* Projected Locus */}
                <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(239, 68, 68, 0.08)', border: '1px dashed rgba(239, 68, 68, 0.3)', borderRadius: '6px', fontSize: '0.72rem', color: '#fca5a5' }}>
                  🎯 Projected Intercept Locus: <strong>{interceptSolution.interceptCoords[0].toFixed(3)}°N, {interceptSolution.interceptCoords[1].toFixed(3)}°E</strong>
                </div>
              </div>

              {/* Operational Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={handleToggleIntercept}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    letterSpacing: '0.5px',
                    background: isInterceptActive ? '#ef4444' : 'linear-gradient(90deg, #0284c7, #0369a1)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: isInterceptActive ? '0 0 16px rgba(239, 68, 68, 0.5)' : '0 4px 12px rgba(2, 132, 199, 0.3)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Zap size={16} />
                  {isInterceptActive ? '🛑 CANCEL ACTIVE INTERCEPT' : '⚡ AUTHORIZE INTERCEPT VECTOR'}
                </button>

                <button
                  onClick={handleScrambleAir}
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    background: 'rgba(56, 189, 248, 0.1)',
                    color: '#38bdf8',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Plane size={15} /> ✈️ SCRAMBLE P-8I AIRBORNE RECON
                </button>

                <button
                  onClick={handleBroadcastChallenge}
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    background: 'rgba(245, 158, 11, 0.1)',
                    color: '#fbbf24',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Radio size={15} /> 📻 BROADCAST CH-16 NAVAL WARNING
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '0.8rem' }}>
              No naval intercept assets currently in range of target.
            </div>
          )}
        </div>
      )}

      {/* TAB 3: COMMS */}
      {activeTab === 'COMMS' && (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <form onSubmit={handleSendHqDirective} style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              placeholder="Transmit tactical directive..." 
              value={newHqDirective}
              onChange={(e) => setNewHqDirective(e.target.value)}
              style={{
                flex: 1, background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '6px', padding: '8px 12px', color: '#f8fafc', fontSize: '0.8rem', outline: 'none'
              }}
            />
            <button 
              type="submit" 
              disabled={commsLoading}
              style={{
                background: '#0284c7', border: 'none', color: '#ffffff', padding: '8px 14px',
                borderRadius: '6px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <Send size={14} /> Send HQ Order
            </button>
          </form>

          <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
            {commsMessages.map((msg) => (
              <div 
                key={msg.id} 
                style={{
                  padding: '8px 12px', borderRadius: '6px', fontSize: '0.8rem',
                  background: msg.sender === 'HQ' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.25)',
                  border: `1px solid ${msg.sender === 'HQ' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(2, 132, 199, 0.4)'}`,
                  alignSelf: msg.sender === 'HQ' ? 'flex-start' : 'flex-end',
                  width: '85%'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 800, marginBottom: '2px' }}>
                  <span style={{ color: msg.sender === 'HQ' ? '#38bdf8' : '#00f2fe' }}>
                    {msg.sender === 'HQ' ? '🛡️ NMDA COMMAND HQ' : `⚓ ${vessel.name || vessel.mmsi}`}
                  </span>
                  <span style={{ color: '#64748b' }}>{msg.time}</span>
                </div>
                <div style={{ color: '#f8fafc' }}>{msg.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '1rem', backgroundColor: 'rgba(0,0,0,0.2)' }}>
         <button 
           onClick={onToggleVisible} 
           style={{ 
             width: '100%', 
             padding: '12px', 
             backgroundColor: 'rgba(56, 189, 248, 0.1)', 
             border: '1px solid rgba(56, 189, 248, 0.3)', 
             color: '#38bdf8', 
             fontWeight: 800, 
             fontSize: '0.75rem',
             cursor: 'pointer',
             borderRadius: '6px',
             letterSpacing: '1px'
           }}
         >
           HIDE TACTICAL INTELLIGENCE
         </button>
      </div>
    </div>
  );
};

export default VesselDetail;
