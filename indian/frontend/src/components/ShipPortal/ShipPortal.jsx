import React, { useState, useEffect } from 'react';
import ShipLogin from './ShipLogin';
import ShipDashboard from './ShipDashboard';
import './ShipPortal.css';

function ShipPortal({ onSwitchToMainPortal }) {
  const [authenticatedMmsi, setAuthenticatedMmsi] = useState(() => {
    return sessionStorage.getItem('ship_authenticated') === 'true'
      ? sessionStorage.getItem('ship_mmsi')
      : null;
  });

  const [vesselList, setVesselList] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/vessels').then(r => r.json()).catch(() => ({ vessels: [] })),
      fetch('/api/anomalies').then(r => r.json()).catch(() => ({ alerts: [] }))
    ]).then(([vData, aData]) => {
      setVesselList(Array.isArray(vData.vessels) ? vData.vessels : []);
      setAlerts(Array.isArray(aData.alerts) ? aData.alerts : []);
      setLoading(false);
    });
  }, []);

  const handleLoginSuccess = (mmsi) => {
    setAuthenticatedMmsi(mmsi);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('ship_authenticated');
    sessionStorage.removeItem('ship_mmsi');
    setAuthenticatedMmsi(null);
  };

  const handleSwitchVessel = () => {
    sessionStorage.removeItem('ship_authenticated');
    sessionStorage.removeItem('ship_mmsi');
    setAuthenticatedMmsi(null);
  };

  if (!authenticatedMmsi) {
    return (
      <ShipLogin 
        vesselList={vesselList} 
        onLoginSuccess={handleLoginSuccess}
        onSwitchToMain={onSwitchToMainPortal}
      />
    );
  }

  const currentVessel = vesselList.find(v => v.mmsi?.toString() === authenticatedMmsi?.toString());
  const currentAlert = alerts.find(a => a.mmsi?.toString() === authenticatedMmsi?.toString());

  return (
    <ShipDashboard 
      mmsi={authenticatedMmsi}
      vesselData={currentVessel}
      alertData={currentAlert}
      onLogout={handleLogout}
      onSwitchVessel={handleSwitchVessel}
    />
  );
}

export default ShipPortal;
