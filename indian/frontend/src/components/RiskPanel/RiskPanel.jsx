import React, { useState, useEffect } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import './RiskPanel.css';

const RiskPanel = ({ mmsi, onClose, liveData }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSirep, setShowSirep] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/risk/${mmsi}`)
      .then(res => res.json())
      .then(data => {
        setProfile(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching risk profile:', err);
        setLoading(false);
      });
  }, [mmsi]);

  if (loading) {
    return (
      <div className="risk-panel glass-panel loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="risk-panel glass-panel error">
        <h3>Error loading profile</h3>
        <button className="btn btn-outline" onClick={onClose}>Close</button>
      </div>
    );
  }

  const { signal_breakdown, track_history } = profile;

  // Prepare radar chart data
  const radarData = [
    { subject: 'Kinematic Anomaly', A: signal_breakdown.kinematic_anomaly_score, fullMark: 10 },
    { subject: 'Dark Vessel', A: signal_breakdown.dark_vessel_score, fullMark: 10 },
    { subject: 'STS Transfer', A: signal_breakdown.sts_transfer_score, fullMark: 10 },
    { subject: 'Route Deviation', A: signal_breakdown.route_deviation_score, fullMark: 10 },
    { subject: 'Port Loitering', A: signal_breakdown.loitering_score, fullMark: 10 },
    { subject: 'Position Spoofed', A: signal_breakdown.spoofing_score, fullMark: 10 },
  ];

  // Prepare speed chart data
  const speedData = track_history.map(pt => ({
    time: new Date(pt.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    sog: pt.sog
  }));

  const severityClass = profile.severity.toLowerCase();

  return (
    <div className="risk-panel glass-panel">
      <div className="panel-header">
        <div>
          <h2>Vessel Risk Profile</h2>
          <span className="mmsi-subtitle">MMSI: {profile.mmsi}</span>
        </div>
        <div className="header-actions">
          <button className="sirep-btn" onClick={() => setShowSirep(!showSirep)}>
            {showSirep ? 'CLOSE REPORT' : 'GENERATE SIREP'}
          </button>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
      </div>

      {showSirep ? (
        <div className="sirep-container custom-scrollbar">
          <div className="sirep-header">
            <h3>TACTICAL SITUATION REPORT (SIREP)</h3>
            <div className="sirep-meta">
              <span>REF ID: {Math.random().toString(36).substring(7).toUpperCase()}</span>
              <span>DATE: {new Date().toLocaleDateString()}</span>
              <span>CLASSIFICATION: RESTRICTED // NAVAL OPS</span>
            </div>
          </div>
          
          <div className="sirep-body">
            <section>
              <h4>1. TARGET IDENTIFICATION</h4>
              <p>VESSEL NAME: {profile.vessel_name}</p>
              <p>MMSI IDENTIFIER: {profile.mmsi}</p>
              <p>FLAG STATE: {profile.flag}</p>
              <p>HULL TYPE: {profile.vessel_type}</p>
            </section>
            
            <section>
              <h4>2. KINEMATIC ANALYSIS</h4>
              <p>LAST KNOWN POS: {profile.last_lat.toFixed(4)}, {profile.last_lon.toFixed(4)}</p>
              <p>CURRENT SOG: {profile.last_sog} KTS</p>
              <p>CURRENT COG: {profile.last_cog}°</p>
            </section>
            
            <section>
              <h4>3. ANOMALY & THREAT VECTOR</h4>
              <p>AGGREGATE THREAT SCORE: {Math.round(profile.risk_score)}%</p>
              <p>SEVERITY RATING: {profile.severity}</p>
              <p>DETECTED VECTORS: {profile.anomaly_types.join(', ').replace(/_/g, ' ')}</p>
            </section>
            
            <section>
              <h4>4. COMMAND RECOMMENDATION</h4>
              <p className="recommendation-text">
                {profile.risk_score > 80 
                  ? "ACTION: URGENT INTERCEPT RECOMMENDED. ASSET POSITIONING REQUIRED." 
                  : "ACTION: CONTINUE PERSISTENT MONITORING. NO IMMEDIATE ESCALATION."}
              </p>
            </section>
            
            <section style={{marginTop: '40px', borderTop: '1px solid #000', paddingTop: '10px'}}>
              <h4>5. GEOSPATIAL TACTICAL CONTEXT</h4>
              <div className="sirep-map-snapshot">
                <div className="tactical-grid">
                  <div className="grid-lat-label">{profile.last_lat.toFixed(2)}N</div>
                  <div className="grid-target-crosshair"></div>
                  <div className="grid-lon-label">{profile.last_lon.toFixed(2)}E</div>
                </div>
                <div className="tactical-legend">
                   <p><strong>POSITIONAL ACCURACY:</strong> HIGH (GPS-AIS FEED)</p>
                   <p><strong>GEOGRAPHIC SECTOR:</strong> Arabian Sea / Northwest Quad</p>
                   <p><strong>NEAREST NAVAL BASE:</strong> Mumbai (INS Shikra)</p>
                </div>
              </div>
            </section>

            <section style={{marginTop: '40px', borderTop: '1px solid #000', paddingTop: '10px'}}>
              <h4>6. DIGITAL AUTHORIZATION</h4>
              <p>SIGNED: CHIEF TACTICAL ANALYST - NMDA HQ</p>
              <p>TOKEN: {Math.random().toString(16).substring(2, 10).toUpperCase()}-SECURE</p>
              <p>IP ADDRESS: 192.168.1.7 (SECURE NODE)</p>
            </section>
          </div>
          
          <div className="sirep-footer">
             <button className="print-report-btn" onClick={() => window.print()}>EXPORT TO PDF/PRINT</button>
          </div>
        </div>
      ) : (
        <div className="panel-content custom-scrollbar">
        <div className="profile-hero">
          <div className="vessel-info">
            <h3 className="text-gradient">{profile.vessel_name}</h3>
            <p>Type: {profile.vessel_type} | Flag: {profile.flag}</p>
          </div>
          <div className={`risk-score-badge ${severityClass}`}>
            <span className="score-value">{Math.round(profile.risk_score)}</span>
            <span className="score-label">{profile.risk_score > 85 ? 'THREAT' : 'RISK'}</span>
            {profile.risk_score > 85 && <div className="danger-glow"></div>}
          </div>
        </div>

        {profile.risk_score > 75 && (
          <div className="tactical-actions outline">
            <h4>Tactical Response Protocols</h4>
            <div className="action-grid">
              <button className="action-btn-red" onClick={() => alert(`UAV Mission initialized for ${profile.vessel_name}`)}>LAUNCH UAV</button>
              <button className="action-btn-warn" onClick={() => alert(`Signals sent to ${profile.mmsi}`)}>SIGNAL VESSEL</button>
              <button className="action-btn-blue" onClick={() => alert(`COAST GUARD alerted for ${profile.vessel_name}`)}>FLAG INTERCEPT</button>
            </div>
          </div>
        )}

        <div className="tags-section">
          {profile.anomaly_types.map(type => (
            <span key={type} className={`anomaly-tag ${type !== 'NORMAL' ? 'active' : ''}`}>
              {type.replace('_', ' ')}
            </span>
          ))}
        </div>

        <div className="chart-section">
          <h4>Multi-Sensor Threat Vector</h4>
          <div className="radar-container">
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                <Radar name="Threat" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.5} />
                <Tooltip contentStyle={{ backgroundColor: '#131f32', border: '1px solid #3b82f6' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-section">
          <h4>Kinematic History (Speed Over Ground)</h4>
          <div className="line-container">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={speedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={30} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 'dataMax + 5']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#131f32', border: '1px solid rgba(255,255,255,0.1)' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Line type="monotone" dataKey="sog" stroke="#06b6d4" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="data-table-section">
          <h4>Latest Telemetry (LIVE)</h4>
          <table className="telemetry-table">
            <tbody>
              <tr><td>Latitude</td><td className="fixed-num">{(liveData?.last_lat || profile.last_lat)?.toFixed(6)}°</td></tr>
              <tr><td>Longitude</td><td className="fixed-num">{(liveData?.last_lon || profile.last_lon)?.toFixed(6)}°</td></tr>
              <tr><td>Speed (SOG)</td><td className="fixed-num highlight-live">{(liveData?.last_sog || profile.last_sog)?.toFixed(1)} kts</td></tr>
              <tr><td>Course (COG)</td><td className="fixed-num">{(liveData?.last_cog || profile.last_cog)?.toFixed(1)}°</td></tr>
              <tr><td>Detection Confidence</td><td className="fixed-num">{(1 - (profile.ae_reconstruction_error || 0)).toFixed(4)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
};

export default RiskPanel;
