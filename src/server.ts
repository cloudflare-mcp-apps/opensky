import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { createUIResource } from "@mcp-ui/server";
import { OpenSkyClient } from "./api-client";
import type { Env, State } from "./types";
import type { Props } from "./auth/props";
import { checkBalance, consumeTokensWithRetry } from "./shared/tokenConsumption";
import { formatInsufficientTokensError } from "./shared/tokenUtils";
import { sanitizeOutput, redactPII } from 'pilpat-mcp-security';
import { generateFlightMapHTML } from "./optional/ui/flight-map-generator";
import {
    GetAircraftByIcaoInput,
    FindAircraftNearLocationInput,
} from "./schemas/inputs";
import {
    GetAircraftByIcaoOutputSchema,
    FindAircraftNearLocationOutputSchema,
} from "./schemas/outputs";

/**
 * OpenSky Flight Tracker MCP Server
 *
 * Provides real-time aircraft tracking via the OpenSky Network API.
 * Uses OAuth2 client credentials flow with automatic 30-minute token refresh.
 *
 * Generic type parameters:
 * - Env: Cloudflare Workers environment bindings (KV, D1, WorkOS, OpenSky credentials)
 * - State: Durable Object state for OAuth token storage (access_token, expires_at)
 * - Props: Authenticated user context from WorkOS (userId, email from database)
 *
 * Authentication flow:
 * 1. User connects via MCP client
 * 2. Redirected to centralized login at panel.wtyczki.ai/auth/login-custom
 * 3. User enters email → receives Magic Auth code
 * 4. Session validated from shared USER_SESSIONS KV
 * 5. Database check: user exists and is_deleted = false
 * 6. If valid → Access granted, user info available via this.props
 * 7. All tools check token balance before execution
 *
 * Tools:
 * - findAircraftNearLocation (3 tokens): Geographic search with bounding box
 * - getAircraftByIcao (1 token): Direct lookup by ICAO24 transponder address
 */
export class OpenSkyMcp extends McpAgent<Env, State, Props> {
    server = new McpServer({
        name: "OpenSky Flight Tracker",
        version: "1.0.0",
    });

    /**
     * Initial state for Durable Object
     *
     * Stores OpenSky OAuth2 access token and expiry timestamp.
     * Token auto-refreshes when expired (30-minute lifetime).
     */
    initialState: State = {
        opensky_access_token: null,
        opensky_token_expires_at: null,
    };

    async init() {
        // Initialize OpenSky API client with state management
        // Wrapper to adapt McpAgent setState to OpenSkyClient expectations
        const setStateWrapper = async (newState: Partial<State>) => {
            await this.setState({ ...this.state, ...newState });
        };

        const openskyClient = new OpenSkyClient(this.env, this.state, setStateWrapper);

        // ========================================================================
        // Tool 1: Get Aircraft by ICAO24 (1 token cost)
        // ========================================================================
        // Direct lookup by ICAO 24-bit transponder address
        // Very cheap operation (1 OpenSky API credit)
        this.server.registerTool(
            "getAircraftByIcao",
            {
                title: "Get Aircraft By ICAO",
                description: "Get aircraft details by ICAO 24-bit transponder address (hex string, e.g., '3c6444'). " +
                    "This is a direct lookup - very fast and cheap. " +
                    "Returns current position, velocity, altitude, and callsign if aircraft is currently flying.",
                inputSchema: GetAircraftByIcaoInput,
                outputSchema: GetAircraftByIcaoOutputSchema,
            },
            async ({ icao24 }) => {
                const TOOL_COST = 1;
                const TOOL_NAME = "getAircraftByIcao";

                // 0. Pre-generate action_id for idempotency
                const actionId = crypto.randomUUID();

                try {
                    // 1. Get user ID from props
                    const userId = this.props?.userId;
                    if (!userId) {
                        throw new Error("User ID not found in authentication context");
                    }

                    // 2. Check token balance
                    const balanceCheck = await checkBalance(this.env.TOKEN_DB, userId, TOOL_COST);

                    // 3. Handle insufficient balance
                    if (!balanceCheck.sufficient) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST)
                            }],
                            isError: true
                        };
                    }

                    // 4. Execute tool logic
                    const aircraft = await openskyClient.getAircraftByIcao(icao24);

                    const result = aircraft
                        ? JSON.stringify(aircraft, null, 2)
                        : `No aircraft found with ICAO24: ${icao24} (aircraft may not be currently flying)`;

                    // ⭐ Step 4.5: Security Processing
                    const sanitized = sanitizeOutput(result, {
                        removeHtml: true,
                        removeControlChars: true,
                        normalizeWhitespace: true,
                        maxLength: 5000
                    });

                    const { redacted, detectedPII } = redactPII(sanitized, {
                        redactEmails: false,
                        redactPhones: true,
                        redactCreditCards: true,
                        redactSSN: true,
                        redactBankAccounts: true,
                        redactPESEL: true,
                        redactPolishIdCard: true,
                        redactPolishPassport: true,
                        redactPolishPhones: true,
                        placeholder: '[REDACTED]'
                    });

                    if (detectedPII.length > 0) {
                        console.warn(`[Security] Tool ${TOOL_NAME}: Redacted PII types:`, detectedPII);
                    }

                    const finalResult = redacted;
                    // ⭐ End of Step 4.5

                    // 5. Consume tokens WITH RETRY and idempotency protection
                    await consumeTokensWithRetry(
                        this.env.TOKEN_DB,
                        userId,
                        TOOL_COST,
                        "opensky",
                        TOOL_NAME,
                        { icao24 },
                        finalResult,
                        true,
                        actionId
                    );

                    // 6. Return result
                    return {
                        content: [{
                            type: "text" as const,
                            text: finalResult
                        }],
                        structuredContent: aircraft as any
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`
                        }],
                        isError: true
                    };
                }
            }
        );

        // ========================================================================
        // Tool 2: Find Aircraft Near Location (3 tokens cost)
        // ========================================================================
        // Geographic search using bounding box calculation
        // Credit usage: 1-3 OpenSky API credits depending on area size
        this.server.registerTool(
            "findAircraftNearLocation",
            {
                title: "Find Aircraft Near Location",
                description: "Find all aircraft currently flying near a geographic location. " +
                    "Provide latitude, longitude, and search radius in kilometers. " +
                    "Server calculates the bounding box and queries for all aircraft in that area. " +
                    "Returns list of aircraft with position, velocity, altitude, callsign, and origin country.",
                inputSchema: FindAircraftNearLocationInput,
                outputSchema: FindAircraftNearLocationOutputSchema,
            },
            async ({ latitude, longitude, radius_km }) => {
                const TOOL_COST = 3;
                const TOOL_NAME = "findAircraftNearLocation";

                // 0. Pre-generate action_id for idempotency
                const actionId = crypto.randomUUID();

                try {
                    // 1. Get user ID
                    const userId = this.props?.userId;
                    if (!userId) {
                        throw new Error("User ID not found in authentication context");
                    }

                    // 2. Check token balance
                    const balanceCheck = await checkBalance(this.env.TOKEN_DB, userId, TOOL_COST);

                    // 3. Handle insufficient balance
                    if (!balanceCheck.sufficient) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST)
                            }],
                            isError: true
                        };
                    }

                    // 4. Execute tool logic
                    const aircraftList = await openskyClient.findAircraftNearLocation(
                        latitude,
                        longitude,
                        radius_km
                    );

                    const result = aircraftList.length > 0
                        ? JSON.stringify({
                            search_center: { latitude, longitude },
                            radius_km,
                            aircraft_count: aircraftList.length,
                            aircraft: aircraftList
                        }, null, 2)
                        : `No aircraft currently flying within ${radius_km}km of (${latitude}, ${longitude})`;

                    // ⭐ Step 4.5: Security Processing
                    const sanitized = sanitizeOutput(result, {
                        removeHtml: true,
                        removeControlChars: true,
                        normalizeWhitespace: true,
                        maxLength: 5000
                    });

                    const { redacted, detectedPII } = redactPII(sanitized, {
                        redactEmails: false,
                        redactPhones: true,
                        redactCreditCards: true,
                        redactSSN: true,
                        redactBankAccounts: true,
                        redactPESEL: true,
                        redactPolishIdCard: true,
                        redactPolishPassport: true,
                        redactPolishPhones: true,
                        placeholder: '[REDACTED]'
                    });

                    if (detectedPII.length > 0) {
                        console.warn(`[Security] Tool ${TOOL_NAME}: Redacted PII types:`, detectedPII);
                    }

                    const finalResult = redacted;
                    // ⭐ End of Step 4.5

                    // 5. Consume tokens
                    await consumeTokensWithRetry(
                        this.env.TOKEN_DB,
                        userId,
                        TOOL_COST,
                        "opensky",
                        TOOL_NAME,
                        { latitude, longitude, radius_km },
                        finalResult,
                        true,
                        actionId
                    );

                    // 6. Return result as MCP-UI resource
                    const structuredResult = aircraftList.length > 0
                        ? { search_center: { latitude, longitude }, radius_km, aircraft_count: aircraftList.length, aircraft: aircraftList }
                        : null;

                    // Generate interactive Leaflet map HTML
                    if (aircraftList.length > 0) {
                        const mapHTML = generateFlightMapHTML({
                            search_center: { latitude, longitude },
                            radius_km,
                            aircraft_count: aircraftList.length,
                            aircraft: aircraftList
                        });

                        const uiResource = createUIResource({
                            uri: `ui://opensky/flight-map-${Date.now()}`,
                            content: {
                                type: 'rawHtml',
                                htmlString: mapHTML
                            },
                            encoding: 'text',
                            metadata: {
                                title: 'Flight Map',
                                description: `${aircraftList.length} aircraft near ${latitude}, ${longitude}`
                            }
                        });

                        return {
                            content: [uiResource as any],
                            structuredContent: structuredResult as any
                        };
                    } else {
                        // No aircraft found - return text message with valid schema structure
                        return {
                            content: [{
                                type: "text" as const,
                                text: `No aircraft currently flying within ${radius_km}km of (${latitude}, ${longitude})`
                            }],
                            structuredContent: {
                                search_center: { latitude, longitude },
                                radius_km,
                                aircraft_count: 0,
                                aircraft: []
                            }
                        };
                    }
                } catch (error) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`
                        }],
                        isError: true
                    };
                }
            }
        );
    }
}
