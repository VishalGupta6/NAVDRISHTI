import React, { useState, useEffect } from 'react';
import { 
  Shield, Activity, Info, Anchor, Users, Briefcase, 
  MapPin, Clock, AlertTriangle, ChevronLeft, ChevronRight, Search, List, MessageSquare, Send
} from 'lucide-react';

const VesselDetail = ({ vessel, alert, onClose, isVisible, onToggleVisible }) => {
  const [activeTab, setActiveTab] = useState('OVERVIEW'); // OVERVIEW | COMMS
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [commsMessages, setCommsMessages] = useState([]);
  const [newHqDirective, setNewHqDirective] = useState('');
  const [commsLoading, setCommsLoading] = useState(false);

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

    // Fast 1-second auto polling for zero-delay live sync across tabs
    const timer = setInterval(fetchComms, 1000);


    // Real-time WebSocket connection
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
          
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
            <div className="risk-score-badge" style={{ 
              background: (history?.risk_score || 0) > 70 ? 'rgba(239, 68, 68, 0.2)' : (history?.risk_score || 0) > 40 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.2)',
              border: `1px solid ${(history?.risk_score || 0) > 70 ? '#ef4444' : (history?.risk_score || 0) > 40 ? '#f59e0b' : '#38bdf8'}`,
              padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, color: (history?.risk_score || 0) > 70 ? '#ef4444' : (history?.risk_score || 0) > 40 ? '#f59e0b' : '#38bdf8'
            }}>
              RISK ASSESSMENT: {history?.risk_score || '0'}%
            </div>
            
            <div className="tactical-unit-label" style={{ 
              fontSize: '0.6rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '2px 8px', borderRadius: '4px', width: 'fit-content', color: '#38bdf8'
            }}>
               SYSTEM UNIT - {String(vessel.type || 'NAVY').toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Selector */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--panel-border)', background: 'rgba(15, 23, 42, 0.9)', alignItems: 'center' }}>
        <button 
          onClick={() => setActiveTab('OVERVIEW')} 
          style={{
            flex: 1, padding: '10px', background: 'transparent', border: 'none',
            borderBottom: activeTab === 'OVERVIEW' ? '2px solid #38bdf8' : '2px solid transparent',
            color: activeTab === 'OVERVIEW' ? '#38bdf8' : '#94a3b8',
            fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer'
          }}
        >
          OVERVIEW
        </button>
        <button 
          onClick={() => setActiveTab('COMMS')} 
          style={{
            flex: 1, padding: '10px', background: 'transparent', border: 'none',
            borderBottom: activeTab === 'COMMS' ? '2px solid #38bdf8' : '2px solid transparent',
            color: activeTab === 'COMMS' ? '#38bdf8' : '#94a3b8',
            fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}
        >
          <MessageSquare size={14} /> HQ COMMS ({commsMessages.length})
        </button>
        <button 
          onClick={onClose} 
          title="Hide Detail Panel"
          style={{
            padding: '10px 14px',
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


      {activeTab === 'OVERVIEW' ? (
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
          </div>

          {/* Activity Timeline */}
          <div style={{ padding: '1rem', borderTop: '1px solid var(--panel-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Activity Timeline</span>
              <Search size={16} color="#94a3b8" />
            </div>
            
            <div className="timeline-container custom-scrollbar" style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {timeline.map((event, idx) => (
                <div key={idx} className={`timeline-event ${event.severity === 'ALERT' ? 'risk' : ''}`}>
                  <span className="event-time">{event.time}</span>
                  <div>
                    <div className="event-desc">{event.desc}</div>
                    <div className="event-loc">{event.loc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* HQ COMMS TAB */
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(56, 189, 248, 0.08)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
             Direct 2-Way Encrypted Link with <strong>{vessel.name || `UNIT ${vessel.mmsi}`}</strong>
          </div>

          <form onSubmit={handleSendHqDirective} style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              placeholder="Send HQ tactical directive..." 
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
