import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { OpenSkyClient } from "./api-client";
import type { Env, State } from "./types";
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
} from './resources/ui-resources.js';

// SEP-1865: MIME type for MCP App widgets
const UI_MIME_TYPE = "text/html;profile=mcp-app";

/**
 * OpenSky Flight Tracker MCP Server
 *
 * Provides real-time aircraft tracking via the OpenSky Network API.
 * Uses OAuth2 client credentials flow with automatic 30-minute token refresh.
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
        // SEP-1865 MCP Apps: Two-Part Registration Pattern
        // ========================================================================
        // Pattern source: mcp-apps/patterns/server-registration-patterns.md#pattern-1
        //
        // CRITICAL: MCP Apps require registering TWO separate entities:
        // PART 1: Resource (UI HTML template) - Registered below
        // PART 2: Tool (with _meta linkage) - Registered further down
        //
        // Note: Capability detection happens at runtime during tool calls since
        // McpAgent doesn't expose client capabilities during init()
        // We always register resources - hosts that don't support UI will ignore them

        const flightMapResource = UI_RESOURCES.flightMap;

        // ========================================================================
        // PART 1: Register Resource (Predeclared UI Template)
        // ========================================================================
        // CRITICAL: Use native this.server.registerResource() - NOT registerAppResource()
        // The ext-apps/server helper functions don't work with OAuthProvider setup
        this.server.registerResource(
            flightMapResource.name,
            flightMapResource.uri,
            {
                description: flightMapResource.description,
                mimeType: UI_MIME_TYPE,
                _meta: { ui: flightMapResource._meta.ui! }
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
        // CRITICAL: Use native this.server.registerTool() - NOT registerAppTool()
        // The ext-apps/server helper functions don't work with OAuthProvider setup
        // Direct lookup by ICAO 24-bit transponder address
        this.server.registerTool(
            "get-aircraft-by-icao",
            {
                title: TOOL_METADATA["get-aircraft-by-icao"].title,
                description: getToolDescription("get-aircraft-by-icao"),
                inputSchema: GetAircraftByIcaoInput,
                _meta: {},
            },
            async (args: any) => {
                const { icao24 } = args;
                const TOOL_NAME = "getAircraftByIcao";

                try {
                    // Execute tool logic
                    const aircraft = await openskyClient.getAircraftByIcao(String(icao24));

                    if (aircraft) {
                        const nextSteps: string[] = [];

                        // If we have position data, suggest nearby search
                        if (aircraft.position.latitude !== null && aircraft.position.longitude !== null) {
                            nextSteps.push(`Search for nearby aircraft using find-aircraft-near-location with lat=${aircraft.position.latitude}, lon=${aircraft.position.longitude}`);
                        }

                        nextSteps.push("Call this tool again in a few minutes to track position changes");
                        nextSteps.push("Use the aircraft's origin_country to find other aircraft from the same country");

                        return {
                            content: [{
                                type: "text" as const,
                                text: JSON.stringify(aircraft, null, 2)
                            }],
                            structuredContent: {
                                ...aircraft,
                                next_steps: nextSteps
                            }
                        };
                    } else {
                        return {
                            content: [{
                                type: "text" as const,
                                text: `No aircraft found with ICAO24: ${icao24} (aircraft may not be currently flying)`
                            }],
                            structuredContent: {
                                icao24,
                                found: false,
                                next_steps: [
                                    "Verify the ICAO24 code is correct (6 hexadecimal characters)",
                                    "The aircraft may not be currently airborne - try again later",
                                    "Use find-aircraft-near-location to search by geographic area instead"
                                ]
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
        // PART 2: Register Tool with UI Linkage (FREE)
        // ========================================================================
        // CRITICAL: Use native this.server.registerTool() - NOT registerAppTool()
        // The ext-apps/server helper functions don't work with OAuthProvider setup
        //
        // Pattern: server-registration-patterns.md#pattern-1 (Two-Part Registration)
        // Geographic search using bounding box calculation
        //
        // _meta.ui.resourceUri links this tool to PART 1 resource (v0.4.0+ nested structure)
        // This linkage tells the host which UI to render when tool returns results
        this.server.registerTool(
            "find-aircraft-near-location",
            {
                title: TOOL_METADATA["find-aircraft-near-location"].title,
                description: getToolDescription("find-aircraft-near-location"),
                inputSchema: FindAircraftNearLocationInput,
                // SEP-1865: Link tool to predeclared UI resource (PART 1)
                // Host will render this resource when tool returns results
                // Always include - hosts that don't support UI will ignore it
                _meta: {
                    ui: { resourceUri: UI_RESOURCES.flightMap.uri }  // v0.4.0+: nested structure
                },
            },
            async (args: any) => {
                const { latitude, longitude, radius_km } = args;
                const TOOL_NAME = "findAircraftNearLocation";

                try {
                    // Execute tool logic
                    const aircraftList = await openskyClient.findAircraftNearLocation(
                        Number(latitude),
                        Number(longitude),
                        Number(radius_km)
                    );

                    if (aircraftList.length > 0) {
                        // Build contextual next steps based on results
                        const nextSteps: string[] = [];

                        // Suggest getting details on first aircraft
                        if (aircraftList[0]?.icao24) {
                            nextSteps.push(`Get detailed info on aircraft ${aircraftList[0].icao24} using get-aircraft-by-icao`);
                        }

                        // Suggest filtering or expanding
                        if (aircraftList.length > 10) {
                            nextSteps.push(`Narrow search with smaller radius (try ${Math.floor(radius_km / 2)}km) to reduce results`);
                        } else if (aircraftList.length < 5 && radius_km < 500) {
                            nextSteps.push(`Expand search with larger radius (try ${Math.min(radius_km * 2, 1000)}km) to find more aircraft`);
                        }

                        nextSteps.push("Call this tool again to see updated positions (aircraft move ~10km/min at cruise)");

                        const structuredResult = {
                            search_center: { latitude, longitude },
                            radius_km,
                            aircraft_count: aircraftList.length,
                            aircraft: aircraftList,
                            next_steps: nextSteps
                        };

                        return {
                            content: [{
                                type: "text" as const,
                                text: JSON.stringify(structuredResult, null, 2)
                            }],
                            structuredContent: structuredResult
                        };
                    } else {
                        const structuredResult = {
                            search_center: { latitude, longitude },
                            radius_km,
                            aircraft_count: 0,
                            aircraft: [],
                            next_steps: [
                                `Expand search radius (try ${Math.min(radius_km * 2, 1000)}km)`,
                                "Try a location near a major airport for more traffic",
                                "Some regions have less air traffic - try searching near major cities"
                            ]
                        };

                        return {
                            content: [{
                                type: "text" as const,
                                text: `No aircraft currently flying within ${radius_km}km of (${latitude}, ${longitude})`
                            }],
                            structuredContent: structuredResult
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
