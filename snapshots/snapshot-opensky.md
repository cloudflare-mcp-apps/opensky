# OpenSky Flight Tracker MCP App - Infrastructure Snapshot

**Generated**: 2025-12-18
**Repository**: opensky
**Status**: Production
**Architecture**: MCP Apps (SEP-1865) - Resource Server with Shared D1 Database

---

## 1. Project Identity Metrics

- **Human-Readable Name**: OpenSky Flight Tracker
- **Server Slug**: opensky
- **Wrangler Name**: opensky
- **Server Description**: Free, open-source MCP server for real-time aircraft tracking via OpenSky Network API. Track flights by ICAO code or search aircraft near any location with interactive maps powered by Leaflet.
- **Primary Domain**: https://opensky.wtyczki.ai

### Visual Identity
- **Server Icon**: ✅ Implemented (using default)
- **Tool Icons**: ✅ Implemented (using tool metadata)
- **Display Name Resolution**: ✅ Title prioritization configured

### MCP Apps (SEP-1865) Configuration
- **Assets Binding**: ✅ ASSETS from ./web/dist/widgets
- **Widget Build System**: ✅ Vite + vite-plugin-singlefile
- **UI Resource URIs**: ui://opensky/flight-map
- **Two-Part Registration**: ✅ Resource + Tool with _meta linkage

---

## 2. Required Functionalities Status

### 2.1 Dual Authentication (WorkOS + API Keys)
- **OAuth Path Status**: ✅ Implemented
  - Provider: WorkOS AuthKit
  - `/authorize` endpoint: ✅
  - `/callback` validation: ✅
  - USER_SESSIONS KV: ✅ Shared
  - Session expiration: 24h

- **API Key Path Status**: ✅ Implemented
  - `src/api-key-handler.ts`: ✅
  - Format validation (`wtyk_*`): ✅
  - DNS rebinding protection: ✅
  - Dual registration (registerTool + executor): ✅

- **Props Extraction**: ✅ { userId, email }
- **Shared Infrastructure**:
  - D1 Database (mcp-oauth): ✅ eac93639-d58e-4777-82e9-f1e28113d5b2
  - OAUTH_KV: ✅ b77ec4c7e96043fab0c466a978c2f186
  - USER_SESSIONS KV: ✅ e5ad189139cd44f38ba0224c3d596c73

### 2.2 Transport Protocol (McpAgent)
- **`/mcp` Endpoint (Streamable HTTP)**: ✅ Implemented
- **Durable Object Class**: OpenSkyMcp extends McpAgent
- **WebSocket Hibernation**: ✅ Configured
- **McpAgent SDK**: agents v0.2.30

### 2.3 Tool Implementation (SDK 1.25+)
- **MCP SDK Version**: @modelcontextprotocol/sdk ^1.25.1
- **registerTool() API**: ✅ Used
- **outputSchema (Zod)**: ✅ Defined for all tools
- **structuredContent**: ✅ Returned
- **isError Flag**: ✅ Implemented
- **Tool Descriptions**: ✅ 4-part pattern (Purpose → Returns → Use Case → Constraints)

### 2.4 Tool Descriptions (4-Part Pattern)
- **Part 1 (Purpose)**: ✅ "[Action] [what it does]."
- **Part 2 (Returns)**: ✅ "Returns [fields]."
- **Part 3 (Use Case)**: ✅ "Use when [scenario]."
- **Part 4 (Constraints)**: ✅ "Note: [limitations]."
- **Vendor names hidden**: ✅ Hidden (OpenSky Network not mentioned in descriptions)
- **Dual-path consistency**: ✅ Identical

### 2.5 Centralized Login (panel.wtyczki.ai)
- **USER_SESSIONS KV Integration**: ✅ Implemented
- **Session cookie check**: ✅ Implemented
- **Database validation**: ✅ `is_deleted` check
- **Redirect flow**: ✅ Configured

### 2.6 Prompts (SDK 1.20+ Server Primitive)
- **Prompts Capability**: ✅ Declared (`listChanged: true`)
- **Total Prompts Registered**: 2
- **registerPrompt() API**: ✅ Used
- **Zod Validation**: ✅ All parameters validated
- **Naming Convention**: ✅ kebab-case

**Prompt List**:
1. **search-aircraft**: Search for an aircraft by ICAO code to get real-time flight details
2. **search-aircraft-near-location**: Find all aircraft flying near a geographic location with optional country filter

---

## 3. Optional Functionalities Status

### 3.1 Stateful Session
- **Status**: ✅ Implemented
- **initialState**: `{ opensky_access_token, opensky_token_expires_at }`
- **State usage**: OAuth2 token caching for OpenSky Network API with 30-minute auto-refresh

### 3.2 Completions (OAuth only)
- **Status**: ❌ Not Implemented
- **completable() wrapper**: ❌
- **Use cases**: N/A

### 3.3 Workers AI (Pattern 3)
- **Status**: ⚠️ Configured but inactive
- **Binding**: AI
- **Model ID**: N/A (binding configured for future use)
- **Use cases**: Reserved for future AI-powered features
- **KV caching**: ❌

### 3.4 Workflows & Async Processing (Pattern 4)
- **Status**: ❌ Not configured
- **Binding**: N/A
- **Workflow Class**: N/A
- **Tool pair pattern**: ❌ N/A
- **R2 storage**: ❌ N/A

### 3.5 Rate Limiting (Pattern 5)
- **Status**: ⚠️ Planned
- **DO state tracking**: ❌
- **Multi-key rotation**: ❌
- **Backoff responses**: ❌

### 3.6 KV Caching Strategy
- **Status**: ❌ Not Implemented
- **Binding**: N/A
- **Cache TTL**: N/A
- **Cache key pattern**: N/A

### 3.7 R2 Storage & Export
- **Status**: ❌ Not Implemented
- **Binding**: N/A
- **Bucket name**: N/A
- **Use cases**: N/A
- **Signed URLs**: ❌

### 3.8 ResourceLinks
- **Status**: ❌ Not Implemented
- **type: 'resource_link'**: ❌

### 3.9 Elicitation
- **Status**: ❌ Not Needed
- **Form mode**: ❌
- **URL mode**: ❌

### 3.10 Dynamic Tools
- **Status**: ❌ Not Implemented
- **Dynamic control methods**: N/A

### 3.11 Tasks Protocol (Experimental)
- **Status**: ❌ Not Needed
- **TaskManager DO**: ❌
- **tasks/get endpoint**: ❌
- **tasks/result endpoint**: ❌
- **tasks/cancel endpoint**: ❌

### 3.12 Resources (MCP Apps - SEP-1865)
- **Status**: ✅ Implemented
- **registerResource() API**: ✅ Used
- **Resource URIs**: ui://opensky/flight-map
- **Resource Templates**: ✅ Predeclared
- **MIME Type**: text/html;profile=mcp-app (UI_MIME_TYPE constant)
- **Handler Pattern**: ✅ async handler with loadHtml()
- **_meta Field**: ✅ Includes title, icon, description, CSP

**Example Resource Registration**:
```typescript
this.server.registerResource(
    flightMapResource.uri,    // "ui://opensky/flight-map"
    flightMapResource.uri,    // Same for predeclared resources
    {
        description: flightMapResource.description,
        mimeType: UI_MIME_TYPE,
    },
    async () => {
        const html = await loadHtml(this.env.ASSETS, "/flight-map.html");
        return {
            contents: [{
                uri: flightMapResource.uri,
                mimeType: UI_MIME_TYPE,
                text: html,
                _meta: flightMapResource._meta,
            }],
        };
    }
);
```

### 3.13 Sampling
- **Status**: ❌ Not Needed
- **createMessage() API**: ❌

---

## 4. Detailed Tool Audit (Tool Inventory)

### Tool Registry
**Total Tools**: 2

---

#### Tool 1: getAircraftByIcao

**Technical Name**: `getAircraftByIcao`

**Display Title**: Get Aircraft By ICAO

**Description (Verbatim)**:
> "Get real-time aircraft details by ICAO 24-bit transponder address. Returns current position (latitude, longitude, altitude), velocity (ground speed, vertical rate, heading), callsign, origin country, and last contact timestamp. Use this when you need to track a specific aircraft by its unique hex identifier (e.g., '3c6444'). Note: Only returns data if the aircraft is currently in flight and broadcasting ADS-B signals. Returns null if not found or aircraft is grounded."

**Input Schema**:
- `icao24` (string, required): ICAO 24-bit address (6 hex characters, e.g., '3c6444' or 'a8b2c3')

**Output Schema**:
- ✅ Defined
- **Fields**: icao24, callsign, origin_country, position (latitude, longitude, altitude_m, on_ground), velocity (ground_speed_ms, vertical_rate_ms, true_track_deg), last_contact, squawk

**Dual Auth Parity**: ✅ Confirmed
- OAuth Path: src/server.ts:131-167
- API Key Path (Registration): src/api-key-handler.ts:337-351
- API Key Path (Executor): src/api-key-handler.ts:828-854

**Implementation Details**:
- **External API**: OpenSky Network API
- **Authentication**: OAuth2 client credentials flow with 30-minute token auto-refresh
- **Timeout**: Standard HTTP timeout
- **Cache TTL**: No caching (real-time data)
- **Pricing Model**: FREE (0 tokens)
- **Special patterns**: OAuth token caching in Durable Object state

**Output Format**:
- Returns Aircraft object with position, velocity, and metadata OR null if not found

**Tool Behavior Hints**:
- **readOnlyHint**: ✅ (read-only operation)
- **destructiveHint**: ❌
- **idempotentHint**: ✅ (repeated calls return same data for same input)
- **openWorldHint**: ✅ (external API data)

**MCP Prompt Integration**: ✅ Used in prompt search-aircraft

---

#### Tool 2: findAircraftNearLocation

**Technical Name**: `findAircraftNearLocation`

**Display Title**: Find Aircraft Near Location

**Description (Verbatim)**:
> "Find all aircraft currently flying near a geographic location. Returns list of aircraft with position (lat/lon/altitude), velocity (speed, vertical rate, heading), callsign, ICAO address, origin country, and last contact timestamp. Use this when you want to discover flight activity in a region (e.g., aircraft over a city or near an airport). Optionally filter by origin country (ISO code). Note: Searches within a radius up to 1000km. Large search areas may return many results. Only includes aircraft broadcasting ADS-B signals."

**Input Schema**:
- `latitude` (number, required): Center point latitude in decimal degrees (-90 to 90, e.g., 52.2297 for Warsaw)
- `longitude` (number, required): Center point longitude in decimal degrees (-180 to 180, e.g., 21.0122 for Warsaw)
- `radius_km` (number, required): Search radius in kilometers (1-1000, e.g., 25 for 25km radius)
- `origin_country` (string, optional): Optional filter: ISO 3166-1 alpha-2 country code (e.g., 'US', 'DE', 'FR'). Filters results by aircraft origin country.

**Output Schema**:
- ✅ Defined
- **Fields**: search_center (latitude, longitude), radius_km, origin_country_filter, aircraft_count, aircraft (array of Aircraft objects)

**Dual Auth Parity**: ✅ Confirmed
- OAuth Path: src/server.ts:177-253
- API Key Path (Registration): src/api-key-handler.ts:356-378
- API Key Path (Executor): src/api-key-handler.ts:859-906

**Implementation Details**:
- **External API**: OpenSky Network API
- **Authentication**: OAuth2 client credentials flow with 30-minute token auto-refresh
- **Timeout**: Standard HTTP timeout
- **Cache TTL**: No caching (real-time data)
- **Pricing Model**: FREE (0 tokens)
- **Special patterns**: Geographic bounding box calculation, client-side country filtering

**Output Format**:
- Returns object with search metadata and array of Aircraft objects with interactive Leaflet map visualization

**Tool Behavior Hints**:
- **readOnlyHint**: ✅ (read-only operation)
- **destructiveHint**: ❌
- **idempotentHint**: ✅ (repeated calls return same data for same input)
- **openWorldHint**: ✅ (external API data)

**MCP Prompt Integration**: ✅ Used in prompt search-aircraft-near-location

---

## 5. UX & Frontend Quality Assessment (6 Pillars)

### Pillar I: Identity & First Impression
- **Unique server name**: ✅ "OpenSky Flight Tracker"
- **Server icons**: ✅ Configured in tool metadata
- **Tool icons**: ✅ Configured in tool metadata
- **Display name resolution**: ✅ Title prioritization implemented
- **4-part tool descriptions**: ✅ All tools follow pattern
- **Shared description constants**: ✅ Centralized in tools/descriptions.ts

### Pillar II: Model Control & Quality
- **Server instructions (System Prompt)**: ✅ Implemented
  - **Word count**: ~1200 words
  - **Coverage**: Tool usage patterns, performance characteristics, coverage limitations, cost optimization, example queries
- **Input schema descriptions + examples**: ✅ All parameters documented with examples
- **outputSchema**: ✅ All tools have Zod schemas
- **structuredContent**: ✅ All tools return structured data
- **Format examples**: ✅ ICAO codes, coordinates, ISO codes
- **Optional vs Required clarity**: ✅ Explicit in schemas
- **Cross-tool workflow patterns**: ✅ Documented (discovery → ICAO lookup pattern)

### Pillar III: Interactivity & Agency
- **Tool completions (autocomplete)**: ❌ Not implemented
- **Context-aware completions**: ❌ Not implemented
- **Elicitation (Forms/URLs)**: ❌ Not needed
- **Sampling capability**: ❌ Not needed
- **Prompt templates**: ✅ 2 prompts registered
- **Prompt arguments**: ✅ All prompts have validated arguments
- **Multi-modal prompts**: ❌ Text-only

### Pillar IV: Context & Data Management
- **Resource URIs & Templates**: ✅ Predeclared resource (ui://opensky/flight-map)
- **Resource metadata & Icons**: ✅ _meta field with CSP, prefersBorder
- **ResourceLinks**: ❌ Not implemented
- **Embedded resources**: ✅ Widget HTML embedded in resource
- **Last modified & Priority**: ❌ Not applicable
- **Resource subscriptions**: ❌ Not implemented
- **Roots support**: ❌ Not applicable
- **Size hints & Truncation warnings**: ❌ Not needed

### Pillar V: Media & Content Handling
- **MIME type declaration**: ✅ text/html;profile=mcp-app
- **Audio & Image content (base64)**: ❌ Not applicable
- **Data URI support**: ❌ Not applicable
- **Content annotations (audience)**: ❌ Not implemented

### Pillar VI: Operations & Transparency
- **Tasks protocol support**: ❌ Not needed
- **Polling, Cancellation, TTL**: ❌ Not needed
- **Structured logs (RFC-5424)**: ✅ Structured logging via logger.ts
- **isError flag**: ✅ Implemented in all tool handlers

---

## 6. Deployment Status

### Consistency Tests
- **Script**: `../../scripts/verify-consistency.sh`
- **Result**: ✅ All checks passed

**Verified Components**:
- Durable Objects configuration: ✅
- KV namespace bindings: ✅
- D1 database binding: ✅
- R2 bucket binding: ❌ N/A
- Workers AI binding: ✅
- Workflows binding: ❌ N/A
- Custom domain configuration: ✅

### TypeScript Compilation
- **Command**: `npx tsc --noEmit`
- **Result**: ✅ No errors
- **Errors**: N/A

### Production URL
- **Primary Domain**: https://opensky.wtyczki.ai
- **Workers.dev**: ✅ Disabled

**Custom Domain Configuration**:
- Pattern: opensky.wtyczki.ai
- Custom Domain: ✅ Enabled
- Automatic DNS: ✅
- Automatic TLS: ✅

---

## 7. Infrastructure Components

### Cloudflare Assets (MCP Apps)
- **Binding**: ASSETS
- **Directory**: ./web/dist/widgets
- **Purpose**: Serving built widget HTML files for MCP Apps (SEP-1865)
- **Build Command**: npm run build:widgets
- **Widget Files**: flight-map.html

### Durable Objects
1. **OpenSkyMcp extends McpAgent**: MCP protocol handling, session state, OAuth token management
   - Migration tag: v1
   - Purpose: Store OpenSky OAuth2 access token with 30-minute auto-refresh

### KV Namespaces (Shared Across All MCP Apps)
1. **OAUTH_KV**: OAuth token storage for WorkOS AuthKit
   - ID: b77ec4c7e96043fab0c466a978c2f186
   - Preview ID: cf8ef9f38ab24ae583d20dd4e973810c
   - Purpose: McpAgent OAuth handling (required by agents SDK)

2. **USER_SESSIONS**: Centralized session management (shared with panel.wtyczki.ai)
   - ID: e5ad189139cd44f38ba0224c3d596c73
   - Preview ID: 49c43fb4d6e242db87fd885ba46b5a1d
   - Purpose: Cross-service session validation

### D1 Database (Shared Across All MCP Apps)
- **Binding**: TOKEN_DB
- **Database Name**: mcp-oauth
- **Database ID**: eac93639-d58e-4777-82e9-f1e28113d5b2
- **Tables**:
  - users (id, email, workos_user_id, created_at, is_deleted)
  - api_keys (id, user_id, key_hash, description, created_at, is_deleted)
- **Purpose**: Centralized authentication and authorization for all MCP servers
- **Note**: Database may contain additional tables; only authentication-related tables listed here

### R2 Storage
- **Binding**: N/A
- **Bucket Name**: N/A
- **Purpose**: N/A
- **Retention**: N/A
- **Public Access**: N/A

### Workers AI
- **Binding**: AI
- **Status**: ⚠️ Configured but inactive
- **Model(s)**: N/A (reserved for future use)
- **Use cases**: Future AI-powered features
- **Integration**: ❌ Not actively used

### AI Gateway (Shared)
- **Status**: ✅ Configured
- **Gateway ID**: mcp-production-gateway (shared across all MCP servers)
- **Environment Variable**: AI_GATEWAY_ID
- **Cache Policy**: 1-hour TTL for AI responses
- **Rate Limiting**: 60 requests/hour per user
- **Purpose**: Authentication, caching, and rate limiting for AI requests

### Workflows (Cloudflare)
- **Binding**: N/A
- **Workflow Name**: N/A
- **Class**: N/A
- **Status**: ❌ Not configured
- **Use cases**: N/A

### Secrets (Wrangler)
**Required (Shared)**:
1. **WORKOS_CLIENT_ID**: ✅ Set - WorkOS AuthKit client ID
2. **WORKOS_API_KEY**: ✅ Set - WorkOS API key for user validation

**Optional (Server-Specific)**:
3. **OPENSKY_CLIENT_ID**: ✅ Set - OpenSky Network OAuth2 client ID
4. **OPENSKY_CLIENT_SECRET**: ✅ Set - OpenSky Network OAuth2 client secret

---

## 8. Architecture Patterns

### Authentication Architecture
- **Dual Transport**: ✅ OAuth + API Keys
  - OAuth Path: POST /mcp (McpAgent Durable Object)
  - API Key Path: POST /mcp (Direct HTTP handler with LRU cache)

### Caching Strategy
- **Pattern**: OAuth Token Caching in Durable Object State
- **Implementation**:
  1. Check if token exists and is not expired (within 30-minute window)
  2. If expired or missing, request new token via OAuth2 client credentials flow
  3. Store token and expiry timestamp in Durable Object state
  4. Use cached token for subsequent API requests

**Benefits**:
- Reduces OAuth token requests (API rate limit protection)
- Improves response times (no token refresh on cached requests)
- Automatic token refresh ensures no stale tokens

### Concurrency Control
- **Pattern**: None (stateless tool execution)
- **Implementation**: N/A

### Storage Architecture
- **Pattern**: Stateful OAuth Token Caching
- **Workflow**: OAuth token stored in DO state, API responses not cached

---

## 9. Code Quality

### Type Safety
- **TypeScript**: ✅ Strict mode
- **Zod Schemas**: ✅ All inputs validated
- **Custom Validation**: ICAO hex code validation, ISO country code validation, coordinate bounds checking

### Error Handling
- **Account deleted check**: ✅ Implemented (via shared D1 database)
- **External API failures**: ✅ Graceful handling with error messages
- **Invalid inputs**: ✅ Validated via Zod schemas
- **Empty/Zero results**: ✅ Handled (null for ICAO lookup, empty array for geographic search)
- **Token expiry**: ✅ Automatic token refresh
- **Network timeouts**: ✅ Standard HTTP timeout handling

### Observability
- **Cloudflare Observability**: ✅ Enabled

**Console Logging**:
- Authentication events (OAuth, API key validation)
- Tool execution (start, completion, failure)
- OpenSky API calls (token refresh, search queries)
- UI resource registration
- Cache operations (hit, miss, eviction)

**Monitoring Points**:
- Tool execution duration
- Token refresh frequency
- API response times
- Error rates and types

---

## 10. Technical Specifications

### Performance
- **Tool timeout**: 30 seconds per tool (HTTP timeout)
- **Cache TTL**: 30 minutes (OAuth token)
- **Max response size**: Unlimited (depends on search area)
- **Expected latency**:
  - getAircraftByIcao: 2-5 seconds
  - findAircraftNearLocation: 3-8 seconds

### Dependencies

**Production (Common Across MCP Apps)**:
```json
{
  "@cloudflare/workers-oauth-provider": "^0.1.0",
  "@modelcontextprotocol/ext-apps": "^0.2.0",
  "@modelcontextprotocol/sdk": "^1.25.1",
  "@workos-inc/node": "^7.77.0",
  "agents": "^0.2.30",
  "hono": "^4.10.4",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "zod": "^4.1.13"
}
```

**Production (Widget-Specific)**:
```json
{
  "@types/leaflet": "^1.9.21",
  "@types/leaflet.markercluster": "^1.5.6",
  "leaflet": "^1.9.4",
  "leaflet.markercluster": "^1.5.3",
  "clsx": "^2.1.1",
  "tailwind-merge": "^3.4.0"
}
```

**Development**:
```json
{
  "@cloudflare/workers-types": "^4.20250101.0",
  "@types/react": "^18.3.0",
  "@types/react-dom": "^18.3.0",
  "@vitejs/plugin-react": "^4.3.4",
  "autoprefixer": "^10.4.20",
  "concurrently": "^9.2.1",
  "postcss": "^8.4.49",
  "tailwindcss": "^3.4.17",
  "typescript": "^5.9.3",
  "vite": "^6.0.6",
  "vite-plugin-singlefile": "^2.0.3",
  "wrangler": "^4.45.3"
}
```

### SDK Versions
- **MCP SDK**: @modelcontextprotocol/sdk ^1.25.1
- **MCP Apps Extension**: @modelcontextprotocol/ext-apps ^0.2.0
- **Cloudflare Agents SDK**: agents ^0.2.30
- **WorkOS SDK**: @workos-inc/node ^7.77.0
- **Hono Framework**: hono ^4.10.4
- **Zod Validation**: zod ^4.1.13

---

## 11. Compliance Summary

| Check | Status | Notes |
|---|---|---|
| Vendor Hiding | ✅ | OpenSky Network not exposed in tool descriptions |
| Dual Auth Parity | ✅ | OAuth and API key paths identical |
| 4-Part Descriptions | ✅ | All tools follow pattern |
| Custom Domain | ✅ | opensky.wtyczki.ai |
| Workers.dev Disabled | ✅ | Production security enforced |
| Consistency Tests | ✅ | All infrastructure checks passed |
| TypeScript Compilation | ✅ | No errors |
| Prompts Implemented | ✅ | 2 prompts registered |

---

## 12. Unique Architectural Features

### OAuth2 Token Caching Pattern
The OpenSky MCP server implements a stateful OAuth2 token caching strategy using Durable Object state. This pattern:
- Stores access token and expiry timestamp in DO state
- Auto-refreshes tokens before expiry (30-minute window)
- Reduces API calls to OpenSky Network token endpoint
- Improves response times by eliminating redundant OAuth flows

**Why This Matters**:
- OpenSky Network has rate limits on token requests
- Caching prevents hitting rate limits during high-traffic periods
- Maintains API reliability without affecting user experience

### Free Public Service Model
Unlike other MCP servers in the ecosystem, OpenSky operates as a free public service:
- No token consumption (0 tokens per tool call)
- No authentication barriers for end users
- OAuth credentials are server-side only (OpenSky API access)
- Demonstrates how MCP Apps can provide public utilities

**Rationale**:
- Flight tracking data is public information (ADS-B broadcasts)
- Educational and research use cases benefit from free access
- Serves as reference implementation for free MCP services

### Geographic Bounding Box Calculation
The `findAircraftNearLocation` tool implements client-side geographic calculations:
- Converts radius to lat/lon bounding box
- Optimizes OpenSky API queries (bounding box is more efficient than radius)
- Client-side country filtering reduces API load

**Rationale**:
- OpenSky API doesn't support radius queries natively
- Bounding box queries are significantly faster
- Country filtering on client reduces network bandwidth

---

## 13. Known Issues & Limitations

1. **Coverage Gaps**: Limited ADS-B receiver coverage in Africa, South America, and remote oceans
2. **Military Aircraft**: Military flights with transponders disabled are not visible
3. **Grounded Aircraft**: Only shows aircraft currently in flight
4. **Rate Limiting**: OpenSky Network enforces rate limits (handled transparently via token caching)
5. **Position Accuracy**: Depends on ADS-B signal quality and receiver density (±100m typically)

---

## 14. Future Roadmap

**Planned Components**:
- Historical flight data queries (requires OpenSky paid tier)
- Aircraft route visualization (connecting positions over time)
- Airport-specific views (arrivals/departures)
- Flight path predictions (ETA calculations)

**Planned Use Cases**:
1. Flight delay analysis (compare scheduled vs actual times)
2. Airspace congestion heatmaps (identify busy routes)
3. Aircraft tracking notifications (alert when specific aircraft enters area)

---

## 15. Testing Status

### Unit Tests
- **Status**: ❌ Not implemented
- **Coverage**: N/A

### Integration Tests
- **Status**: ❌ Not implemented
- **Endpoints tested**: N/A

### Manual Testing Checklist
- [x] OAuth flow (desktop client)
- [x] API key authentication
- [x] Tool execution (all tools)
- [x] Error handling scenarios
- [x] Widget rendering and functionality
- [ ] Token refresh edge cases
- [ ] Large result sets (100+ aircraft)
- [ ] Country filtering accuracy

---

## 16. Documentation Status

- **README.md**: ✅ Complete
- **API Documentation**: ✅ Complete (server instructions)
- **Setup Guide**: ✅ Complete (self-hosting section)
- **Troubleshooting Guide**: ⚠️ Incomplete
- **Deployment Guide**: ✅ Complete

---

## 17. File Structure (MCP Apps Standard)

### Source Files (`src/`)
```
src/
├── index.ts                    # Entry point (Hono app, routes, DO exports)
├── server.ts                   # McpAgent class (OAuth path)
├── api-key-handler.ts          # API key authentication path
├── api-client.ts               # OpenSky API client
├── types.ts                    # TypeScript type definitions
├── server-instructions.ts      # System prompt for server
├── auth/                       # Authentication helpers
│   ├── extract-props.ts        # Extract user props from WorkOS
│   ├── oauth-provider.ts       # WorkOS OAuth provider setup
│   └── apiKeys.ts              # API key validation logic
├── helpers/                    # Utility functions
│   └── assets.ts               # loadHtml() for Assets binding
├── optional/                   # Optional features
│   └── prompts/                # MCP prompts (registered in server.ts)
├── resources/                  # UI resource definitions
│   └── ui-resources.ts         # UI_RESOURCES constant with uri, _meta
├── schemas/                    # Zod schemas
│   ├── inputs.ts               # Input validation schemas
│   └── outputs.ts              # Output schemas for structuredContent
├── shared/                     # Shared utilities
│   ├── logger.ts               # Logging helper
│   └── constants.ts            # Shared constants
└── tools/                      # Tool implementations
    └── descriptions.ts         # Tool descriptions (4-part pattern)
```

### Widget Files (`widgets/`)
```
widgets/
└── flight-map.html             # HTML entry point for Vite
```

### Build Output (`web/dist/widgets/`)
```
web/dist/widgets/
└── flight-map.html             # Single-file HTML output from Vite
```

### Configuration Files
```
├── wrangler.jsonc              # Cloudflare Workers configuration
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── vite.config.ts              # Vite build configuration
├── tailwind.config.js          # Tailwind CSS configuration
└── postcss.config.js           # PostCSS configuration
```

### Common Scripts (package.json)
```json
{
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "npm run build:widgets && wrangler deploy",
    "type-check": "tsc --noEmit",
    "cf-typegen": "wrangler types",
    "build:widget:map": "INPUT=widgets/flight-map.html vite build",
    "build:widgets": "npm run build:widget:map",
    "dev:widget": "INPUT=widgets/flight-map.html vite build --watch",
    "dev:full": "concurrently \"npm run dev\" \"npm run watch:widgets\""
  }
}
```

---

**End of Snapshot**

---

## Appendix A: MCP Apps (SEP-1865) Quick Reference

### Two-Part Registration Pattern

**Part 1: Register Resource**
```typescript
this.server.registerResource(
    resourceUri,                    // "ui://opensky/flight-map"
    resourceUri,                    // Same for predeclared
    { description, mimeType },
    async () => ({ contents: [{ uri, mimeType, text, _meta }] })
);
```

**Part 2: Register Tool with _meta Linkage**
```typescript
this.server.registerTool(
    toolId,
    {
        description,
        inputSchema,
        outputSchema,
        _meta: {
            [RESOURCE_URI_META_KEY]: resourceUri  // Links to UI
        }
    },
    async (params) => ({
        content: [{
            type: 'text',
            text: result
        }],
        structuredContent: validatedOutput,
        isError: false
    })
);
```

### Widget Build Configuration (vite.config.ts)
```typescript
export default defineConfig({
    plugins: [
        react(),
        viteSingleFile()  // Bundles to single HTML
    ],
    build: {
        rollupOptions: {
            input: process.env.INPUT || 'widgets/default.html'
        }
    }
});
```

---

## Appendix B: AnythingLLM Configuration Example

**Standard MCP Configuration** (for API key authentication):
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

**Notes**:
- Server name ("opensky") is a local identifier - customize as needed
- API key must start with `wtyk_` prefix
- Use `/mcp` endpoint for streamable HTTP transport

---

## Appendix C: Common Architecture Patterns

### Pattern 1: Stateless External API Server
**Example**: nbp-exchange (NBP Exchange Rates)
- No Durable Object state management
- Direct API calls to external service
- No caching (real-time data expected)
- Simple, synchronous tool execution

### Pattern 2: Stateful OAuth Token Caching
**Example**: opensky (OpenSky Flight Tracker)
- Durable Object stores OAuth access token
- Token auto-refresh every 30 minutes
- State: `{ opensky_access_token, opensky_token_expires_at }`

### Pattern 3: Pure Widget Server
**Example**: quiz (General Knowledge Quiz)
- No external API calls
- Widget manages state internally
- Single tool launches widget

---

## Appendix D: Checklist References

This snapshot template is based on the following checklists:
- `features/CHECKLIST_BACKEND.md` - Backend requirements
- `features/CHECKLIST_FRONTEND.md` - 6 Pillars of MCP Server Maturity
- `features/OPTIONAL_FEATURES.md` - Optional features guide
- `features/SERVER_REQUIREMENTS_CHECKLIST.md` - Required vs optional breakdown
- `features/UX_IMPLEMENTATION_CHECKLIST.md` - UX quality checklist

---

## Appendix E: Quick Commands

**Development**:
```bash
npm run dev                    # Start local dev server
npm run dev:full              # Dev server + widget watch mode
npm run type-check            # TypeScript validation
```

**Building & Deployment**:
```bash
npm run build:widgets         # Build all widgets
npm run deploy                # Build widgets + deploy to Cloudflare
```

**Secrets Management**:
```bash
wrangler secret put WORKOS_CLIENT_ID
wrangler secret put WORKOS_API_KEY
wrangler secret put OPENSKY_CLIENT_ID
wrangler secret put OPENSKY_CLIENT_SECRET
wrangler secret list          # View configured secrets
```

**Testing**:
```bash
../../scripts/verify-consistency.sh    # Verify infrastructure consistency
npx tsc --noEmit                       # Type check without building
```
