import React from 'react';
import './AlertSidebar.css';

const AlertSidebar = ({ alerts, selectedMmsi, onSelectAlert, onClose }) => {
  return (
    <div className="alert-sidebar glass-panel">
      <div className="sidebar-header">
        <div className="header-title-group">
          <h2>Live Anomalies</h2>
          <span className="badge critical">{alerts.length} Active</span>
        </div>
        <button className="mobile-only-close icon-btn" onClick={onClose}>
          ×
        </button>
      </div>
      
      <div className="alert-list custom-scrollbar">
        {alerts.length === 0 ? (
          <div className="no-alerts">No active anomalies detected.</div>
        ) : (
          alerts.map(alert => {
            const isSelected = alert.mmsi === selectedMmsi;
            const severityClass = alert.severity.toLowerCase();

            return (
              <div 
                key={alert.alert_id} 
                className={`alert-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectAlert(alert.mmsi)}
              >
                <div className="alert-card-header">
                  <span className={`severity-indicator ${severityClass}`}></span>
                  <div className="alert-vessel">
                    <strong>{alert.vessel_name}</strong>
                    <span className="text-muted text-sm">{alert.mmsi}</span>
                  </div>
                  <span className={`badge ${severityClass}`}>
                    {Math.round(alert.risk_score)}
                  </span>
                </div>
                
                <div className="alert-tags">
                  {alert.anomaly_types.map(type => (
                    <span key={type} className="anomaly-tag">
                      {type.replace('_', ' ')}
                    </span>
                  ))}
                </div>
                
                <div className="alert-footer">
                  <span className="text-muted">
                    {new Date(alert.generated_at).toLocaleTimeString()}
                  </span>
                  <span className="text-muted">
                    SOG: {alert.last_sog}kts
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AlertSidebar;
