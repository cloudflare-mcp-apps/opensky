/**
 * SEP-1865 MCP Apps Extension: Flight Map Template Generator
 *
 * This module generates an interactive flight map HTML template that:
 * - Implements the SEP-1865 JSON-RPC 2.0 protocol over postMessage
 * - Performs ui/initialize handshake with the host
 * - Receives data via ui/notifications/tool-input and ui/notifications/tool-result
 * - Reports size changes via ui/notifications/size-change
 * - Handles theme changes via ui/notifications/host-context-changed
 *
 * The template is predeclared as a resource and does NOT contain embedded data.
 * All aircraft data is received dynamically from the host.
 *
 * @see https://github.com/modelcontextprotocol/specification/blob/main/docs/specification/extensions/sep-1865-mcp-apps.md
 */

/**
 * Generates a self-contained SVG-based flight map HTML template
 *
 * This template implements the SEP-1865 MCP Apps protocol:
 * 1. Sends ui/initialize request on load
 * 2. Sends ui/notifications/initialized after receiving initialize response
 * 3. Listens for ui/notifications/tool-input (search parameters)
 * 4. Listens for ui/notifications/tool-result (aircraft data)
 * 5. Reports ui/notifications/size-change on resize
 * 6. Handles ui/notifications/host-context-changed (theme, viewport)
 *
 * @returns Complete HTML template string ready for embedding
 */
export function generateFlightMapTemplate(): string {
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
    body.dark-theme {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e0e0e0;
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
    .dark-theme .header {
      background: #0f0f1a;
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
    .dark-theme .map-svg {
      background: linear-gradient(180deg, #1a1a2e 0%, #16213e 30%, #0f3460 70%, #1a1a2e 100%);
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
    .dark-theme .info-panel {
      background: #1a1a2e;
      color: #e0e0e0;
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
    .dark-theme .info-panel h3 {
      color: #e0e0e0;
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
    .dark-theme .close-btn:hover { color: #fff; }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #eee;
    }
    .dark-theme .info-row {
      border-bottom-color: #333;
    }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #666; font-weight: 500; }
    .dark-theme .info-label { color: #aaa; }
    .info-value { color: #333; text-align: right; }
    .dark-theme .info-value { color: #e0e0e0; }
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
    .dark-theme .legend {
      background: rgba(26,26,46,0.95);
    }
    .legend-title {
      font-weight: 600;
      margin-bottom: 8px;
      color: #2c3e50;
    }
    .dark-theme .legend-title {
      color: #e0e0e0;
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
    .dark-theme .grid-line { stroke: #444; }
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
    .dark-theme .coordinates {
      background: rgba(26,26,46,0.9);
      color: #aaa;
    }
    .loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      color: #666;
    }
    .dark-theme .loading { color: #aaa; }
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e0e0e0;
      border-top-color: #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="header">
    <h1><span style="font-size: 24px;">&#9992;</span> Flight Tracker</h1>
    <div class="stats">
      <div class="stat">
        <span class="stat-value" id="aircraftCount">-</span>
        <span class="stat-label">Aircraft</span>
      </div>
      <div class="stat">
        <span class="stat-value" id="radiusKm">-</span>
        <span class="stat-label">km radius</span>
      </div>
    </div>
  </div>

  <div class="map-container">
    <div class="loading" id="loadingIndicator">
      <div class="loading-spinner"></div>
      <div>Waiting for flight data...</div>
    </div>

    <svg class="map-svg" id="mapSvg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet" style="display: none;">
      <defs>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" class="grid-line"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)"/>
      <g id="radiusCircle"></g>
      <g id="centerMarker"></g>
      <g id="aircraftMarkers"></g>
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

    <div class="coordinates" id="coordinates" style="display: none;">
      Center: <span id="centerCoords">-</span>
    </div>
  </div>

  <script>
    /**
     * SEP-1865 MCP Apps Protocol Implementation
     *
     * This script implements the Guest UI side of the MCP Apps extension protocol.
     * Communication uses JSON-RPC 2.0 over postMessage.
     */

    // State
    let requestId = 1;
    let initialized = false;
    let hostContext = {};
    let toolInput = null;
    let aircraftData = [];

    // SVG viewport
    const SVG_WIDTH = 800;
    const SVG_HEIGHT = 600;

    // ============================================
    // JSON-RPC Communication Layer
    // ============================================

    function sendRequest(method, params) {
      const id = requestId++;
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, '*');
      return id;
    }

    function sendNotification(method, params) {
      window.parent.postMessage({ jsonrpc: "2.0", method, params }, '*');
    }

    function sendResponse(id, result) {
      window.parent.postMessage({ jsonrpc: "2.0", id, result }, '*');
    }

    // ============================================
    // SEP-1865 Lifecycle
    // ============================================

    async function initialize() {
      console.log('[FlightMap] Sending ui/initialize request');

      sendRequest("ui/initialize", {
        capabilities: {},
        clientInfo: {
          name: "OpenSky Flight Map",
          version: "1.0.0"
        },
        protocolVersion: "2025-06-18"
      });
    }

    function handleInitializeResponse(result) {
      console.log('[FlightMap] Received initialize response:', result);

      // Store host context
      if (result.hostContext) {
        hostContext = result.hostContext;
        applyHostContext(hostContext);
      }

      // Send initialized notification
      sendNotification("ui/notifications/initialized", {});
      initialized = true;

      console.log('[FlightMap] Initialization complete');
    }

    // ============================================
    // Message Handler
    // ============================================

    window.addEventListener('message', (event) => {
      const msg = event.data;

      // Validate JSON-RPC message
      if (!msg || msg.jsonrpc !== "2.0") return;

      // Response to our request (has id and result/error)
      if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
        if (msg.result && !initialized) {
          // This is likely the initialize response
          handleInitializeResponse(msg.result);
        }
        return;
      }

      // Notification from host (has method but no id)
      if (msg.method) {
        handleNotification(msg.method, msg.params);
        return;
      }

      // Request from host (has method and id)
      if (msg.method && msg.id !== undefined) {
        handleRequest(msg.id, msg.method, msg.params);
        return;
      }
    });

    function handleNotification(method, params) {
      switch (method) {
        case 'ui/notifications/tool-input':
          console.log('[FlightMap] Received tool-input:', params);
          toolInput = params.arguments || {};
          // Tool input contains search parameters (lat, lng, radius)
          // We'll use this to configure the map center
          break;

        case 'ui/notifications/tool-input-partial':
          // Optional: Handle streaming partial arguments
          console.log('[FlightMap] Received partial tool-input:', params);
          break;

        case 'ui/notifications/tool-result':
          console.log('[FlightMap] Received tool-result:', params);
          handleToolResult(params);
          break;

        case 'ui/notifications/host-context-changed':
          console.log('[FlightMap] Received host-context-changed:', params);
          Object.assign(hostContext, params);
          applyHostContext(params);
          break;

        default:
          console.log('[FlightMap] Unknown notification:', method);
      }
    }

    function handleRequest(id, method, params) {
      switch (method) {
        case 'ui/resource-teardown':
          console.log('[FlightMap] Received teardown request');
          // Cleanup if needed
          sendResponse(id, {});
          break;

        default:
          console.log('[FlightMap] Unknown request:', method);
          window.parent.postMessage({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: "Method not found" }
          }, '*');
      }
    }

    // ============================================
    // Data Handling & Rendering
    // ============================================

    function handleToolResult(result) {
      // Hide loading indicator
      document.getElementById('loadingIndicator').style.display = 'none';
      document.getElementById('mapSvg').style.display = 'block';
      document.getElementById('coordinates').style.display = 'block';

      // Extract structured content
      const data = result.structuredContent || result;

      if (!data.search_center || !data.aircraft) {
        console.error('[FlightMap] Invalid tool result structure');
        return;
      }

      // Store aircraft data
      aircraftData = data.aircraft || [];

      // Update stats
      document.getElementById('aircraftCount').textContent = data.aircraft_count || aircraftData.length;
      document.getElementById('radiusKm').textContent = data.radius_km || '-';

      // Update coordinates
      const center = data.search_center;
      document.getElementById('centerCoords').textContent =
        center.latitude.toFixed(4) + '\\u00B0, ' + center.longitude.toFixed(4) + '\\u00B0';

      // Render map
      renderMap(center, data.radius_km || 50, aircraftData);
    }

    function renderMap(center, radiusKm, aircraft) {
      const centerLat = center.latitude;
      const centerLon = center.longitude;

      // Calculate bounding box for SVG viewport
      const latKm = 111;
      const lonKm = 111 * Math.cos(centerLat * Math.PI / 180);
      const latRange = (radiusKm * 1.5) / latKm;
      const lonRange = (radiusKm * 1.5) / lonKm;

      const minLat = centerLat - latRange;
      const maxLat = centerLat + latRange;
      const minLon = centerLon - lonRange;
      const maxLon = centerLon + lonRange;

      // Coordinate conversion functions
      const toSvgX = (lon) => ((lon - minLon) / (maxLon - minLon)) * SVG_WIDTH;
      const toSvgY = (lat) => SVG_HEIGHT - ((lat - minLat) / (maxLat - minLat)) * SVG_HEIGHT;

      // Render radius circle
      const radiusCircleG = document.getElementById('radiusCircle');
      const radiusPx = (radiusKm / ((maxLon - minLon) * lonKm)) * SVG_WIDTH;
      radiusCircleG.innerHTML = \`
        <circle cx="\${toSvgX(centerLon)}" cy="\${toSvgY(centerLat)}"
                r="\${radiusPx}" class="radius-circle"/>
      \`;

      // Render center marker
      const centerMarkerG = document.getElementById('centerMarker');
      const cx = toSvgX(centerLon);
      const cy = toSvgY(centerLat);
      centerMarkerG.innerHTML = \`
        <circle cx="\${cx}" cy="\${cy}" r="8" class="center-marker"/>
        <circle cx="\${cx}" cy="\${cy}" r="3" fill="#fff"/>
      \`;

      // Render aircraft markers
      const markersG = document.getElementById('aircraftMarkers');
      const markers = aircraft
        .filter(a => a.position.latitude !== null && a.position.longitude !== null)
        .map((a, i) => {
          const x = toSvgX(a.position.longitude);
          const y = toSvgY(a.position.latitude);
          const heading = a.velocity.true_track_deg || 0;
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

          return \`
            <g class="aircraft" data-index="\${i}" transform="translate(\${x}, \${y}) rotate(\${heading})" style="cursor: pointer;">
              <title>\${a.callsign || 'Unknown'} (\${a.icao24})</title>
              <path d="M0,-12 L3,-4 L12,2 L3,2 L3,8 L6,12 L-6,12 L-3,8 L-3,2 L-12,2 L-3,-4 Z"
                    fill="\${color}" stroke="#333" stroke-width="1" opacity="0.9"/>
            </g>
          \`;
        })
        .join('\\n');

      markersG.innerHTML = markers;

      // Add click handlers
      document.querySelectorAll('.aircraft').forEach(el => {
        el.addEventListener('click', function() {
          showAircraftInfo(parseInt(this.dataset.index));
        });
      });
    }

    // ============================================
    // UI Interactions
    // ============================================

    function showAircraftInfo(index) {
      const visibleAircraft = aircraftData.filter(ac => ac.position.latitude && ac.position.longitude);
      const a = visibleAircraft[index];
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

    // ============================================
    // Host Context Handling
    // ============================================

    function applyHostContext(context) {
      // Apply theme
      if (context.theme === 'dark') {
        document.body.classList.add('dark-theme');
      } else if (context.theme === 'light') {
        document.body.classList.remove('dark-theme');
      }

      // Handle viewport changes if needed
      if (context.viewport) {
        console.log('[FlightMap] Viewport:', context.viewport);
      }
    }

    // ============================================
    // Size Change Notifications
    // ============================================

    const resizeObserver = new ResizeObserver(() => {
      if (!initialized) return;

      sendNotification('ui/notifications/size-change', {
        width: document.body.scrollWidth,
        height: document.body.scrollHeight
      });
    });

    resizeObserver.observe(document.body);

    // ============================================
    // Startup
    // ============================================

    // Start initialization
    initialize();
  </script>
</body>
</html>`;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use generateFlightMapTemplate() for SEP-1865 compliance
 */
export function generateFlightMapHTML(data: {
  search_center: { latitude: number; longitude: number };
  radius_km: number;
  aircraft_count: number;
  aircraft: Array<{
    icao24: string;
    callsign: string | null;
    origin_country: string;
    position: {
      latitude: number | null;
      longitude: number | null;
      altitude_m: number | null;
      on_ground: boolean;
    };
    velocity: {
      ground_speed_ms: number | null;
      vertical_rate_ms: number | null;
      true_track_deg: number | null;
    };
    last_contact: number;
    squawk: string | null;
  }>;
}): string {
  console.warn(
    "[DEPRECATED] generateFlightMapHTML is deprecated. Use generateFlightMapTemplate() for SEP-1865 compliance."
  );

  // For backward compatibility, we still generate inline HTML
  // but the preferred approach is to use the template + notifications pattern
  const template = generateFlightMapTemplate();

  // Inject the data as an initial script that simulates receiving tool-result
  const dataScript = `
    <script>
      // Injected data for backward compatibility
      window.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
          handleToolResult({
            structuredContent: ${JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")}
          });
        }, 100);
      });
    </script>
  `;

  // Insert before closing body tag
  return template.replace("</body>", dataScript + "</body>");
}
