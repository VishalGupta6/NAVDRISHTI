import React, { useState, useMemo } from 'react';
import { ShieldAlert, AlertTriangle, Filter, Search, ChevronRight } from 'lucide-react';
import './AlertSidebar.css';

const AlertSidebar = ({ alerts = [], selectedMmsi, onSelectAlert, onClose }) => {
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Only consider alerts that are marked anomalous or have elevated severity
  const activeAlerts = useMemo(() => {
    return alerts.filter(a => a.is_anomalous || a.severity !== 'NORMAL');
  }, [alerts]);

  // Counts by severity
  const counts = useMemo(() => {
    return {
      ALL: activeAlerts.length,
      CRITICAL: activeAlerts.filter(a => a.severity === 'CRITICAL').length,
      HIGH: activeAlerts.filter(a => a.severity === 'HIGH').length,
      MEDIUM: activeAlerts.filter(a => a.severity === 'MEDIUM').length,
    };
  }, [activeAlerts]);

  // Filtered and searched list
  const filteredAlerts = useMemo(() => {
    return activeAlerts.filter(a => {
      if (filterSeverity !== 'ALL' && a.severity !== filterSeverity) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (a.vessel_name || '').toLowerCase().includes(q);
        const mmsiMatch = String(a.mmsi || '').includes(q);
        const tagMatch = (a.anomaly_types || []).some(t => t.toLowerCase().includes(q));
        const catMatch = (a.risk_categories || []).some(c => c.toLowerCase().includes(q));
        return nameMatch || mmsiMatch || tagMatch || catMatch;
      }
      return true;
    });
  }, [activeAlerts, filterSeverity, searchQuery]);

  // Group filtered alerts by severity for clean visual hierarchy
  const groupedAlerts = useMemo(() => {
    if (filterSeverity !== 'ALL') {
      return [{ title: `${filterSeverity} SEVERITY`, items: filteredAlerts, severity: filterSeverity }];
    }
    const critical = filteredAlerts.filter(a => a.severity === 'CRITICAL');
    const high = filteredAlerts.filter(a => a.severity === 'HIGH');
    const medium = filteredAlerts.filter(a => a.severity === 'MEDIUM');
    const low = filteredAlerts.filter(a => a.severity === 'LOW');

    const groups = [];
    if (critical.length) groups.push({ title: 'CRITICAL TACTICAL THREATS', items: critical, severity: 'CRITICAL' });
    if (high.length) groups.push({ title: 'HIGH RISK TARGETS', items: high, severity: 'HIGH' });
    if (medium.length) groups.push({ title: 'MEDIUM ELEVATION DETECTIONS', items: medium, severity: 'MEDIUM' });
    if (low.length) groups.push({ title: 'LOW RISK MONITORING', items: low, severity: 'LOW' });
    return groups;
  }, [filteredAlerts, filterSeverity]);

  return (
    <div className="alert-sidebar glass-panel">
      {/* Header */}
      <div className="sidebar-header">
        <div className="header-title-group">
          <div className="sidebar-title-row">
            <ShieldAlert size={20} className="header-threat-icon" />
            <h2>Live Tactical Threats</h2>
          </div>
          <div className="threat-summary-sub">
            <span className="badge critical">{counts.CRITICAL} Critical</span>
            {counts.HIGH > 0 && <span className="badge high">{counts.HIGH} High</span>}
            <span className="total-badge">{counts.ALL} Anomalies</span>
          </div>
        </div>
        <button className="mobile-only-close icon-btn" onClick={onClose}>
          ×
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="sidebar-controls">
        <div className="sidebar-search-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="Search threat, MMSI, type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery('')}>×</button>
          )}
        </div>

        {/* Risk Grouping Filter Tabs */}
        <div className="severity-tabs">
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM'].map(sev => (
            <button
              key={sev}
              className={`severity-tab-btn ${filterSeverity === sev ? 'active' : ''} ${sev.toLowerCase()}`}
              onClick={() => setFilterSeverity(sev)}
            >
              <span>{sev}</span>
              <span className="tab-count">{counts[sev] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Alert List grouped by risk */}
      <div className="alert-list custom-scrollbar">
        {filteredAlerts.length === 0 ? (
          <div className="no-alerts">
            <AlertTriangle size={28} className="no-alerts-icon" />
            <p>No active anomalies found for selected criteria.</p>
          </div>
        ) : (
          groupedAlerts.map(group => (
            <div key={group.title} className="alert-group-section">
              <div className={`group-header-label ${group.severity.toLowerCase()}`}>
                <span className="group-dot"></span>
                <span>{group.title}</span>
                <span className="group-badge-count">{group.items.length}</span>
              </div>

              {group.items.map(alert => {
                const isSelected = String(alert.mmsi) === String(selectedMmsi);
                const severityClass = (alert.severity || 'NORMAL').toLowerCase();
                const score = Math.round(alert.risk_score || 0);

                return (
                  <div
                    key={alert.alert_id || alert.mmsi}
                    className={`alert-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => onSelectAlert(alert.mmsi)}
                  >
                    <div className="alert-card-header">
                      <span className={`severity-indicator ${severityClass}`}></span>
                      <div className="alert-vessel">
                        <strong className="vessel-title">{alert.vessel_name}</strong>
                        <div className="vessel-meta-sub">
                          <span className="text-muted text-sm">MMSI: {alert.mmsi}</span>
                          {alert.flag && alert.flag !== 'XX' && (
                            <span className="vessel-flag-pill">🚩 {alert.flag}</span>
                          )}
                        </div>
                      </div>
                      <div className="risk-score-display">
                        <span className={`badge ${severityClass}`}>{score}</span>
                        <span className="score-subtext">RISK</span>
                      </div>
                    </div>

                    {/* Tactical threat tags */}
                    <div className="alert-tags">
                      {(alert.anomaly_types || []).map(type => (
                        <span key={type} className="anomaly-tag">
                          {type.replace(/_/g, ' ')}
                        </span>
                      ))}
                      {(alert.risk_categories || []).map(cat => (
                        <span key={cat} className="category-tag">
                          🛡️ {cat.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>

                    <div className="alert-footer">
                      <span className="text-muted text-xs">
                        {alert.generated_at ? new Date(alert.generated_at).toLocaleTimeString() : 'LIVE'}
                      </span>
                      <span className="text-muted text-xs font-mono">
                        {alert.last_sog ? `${alert.last_sog} kts` : 'SURFACE TRACK'}
                      </span>
                      <ChevronRight size={14} className="alert-arrow" />
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AlertSidebar;
