import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, useMap, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './Map.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const createVesselIcon = (severity, cog = 0, sog = 0) => {
  let color = '#38bdf8'; // crisp cyan blue — normal moving
  if (severity === 'CRITICAL') color = '#ef4444';
  else if (severity === 'HIGH') color = '#f97316';
  else if (severity === 'MEDIUM') color = '#f59e0b';
  
  const isMoving = sog > 0.5;

  return L.divIcon({
    className: 'custom-vessel-icon',
    html: `
      <div class="vessel-marker-container">
        ${isMoving ? `<div class="vessel-wake-ring" style="border-color: ${color};"></div>` : ''}
        <div class="vessel-directional-hull" style="transform: rotate(${cog}deg); background-color: ${color}; box-shadow: 0 0 10px ${color};">
          <div class="hull-bow-pointer"></div>
        </div>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
};


const MapUpdater = ({ center, zoom, selectedMmsi }) => {
  const map = useMap();
  const lastMmsi = useRef(null);

  useEffect(() => {
    // Invalidate map size to ensure tile layer fills 100% container upon tab mount
    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    if (center && selectedMmsi !== lastMmsi.current) {
      map.setView(center, zoom, { animate: true, duration: 1.2 });
      lastMmsi.current = selectedMmsi;
    } else if (center) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map, selectedMmsi]);
  
  return null;
};


// Arrow marker icon factory — places a rotated triangle at each waypoint
const createArrowIcon = (bearing, color = '#1e3a5f') => L.divIcon({
  className: '',
  html: `<div style="
    width: 0; height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 14px solid ${color};
    transform: rotate(${bearing}deg);
    filter: drop-shadow(0 0 3px ${color});
  "></div>`,
  iconSize: [12, 14],
  iconAnchor: [6, 7],
});

// Calculate bearing between two lat/lon points
const getBearing = (lat1, lon1, lat2, lon2) => {
  const toRad = d => d * Math.PI / 180;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
};

// Memoized Tactical Layers to prevent re-rendering them on every vessel update
const TacticalLayers = React.memo(({ activeLayers, layerOpacity, mdaData }) => {
  return (
    <>
      {activeLayers.includes('straits') && mdaData.regions.filter(r => r.layer === 'straits').map(r => (
        <CircleMarker key={r.id} center={r.center} radius={25} pathOptions={{ color: '#ea580c', fillOpacity: layerOpacity * 0.2, weight: 1 * layerOpacity, dashArray: '5, 5', opacity: layerOpacity }}>
           <Tooltip permanent direction="top" className="region-tooltip">{r.name}</Tooltip>
        </CircleMarker>
      ))}

      {activeLayers.includes('iuu_hot_zones') && mdaData.regions.filter(r => r.layer === 'iuu_hot_zones').map(r => (
        <CircleMarker key={r.id} center={r.center} radius={45} pathOptions={{ color: '#f59e0b', fillOpacity: layerOpacity * 0.2, weight: 2 * layerOpacity, dashArray: '10, 5', opacity: layerOpacity }}>
           <Tooltip permanent className="region-tooltip">IUU RISK</Tooltip>
        </CircleMarker>
      ))}

      {activeLayers.includes('military_area') && mdaData.regions.filter(r => r.layer === 'military_area').map(r => (
        <CircleMarker key={r.id} center={r.center} radius={35} pathOptions={{ color: '#ef4444', fillOpacity: layerOpacity * 0.4, weight: 3 * layerOpacity, opacity: layerOpacity }}>
           <Tooltip permanent className="region-tooltip">MILITARY</Tooltip>
        </CircleMarker>
      ))}

      {activeLayers.includes('war_risk') && mdaData.regions.filter(r => r.layer === 'war_risk').map(r => (
        <CircleMarker key={r.id} center={r.center} radius={50} pathOptions={{ color: '#9333ea', fillOpacity: layerOpacity * 0.3, weight: 2 * layerOpacity, opacity: layerOpacity }}>
           <Tooltip permanent className="region-tooltip">WAR RISK</Tooltip>
        </CircleMarker>
      ))}

      {activeLayers.includes('maritime_region') && mdaData.slocs.map((sloc, idx) => (
        <Polyline key={idx} positions={sloc.path} pathOptions={{ color: sloc.color, weight: 1.5, opacity: layerOpacity * 0.6, dashArray: '1, 15' }}>
          <Tooltip sticky>{sloc.name}</Tooltip>
        </Polyline>
      ))}

      {activeLayers.includes('strategic_corridors') && mdaData.slocs.map((sloc, idx) => (
        <Polyline key={`sc-${idx}`} positions={sloc.path} pathOptions={{ color: '#22d3ee', weight: 40, opacity: layerOpacity * 0.1 }}>
          <Tooltip sticky>STRATEGIC SHIPPING CORRIDOR</Tooltip>
        </Polyline>
      ))}

      {activeLayers.includes('undersea_cables') && mdaData.cables.map((cable, idx) => (
        <Polyline key={`cable-${idx}`} positions={cable.path} pathOptions={{ color: '#8b5cf6', weight: 2, opacity: layerOpacity, dashArray: '5, 10' }}>
          <Tooltip sticky>UNDERSEA CABLE ASSET: {cable.name}</Tooltip>
        </Polyline>
      ))}

      {activeLayers.includes('port_buffers') && mdaData.ports.map((port, idx) => (
        <CircleMarker key={`port-${idx}`} center={port.center} radius={35} pathOptions={{ color: '#ef4444', fillOpacity: layerOpacity * 0.2, weight: 1, dashArray: '5, 5', opacity: layerOpacity }}>
           <Tooltip permanent direction="top">{port.name}</Tooltip>
        </CircleMarker>
      ))}

      {activeLayers.includes('eez') && <Polyline positions={mdaData.eez} pathOptions={{ color: '#38bdf8', weight: 2, opacity: layerOpacity * 0.8, dashArray: '10, 10' }} />}
      {activeLayers.includes('shoreline') && <Polyline positions={mdaData.shore} pathOptions={{ color: '#a8a29e', weight: 4, opacity: layerOpacity * 0.5 }} />}
    </>
  );
});

const Map = ({ vessels, alerts, historyData, selectedMmsi, onSelectVessel, activeLayers = [], layerOpacity = 0.6 }) => {
  const initialCenter = [17.5, 72.5];
  const initialZoom = 6;

  const historicalTracks = useMemo(() => {
    const tracks = {};
    if (historyData) historyData.forEach(m => { if(m.mmsi && m.lat) { if(!tracks[m.mmsi]) tracks[m.mmsi] = []; tracks[m.mmsi].push([m.lat, m.lon]); } });
    return tracks;
  }, [historyData]);

  const mdaData = useMemo(() => ({
    slocs: [
      { name: 'Arabian Gulf - India Lane', path: [[26.0, 56.5], [23.5, 60.5], [21.0, 65.5], [18.9, 72.8]], color: '#38bdf8' },
      { name: 'Red Sea - India Lane', path: [[12.5, 43.5], [13.0, 50.0], [15.0, 60.0], [18.8, 72.7]], color: '#06b6d4' }
    ],
    regions: [
      { id: 'hormuz', name: 'Strait of Hormuz', center: [26.6, 56.3], radius: 45000, risk: 'HIGH', layer: 'straits' },
      { id: 'bab-el-mandeb', name: 'Bab-el-Mandeb', center: [12.6, 43.3], radius: 35000, risk: 'HIGH', layer: 'straits' },
      { id: 'iuu-west', name: 'IUU WEST ZONE', center: [15.5, 65.0], radius: 120000, risk: 'IUU', layer: 'iuu_hot_zones' },
      { id: 'war-north', name: 'WAR RISK NORTH', center: [24.5, 62.0], radius: 150000, risk: 'WAR', layer: 'war_risk' },
      { id: 'military-drills', name: 'MILITARY EXERCISE AREA', center: [19.0, 68.0], radius: 80000, risk: 'MIL', layer: 'military_area' }
    ],
    eez: [[24,67],[22,66],[20,65],[18,66],[15,68],[12,70],[8,73],[6,76],[7.5,80],[10,83],[13,82.5],[16,83.5],[20,88],[22,91]],
    shore: [[23.5, 68.5], [21.5, 69.5], [19.0, 72.8], [15.5, 73.8], [10.0, 76.2], [8.0, 77.5]],
    ports: [
      { name: 'MUMBAI NAVAL BASE', center: [18.9, 72.8], color: '#ef4444' },
      { name: 'VISAKHAPATNAM COMMAND', center: [17.7, 83.3], color: '#ef4444' },
      { name: 'KOCHI COMMAND', center: [9.9, 76.2], color: '#ef4444' }
    ],
    cables: [
      { name: 'SEA-ME-WE 4', path: [[19.0, 72.5], [15.0, 65.0], [12.0, 50.0]] },
      { name: 'TATA TGN-TATA INDICOM', path: [[12.9, 80.2], [10.0, 85.0], [5.0, 95.0]] }
    ],
    vessel_routes: [
      {
        name: 'ROUTE: HORMUZ → MUMBAI',
        color: '#1e40af',
        path: [
          [26.5, 56.3],   // Hormuz
          [24.0, 59.5],
          [22.0, 62.5],
          [20.0, 66.0],
          [18.9, 72.8]   // Mumbai
        ]
      },
      {
        name: 'ROUTE: RED SEA → MUMBAI',
        color: '#1e3a5f',
        path: [
          [12.5, 43.5],   // Bab-el-Mandeb
          [13.0, 50.0],
          [16.0, 58.0],
          [18.5, 66.0],
          [19.0, 72.8]    // Mumbai
        ]
      },
      {
        name: 'ROUTE: COASTAL PATROL INDIA',
        color: '#0f4c75',
        path: [
          [23.0, 68.5],   // Gujarat Coast
          [21.0, 70.5],
          [19.0, 72.8],   // Mumbai
          [15.5, 73.8],
          [11.5, 75.5],
          [9.9, 76.2],    // Kochi
          [8.5, 77.0],
          [8.0, 77.5]     // Kanyakumari
        ]
      }
    ]
  }), []);

  const calculatePrediction = (lat, lon, sog, cog, min) => {
    if (!lat || !lon || !sog) return null;
    const dist = (sog * (min / 60) * 1.852) / 111; 
    const r = (cog * Math.PI) / 180;
    return [lat + dist * Math.cos(r), lon + dist * Math.sin(r)];
  };

  const [onlyMoving, setOnlyMoving] = React.useState(false);

  const displayedVessels = useMemo(() => {
    if (!onlyMoving) return vessels;
    return vessels.filter(v => {
      const sog = v.last_sog || v.sog || 0;
      return sog > 0.5;
    });
  }, [vessels, onlyMoving]);

  const selectedVessel = useMemo(() => vessels.find(v => String(v.mmsi) === String(selectedMmsi)), [vessels, selectedMmsi]);
  
  const highlightCenter = useMemo(() => {
    if (!selectedVessel) return null;
    const lat = selectedVessel.last_lat || selectedVessel.lat || selectedVessel.start_lat;
    const lon = selectedVessel.last_lon || selectedVessel.lon || selectedVessel.start_lon;
    return (lat && lon) ? [lat, lon] : null;
  }, [selectedVessel]);


  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div className="map-radar-control-panel">
        <button 
          className={`simple-vessel-filter-btn ${onlyMoving ? 'active' : ''}`}
          onClick={() => setOnlyMoving(!onlyMoving)}
          title="Filter to show active moving vessels"
        >
          {onlyMoving ? 'Filter: Moving Vessels Only' : 'Show: All Vessels'}
        </button>
      </div>

      <MapContainer 
        center={initialCenter} 
        zoom={initialZoom} 
        className="mda-map" 
        zoomControl={false}
        preferCanvas={true}
      >
        <TileLayer 
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      
      {highlightCenter && <MapUpdater center={highlightCenter} zoom={8} selectedMmsi={selectedMmsi} />}

      <TacticalLayers activeLayers={activeLayers} layerOpacity={layerOpacity} mdaData={mdaData} />

      {Object.entries(historicalTracks).map(([mmsi, pos]) => (
        <Polyline key={`hist-${mmsi}`} positions={pos} pathOptions={{ color: '#94a3b8', weight: 1, opacity: 0.4, dashArray: '5, 5' }} />
      ))}

      {activeLayers.includes('vessel_routes') && mdaData.vessel_routes.map((route, ri) => (
        <React.Fragment key={`route-${ri}`}>
          <Polyline 
            positions={route.path} 
            pathOptions={{ color: route.color, weight: 2.5, opacity: layerOpacity * 0.9 }}
          >
            <Tooltip sticky className="region-tooltip">{route.name}</Tooltip>
          </Polyline>

          {Array.isArray(route.path) && route.path.map((wp, wi) => {
            if (!wp || wp.length < 2) return null;
            const isLast = wi === route.path.length - 1;
            const nextWp = route.path[wi+1];
            
            let bearing = 0;
            if (!isLast && nextWp && nextWp.length >= 2) {
              bearing = getBearing(wp[0], wp[1], nextWp[0], nextWp[1]);
            }
            
            return (
              <React.Fragment key={`wp-${ri}-${wi}`}>
                <CircleMarker 
                  center={wp} 
                  radius={isLast ? 7 : 4} 
                  pathOptions={{ 
                    color: route.color, 
                    fillColor: isLast ? route.color : '#ffffff', 
                    fillOpacity: 0.9, 
                    weight: 2, 
                    opacity: layerOpacity 
                  }}
                >
                  <Tooltip>{isLast ? '⚓ DESTINATION' : `Waypoint ${wi+1}`}</Tooltip>
                </CircleMarker>
                {!isLast && nextWp && nextWp.length >= 2 && (
                  <Marker 
                    position={[(wp[0] + nextWp[0]) / 2, (wp[1] + nextWp[1]) / 2]} 
                    icon={createArrowIcon(bearing, route.color)} 
                    interactive={false}
                  />
                )}
              </React.Fragment>
            );
          })}
        </React.Fragment>
      ))}

      {displayedVessels.map(v => {
        const lat = v.last_lat || v.lat || v.start_lat;
        const lon = v.last_lon || v.lon || v.start_lon;
        if (!lat || !lon) return null;
        
        // Correctly match alert based on MMSI (ensuring string comparison)
        const vMmsiStr = String(v.mmsi);
        const alert = alerts.find(a => String(a.mmsi) === vMmsiStr);
        
        // Derive severity: Priority from alert, then vessel property, then default NORMAL
        const severity = alert?.severity || v.severity || 'NORMAL';
        const riskScore = alert?.risk_score || v.risk_score || 0;
        const isAnomalous = severity !== 'NORMAL';
        const isSelected = String(v.mmsi) === String(selectedMmsi);

        
        // Safety checks for telemetry
        const sog = v.last_sog || v.sog || 0;
        const cog = v.last_cog || v.cog || 0;
        const flag = v.flag || alert?.flag || 'UN';
        const vesselName = v.name || alert?.vessel_name || `UNIT ${v.mmsi}`;
        const vesselType = v.type || alert?.vessel_type || 'Cargo';

        return (
          <React.Fragment key={v.mmsi}>
            <Marker 
              position={[lat, lon]} 
              icon={createVesselIcon(severity, cog, sog)} 
              eventHandlers={{ click: () => onSelectVessel(v.mmsi) }}
            >

               <Tooltip direction="top" offset={[0, -10]} opacity={0.95} className="vessel-hover-tooltip">
                 <div className="vessel-hover-content">
                    <div className="hover-header">
                       <strong>{vesselName}</strong>
                       <span className={`risk-badge ${severity}`}>{severity}</span>
                    </div>
                    <div className="hover-body">
                       <div className="hover-row"><span>MMSI:</span> <strong>{v.mmsi}</strong></div>
                       <div className="hover-row"><span>Type:</span> <strong>{vesselType}</strong></div>
                       <div className="hover-row"><span>Flag:</span> <strong>{flag}</strong></div>
                       <div className="hover-grid">
                          <div className="grid-item"><span>SOG</span><strong>{sog.toFixed(1)} kn</strong></div>
                          <div className="grid-item"><span>COG</span><strong>{cog.toFixed(0)}°</strong></div>
                          <div className="grid-item"><span>RISK</span><strong>{riskScore.toFixed(0)}%</strong></div>
                       </div>
                       {isAnomalous && (
                         <div className="anomaly-tags">
                            {(alert?.anomaly_types || []).filter(t => t !== 'NORMAL').map(t => (
                              <span key={t} className="ano-tag">{t.replace('_', ' ')}</span>
                            ))}
                         </div>
                       )}
                    </div>
                 </div>
               </Tooltip>

               <Popup className="vessel-popup">
                 <div className="vessel-popup-basic">
                   <strong>{vesselName}</strong><br/>
                   MMSI: {v.mmsi}<br/>
                   Type: {vesselType}<br/>
                   <span className={`sev-tag ${severity}`}>{severity} RISK ({riskScore.toFixed(0)}%)</span>
                 </div>
               </Popup>
               {isAnomalous && (
                 <Tooltip permanent direction="bottom" className="threat-label" offset={[0, 12]}>
                   {severity}
                 </Tooltip>
               )}
            </Marker>
            {(isAnomalous || isSelected) && (
              <CircleMarker 
                center={[lat, lon]} 
                radius={isSelected ? 30 : 20} 
                pathOptions={{ 
                  color: isAnomalous ? (severity === 'CRITICAL' ? '#ef4444' : '#f59e0b') : '#38bdf8', 
                  weight: 1, 
                  fillOpacity: 0.1,
                  className: isAnomalous ? 'threat-zone-pulse' : ''
                }} 
              />
            )}
            {sog > 0.5 && (
              <Polyline 
                positions={[[lat, lon], calculatePrediction(lat, lon, sog, cog, 45)]} 
                pathOptions={{ color: '#38bdf8', weight: 2, opacity: 0.85, dashArray: '6, 6', className: 'live-motion-vector' }} 
              />
            )}

          </React.Fragment>
        );
      })}
    </MapContainer>
    </div>
  );
};

export default Map;
