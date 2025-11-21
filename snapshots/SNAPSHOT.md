# OpenSky Flight Tracker - Infrastructure Snapshot

**Generated**: 2025-11-20
**Repository**: opensky
**Status**: Production

---

## 1. Project Identity Metrics

- **Human-Readable Name**: OpenSky Flight Tracker MCP Server
- **Server Slug**: opensky
- **Wrangler Name**: opensky

---

## 2. AI Infrastructure (Intelligence Stack)

### Workers AI

- **Workers AI Status**: Configured (not actively used)
- **Binding**: AI
- **AI Usage**: Pre-configured for future enhancements (flight prediction, route analysis)

### AI Gateway

- **AI Gateway Status**: Configured
- **Gateway ID**: mcp-production-gateway (shared across all MCP servers)
- **Configuration**: Token stored as `AI_GATEWAY_TOKEN` secret
- **Current Usage**: Not actively used (no AI inference in this server)
- **Purpose**: Ready for future AI features (flight path prediction, delay analysis)

---

## 3. Detailed Tool Audit (Tool Inventory)

### Tool Registry

**Total Tools**: 3

#### Tool 1: getAircraftByIcao

**Technical Name**: `getAircraftByIcao`

**Description (Verbatim)**:
> "Get aircraft details by ICAO 24-bit transponder address (hex string, e.g., '3c6444'). This is a direct lookup - very fast and cheap. Returns current position, velocity, altitude, and callsign if aircraft is currently flying. ⚠️ This tool costs 1 token per use."

**Token Cost**: 1 token per use (unconditional flat cost)

**Input Schema**:
- `icao24` (string, required): ICAO 24-bit address (6 hex characters, e.g., '3c6444' or 'a8b2c3')

**Dual Auth Parity**: ⚠️ OAuth path only (API key path not implemented)
- OAuth Path: src/server.ts:67-170
- API Key Path: Not implemented (skeleton only)

**Implementation Details**:
- External API: OpenSky Network REST API (https://opensky-network.org/api/states/all)
- Query Type: Direct ICAO24 lookup (most efficient method)
- API Credit Cost: 1 OpenSky credit
- Pricing Model: Flat cost (1 token always, no caching)
- OAuth2 Token: 30-minute lifetime with 5-minute buffer auto-refresh
- Max Output Length: 5000 characters (post-sanitization)

**Output Format**:
```json
{
  "icao24": "3c6444",
  "callsign": "LOT456",
  "origin_country": "Poland",
  "position": {
    "latitude": 52.2297,
    "longitude": 21.0122,
    "altitude_m": 10668,
    "on_ground": false
  },
  "velocity": {
    "ground_speed_ms": 240.5,
    "vertical_rate_ms": 5.2,
    "true_track_deg": 85.3
  },
  "last_contact": 1732118400,
  "squawk": "2000"
}
```

**MCP Prompt Descriptions**: Not implemented (no custom prompts defined)

---

#### Tool 2: findAircraftNearLocation

**Technical Name**: `findAircraftNearLocation`

**Description (Verbatim)**:
> "Find all aircraft currently flying near a geographic location. Provide latitude, longitude, and search radius in kilometers. Server calculates the bounding box and queries for all aircraft in that area. Returns list of aircraft with position, velocity, altitude, callsign, and origin country. ⚠️ This tool costs 3 tokens per use."

**Token Cost**: 3 tokens per use (unconditional flat cost)

**Input Schema**:
- `latitude` (number, required): Center point latitude in decimal degrees (-90 to 90, e.g., 52.2297 for Warsaw)
- `longitude` (number, required): Center point longitude in decimal degrees (-180 to 180, e.g., 21.0122 for Warsaw)
- `radius_km` (number, required): Search radius in kilometers (1-1000, e.g., 25 for 25km radius)

**Dual Auth Parity**: ⚠️ OAuth path only (API key path not implemented)
- OAuth Path: src/server.ts:173-294
- API Key Path: Not implemented (skeleton only)

**Implementation Details**:
- External API: OpenSky Network REST API with bounding box query
- Geographic Calculation: Flat-Earth approximation (accurate for < 100km radius)
- Bounding Box Formula: lat ± (radius/R) * (180/π), lon ± (radius/R) * (180/π) / cos(lat)
- API Credit Cost: 1-3 OpenSky credits (depends on bounding box area)
  - 0-25 sq deg (< 500x500km): 1 credit
  - 25-100 sq deg (< 1000x1000km): 2 credits
  - 100-400 sq deg (< 2000x2000km): 3 credits
- Pricing Model: Flat cost (3 tokens always, no caching)
- Max Output Length: 5000 characters (post-sanitization)

**Output Format**:
```json
{
  "search_center": {
    "latitude": 52.2297,
    "longitude": 21.0122
  },
  "radius_km": 25,
  "aircraft_count": 12,
  "aircraft": [
    { /* aircraft data */ }
  ]
}
```

**MCP Prompt Descriptions**: Not implemented (no custom prompts defined)

---

#### Tool 3: getAircraftByCallsign

**Technical Name**: `getAircraftByCallsign`

**Description (Verbatim)**:
> "Find aircraft by callsign (flight number). This requires a global scan of ALL currently flying aircraft (expensive operation). Provide the aircraft callsign (e.g., 'LOT456', 'UAL123'). Returns aircraft position, velocity, altitude, and origin country if found. ⚠️ This tool costs 10 tokens per use (global scan is expensive)."

**Token Cost**: 10 tokens per use (unconditional flat cost)

**Input Schema**:
- `callsign` (string, required): Aircraft callsign (1-8 alphanumeric characters, e.g., 'LOT456' or 'UAL123')

**Dual Auth Parity**: ⚠️ OAuth path only (API key path not implemented)
- OAuth Path: src/server.ts:297-405
- API Key Path: Not implemented (skeleton only)

**Implementation Details**:
- External API: OpenSky Network REST API (global scan, no filters)
- Query Type: Global state retrieval + server-side filtering
- API Credit Cost: 4 OpenSky credits (most expensive operation)
- Pricing Model: Flat cost (10 tokens always, reflects high API cost)
- Server-Side Filtering: Callsign matching in Workers runtime (not API-supported)
- Max Output Length: 5000 characters (post-sanitization)

**Why So Expensive**: OpenSky API doesn't support direct callsign queries. Must fetch ALL flying aircraft (~10,000-20,000 records) and filter locally. This is the most expensive operation available.

**Output Format**: Same as getAircraftByIcao (single aircraft object or null)

**MCP Prompt Descriptions**: Not implemented (no custom prompts defined)

---

## 4. Security and Compliance

### Vendor Hiding

✅ **Compliant**: No vendor names detected in tool descriptions
- "OpenSky Network": Not mentioned in any tool description
- Tool descriptions focus on functionality ("aircraft tracking", "geographic search")

### PII Redaction

✅ **Active**: pilpat-mcp-security v1.1.0

**Configuration**:
```typescript
redactEmails: false       // v1.1.0+ default
redactPhones: true        // Redact phone numbers
redactCreditCards: true   // Redact credit card numbers
redactSSN: true           // Redact Social Security Numbers
redactBankAccounts: true  // Redact bank account numbers
redactPESEL: true         // Polish national ID
redactPolishIdCard: true  // Polish ID cards
redactPolishPassport: true // Polish passports
redactPolishPhones: true  // Polish phone numbers
```

**Rationale**: OpenSky API responses contain aviation technical data (coordinates, callsigns, transponder codes) - extremely low PII risk. Security layer primarily protects against edge cases where user input might accidentally include sensitive data.

**Security Processing**: Implemented at Step 4.5 in OAuth path (all 3 tools)
- `sanitizeOutput()`: HTML removal, control character stripping, whitespace normalization
- `redactPII()`: Pattern-based PII detection with Polish market support
- Security logging: Console warnings when PII patterns detected

**Output Sanitization**:
- Max length (all tools): 5,000 characters
- HTML removal: Enabled
- Control chars: Stripped
- Whitespace: Normalized

---

## 5. Deployment Status

### Consistency Tests

**Script**: `../../scripts/verify-consistency.sh`
**Result**: Assumed ✅ (pre-deployment validation required)

**Verified Components** (expected):
- Durable Objects configuration (OpenSkyMcp)
- KV namespace bindings (OAUTH_KV, CACHE_KV, USER_SESSIONS)
- D1 database binding (TOKEN_DB)
- Custom domain configuration (opensky.wtyczki.ai)
- Workers AI binding (AI)

### Production URL

**Primary Domain**: https://opensky.wtyczki.ai
**Workers.dev**: Disabled (security best practice)

**Custom Domain Configuration**:
- Pattern: opensky.wtyczki.ai
- Custom Domain: Enabled
- Automatic DNS: Yes
- Automatic TLS: Yes

---

## 6. Infrastructure Components

### Durable Objects

1. **OpenSkyMcp**: MCP protocol handling, WebSocket management, OAuth2 token storage
   - **State Management**: Stores OpenSky access_token and expires_at timestamp
   - **Token Lifecycle**: 30-minute expiry with 5-minute buffer for auto-refresh
   - **Token Refresh Logic**: Automatic re-authentication when token expires

### KV Namespaces (Shared)

1. **OAUTH_KV** (b77ec4c7e96043fab0c466a978c2f186): OAuth token storage (WorkOS)
2. **CACHE_KV** (fa6ff790f146478e85ea77ae4a5caa4b): API response caching (not actively used)
3. **USER_SESSIONS** (e5ad189139cd44f38ba0224c3d596c73): Custom login sessions (mandatory)

**Note**: CACHE_KV is configured but not actively used (no KV caching implemented in current version).

### D1 Database (Shared)

**Binding**: TOKEN_DB
**Database ID**: ebb389aa-2d65-4d38-a0da-50c7da9dfe8b
**Database Name**: mcp-tokens-database

### Workers AI

**Status**: Configured (not actively used)
**Binding**: AI
**Purpose**: Pre-configured for future enhancements

### Secrets (Wrangler)

1. **WORKOS_CLIENT_ID**: WorkOS OAuth client ID (user authentication)
2. **WORKOS_API_KEY**: WorkOS authentication API key (user authentication)
3. **OPENSKY_CLIENT_ID**: OpenSky Network OAuth2 client ID (API authentication)
4. **OPENSKY_CLIENT_SECRET**: OpenSky Network OAuth2 client secret (API authentication)
5. **AI_GATEWAY_TOKEN**: AI Gateway authentication (configured, not yet used)

---

## 7. Architecture Patterns

### Authentication

**Dual-Layer Authentication Pattern**:

1. **User Authentication** (WorkOS Magic Auth):
   - User logs in via email + 6-digit code
   - Session stored in USER_SESSIONS KV
   - User ID retrieved for token balance checks

2. **API Authentication** (OpenSky OAuth2 Client Credentials):
   - Server authenticates to OpenSky API independently
   - Access token stored in Durable Object state
   - 30-minute token lifetime with automatic refresh
   - User never sees or interacts with OpenSky credentials

**This is NOT the same as dual transport (SSE + HTTP)** - this server has dual authentication layers for different purposes.

### OAuth2 Token Management (OpenSky API)

**Token Lifecycle Pattern**:
1. Check Durable Object state for existing token
2. If token exists and expires_at > now + 5 minutes → Use cached token
3. If token missing or expiring soon → Fetch new token:
   ```
   POST https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token
   Body: grant_type=client_credentials&client_id=...&client_secret=...
   ```
4. Parse response (access_token, expires_in)
5. Store in Durable Object state (expires_at = now + expires_in)
6. Return access token for API requests

**Key Features**:
- **5-Minute Buffer**: Refreshes token 5 minutes before expiry (prevents mid-request expiration)
- **Stateful Storage**: Token persists across multiple tool calls (no re-auth overhead)
- **Automatic Refresh**: No manual token management required

### Pricing Model

**Flat Cost (No Caching)**: All tools charge tokens regardless of API credit usage

| Tool | Token Cost | OpenSky Credits | Rationale |
|------|------------|-----------------|-----------|
| getAircraftByIcao | 1 token | 1 credit | Direct lookup (cheapest operation) |
| findAircraftNearLocation | 3 tokens | 1-3 credits | Geographic query (medium cost) |
| getAircraftByCallsign | 10 tokens | 4 credits | Global scan + filtering (expensive) |

**Why No Caching**:
- Aircraft data changes every 10-15 seconds (real-time tracking)
- Caching would provide stale/incorrect data
- Users expect current positions, not historical snapshots
- KV caching namespace configured but not used

### Geographic Calculations

**Bounding Box Algorithm** (src/api-client.ts:132-152):
```typescript
// Flat-Earth approximation (accurate for < 100km radius)
const R = 6371; // Earth radius in km
const latDelta = (radiusKm / R) * (180 / Math.PI);
const lonDelta = (radiusKm / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

return {
  lamin: lat - latDelta,
  lomin: lon - lonDelta,
  lamax: lat + latDelta,
  lomax: lon + lonDelta
};
```

**Trade-offs**:
- Simple calculation (fast, low CPU)
- Good accuracy for < 100km radius
- Breaks down near poles (latitude convergence)
- For production at scale, consider haversine formula

---

## 8. Code Quality

### Type Safety

**TypeScript**: ✅ Strict mode enabled
**Zod Schemas**: ✅ Input validation with regex patterns
**Type Definitions**: Comprehensive types for:
- OpenSkyApiResponse (raw API format - 18-field arrays)
- OpenSkyStateVector (parsed intermediate format)
- AircraftData (LLM-optimized output format)

**Data Transformation Pipeline**:
1. Raw API: `Array<[string, string|null, ...]>` (18 fields)
2. Parse: `OpenSkyStateVector` (named fields, technical metadata)
3. Transform: `AircraftData` (semantic grouping, LLM-friendly)

### Error Handling

- User authentication: Checked in Step 1 (userId from props)
- Insufficient tokens: Checked in Step 2 (balance verification)
- Invalid ICAO24 format: Regex validation (6 hex characters)
- Invalid callsign format: Regex validation (1-8 alphanumeric)
- Invalid coordinates: Range validation (-90 to 90 lat, -180 to 180 lon)
- Invalid radius: Range validation (1-1000 km)
- OAuth2 token failure: HTTP status + error text logging
- API failures: HTTP status + error text logging
- Empty results: Graceful "no aircraft found" messages

### Observability

**Cloudflare Observability**: Enabled (wrangler.jsonc:166)

**Console Logging**:
- OAuth2 token lifecycle (cached/refreshed, expires in X seconds)
- API request URLs (with query params)
- Aircraft count in responses
- ICAO24/callsign search queries
- Geographic search parameters (lat, lon, radius → bbox)
- PII detection warnings (Step 4.5)
- Error traces with HTTP status codes

---

## 9. Technical Specifications

### Performance

- **OAuth2 Token Expiry**: 1800 seconds (30 minutes)
- **Token Refresh Buffer**: 300 seconds (5 minutes before expiry)
- **API Timeout**: Not specified (uses default fetch timeout)
- **Max Output Length**: 5000 characters (all tools)

### Dependencies

**Production**:
- @modelcontextprotocol/sdk: ^1.18.2
- @cloudflare/workers-oauth-provider: ^0.0.11
- @workos-inc/node: ^7.70.0
- agents: ^0.2.4 (McpAgent framework)
- hono: ^4.10.4 (HTTP routing)
- jose: ^6.1.0 (JWT handling)
- pilpat-mcp-security: ^1.1.0 (PII redaction)
- zod: ^3.25.76 (input validation)

**Development**:
- @cloudflare/workers-types: ^4.20250101.0
- typescript: ^5.9.2
- wrangler: ^4.45.3

### External API

**Provider**: OpenSky Network
**Base URL**: https://opensky-network.org/api
**Authentication**: OAuth2 client credentials flow
**Token Endpoint**: https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token
**Data Endpoint**: GET /api/states/all

**API Capabilities**:
1. **Filter by ICAO24**: `?icao24=3c6444` (1 credit)
2. **Bounding Box Query**: `?lamin=X&lomin=Y&lamax=Z&lomax=W` (1-3 credits)
3. **Global Scan**: No filters (4 credits, ~10,000-20,000 aircraft)
4. **Time Query**: `?time=<unix_timestamp>` (historical data, not used)

**Response Format**: Array of 18-field state vectors (see types.ts:93-112)

**Credit System**:
- Rate limit: Depends on subscription tier
- Credit consumption: Based on query type and bounding box area
- Free tier: 400 credits/day (~100 ICAO lookups or ~25 callsign searches)

---

## 10. Compliance Summary

| Check | Status | Notes |
|---|---|---|
| Vendor Hiding | ✅ | No "OpenSky Network" in descriptions |
| PII Redaction | ✅ | pilpat-mcp-security v1.1.0 with Polish patterns |
| Dual Auth Parity | ⚠️ | OAuth path complete, API key path TODO |
| Security Processing | ✅ | Step 4.5 implemented in all 3 tools |
| Custom Domain | ✅ | opensky.wtyczki.ai |
| Workers.dev Disabled | ✅ | Security best practice |
| Consistency Tests | ⚠️ | Not yet run (pre-deployment) |
| OAuth2 Token Management | ✅ | Auto-refresh with 5-minute buffer |

---

## 11. Unique Architectural Features

### Dual-Layer Authentication

Unlike most MCP servers with single authentication layer, OpenSky implements **two independent OAuth2 flows**:

**Layer 1: User Authentication (WorkOS)**
- Purpose: Identify user, check token balance
- Flow: Magic Auth (email + 6-digit code)
- Session: Stored in USER_SESSIONS KV
- Expiry: 24 hours (WorkOS default)

**Layer 2: API Authentication (OpenSky)**
- Purpose: Access external API data
- Flow: OAuth2 client credentials
- Session: Stored in Durable Object state
- Expiry: 30 minutes with auto-refresh

**Benefits**:
1. **Security Isolation**: User never sees OpenSky credentials
2. **Shared Token Pool**: One OpenSky token serves all users
3. **Cost Efficiency**: No per-user API authentication overhead
4. **Transparent Refresh**: Token management invisible to users

### Stateful Durable Object

**Why State is Necessary**: OAuth2 token persistence across requests

**State Schema**:
```typescript
{
  opensky_access_token: string | null,
  opensky_token_expires_at: number | null  // Unix timestamp in ms
}
```

### Expensive Tool as Warning Pattern

**getAircraftByCallsign (10 tokens)** serves as an economic disincentive:

**Design Philosophy**:
1. **API Limitation**: OpenSky doesn't support callsign queries
2. **Workaround Cost**: Global scan is 4x more expensive than ICAO lookup
3. **Price Signal**: 10 tokens (vs 1 for ICAO) guides users toward efficient patterns
4. **Clear Communication**: Description explicitly warns "expensive operation"

**Result**: Users learn to prefer ICAO24 lookups when possible, reducing API costs for everyone.

### LLM-Optimized Data Transformation

**Three-Stage Pipeline** (src/api-client.ts:163-214):

**Stage 1: Raw API Response**
```json
["3c6444", "LOT456  ", "Poland", 1732118400, 1732118400, 21.0122, 52.2297, ...]
```
- Array of 18 fields
- Whitespace-padded strings
- Technical metadata (sensor IDs, position_source codes)

**Stage 2: Parsed State Vector**
```json
{
  "icao24": "3c6444",
  "callsign": "LOT456",  // Trimmed!
  "latitude": 52.2297,
  ...
}
```
- Named fields (developer-friendly)
- Cleaned strings (trimmed whitespace)
- Still includes technical metadata

**Stage 3: LLM-Optimized Aircraft Data**
```json
{
  "icao24": "3c6444",
  "callsign": "LOT456",
  "position": { "latitude": 52.2297, ... },  // Semantic grouping!
  "velocity": { "ground_speed_ms": 240.5, ... }
}
```
- Semantic field grouping (position, velocity)
- Human-readable units (m/s, degrees)
- Technical metadata removed (no sensor IDs, position_source)

**Why This Matters**: LLMs understand semantic structure better than flat key-value pairs.

---

## 12. Implementation Status & TODOs

### Completed Features

✅ **User Authentication**: WorkOS Magic Auth with token database integration
✅ **API Authentication**: OpenSky OAuth2 client credentials with auto-refresh
✅ **Tool 1 (getAircraftByIcao)**: Direct ICAO24 lookup (1 token)
✅ **Tool 2 (findAircraftNearLocation)**: Geographic bounding box search (3 tokens)
✅ **Tool 3 (getAircraftByCallsign)**: Global scan with server-side filtering (10 tokens)
✅ **Security Processing**: Step 4.5 with pilpat-mcp-security v1.1.0 (all 3 tools)
✅ **Input Validation**: Zod schemas with regex patterns (ICAO24, callsign)
✅ **Stateful Token Management**: Durable Object state for OAuth2 token lifecycle
✅ **Geographic Calculations**: Bounding box algorithm for radius queries

### Pending Implementation

⚠️ **API Key Authentication Path**: AnythingLLM compatibility
- src/api-key-handler.ts exists but not implemented
- Requires tool registration + executor functions (5 locations per tool × 3 tools)
- State management complexity: How to handle OpenSky token in API key path?

⚠️ **KV Caching Consideration**:
- CACHE_KV namespace configured but not used
- Real-time data (10-15 second updates) makes caching questionable
- Could cache ICAO24 lookups for 10-15 seconds to reduce costs
- Trade-off: Slight staleness vs API credit savings

⚠️ **Pre-Deployment Validation**:
- Run `../../scripts/verify-consistency.sh`
- Run `../../scripts/validate-runtime-secrets.sh`
- Run `npx tsc --noEmit` (must pass with 0 errors)

⚠️ **Initial Deployment**:
- Configure secrets: `wrangler secret put WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`
- Deploy: `npx wrangler deploy` (one-time initial deployment)
- Configure GitHub integration for automatic deployments

⚠️ **Post-Deployment Testing**:
- Test OAuth flow completion
- Test all 3 tools with real aircraft data
- Verify OpenSky token auto-refresh behavior (wait 30 minutes)
- Check token consumption accuracy
- Test invalid inputs (bad ICAO24, bad callsign, invalid coordinates)

---

## 13. Tool Pricing Rationale

### getAircraftByIcao (1 token)

**Cost Breakdown**:
- Direct ICAO24 lookup (cheapest OpenSky operation)
- 1 OpenSky API credit
- Small response (~500 bytes single aircraft)
- Low LLM context value (single data point)

**Use Case**: User knows exact aircraft transponder code

### findAircraftNearLocation (3 tokens)

**Cost Breakdown**:
- Geographic bounding box query
- 1-3 OpenSky API credits (depends on area)
- Medium response (~2-10 KB, typically 5-50 aircraft)
- Medium LLM context value (regional snapshot)

**Use Case**: "Show me flights near Warsaw airport", "What's flying over Berlin right now?"

### getAircraftByCallsign (10 tokens)

**Cost Breakdown**:
- Global scan of ALL aircraft (4 OpenSky credits)
- Server-side filtering (CPU cost)
- Response size same as getAircraftByIcao (~500 bytes)
- Low LLM context value BUT high infrastructure cost

**Use Case**: "Where is LOT456 right now?" (when ICAO24 unknown)

**Economic Signal**: High price discourages usage, guides users toward ICAO24 lookups

---

## 14. Future Enhancement Opportunities

### Potential Tool Additions

1. **getFlightRoute**: Historical flight path from departure to current position
   - Cost: 5-8 tokens (requires multiple API calls)
   - Use case: "Show me the route LOT456 took today"

2. **getAirportTraffic**: All aircraft within 50km of major airport
   - Cost: 4 tokens (fixed bounding box)
   - Use case: "How busy is Warsaw Chopin Airport right now?"

3. **compareFlightPaths**: Side-by-side route comparison for 2+ flights
   - Cost: 6-10 tokens (multi-flight query)
   - Use case: "Compare routes of LOT456 and LOT457"

### Workers AI Integration Ideas

1. **AI-Powered Flight Delay Prediction**:
   - Model: Llama 3.3 70B or similar
   - Input: Current position, typical route, weather data
   - Output: Estimated arrival delay probability
   - Token cost: +5 tokens (total 6 for getAircraftByIcao + prediction)

2. **Route Anomaly Detection**:
   - Model: Fast classification model
   - Input: Flight path waypoints
   - Output: Unusual route deviations flagged
   - Use case: Safety monitoring, flight tracking insights

3. **Natural Language Flight Search**:
   - Model: Text embedding model
   - Input: "Flights from Poland to UK"
   - Processing: Embed query → match against real-time data
   - Output: Relevant aircraft list
   - Token cost: 7-10 tokens (embedding + filtering)

### KV Caching Strategy (If Implemented)

**Short-TTL Caching for ICAO24 Lookups**:
- Cache key: `flight:${icao24}:${Math.floor(Date.now() / 15000)}` (15-second buckets)
- TTL: 15 seconds (matches OpenSky data update frequency)
- Benefit: Reduces API credits if same aircraft queried multiple times quickly
- Risk: Minimal staleness (15 seconds acceptable for most use cases)

**Why Not Cache Now**: Real-time data expectation > cost savings

---

## 15. Known Limitations & Design Decisions

### No Callsign Index

**Problem**: OpenSky API doesn't support direct callsign queries
**Workaround**: Global scan + server-side filtering
**Cost Impact**: 10 tokens (vs 1 for ICAO24)
**Alternative Considered**: Build local callsign→ICAO24 cache (rejected due to maintenance complexity)

### Flat-Earth Approximation

**Problem**: Bounding box calculations inaccurate near poles
**Impact**: Search radius increasingly inaccurate above 70° latitude
**Mitigation**: Max radius limited to 1000km (reduces error)
**Future Fix**: Implement haversine formula for high-latitude queries

### No Historical Data

**Problem**: OpenSky API supports `?time=<timestamp>` but not implemented
**Reason**: Historical queries cost 4x more credits, limited user value
**Future**: Could add `getHistoricalPosition(icao24, timestamp)` tool (8-10 tokens)

### No Caching Despite CACHE_KV

**Decision**: Real-time data prioritized over cost savings
**Rationale**: Aircraft positions change every 10-15 seconds
**User Expectation**: "Where is flight X right now?" implies current position
**Trade-off**: Higher API costs but better UX

---

**End of Snapshot**