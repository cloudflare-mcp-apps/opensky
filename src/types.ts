/**
 * Cloudflare Workers Environment Bindings
 *
 * This interface defines all the bindings available to your MCP server,
 * including authentication credentials and Cloudflare resources.
 *
 * TODO: Add your custom bindings here (AI, R2, additional KV/D1, etc.)
 */
export interface Env {
    /** KV namespace for storing OAuth tokens and session data */
    OAUTH_KV: KVNamespace;

    /** Durable Object namespace for MCP server instances (required by McpAgent) */
    MCP_OBJECT: DurableObjectNamespace;

    /** D1 Database for token management (shared with mcp-token-system) */
    TOKEN_DB: D1Database;

    /** WorkOS Client ID (public, used to initiate OAuth flows) */
    WORKOS_CLIENT_ID: string;

    /** WorkOS API Key (sensitive, starts with sk_, used to initialize WorkOS SDK) */
    WORKOS_API_KEY: string;

    /**
     * KV namespace for centralized custom login session storage (MANDATORY)
     *
     * CRITICAL: This is REQUIRED for centralized authentication at panel.wtyczki.ai
     *
     * Without this binding:
     * - Users will be redirected to default WorkOS UI (exciting-domain-65.authkit.app)
     * - Centralized branded login will NOT work
     * - Session sharing across servers will fail
     *
     * This namespace is already configured in wrangler.jsonc with the correct ID
     * from CLOUDFLARE_CONFIG.md. DO NOT make this optional or remove it.
     *
     * See docs/CUSTOM_LOGIN_GUIDE.md for architecture details.
     */
    USER_SESSIONS: KVNamespace;

    /** Workers AI binding (optional, for future features) */
    AI?: Ai;

    /** OpenSky Network OAuth2 Client ID */
    OPENSKY_CLIENT_ID: string;

    /** OpenSky Network OAuth2 Client Secret */
    OPENSKY_CLIENT_SECRET: string;

    /** KV namespace for API response caching */
    CACHE_KV: KVNamespace;

    /**
     * Cloudflare AI Gateway Configuration
     *
     * Route all AI requests through AI Gateway for:
     * - Authenticated access control
     * - Rate limiting (60 requests/hour per user)
     * - Response caching (1-hour TTL)
     * - Analytics and monitoring
     */
    AI_GATEWAY_ID: string;
    AI_GATEWAY_TOKEN: string;
}

/**
 * State for Durable Object - OAuth token storage
 *
 * OpenSky OAuth2 tokens expire after 30 minutes (1800 seconds).
 * We store the token and expiry timestamp in Durable Object state
 * for automatic refresh on expiry.
 */
export type State = {
    /** OpenSky OAuth2 access token (Bearer token) */
    opensky_access_token: string | null;
    /** Token expiry timestamp in milliseconds since epoch */
    opensky_token_expires_at: number | null;
};

/**
 * OpenSky API response format
 *
 * The OpenSky Network API returns aircraft state vectors as arrays
 * with 18 fields. This interface maps the raw response structure.
 *
 * @see https://openskynetwork.github.io/opensky-api/rest.html#all-state-vectors
 */
export interface OpenSkyApiResponse {
    /** Unix timestamp (seconds) when data was generated */
    time: number;
    /** Array of state vectors, or null if no aircraft found */
    states: Array<[
        string,           // [0] icao24 - Unique ICAO 24-bit address
        string | null,    // [1] callsign - Aircraft callsign (8 chars, padded with spaces)
        string,           // [2] origin_country - Country of registration
        number | null,    // [3] time_position - Unix timestamp of last position update
        number,           // [4] last_contact - Unix timestamp of last update
        number | null,    // [5] longitude - WGS-84 longitude in decimal degrees
        number | null,    // [6] latitude - WGS-84 latitude in decimal degrees
        number | null,    // [7] baro_altitude - Barometric altitude in meters
        boolean,          // [8] on_ground - true if aircraft is on ground
        number | null,    // [9] velocity - Ground speed in m/s
        number | null,    // [10] true_track - True track in decimal degrees (0° = north)
        number | null,    // [11] vertical_rate - Vertical rate in m/s (positive = climbing)
        number[] | null,  // [12] sensors - IDs of sensors that contributed to state vector
        number | null,    // [13] geo_altitude - Geometric altitude in meters
        string | null,    // [14] squawk - Transponder code (4 digits)
        boolean,          // [15] spi - Special position indicator
        number,           // [16] position_source - 0=ADS-B, 1=ASTERIX, 2=MLAT, 3=FLARM
        number            // [17] category - Aircraft category (0-20)
    ]> | null;
}

/**
 * Parsed state vector for a single aircraft
 *
 * This is the intermediate format after parsing the raw array response.
 */
export interface OpenSkyStateVector {
    icao24: string;
    callsign: string | null;
    origin_country: string;
    time_position: number | null;
    last_contact: number;
    longitude: number | null;
    latitude: number | null;
    baro_altitude: number | null;  // meters
    on_ground: boolean;
    velocity: number | null;  // m/s
    true_track: number | null;  // degrees
    vertical_rate: number | null;  // m/s
    geo_altitude: number | null;  // meters
    squawk: string | null;
}

/**
 * LLM-optimized aircraft data
 *
 * Cleaned response format that removes technical metadata
 * and organizes data semantically for LLM comprehension.
 *
 * This format follows MCP best practices:
 * - Human-readable field names
 * - Semantic grouping (position, velocity)
 * - Essential data only (no sensor IDs, position_source codes)
 */
export interface AircraftData {
    /** Unique ICAO 24-bit address (hex string, e.g., "3c6444") */
    icao24: string;
    /** Aircraft callsign (trimmed, null if not available) */
    callsign: string | null;
    /** Country where aircraft is registered */
    origin_country: string;
    /** Position data */
    position: {
        latitude: number | null;
        longitude: number | null;
        altitude_m: number | null;
        on_ground: boolean;
    };
    /** Velocity data */
    velocity: {
        ground_speed_ms: number | null;
        vertical_rate_ms: number | null;
        true_track_deg: number | null;
    };
    /** Unix timestamp of last contact (seconds) */
    last_contact: number;
    /** Transponder squawk code (4 digits) */
    squawk: string | null;
}

/**
 * Response format options for tools that return large datasets
 *
 * Based on MCP best practices for token optimization and LLM comprehension.
 * Use this enum to give agents control over response verbosity.
 *
 * @see https://developers.cloudflare.com/agents/model-context-protocol/
 */
export enum ResponseFormat {
    /**
     * Concise format: Essential data only, ~1/3 tokens
     *
     * - Returns human-readable names, descriptions, and key attributes
     * - Excludes technical IDs, metadata, and redundant fields
     * - Optimized for LLM comprehension and decision-making
     * - Default choice for most tools
     *
     * Example: { name: "Report.pdf", type: "PDF", author: "Jane Smith" }
     */
    CONCISE = "concise",

    /**
     * Detailed format: Full data including IDs for programmatic use
     *
     * - Includes all fields from API response
     * - Contains technical identifiers (UUIDs, IDs, hashes)
     * - Useful when agent needs to make subsequent API calls
     * - Use for tools that are building blocks for complex workflows
     *
     * Example: { id: "uuid-123", name: "Report.pdf", mime_type: "application/pdf", ... }
     */
    DETAILED = "detailed"
}
