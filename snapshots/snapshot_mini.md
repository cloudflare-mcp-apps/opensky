# OpenSky Flight Tracker MCP Server - Mini Snapshot

**Generated**: 2025-11-27 (Updated for SDK 1.20+ Migration)

---

- **Human-Readable Name**: OpenSky Flight Tracker MCP Server

- **Workers AI Status**: Configured (not actively used)
- **AI Usage**: Pre-configured for future enhancements (flight prediction, route analysis)

- **AI Gateway Status**: Configured (environment variable) but not actively used
- **Gateway ID**: mcp-production-gateway (shared across all MCP servers)

- **Total Tools**: 2

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

* **PII Redaction (is active)**: Yes - pilpat-mcp-security v1.1.0 with Polish patterns (PESEL, ID cards, passports, phones, credit cards, SSN, bank accounts). Email redaction disabled by default.

* **Primary Domain**: https://opensky.wtyczki.ai

* **AnythingLLM MCP Configuration**:
```json
{
  "mcpServers": {
    "opensky": {
      "url": "https://opensky.wtyczki.ai/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer wtyk_YOUR_API_KEY_HERE"
      }
    }
  }
}
```
Note: The server name ("opensky") is a local identifier - change it to whatever you prefer.

* **Workers AI status (is active, model)**: Configured but not active - AI binding present, reserved for future enhancements

* **Caching strategy**: No caching implemented. Rationale: Aircraft positions change every 10-15 seconds (real-time tracking); caching would provide stale/incorrect data; users expect current positions; CACHE_KV configured but intentionally not used.

---

**Architecture Notes**:
- **SDK 1.20+ Features**: registerTool() API for cleaner tool registration, structuredContent field for LLM optimization
  - All 2 tools use registerTool() API (both OAuth and API key paths)
  - structuredContent enables direct JSON access for Claude and other LLM clients
- Dual-layer authentication: WorkOS (user auth) + OpenSky OAuth2 client credentials (API auth)
- Stateful Durable Object: Stores OpenSky access_token with 30-minute expiry and 5-minute auto-refresh buffer
- LLM-optimized data transformation: 3-stage pipeline (raw → parsed → semantic grouping)
- Geographic calculations: Flat-Earth bounding box approximation (accurate for < 100km radius)
- External API: OpenSky Network REST API (OAuth2 client credentials)
- Dual authentication: OAuth (server.ts) + API key (api-key-handler.ts) both fully implemented with registerTool() parity
- Security: Step 4.5 implemented in all 4 tool paths (2 OAuth + 2 API key), DNS rebinding protection added to API key path