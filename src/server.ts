import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { OpenSkyClient } from "./api-client";
import type { Env, State } from "./types";
import { sanitizeOutput, redactPII } from 'pilpat-mcp-security';
import { loadHtml } from "./helpers/assets";
import { logger } from './shared/logger';
import {
    GetAircraftByIcaoInput,
    FindAircraftNearLocationInput,
} from "./schemas/inputs";
import {
    GetAircraftByIcaoOutputSchema,
    FindAircraftNearLocationOutputSchema,
} from "./schemas/outputs";
import { TOOL_METADATA, getToolDescription } from './tools/descriptions.js';
import { SERVER_INSTRUCTIONS } from './server-instructions.js';
import {
    UI_RESOURCES,
    UI_MIME_TYPE,
} from './resources/ui-resources.js';

/**
 * OpenSky Flight Tracker MCP Server
 *
 * Provides real-time aircraft tracking via the OpenSky Network API.
 * Uses OAuth2 client credentials flow with automatic 30-minute token refresh.
 *
 * This is a FREE PUBLIC SERVICE - no authentication or tokens required.
 *
 * Generic type parameters:
 * - Env: Cloudflare Workers environment bindings (KV, OpenSky credentials)
 * - State: Durable Object state for OAuth token storage (access_token, expires_at)
 *
 * Tools:
 * - findAircraftNearLocation: Geographic search with bounding box
 * - getAircraftByIcao: Direct lookup by ICAO24 transponder address
 */
export class OpenSkyMcp extends McpAgent<Env, State> {
    server = new McpServer(
        {
            name: "OpenSky Flight Tracker",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {},
                prompts: { listChanged: true },
                resources: { listChanged: true }  // SEP-1865: Enable resource discovery
            },
            instructions: SERVER_INSTRUCTIONS
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
        // SEP-1865 MCP Apps: Resource Registration
        // ========================================================================
        // Note: Capability detection happens at runtime during tool calls since
        // McpAgent doesn't expose client capabilities during init()
        // We always register resources - hosts that don't support UI will ignore them

        const flightMapResource = UI_RESOURCES.flightMap;

        // Register resource with correct parameter order: (name, uri, options, handler)
        this.server.registerResource(
            flightMapResource.name,          // name: "flight_map"
            flightMapResource.uri,           // uri: "ui://opensky/flight-map"
            {
                description: flightMapResource.description,
                mimeType: flightMapResource.mimeType
            },
            async () => {
                // Load built widget from Cloudflare Assets binding
                // Widget is built by Vite from web/widgets/flight-map.tsx
                // Dynamic data comes via ui/notifications/tool-result
                const templateHTML = await loadHtml(this.env.ASSETS, "/flight-map.html");

                return {
                    contents: [{
                        uri: flightMapResource.uri,
                        mimeType: UI_MIME_TYPE,
                        text: templateHTML,
                        _meta: flightMapResource._meta as Record<string, unknown>
                    }]
                };
            }
        );

        logger.info({
            event: 'ui_resource_registered',
            uri: flightMapResource.uri,
            name: flightMapResource.name,
        });

        // ========================================================================
        // Tool 1: Get Aircraft by ICAO24 (FREE)
        // ========================================================================
        // Direct lookup by ICAO 24-bit transponder address
        this.server.registerTool(
            "getAircraftByIcao",
            {
                title: TOOL_METADATA.getAircraftByIcao.title,
                description: getToolDescription("getAircraftByIcao"),
                inputSchema: GetAircraftByIcaoInput,
                outputSchema: GetAircraftByIcaoOutputSchema,
            },
            async ({ icao24 }) => {
                const TOOL_NAME = "getAircraftByIcao";

                try {
                    // Execute tool logic (FREE - no auth or token checks)
                    const aircraft = await openskyClient.getAircraftByIcao(icao24);

                    const result = aircraft
                        ? JSON.stringify(aircraft, null, 2)
                        : `No aircraft found with ICAO24: ${icao24} (aircraft may not be currently flying)`;

                    // Security Processing
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
                        logger.warn({
                            event: 'pii_redacted',
                            tool: TOOL_NAME,
                            pii_types: detectedPII,
                            count: detectedPII.length,
                        });
                    }

                    const finalResult = redacted;

                    // Return result
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
        // Tool 2: Find Aircraft Near Location (FREE)
        // ========================================================================
        // Geographic search using bounding box calculation
        this.server.registerTool(
            "findAircraftNearLocation",
            {
                title: TOOL_METADATA.findAircraftNearLocation.title,
                description: getToolDescription("findAircraftNearLocation"),
                inputSchema: FindAircraftNearLocationInput,
                outputSchema: FindAircraftNearLocationOutputSchema,
                // SEP-1865: Link tool to predeclared UI resource
                // Host will render this resource when tool returns results
                // Always include - hosts that don't support UI will ignore it
                _meta: {
                    "ui/resourceUri": UI_RESOURCES.flightMap.uri
                },
            },
            async ({ latitude, longitude, radius_km, origin_country }) => {
                const TOOL_NAME = "findAircraftNearLocation";

                try {
                    // Execute tool logic (FREE - no auth or token checks)
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
                        logger.info({
                            event: 'aircraft_filtered',
                            total_count: aircraftList.length,
                            filtered_count: filteredAircraftList.length,
                            filter_type: 'origin_country',
                            filter_value: origin_country,
                        });
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

                    // Security Processing
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
                        logger.warn({
                            event: 'pii_redacted',
                            tool: TOOL_NAME,
                            pii_types: detectedPII,
                            count: detectedPII.length,
                        });
                    }

                    const finalResult = redacted;

                    // Return result with structuredContent for SEP-1865 UI rendering
                    // Host will:
                    // 1. Fetch the UI resource template via resources/read
                    // 2. Send tool input via ui/notifications/tool-input
                    // 3. Send this structuredContent via ui/notifications/tool-result
                    // 4. The template will render the aircraft data dynamically

                    const structuredResult = {
                        search_center: { latitude, longitude },
                        radius_km,
                        origin_country_filter: origin_country || null,
                        aircraft_count: filteredAircraftList.length,
                        aircraft: filteredAircraftList
                    };

                    // Generate summary text for model context (SEP-1865 best practice)
                    const summaryText = filteredAircraftList.length > 0
                        ? `Found ${filteredAircraftList.length} aircraft within ${radius_km}km of (${latitude}, ${longitude})` +
                          (origin_country ? ` from ${origin_country}` : '') +
                          `. Top aircraft: ${filteredAircraftList.slice(0, 3).map(a => a.callsign || a.icao24).join(', ')}` +
                          (filteredAircraftList.length > 3 ? ` and ${filteredAircraftList.length - 3} more` : '')
                        : `No aircraft currently flying within ${radius_km}km of (${latitude}, ${longitude})` +
                          (origin_country ? ` with origin_country: ${origin_country}` : '');

                    return {
                        content: [{
                            type: "text" as const,
                            text: summaryText
                        }],
                        // structuredContent is sent to UI via ui/notifications/tool-result
                        // This data is NOT added to model context (SEP-1865 best practice)
                        structuredContent: structuredResult
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
        // PROMPTS: Provide autocomplete-enabled UI frontends for tools
        // ========================================================================

        // Register prompt for aircraft search
        this.server.registerPrompt(
            "search-aircraft",
            {
                title: "Search Aircraft by ICAO Code",
                description: "Search for an aircraft or airline by ICAO code to get real-time flight details.",
                argsSchema: {
                    icao_search: z.string()
                        .length(6)
                        .regex(/^[0-9a-fA-F]{6}$/)
                        .meta({ description: "ICAO 24-bit aircraft code (6 hex characters, e.g., '3c6444' or 'a8b2c3')" })
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

        // Register prompt for geographic aircraft search with country filter
        this.server.registerPrompt(
            "search-aircraft-near-location",
            {
                title: "Find Aircraft Near Location",
                description: "Find all aircraft flying near a geographic location with optional country filter.",
                argsSchema: {
                    latitude: z.number()
                        .min(-90)
                        .max(90)
                        .meta({ description: "Center point latitude in decimal degrees (-90 to 90, e.g., 52.2297 for Warsaw)" }),
                    longitude: z.number()
                        .min(-180)
                        .max(180)
                        .meta({ description: "Center point longitude in decimal degrees (-180 to 180, e.g., 21.0122 for Warsaw)" }),
                    radius_km: z.number()
                        .min(1)
                        .max(1000)
                        .meta({ description: "Search radius in kilometers (1-1000, e.g., 25 for 25km radius)" }),
                    country_filter: z.string()
                        .length(2)
                        .regex(/^[A-Z]{2}$/)
                        .optional()
                        .meta({ description: "Optional filter: ISO 3166-1 alpha-2 country code (e.g., 'US', 'DE', 'FR'). Filters results by aircraft origin country." })
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
    }
}
