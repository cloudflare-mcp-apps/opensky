import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createUIResource } from "@mcp-ui/server";
import { completable, getCompleter } from "@modelcontextprotocol/sdk/server/completable.js";
import { z } from "zod";
import { COMMON_AIRCRAFT_ICAO24, ISO_COUNTRY_CODES } from './data/completions';
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
    server = new McpServer(
        {
            name: "OpenSky Flight Tracker",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {},
                prompts: { listChanged: true },
                completions: {} // Required for prompt argument completions
            }
        }
    );

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
                    "Returns current position, velocity, altitude, and callsign if aircraft is currently flying. " +
                    "💡 Tip: Use the 'search-aircraft' prompt for autocomplete suggestions.",
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
                    "Returns list of aircraft with position, velocity, altitude, callsign, and origin country. " +
                    "OPTIONAL: Filter by origin_country (ISO code). " +
                    "💡 Tip: Use the 'search-aircraft-near-location' prompt for country filter autocomplete.",
                inputSchema: FindAircraftNearLocationInput,
                outputSchema: FindAircraftNearLocationOutputSchema,
            },
            async ({ latitude, longitude, radius_km, origin_country }) => {
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

                    // Apply optional origin_country filter (client-side filtering)
                    let filteredAircraftList = aircraftList;
                    if (origin_country) {
                        filteredAircraftList = aircraftList.filter(
                            aircraft => aircraft.origin_country.toUpperCase() === origin_country.toUpperCase()
                        );
                        console.log(`[OpenSky] Filtered ${aircraftList.length} → ${filteredAircraftList.length} aircraft by origin_country: ${origin_country}`);
                    }

                    const result = filteredAircraftList.length > 0
                        ? JSON.stringify({
                            search_center: { latitude, longitude },
                            radius_km,
                            origin_country_filter: origin_country || null,
                            aircraft_count: filteredAircraftList.length,
                            aircraft: filteredAircraftList
                        }, null, 2)
                        : `No aircraft currently flying within ${radius_km}km of (${latitude}, ${longitude})` +
                          (origin_country ? ` with origin_country: ${origin_country}` : '');

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
                    const structuredResult = filteredAircraftList.length > 0
                        ? {
                            search_center: { latitude, longitude },
                            radius_km,
                            origin_country_filter: origin_country || null,
                            aircraft_count: filteredAircraftList.length,
                            aircraft: filteredAircraftList
                        }
                        : null;

                    // Generate interactive Leaflet map HTML
                    if (filteredAircraftList.length > 0) {
                        const mapHTML = generateFlightMapHTML({
                            search_center: { latitude, longitude },
                            radius_km,
                            aircraft_count: filteredAircraftList.length,
                            aircraft: filteredAircraftList
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
                                description: `${filteredAircraftList.length} aircraft near ${latitude}, ${longitude}` +
                                    (origin_country ? ` (filtered: ${origin_country})` : '')
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
                                text: `No aircraft currently flying within ${radius_km}km of (${latitude}, ${longitude})` +
                                    (origin_country ? ` with origin_country: ${origin_country}` : '')
                            }],
                            structuredContent: {
                                search_center: { latitude, longitude },
                                radius_km,
                                origin_country_filter: origin_country || null,
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

        // ========================================================================
        // PROMPTS: Provide autocomplete-enabled UI frontends for tools
        // ========================================================================

        // Register prompt for aircraft search with ICAO code completion
        this.server.registerPrompt(
            "search-aircraft",
            {
                title: "Search Aircraft by ICAO Code",
                description: "Search for an aircraft or airline by partial ICAO code to get real-time flight details. " +
                    "Type partial codes to see autocomplete suggestions (e.g., '3c' for Lufthansa, 'a0' for United).",
                argsSchema: {
                    icao_search: completable(
                        z.string()
                            .length(6)
                            .regex(/^[0-9a-fA-F]{6}$/)
                            .describe("ICAO 24-bit aircraft code (6 hex characters, e.g., '3c6444' or 'a8b2c3')"),
                        async (value) => {
                            const valueLower = value.toLowerCase();
                            return COMMON_AIRCRAFT_ICAO24
                                .filter(item => item.icao24.toLowerCase().startsWith(valueLower))
                                .map(item => item.icao24)
                                .slice(0, 100);
                        }
                    )
                }
            },
            async ({ icao_search }) => {
                // Return a message instructing the LLM to use the tool
                return {
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: `Please use the 'getAircraftByIcao' tool to fetch real-time flight details for aircraft with ICAO code: ${icao_search}`
                            }
                        }
                    ]
                };
            }
        );

        // Register prompt for geographic aircraft search with country filter completion
        this.server.registerPrompt(
            "search-aircraft-near-location",
            {
                title: "Find Aircraft Near Location",
                description: "Find all aircraft flying near a geographic location with optional country filter. " +
                    "Type partial country codes to see autocomplete suggestions (e.g., 'U' for US, 'D' for DE).",
                argsSchema: {
                    latitude: z.number()
                        .min(-90)
                        .max(90)
                        .describe("Center point latitude in decimal degrees (-90 to 90, e.g., 52.2297 for Warsaw)"),
                    longitude: z.number()
                        .min(-180)
                        .max(180)
                        .describe("Center point longitude in decimal degrees (-180 to 180, e.g., 21.0122 for Warsaw)"),
                    radius_km: z.number()
                        .min(1)
                        .max(1000)
                        .describe("Search radius in kilometers (1-1000, e.g., 25 for 25km radius)"),
                    country_filter: completable(
                        z.string()
                            .length(2)
                            .regex(/^[A-Z]{2}$/)
                            .optional()
                            .describe("Optional filter: ISO 3166-1 alpha-2 country code (e.g., 'US', 'DE', 'FR'). Filters results by aircraft origin country."),
                        async (value) => {
                            if (!value) {
                                return ISO_COUNTRY_CODES.slice(0, 20).map(item => item.code);
                            }
                            const valueUpper = value.toUpperCase();
                            return ISO_COUNTRY_CODES
                                .filter(item => item.code.startsWith(valueUpper))
                                .map(item => item.code)
                                .slice(0, 100);
                        }
                    )
                }
            },
            async ({ latitude, longitude, radius_km, country_filter }) => {
                // Build the tool call instruction
                const baseInstruction = `Please use the 'findAircraftNearLocation' tool with these parameters:
- latitude: ${latitude}
- longitude: ${longitude}
- radius_km: ${radius_km}`;

                const countryInstruction = country_filter
                    ? `\n- origin_country: ${country_filter}`
                    : '';

                return {
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: baseInstruction + countryInstruction
                            }
                        }
                    ]
                };
            }
        );

        // ========================================================================
        // COMPLETION HANDLER: Manual implementation using getCompleter
        // ========================================================================

        // Store the completable schemas for later use
        const icaoSearchSchema = completable(
            z.string()
                .length(6)
                .regex(/^[0-9a-fA-F]{6}$/)
                .describe("ICAO 24-bit aircraft code (6 hex characters, e.g., '3c6444' or 'a8b2c3')"),
            async (value) => {
                const valueLower = value.toLowerCase();
                return COMMON_AIRCRAFT_ICAO24
                    .filter(item => item.icao24.toLowerCase().startsWith(valueLower))
                    .map(item => item.icao24)
                    .slice(0, 100);
            }
        );

        const countryFilterSchema = completable(
            z.string().length(2).regex(/^[A-Z]{2}$/).optional().describe("ISO 3166-1 alpha-2 country code"),
            async (value) => {
                if (!value) {
                    return ISO_COUNTRY_CODES.slice(0, 20).map(item => item.code);
                }
                const valueUpper = value.toUpperCase();
                return ISO_COUNTRY_CODES
                    .filter(item => item.code.startsWith(valueUpper))
                    .map(item => item.code)
                    .slice(0, 100);
            }
        );

        // Access the underlying Server to register completion handler
        this.server.server.setRequestHandler(
            {
                method: z.literal("completion/complete"),
                params: z.object({
                    ref: z.object({
                        type: z.string(),
                        name: z.string().optional(),
                        uri: z.string().optional(),
                    }),
                    argument: z.object({
                        name: z.string(),
                        value: z.string().optional(),
                    }),
                }),
            } as any,
            async (request) => {
                console.log("🔍 [COMPLETION] Received completion/complete request:", JSON.stringify(request.params, null, 2));

                const { ref, argument } = request.params;

                // Only handle prompt completions
                if (ref.type !== "ref/prompt") {
                    console.log("🔍 [COMPLETION] Not a prompt reference, returning empty");
                    return { completion: { values: [], total: 0, hasMore: false } };
                }

                // Handle search-aircraft prompt - icao_search argument
                if (ref.name === "search-aircraft" && argument.name === "icao_search") {
                    console.log("🔍 [COMPLETION] Handling search-aircraft ICAO completion");
                    const completer = getCompleter(icaoSearchSchema);
                    if (completer) {
                        const suggestions = await completer(argument.value || "");
                        console.log(`🔍 [COMPLETION] Returning ${suggestions.length} ICAO suggestions`);
                        return {
                            completion: {
                                values: suggestions.slice(0, 100),
                                total: suggestions.length,
                                hasMore: false,
                            },
                        };
                    }
                }

                // Handle search-aircraft-near-location prompt - country_filter argument
                if (ref.name === "search-aircraft-near-location" && argument.name === "country_filter") {
                    console.log("🔍 [COMPLETION] Handling search-aircraft-near-location country completion");
                    const completer = getCompleter(countryFilterSchema);
                    if (completer) {
                        const suggestions = await completer(argument.value || "");
                        console.log(`🔍 [COMPLETION] Returning ${suggestions.length} country suggestions`);
                        return {
                            completion: {
                                values: suggestions.slice(0, 100),
                                total: suggestions.length,
                                hasMore: false,
                            },
                        };
                    }
                }

                // No completions for other prompts/arguments
                console.log("🔍 [COMPLETION] No matching handler, returning empty");
                return { completion: { values: [], total: 0, hasMore: false } };
            }
        );
    }
}
