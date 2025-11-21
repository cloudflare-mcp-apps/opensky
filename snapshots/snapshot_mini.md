# OpenSky Flight Tracker MCP Server - Mini Snapshot

**Generated**: 2025-11-21

---

- **Human-Readable Name**: OpenSky Flight Tracker MCP Server

- **Workers AI Status**: Configured (not actively used)
- **AI Usage**: Pre-configured for future enhancements (flight prediction, route analysis)

- **AI Gateway Status**: Configured (environment variable) but not actively used
- **Gateway ID**: mcp-production-gateway (shared across all MCP servers)

- **Total Tools**: 3

  - Tool 1: getAircraftByIcao
    - **Description (Verbatim)**: "Get aircraft details by ICAO 24-bit transponder address (hex string, e.g., '3c6444'). This is a direct lookup - very fast and cheap. Returns current position, velocity, altitude, and callsign if aircraft is currently flying. ⚠️ This tool costs 1 token per use."
    - **Token Cost**: 1 token per use (unconditional flat cost)
    - **Input Schema**:
      - `icao24` (string, required): ICAO 24-bit address (6 hex characters)
    - **Output Format**: JSON with icao24, callsign, origin_country, position (lat/lon/altitude), velocity (speed/track/vertical_rate), last_contact, squawk
    - Max Output Length: 5000 characters (post-sanitization)
    - **MCP Prompt Descriptions**: Not implemented

  - Tool 2: findAircraftNearLocation
    - **Description (Verbatim)**: "Find all aircraft currently flying near a geographic location. Provide latitude, longitude, and search radius in kilometers. Server calculates the bounding box and queries for all aircraft in that area. Returns list of aircraft with position, velocity, altitude, callsign, and origin country. ⚠️ This tool costs 3 tokens per use."
    - **Token Cost**: 3 tokens per use (unconditional flat cost)
    - **Input Schema**:
      - `latitude` (number, required): Center point latitude (-90 to 90)
      - `longitude` (number, required): Center point longitude (-180 to 180)
      - `radius_km` (number, required): Search radius in kilometers (1-1000)
    - **Output Format**: JSON with search_center, radius_km, aircraft_count, aircraft array
    - Max Output Length: 5000 characters (post-sanitization)
    - **MCP Prompt Descriptions**: Not implemented

  - Tool 3: getAircraftByCallsign
    - **Description (Verbatim)**: "Find aircraft by callsign (flight number). This requires a global scan of ALL currently flying aircraft (expensive operation). Provide the aircraft callsign (e.g., 'LOT456', 'UAL123'). Returns aircraft position, velocity, altitude, and origin country if found. ⚠️ This tool costs 10 tokens per use (global scan is expensive)."
    - **Token Cost**: 10 tokens per use (unconditional flat cost)
    - **Input Schema**:
      - `callsign` (string, required): Aircraft callsign (1-8 alphanumeric characters)
    - **Output Format**: Same as getAircraftByIcao (single aircraft object or null)
    - Max Output Length: 5000 characters (post-sanitization)
    - **MCP Prompt Descriptions**: Not implemented

* **PII Redaction (is active)**: Yes - pilpat-mcp-security v1.1.0 with Polish patterns (PESEL, ID cards, passports, phones, credit cards, SSN, bank accounts). Email redaction disabled by default.

* **Primary Domain**: https://opensky.wtyczki.ai

* **Workers AI status (is active, model)**: Configured but not active - AI binding present, reserved for future enhancements

* **Caching strategy**: No caching implemented. Rationale: Aircraft positions change every 10-15 seconds (real-time tracking); caching would provide stale/incorrect data; users expect current positions; CACHE_KV configured but intentionally not used.

---

**Architecture Notes**:
- Dual-layer authentication: WorkOS (user auth) + OpenSky OAuth2 client credentials (API auth)
- Stateful Durable Object: Stores OpenSky access_token with 30-minute expiry and 5-minute auto-refresh buffer
- Expensive tool as warning pattern: getAircraftByCallsign (10 tokens) discourages global scans
- LLM-optimized data transformation: 3-stage pipeline (raw → parsed → semantic grouping)
- Geographic calculations: Flat-Earth bounding box approximation (accurate for < 100km radius)
- External API: OpenSky Network REST API (OAuth2 client credentials)
- Dual authentication: OAuth (server.ts) complete, API key path (api-key-handler.ts) pending
- Security: Step 4.5 implemented in OAuth path (3 tool paths)