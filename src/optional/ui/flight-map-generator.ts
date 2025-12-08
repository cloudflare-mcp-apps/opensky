import { AircraftData } from '../../types';

/**
 * Generates a self-contained SVG-based flight map HTML
 *
 * This version uses pure SVG and inline JavaScript with no external dependencies,
 * making it fully compatible with MCP-UI iframe sandboxing and CSP restrictions.
 *
 * Features:
 * - Interactive aircraft markers with rotation based on heading
 * - Click-to-view aircraft details
 * - Search radius visualization
 * - Responsive design
 * - No external CSS/JS required
 *
 * @param data - Aircraft search response data with aircraft list and location
 * @returns Complete HTML string ready for embedding in MCP-UI
 */
export function generateFlightMapHTML(data: {
  search_center: { latitude: number; longitude: number };
  radius_km: number;
  aircraft_count: number;
  aircraft: AircraftData[];
}): string {
  const { search_center, radius_km, aircraft_count, aircraft } = data;
  const { latitude: centerLat, longitude: centerLon } = search_center;

  // Calculate bounding box for SVG viewport
  // Approximate: 1 degree latitude = 111km, 1 degree longitude = 111km * cos(lat)
  const latKm = 111;
  const lonKm = 111 * Math.cos(centerLat * Math.PI / 180);
  const latRange = (radius_km * 1.5) / latKm;
  const lonRange = (radius_km * 1.5) / lonKm;

  const minLat = centerLat - latRange;
  const maxLat = centerLat + latRange;
  const minLon = centerLon - lonRange;
  const maxLon = centerLon + lonRange;

  // SVG viewport dimensions
  const svgWidth = 800;
  const svgHeight = 600;

  // Convert lat/lon to SVG coordinates
  const toSvgX = (lon: number) => ((lon - minLon) / (maxLon - minLon)) * svgWidth;
  const toSvgY = (lat: number) => svgHeight - ((lat - minLat) / (maxLat - minLat)) * svgHeight;

  // Generate aircraft markers
  const aircraftMarkers = aircraft
    .filter(a => a.position.latitude !== null && a.position.longitude !== null)
    .map((a, i) => {
      const x = toSvgX(a.position.longitude!);
      const y = toSvgY(a.position.latitude!);
      const heading = a.velocity.true_track_deg ?? 0;
      const alt = a.position.altitude_m;

      // Color based on altitude
      let color = '#3388ff';
      if (alt !== null && alt !== undefined) {
        if (alt <= 300) color = '#d4353d';
        else if (alt <= 3000) color = '#f58220';
        else if (alt <= 6000) color = '#fac858';
        else if (alt <= 9000) color = '#5eaed8';
        else color = '#1f77b4';
      }

      // Aircraft SVG path (airplane shape)
      return `
        <g class="aircraft" data-index="${i}" transform="translate(${x}, ${y}) rotate(${heading})" style="cursor: pointer;">
          <title>${a.callsign || 'Unknown'} (${a.icao24})</title>
          <path d="M0,-12 L3,-4 L12,2 L3,2 L3,8 L6,12 L-6,12 L-3,8 L-3,2 L-12,2 L-3,-4 Z"
                fill="${color}" stroke="#333" stroke-width="1" opacity="0.9"/>
        </g>`;
    })
    .join('\n');

  // Escape JSON for safe embedding
  const aircraftJSON = JSON.stringify(aircraft).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flight Map - OpenSky Network</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #e8f4f8 0%, #d0e8f0 100%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      background: #2c3e50;
      color: white;
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }
    .header h1 {
      font-size: 18px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .stats {
      display: flex;
      gap: 20px;
      font-size: 13px;
    }
    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .stat-value {
      font-size: 20px;
      font-weight: bold;
      color: #3498db;
    }
    .stat-label {
      opacity: 0.8;
      font-size: 11px;
    }
    .map-container {
      flex: 1;
      display: flex;
      position: relative;
      overflow: hidden;
    }
    .map-svg {
      width: 100%;
      height: 100%;
      background: linear-gradient(180deg, #a8d8ea 0%, #87ceeb 30%, #98d8c8 70%, #c8e6c9 100%);
    }
    .info-panel {
      position: absolute;
      top: 10px;
      right: 10px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.15);
      padding: 15px;
      min-width: 250px;
      max-width: 300px;
      font-size: 13px;
      display: none;
    }
    .info-panel.visible { display: block; }
    .info-panel h3 {
      margin-bottom: 12px;
      color: #2c3e50;
      border-bottom: 2px solid #3498db;
      padding-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .close-btn {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #999;
      padding: 0;
      line-height: 1;
    }
    .close-btn:hover { color: #333; }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #eee;
    }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #666; font-weight: 500; }
    .info-value { color: #333; text-align: right; }
    .legend {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: rgba(255,255,255,0.95);
      border-radius: 8px;
      padding: 12px;
      font-size: 11px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .legend-title {
      font-weight: 600;
      margin-bottom: 8px;
      color: #2c3e50;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 0;
    }
    .legend-color {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      border: 1px solid #333;
    }
    .grid-line { stroke: #ffffff; stroke-width: 0.5; opacity: 0.3; }
    .center-marker { fill: #ff7800; stroke: #fff; stroke-width: 2; }
    .radius-circle { fill: rgba(51,136,255,0.1); stroke: #3388ff; stroke-width: 2; stroke-dasharray: 8,4; }
    .aircraft:hover path { opacity: 1; stroke-width: 2; }
    .coordinates {
      position: absolute;
      bottom: 10px;
      right: 10px;
      background: rgba(255,255,255,0.9);
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 11px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1><span style="font-size: 24px;">&#9992;</span> Flight Tracker</h1>
    <div class="stats">
      <div class="stat">
        <span class="stat-value">${aircraft_count}</span>
        <span class="stat-label">Aircraft</span>
      </div>
      <div class="stat">
        <span class="stat-value">${radius_km}</span>
        <span class="stat-label">km radius</span>
      </div>
    </div>
  </div>

  <div class="map-container">
    <svg class="map-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" class="grid-line"/>
        </pattern>
      </defs>

      <!-- Grid background -->
      <rect width="100%" height="100%" fill="url(#grid)"/>

      <!-- Search radius circle -->
      <circle cx="${toSvgX(centerLon)}" cy="${toSvgY(centerLat)}"
              r="${(radius_km / ((maxLon - minLon) * lonKm)) * svgWidth}"
              class="radius-circle"/>

      <!-- Center marker -->
      <circle cx="${toSvgX(centerLon)}" cy="${toSvgY(centerLat)}" r="8" class="center-marker"/>
      <circle cx="${toSvgX(centerLon)}" cy="${toSvgY(centerLat)}" r="3" fill="#fff"/>

      <!-- Aircraft markers -->
      ${aircraftMarkers}
    </svg>

    <div class="info-panel" id="infoPanel">
      <h3>
        <span id="callsign">Aircraft Info</span>
        <button class="close-btn" onclick="closePanel()">&times;</button>
      </h3>
      <div class="info-row"><span class="info-label">ICAO24</span><span class="info-value" id="icao24">-</span></div>
      <div class="info-row"><span class="info-label">Country</span><span class="info-value" id="country">-</span></div>
      <div class="info-row"><span class="info-label">Altitude</span><span class="info-value" id="altitude">-</span></div>
      <div class="info-row"><span class="info-label">Speed</span><span class="info-value" id="speed">-</span></div>
      <div class="info-row"><span class="info-label">Heading</span><span class="info-value" id="heading">-</span></div>
      <div class="info-row"><span class="info-label">Vert. Rate</span><span class="info-value" id="vertRate">-</span></div>
      <div class="info-row"><span class="info-label">Status</span><span class="info-value" id="status">-</span></div>
    </div>

    <div class="legend">
      <div class="legend-title">Altitude</div>
      <div class="legend-item"><div class="legend-color" style="background:#d4353d"></div>Ground/Low (&lt;300m)</div>
      <div class="legend-item"><div class="legend-color" style="background:#f58220"></div>Low (300-3000m)</div>
      <div class="legend-item"><div class="legend-color" style="background:#fac858"></div>Medium (3000-6000m)</div>
      <div class="legend-item"><div class="legend-color" style="background:#5eaed8"></div>High (6000-9000m)</div>
      <div class="legend-item"><div class="legend-color" style="background:#1f77b4"></div>Cruise (&gt;9000m)</div>
    </div>

    <div class="coordinates">
      Center: ${centerLat.toFixed(4)}&deg;, ${centerLon.toFixed(4)}&deg;
    </div>
  </div>

  <script>
    const aircraftData = ${aircraftJSON};

    function showAircraftInfo(index) {
      const a = aircraftData.filter(ac => ac.position.latitude && ac.position.longitude)[index];
      if (!a) return;

      document.getElementById('callsign').textContent = a.callsign || 'Unknown';
      document.getElementById('icao24').textContent = a.icao24;
      document.getElementById('country').textContent = a.origin_country;
      document.getElementById('altitude').textContent = a.position.altitude_m ? a.position.altitude_m + ' m' : 'N/A';
      document.getElementById('speed').textContent = Math.round((a.velocity.ground_speed_ms || 0) * 3.6) + ' km/h';
      document.getElementById('heading').textContent = (a.velocity.true_track_deg || 0).toFixed(1) + '\\u00B0';
      document.getElementById('vertRate').textContent = a.velocity.vertical_rate_ms !== null
        ? a.velocity.vertical_rate_ms.toFixed(1) + ' m/s'
        : 'N/A';
      document.getElementById('status').textContent = a.position.on_ground ? 'On Ground' : 'In Flight';

      document.getElementById('infoPanel').classList.add('visible');
    }

    function closePanel() {
      document.getElementById('infoPanel').classList.remove('visible');
    }

    // Add click handlers to aircraft markers
    document.querySelectorAll('.aircraft').forEach(el => {
      el.addEventListener('click', function() {
        showAircraftInfo(parseInt(this.dataset.index));
      });
    });
  <\\/script>
</body>
</html>`;
}
