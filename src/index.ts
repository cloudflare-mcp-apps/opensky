import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { OpenSkyMcp } from "./server";
import { handleApiKeyRequest } from "./api-key-handler";
import type { Env } from "./types";
import { logger } from './shared/logger';

// Export the McpAgent class for Cloudflare Workers
export { OpenSkyMcp };

/**
 * OpenSky Flight Tracker - FREE PUBLIC SERVICE
 *
 * This MCP server is completely free and open - no authentication required.
 *
 * MCP Endpoints:
 * - /sse - Server-Sent Events transport (for AnythingLLM, Claude Desktop)
 * - /mcp - Streamable HTTP transport (for ChatGPT and modern clients)
 *
 * Available Tools (FREE - no tokens needed):
 * - getAircraftByIcao: Direct lookup by ICAO24 transponder address
 * - findAircraftNearLocation: Geographic search with bounding box
 */

// Simple default handler for root and unmatched routes
const defaultHandler = {
    async fetch(_request: Request): Promise<Response> {
        return new Response(
            JSON.stringify({
                service: "OpenSky Flight Tracker MCP Server",
                status: "FREE PUBLIC SERVICE - No authentication required",
                endpoints: {
                    sse: "/sse - Server-Sent Events transport (for AnythingLLM, Claude Desktop)",
                    mcp: "/mcp - Streamable HTTP transport (for ChatGPT and modern clients)"
                },
                tools: [
                    "getAircraftByIcao - Direct lookup by ICAO24 transponder address",
                    "findAircraftNearLocation - Geographic search with bounding box"
                ]
            }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" }
            }
        );
    }
};

// Create OAuthProvider instance (for McpAgent Durable Object routing)
const oauthProvider = new OAuthProvider({
    apiHandlers: {
        '/sse': OpenSkyMcp.serveSSE('/sse'),
        '/mcp': OpenSkyMcp.serve('/mcp'),
    },
    defaultHandler,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
});

/**
 * Main fetch handler - FREE PUBLIC SERVICE
 *
 * All MCP endpoints are accessible without authentication.
 */
export default {
    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext
    ): Promise<Response> {
        let pathname: string | undefined;
        try {
            const url = new URL(request.url);
            pathname = url.pathname;

            // Route MCP endpoints to public handler
            if (pathname === "/sse" || pathname === "/mcp") {
                return await handleApiKeyRequest(request, env, ctx, pathname);
            }

            // Other endpoints (for McpAgent compatibility)
            return await oauthProvider.fetch(request, env, ctx);

        } catch (error) {
            logger.error({
                event: 'server_error',
                error: error instanceof Error ? error.message : String(error),
                context: 'fetch_handler',
                pathname,
            });
            return new Response(
                JSON.stringify({
                    error: "Internal server error",
                    message: error instanceof Error ? error.message : String(error),
                }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }
    },
};
