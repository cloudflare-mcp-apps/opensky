/**
 * OpenSky Network API Client
 *
 * Provides OAuth2-authenticated access to the OpenSky Network REST API.
 * Handles token lifecycle management (30-minute expiry with auto-refresh),
 * geographic bounding box calculations, and response parsing.
 *
 * @see https://openskynetwork.github.io/opensky-api/rest.html
 */

import type {
    Env,
    State,
    OpenSkyApiResponse,
    OpenSkyStateVector,
    AircraftData,
} from "./types";

/**
 * OpenSky API Client
 *
 * This client manages:
 * - OAuth2 client credentials flow with 30-minute token lifecycle
 * - Token storage in Durable Object state
 * - Automatic token refresh on expiry (with 5-minute buffer)
 * - Geographic bounding box calculations
 * - Response parsing from array format to structured JSON
 */
export class OpenSkyClient {
    private env: Env;
    private state: State;
    private setState: (newState: Partial<State>) => Promise<void>;

    /**
     * Create OpenSky API client
     *
     * @param env - Cloudflare Workers environment bindings
     * @param state - Durable Object state (for OAuth token storage)
     * @param setState - Function to update Durable Object state
     */
    constructor(
        env: Env,
        state: State,
        setState: (newState: Partial<State>) => Promise<void>
    ) {
        this.env = env;
        this.state = state;
        this.setState = setState;
    }

    /**
     * Get valid OAuth2 access token (auto-refresh if expired)
     *
     * OpenSky tokens expire after 30 minutes (1800 seconds).
     * We use a 5-minute buffer to ensure token is valid for the entire request.
     *
     * @returns Valid OAuth2 Bearer token
     * @throws Error if token fetch/refresh fails
     */
    async getAccessToken(): Promise<string> {
        const now = Date.now();
        const BUFFER_MS = 5 * 60 * 1000; // 5-minute buffer

        // Check if token exists and is not expired (with buffer)
        if (
            this.state.opensky_access_token &&
            this.state.opensky_token_expires_at &&
            this.state.opensky_token_expires_at > now + BUFFER_MS
        ) {
            console.log("[OpenSky] Using cached token (valid for", Math.floor((this.state.opensky_token_expires_at - now) / 1000), "more seconds)");
            return this.state.opensky_access_token;
        }

        // Token expired or missing - fetch new token
        console.log("[OpenSky] Fetching new OAuth2 token (previous token expired or missing)");

        const tokenResponse = await fetch(
            "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    grant_type: "client_credentials",
                    client_id: this.env.OPENSKY_CLIENT_ID,
                    client_secret: this.env.OPENSKY_CLIENT_SECRET,
                }),
            }
        );

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error("[OpenSky] Token fetch failed:", tokenResponse.status, errorText);
            throw new Error(`OpenSky OAuth2 token fetch failed: ${tokenResponse.status}`);
        }

        const data = await tokenResponse.json<{
            access_token: string;
            expires_in: number; // seconds
            token_type: string;
        }>();

        const expiresAt = now + (data.expires_in * 1000); // Convert to milliseconds

        // Store in Durable Object state
        await this.setState({
            opensky_access_token: data.access_token,
            opensky_token_expires_at: expiresAt,
        });

        // Update local state reference
        this.state.opensky_access_token = data.access_token;
        this.state.opensky_token_expires_at = expiresAt;

        console.log("[OpenSky] New token fetched, expires in", data.expires_in, "seconds");

        return data.access_token;
    }

    /**
     * Calculate geographic bounding box from center point and radius
     *
     * Uses simple flat-Earth approximation (good enough for < 100km radius).
     * For production use, consider haversine formula for higher accuracy.
     *
     * @param lat - Center latitude in decimal degrees (-90 to 90)
     * @param lon - Center longitude in decimal degrees (-180 to 180)
     * @param radiusKm - Search radius in kilometers
     * @returns Bounding box coordinates for OpenSky API
     */
    calculateBoundingBox(
        lat: number,
        lon: number,
        radiusKm: number
    ): { lamin: number; lomin: number; lamax: number; lomax: number } {
        // Earth radius in kilometers
        const R = 6371;

        // Convert radius from km to degrees latitude
        const latDelta = (radiusKm / R) * (180 / Math.PI);

        // Convert radius from km to degrees longitude (account for latitude convergence)
        const lonDelta = (radiusKm / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

        return {
            lamin: lat - latDelta,
            lomin: lon - lonDelta,
            lamax: lat + latDelta,
            lomax: lon + lonDelta,
        };
    }

    /**
     * Parse raw OpenSky state vectors from array format to structured objects
     *
     * OpenSky returns data as arrays with 18 fields. This function converts
     * them to typed objects with semantic field names.
     *
     * @param states - Raw state vectors from API
     * @returns Array of parsed state vectors
     */
    parseStateVectors(states: OpenSkyApiResponse["states"]): OpenSkyStateVector[] {
        if (!states || states.length === 0) {
            return [];
        }

        return states.map((state) => ({
            icao24: state[0],
            callsign: state[1] ? state[1].trim() : null, // Trim whitespace padding
            origin_country: state[2],
            time_position: state[3],
            last_contact: state[4],
            longitude: state[5],
            latitude: state[6],
            baro_altitude: state[7],
            on_ground: state[8],
            velocity: state[9],
            true_track: state[10],
            vertical_rate: state[11],
            geo_altitude: state[13],
            squawk: state[14],
        }));
    }

    /**
     * Convert parsed state vectors to LLM-optimized format
     *
     * Removes technical metadata and organizes data semantically
     * for better LLM comprehension (follows MCP best practices).
     *
     * @param vectors - Parsed state vectors
     * @returns LLM-friendly aircraft data
     */
    toAircraftData(vectors: OpenSkyStateVector[]): AircraftData[] {
        return vectors.map((v) => ({
            icao24: v.icao24,
            callsign: v.callsign,
            origin_country: v.origin_country,
            position: {
                latitude: v.latitude,
                longitude: v.longitude,
                altitude_m: v.baro_altitude,
                on_ground: v.on_ground,
            },
            velocity: {
                ground_speed_ms: v.velocity,
                vertical_rate_ms: v.vertical_rate,
                true_track_deg: v.true_track,
            },
            last_contact: v.last_contact,
            squawk: v.squawk,
        }));
    }

    /**
     * Fetch all aircraft states from OpenSky API
     *
     * Supports filtering by ICAO24, callsign, and geographic bounding box.
     *
     * @param params - Query parameters (icao24, bbox, time)
     * @returns API response with state vectors
     * @throws Error if API request fails
     */
    async getAllStates(params?: {
        icao24?: string;
        lamin?: number;
        lomin?: number;
        lamax?: number;
        lomax?: number;
        time?: number;
    }): Promise<OpenSkyApiResponse> {
        const accessToken = await this.getAccessToken();

        // Build query string
        const queryParams = new URLSearchParams();
        if (params?.icao24) queryParams.set("icao24", params.icao24);
        if (params?.lamin !== undefined) queryParams.set("lamin", params.lamin.toString());
        if (params?.lomin !== undefined) queryParams.set("lomin", params.lomin.toString());
        if (params?.lamax !== undefined) queryParams.set("lamax", params.lamax.toString());
        if (params?.lomax !== undefined) queryParams.set("lomax", params.lomax.toString());
        if (params?.time) queryParams.set("time", params.time.toString());

        const url = `https://opensky-network.org/api/states/all${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

        console.log("[OpenSky API] Fetching states:", url);

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[OpenSky API] Error:", response.status, errorText);
            throw new Error(`OpenSky API returned ${response.status}: ${errorText}`);
        }

        const data = await response.json<OpenSkyApiResponse>();

        console.log("[OpenSky API] Received", data.states?.length || 0, "aircraft");

        return data;
    }

    /**
     * Find aircraft near a geographic location
     *
     * Calculates bounding box from center point and radius, then queries
     * OpenSky API for all aircraft in that area.
     *
     * Credit Usage: 1-3 OpenSky credits depending on area size
     * - 0-25 sq deg (< 500x500km): 1 credit
     * - 25-100 sq deg (< 1000x1000km): 2 credits
     * - 100-400 sq deg (< 2000x2000km): 3 credits
     *
     * @param lat - Center latitude (-90 to 90)
     * @param lon - Center longitude (-180 to 180)
     * @param radiusKm - Search radius in kilometers
     * @returns Array of aircraft in the area
     */
    async findAircraftNearLocation(
        lat: number,
        lon: number,
        radiusKm: number
    ): Promise<AircraftData[]> {
        // Validate inputs
        if (lat < -90 || lat > 90) {
            throw new Error(`Invalid latitude: ${lat} (must be -90 to 90)`);
        }
        if (lon < -180 || lon > 180) {
            throw new Error(`Invalid longitude: ${lon} (must be -180 to 180)`);
        }
        if (radiusKm <= 0 || radiusKm > 1000) {
            throw new Error(`Invalid radius: ${radiusKm} (must be 1-1000 km)`);
        }

        const bbox = this.calculateBoundingBox(lat, lon, radiusKm);

        console.log("[OpenSky] Searching near", { lat, lon, radiusKm }, "→ bbox:", bbox);

        const response = await this.getAllStates(bbox);

        if (!response.states || response.states.length === 0) {
            return [];
        }

        const parsed = this.parseStateVectors(response.states);
        return this.toAircraftData(parsed);
    }

    /**
     * Get aircraft by ICAO24 transponder address
     *
     * Direct lookup - very cheap (1 OpenSky credit).
     *
     * @param icao24 - ICAO 24-bit address (hex string, e.g., "3c6444")
     * @returns Aircraft data if found, null otherwise
     */
    async getAircraftByIcao(icao24: string): Promise<AircraftData | null> {
        // Validate ICAO24 format (6 hex characters)
        const icao24Lower = icao24.toLowerCase().trim();
        if (!/^[0-9a-f]{6}$/.test(icao24Lower)) {
            throw new Error(`Invalid ICAO24 format: ${icao24} (must be 6 hex characters)`);
        }

        console.log("[OpenSky] Looking up ICAO24:", icao24Lower);

        const response = await this.getAllStates({ icao24: icao24Lower });

        if (!response.states || response.states.length === 0) {
            return null;
        }

        const parsed = this.parseStateVectors(response.states);
        const aircraftData = this.toAircraftData(parsed);

        return aircraftData[0] || null;
    }

    /**
     * Get aircraft by callsign
     *
     * Requires global scan (4 OpenSky credits) + server-side filtering.
     * This is expensive but necessary since OpenSky API doesn't support
     * direct callsign filtering.
     *
     * @param callsign - Aircraft callsign (e.g., "LOT456")
     * @returns Aircraft data if found, null otherwise
     */
    async getAircraftByCallsign(callsign: string): Promise<AircraftData | null> {
        // Validate callsign (alphanumeric, max 8 chars)
        const callsignUpper = callsign.toUpperCase().trim();
        if (!/^[A-Z0-9]{1,8}$/.test(callsignUpper)) {
            throw new Error(`Invalid callsign format: ${callsign} (must be 1-8 alphanumeric characters)`);
        }

        console.log("[OpenSky] Searching for callsign:", callsignUpper, "(global scan)");

        // Global scan (no filters)
        const response = await this.getAllStates();

        if (!response.states || response.states.length === 0) {
            return null;
        }

        const parsed = this.parseStateVectors(response.states);

        // Filter by callsign (server-side)
        const match = parsed.find((v) => v.callsign === callsignUpper);

        if (!match) {
            return null;
        }

        const aircraftData = this.toAircraftData([match]);
        return aircraftData[0];
    }
}
