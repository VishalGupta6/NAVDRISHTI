/**
 * AI Tactical Intercept Engine — Indian Navy MDA System
 * Computes optimal interception vector and nearest warship dispatch for maritime targets.
 */

const toRad = deg => (deg * Math.PI) / 180;
const toDeg = rad => (rad * 180) / Math.PI;

/**
 * Calculates geodesic distance between two points in Nautical Miles.
 */
export function getDistanceNM(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const R = 3440.065; // Earth radius in NM
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates compass bearing (0-360 deg) from point 1 to point 2.
 */
export function getBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Finds the nearest Indian Navy warship and computes the tactical intercept vector.
 * @param {Object} target Target vessel object with lat, lon, sog, cog
 * @param {Array} allVessels Array of all active vessels in fleet
 * @returns {Object|null} Intercept solution or null
 */
export function calculateInterceptSolution(target, allVessels = []) {
  if (!target) return null;

  const targetLat = target.lat || target.last_lat || target.start_lat;
  const targetLon = target.lon || target.last_lon || target.start_lon;
  if (!targetLat || !targetLon) return null;

  const targetSog = parseFloat(target.sog || target.last_sog || 0) || 0;
  const targetCog = parseFloat(target.cog || target.last_cog || 0) || 0;

  // Filter for Indian Navy warships (exclude target itself)
  const warships = allVessels.filter(v => {
    if (String(v.mmsi) === String(target.mmsi)) return false;
    const name = (v.name || '').toUpperCase();
    const isEscort = v.type === 'Naval Escort';
    const isNavyName = name.startsWith('INS ') || name.includes('NAVY');
    const isIndian = v.flag === 'IN' || isNavyName;
    return isIndian && (isEscort || isNavyName);
  });

  if (!warships.length) return null;

  // Find nearest warship by distance
  let nearest = null;
  let minDistance = Infinity;

  warships.forEach(w => {
    const wLat = w.lat || w.last_lat || w.start_lat;
    const wLon = w.lon || w.last_lon || w.start_lon;
    if (wLat && wLon) {
      const dist = getDistanceNM(wLat, wLon, targetLat, targetLon);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = { ...w, lat: wLat, lon: wLon, distanceNM: dist };
      }
    }
  });

  if (!nearest) return null;

  // Calculate tactical interception parameters
  // Warship standard flank intercept speed: 26.0 knots
  const WARSHIP_INTERCEPT_SPEED = 26.0;
  const bearing = getBearing(nearest.lat, nearest.lon, targetLat, targetLon);

  // Relative speed intercept projection
  const approxHours = minDistance / (WARSHIP_INTERCEPT_SPEED + Math.max(0, targetSog * 0.4));
  const etaMinutes = Math.max(8, Math.round(approxHours * 60));
  const hours = Math.floor(etaMinutes / 60);
  const mins = etaMinutes % 60;
  const etaFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  // Project intercept locus coordinates ahead of target
  const interceptDistNM = targetSog * (etaMinutes / 60);
  const interceptLat = targetLat + (interceptDistNM / 60) * Math.cos(toRad(targetCog));
  const interceptLon = targetLon + (interceptDistNM / (60 * Math.cos(toRad(targetLat)))) * Math.sin(toRad(targetCog));

  return {
    targetMmsi: target.mmsi,
    targetName: target.name || `UNIT ${target.mmsi}`,
    targetCoords: [targetLat, targetLon],
    warshipMmsi: nearest.mmsi,
    warshipName: nearest.name,
    warshipCoords: [nearest.lat, nearest.lon],
    distanceNM: Math.round(minDistance * 10) / 10,
    bearingDeg: Math.round(bearing),
    interceptCoords: [interceptLat, interceptLon],
    etaMinutes,
    etaFormatted,
    flankSpeedKts: WARSHIP_INTERCEPT_SPEED,
    timestamp: new Date().toISOString()
  };
}
