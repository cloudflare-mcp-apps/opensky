/**
 * API Key Authentication Handler for OpenSky Flight Tracker
 *
 * This module provides API key authentication support for MCP clients that don't support
 * OAuth flows (like AnythingLLM, Cursor IDE, custom scripts).
 *
 * Authentication flow:
 * 1. Extract API key from Authorization header
 * 2. Validate key via shared D1 database (mcp-oauth)
 * 3. Get user info from database
 * 4. Create MCP server with tools
 * 5. Handle MCP protocol request
 * 6. Return response
 *
 * Architecture:
 * - Shared D1 database (mcp-oauth) for centralized auth
 * - Same database used by panel.wtyczki.ai
 * - Contains: users, api_keys tables
 *
 * TODO: When you add new tools to server.ts, you MUST also:
 * 1. Register them in getOrCreateServer() (around line 260)
 * 2. Add tool executor functions (around line 770)
 * 3. Add cases to handleToolsCall() (around line 750)
 * 4. Add tool schemas to handleToolsList() (around line 625)
 */

import { validateApiKey } from "./auth/apiKeys";
import type { Env, State } from "./types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
    RESOURCE_MIME_TYPE,
    RESOURCE_URI_META_KEY,
    registerAppResource,
    registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { OpenSkyClient } from "./api-client";
import { TOOL_METADATA, getToolDescription } from './tools/descriptions.js';
import { SERVER_INSTRUCTIONS } from './server-instructions.js';
import { logger } from './shared/logger';
import { UI_RESOURCES } from './resources/ui-resources.js';

/**
 * Simple LRU (Least Recently Used) Cache for MCP Server instances
 *
 * IMPORTANT: This cache is ephemeral and Worker-instance-specific:
 *
 * 🔸 **Ephemeral (Non-Persistent):**
 *   - Cache is cleared when the Worker is evicted from memory
 *   - Eviction can happen at any time (deployments, inactivity, memory pressure)
 *   - NO guarantee of cache persistence between requests
 *
 * 🔸 **Worker-Instance-Specific:**
 *   - Different Worker instances (different data centers) have separate caches
 *   - A user in Warsaw and a user in New York access different caches
 *   - Cache is NOT replicated globally (unlike D1 database)
 *
 * 🔸 **Performance Optimization Only:**
 *   - This is a PERFORMANCE optimization, not critical state storage
 *   - Cache misses simply recreate the MCP server (acceptable overhead)
 *   - Critical state (balances, tokens, transactions) is stored in D1 database
 *
 * 🔸 **Why This Is Safe:**
 *   - MCP servers are stateless (tools query database on each call)
 *   - Recreating a server doesn't cause data loss or corruption
 *   - Token consumption is atomic via D1 transactions (not cached)
 *   - User balances are ALWAYS queried from database (never cached)
 *
 * 🔸 **LRU Eviction:**
 *   - When cache reaches MAX_SIZE, the least recently used server is evicted
 *   - This prevents unbounded memory growth
 *   - Evicted servers are simply garbage collected
 *
 * Reference: Cloudflare Docs - "In-memory state in Durable Objects"
 * https://developers.cloudflare.com/durable-objects/reference/in-memory-state/
 */
class LRUCache<K, V> {
  private cache: Map<K, { value: V; lastAccessed: number }>;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Get value from cache and update last accessed time
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      // Update last accessed time (LRU tracking)
      entry.lastAccessed = Date.now();
      return entry.value;
    }
    return undefined;
  }

  /**
   * Set value in cache with automatic LRU eviction
   */
  set(key: K, value: V): void {
    // If cache is full, evict least recently used entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      lastAccessed: Date.now(),
    });
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Evict least recently used entry from cache
   */
  private evictLRU(): void {
    let oldestKey: K | undefined;
    let oldestTime = Infinity;

    // Find least recently used entry
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.cache.delete(oldestKey);
      logger.info({
        event: 'lru_cache_eviction',
        evicted_user_id: String(oldestKey),
        cache_size: this.cache.size,
      });
    }
  }

  /**
   * Clear entire cache (useful for testing)
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Global MCP server cache
 *
 * Configuration:
 * - Max size: 1000 servers (prevents unbounded memory growth)
 * - Eviction policy: LRU (Least Recently Used)
 * - Lifetime: Until Worker is evicted from memory
 *
 * Typical memory usage:
 * - Each MCP server: ~50-100 KB
 * - 1000 servers: ~50-100 MB (acceptable for Workers)
 *
 * Workers have 128 MB memory limit, so 1000 servers leaves plenty of headroom.
 */
const MAX_CACHED_SERVERS = 1000;
const serverCache = new LRUCache<string, McpServer>(MAX_CACHED_SERVERS);

/**
 * Main entry point for API key authenticated MCP requests
 *
 * @param request - Incoming HTTP request
 * @param env - Cloudflare Workers environment
 * @param ctx - Execution context
 * @param pathname - Request pathname (/mcp)
 * @returns MCP protocol response
 */
export async function handleApiKeyRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string
): Promise<Response> {
  try {
    // 1. Extract API key from Authorization header
    const authHeader = request.headers.get("Authorization");
    const apiKey = authHeader?.replace("Bearer ", "");

    if (!apiKey) {
      logger.warn({ event: "auth_attempt", method: "api_key", success: false, reason: "Missing Authorization header" });
      return jsonError("Missing Authorization header", 401);
    }

    // 2. Validate API key and get user info
    const validationResult = await validateApiKey(apiKey, env);

    if (!validationResult) {
      logger.warn({ event: "auth_attempt", method: "api_key", success: false, reason: "Invalid or expired API key" });
      return jsonError("Invalid or expired API key", 401);
    }

    const { userId, email } = validationResult;

    logger.info({
      event: 'transport_request',
      transport: 'http',
      method: 'api_key',
      user_id: userId,
      user_email: email,
    });

    // 3. Create or get cached MCP server with tools
    const server = await getOrCreateServer(env, userId, email);

    // 4. Handle the MCP request using HTTP transport
    return await handleHTTPTransport(server, request, env, userId, email);
  } catch (error) {
    logger.error({
      event: 'server_error',
      error: error instanceof Error ? error.message : String(error),
      context: 'api_key_request_handler',
      pathname,
    });
    return jsonError(
      `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
      500
    );
  }
}

/**
 * Get or create MCP server instance for API key user
 *
 * This creates a standalone MCP server (not using McpAgent) with all tools.
 * The server instance is cached per user to avoid recreating it on every request.
 *
 * Cache behavior:
 * - Cache hit: Returns existing server immediately (~1ms)
 * - Cache miss: Creates new server (~10-50ms), then caches it
 * - Cache full: Evicts least recently used server automatically
 *
 * TODO: When you add new tools to server.ts, you MUST add them here too!
 *
 * @param env - Cloudflare Workers environment
 * @param userId - User ID for token management
 * @param email - User email for logging
 * @returns Configured MCP server instance
 */
async function getOrCreateServer(
  env: Env,
  userId: string,
  email: string
): Promise<McpServer> {
  // Check cache first (per user)
  const cached = serverCache.get(userId);
  if (cached) {
    logger.info({
      event: 'cache_operation',
      operation: 'hit',
      key: userId,
    });
    return cached;
  }

  logger.info({
    event: 'cache_operation',
    operation: 'miss',
    key: userId,
  });

  // Create new MCP server
  const server = new McpServer({
    name: "OpenSky Flight Tracker (API Key)",
    version: "1.0.0",
  });

  // Initialize OpenSky API client with local state management
  // Note: State is not persisted across requests
  // Each request gets a fresh token if needed
  const localState: State = {
    opensky_access_token: null,
    opensky_token_expires_at: null,
  };

  const setLocalState = async (newState: Partial<State>) => {
    Object.assign(localState, newState);
  };

  const openskyClient = new OpenSkyClient(env, localState, setLocalState);

  // ========================================================================
  // SEP-1865 MCP Apps: Resource Registration
  // ========================================================================
  const flightMapResource = UI_RESOURCES.flightMap;

  // Load HTML helper function (matches server.ts pattern)
  const loadHtml = async (assets: Fetcher, path: string): Promise<string> => {
    const response = await assets.fetch(new Request(`https://placeholder${path}`));
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }
    return response.text();
  };

  registerAppResource(
    server,
    flightMapResource.name,
    flightMapResource.uri,
    {
      description: flightMapResource.description,
      mimeType: RESOURCE_MIME_TYPE
    },
    async () => {
      const templateHTML = await loadHtml(env.ASSETS, "/flight-map.html");
      return {
        contents: [{
          uri: flightMapResource.uri,
          mimeType: RESOURCE_MIME_TYPE,
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
  registerAppTool(
    server,
    "get-aircraft-by-icao",
    {
      title: TOOL_METADATA["get-aircraft-by-icao"].title,
      description: getToolDescription("get-aircraft-by-icao"),
      inputSchema: {
        icao24: z.string().length(6).regex(/^[0-9a-fA-F]{6}$/)
          .meta({ description: "ICAO 24-bit address (6 hex characters, e.g., '3c6444' or 'a8b2c3')" }),
      }
    },
    async ({ icao24 }) => {
      // Implementation handled in executeGetAircraftByIcaoTool()
      return { content: [{ type: "text" as const, text: "Tool registered" }] };
    }
  );

  // ========================================================================
  // Tool 2: Find Aircraft Near Location (FREE)
  // ========================================================================
  registerAppTool(
    server,
    "find-aircraft-near-location",
    {
      title: TOOL_METADATA["find-aircraft-near-location"].title,
      description: getToolDescription("find-aircraft-near-location"),
      inputSchema: {
        latitude: z.number().min(-90).max(90)
          .meta({ description: "Center point latitude in decimal degrees (-90 to 90, e.g., 52.2297 for Warsaw)" }),
        longitude: z.number().min(-180).max(180)
          .meta({ description: "Center point longitude in decimal degrees (-180 to 180, e.g., 21.0122 for Warsaw)" }),
        radius_km: z.number().min(1).max(1000)
          .meta({ description: "Search radius in kilometers (1-1000, e.g., 25 for 25km radius)" }),
      },
      // SEP-1865: Link tool to predeclared UI resource
      _meta: {
        [RESOURCE_URI_META_KEY]: UI_RESOURCES.flightMap.uri
      }
    },
    async ({ latitude, longitude, radius_km }) => {
      // Implementation handled in executeFindAircraftNearLocationTool()
      return { content: [{ type: "text" as const, text: "Tool registered" }] };
    }
  );

  // Cache the server (automatic LRU eviction if cache is full)
  serverCache.set(userId, server);

  logger.info({
    event: 'cache_operation',
    operation: 'set',
    key: userId,
  });
  return server;
}

/**
 * Handle HTTP (Streamable HTTP) transport for MCP protocol
 *
 * Streamable HTTP is the modern MCP transport protocol that replaced SSE.
 * It uses standard HTTP POST requests with JSON-RPC 2.0 protocol.
 *
 * Supported JSON-RPC methods:
 * - initialize: Protocol handshake and capability negotiation
 * - ping: Health check (required by AnythingLLM)
 * - tools/list: List all available tools
 * - tools/call: Execute a specific tool
 *
 * @param server - Configured MCP server instance
 * @param request - Incoming HTTP POST request with JSON-RPC message
 * @param env - Cloudflare Workers environment
 * @param userId - User ID for logging
 * @param userEmail - User email for logging
 * @returns JSON-RPC response
 */
async function handleHTTPTransport(
  server: McpServer,
  request: Request,
  env: Env,
  userId: string,
  userEmail: string
): Promise<Response> {
  logger.info({
    event: 'transport_request',
    transport: 'http',
    method: 'POST',
    user_id: userId,
    user_email: userEmail,
  });

  try {
    // Parse JSON-RPC request
    const jsonRpcRequest = await request.json() as {
      jsonrpc: string;
      id: number | string;
      method: string;
      params?: any;
    };

    logger.info({
      event: 'transport_request',
      transport: 'http',
      method: jsonRpcRequest.method,
      user_email: 'anonymous',
    });

    // Validate JSON-RPC 2.0 format
    if (jsonRpcRequest.jsonrpc !== "2.0") {
      return jsonRpcResponse(jsonRpcRequest.id, null, {
        code: -32600,
        message: "Invalid Request: jsonrpc must be '2.0'",
      });
    }

    // Route to appropriate handler based on method
    switch (jsonRpcRequest.method) {
      case "initialize":
        return handleInitialize(jsonRpcRequest);

      case "ping":
        return handlePing(jsonRpcRequest);

      case "resources/list":
        return await handleResourcesList(jsonRpcRequest);

      case "resources/read":
        return await handleResourcesRead(jsonRpcRequest, env);

      case "tools/list":
        return await handleToolsList(server, jsonRpcRequest);

      case "tools/call":
        return await handleToolsCall(server, jsonRpcRequest, env, userId, userEmail);

      default:
        return jsonRpcResponse(jsonRpcRequest.id, null, {
          code: -32601,
          message: `Method not found: ${jsonRpcRequest.method}`,
        });
    }
  } catch (error) {
    logger.error({
      event: 'server_error',
      error: error instanceof Error ? error.message : String(error),
      context: 'http_transport_handler',
    });
    return jsonRpcResponse("error", null, {
      code: -32700,
      message: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Handle initialize request (MCP protocol handshake)
 */
function handleInitialize(request: {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: any;
}): Response {
  logger.info({
    event: 'transport_request',
    transport: 'http',
    method: 'initialize',
    user_email: 'system',
  });

  return jsonRpcResponse(request.id, {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {},
      resources: {},
    },
    serverInfo: {
      name: "OpenSky Flight Tracker",
      version: "1.0.0",
    },
    instructions: SERVER_INSTRUCTIONS,
  });
}

/**
 * Handle ping request (health check)
 */
function handlePing(request: {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: any;
}): Response {
  logger.info({
    event: 'transport_request',
    transport: 'http',
    method: 'ping',
    user_email: 'system',
  });

  return jsonRpcResponse(request.id, {});
}

/**
 * Handle resources/list request (list all available UI resources)
 */
async function handleResourcesList(request: {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: any;
}): Promise<Response> {
  logger.info({
    event: 'transport_request',
    transport: 'http',
    method: 'resources/list',
    user_email: 'system',
  });

  const flightMapResource = UI_RESOURCES.flightMap;

  return jsonRpcResponse(request.id, {
    resources: [
      {
        uri: flightMapResource.uri,
        name: flightMapResource.name,
        description: flightMapResource.description,
        mimeType: flightMapResource.mimeType,
      }
    ]
  });
}

/**
 * Handle resources/read request (fetch UI resource content)
 */
async function handleResourcesRead(
  request: {
    jsonrpc: string;
    id: number | string;
    method: string;
    params?: {
      uri: string;
    };
  },
  env: Env
): Promise<Response> {
  logger.info({
    event: 'transport_request',
    transport: 'http',
    method: 'resources/read',
    user_email: 'system',
  });

  if (!request.params?.uri) {
    return jsonRpcResponse(request.id, null, {
      code: -32602,
      message: "Invalid params: uri is required",
    });
  }

  const flightMapResource = UI_RESOURCES.flightMap;

  // Check if requested URI matches our flight map resource
  if (request.params.uri !== flightMapResource.uri) {
    return jsonRpcResponse(request.id, null, {
      code: -32602,
      message: `Resource not found: ${request.params.uri}`,
    });
  }

  try {
    // Load widget HTML from Assets
    const response = await env.ASSETS.fetch(new Request("https://placeholder/flight-map.html"));
    if (!response.ok) {
      throw new Error(`Failed to load widget: ${response.status}`);
    }
    const templateHTML = await response.text();

    return jsonRpcResponse(request.id, {
      contents: [{
        uri: flightMapResource.uri,
        mimeType: flightMapResource.mimeType,
        text: templateHTML,
        _meta: flightMapResource._meta as Record<string, unknown>
      }]
    });
  } catch (error) {
    logger.error({
      event: 'server_error',
      error: error instanceof Error ? error.message : String(error),
      context: 'resource_read_handler',
    });
    return jsonRpcResponse(request.id, null, {
      code: -32603,
      message: `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Handle tools/list request (list all available tools)
 *
 * LOCATION 2 of 4: Tool schemas for tools/list response
 */
async function handleToolsList(
  server: McpServer,
  request: {
    jsonrpc: string;
    id: number | string;
    method: string;
    params?: any;
  }
): Promise<Response> {
  logger.info({
    event: 'transport_request',
    transport: 'http',
    method: 'tools/list',
    user_email: 'system',
  });

  // Manually define tools since McpServer doesn't expose listTools()
  // These match the tools registered in getOrCreateServer()
  const tools = [
    {
      name: "getAircraftByIcao",
      description:
        "Get aircraft details by ICAO 24-bit transponder address (hex string, e.g., '3c6444'). " +
        "This is a direct lookup - very fast and cheap. " +
        "Returns current position, velocity, altitude, and callsign if aircraft is currently flying.",
      inputSchema: {
        type: "object",
        properties: {
          icao24: {
            type: "string",
            minLength: 6,
            maxLength: 6,
            pattern: "^[0-9a-fA-F]{6}$",
            description: "ICAO 24-bit address (6 hex characters, e.g., '3c6444' or 'a8b2c3')",
          },
        },
        required: ["icao24"],
      },
    },
    {
      name: "findAircraftNearLocation",
      description:
        "Find all aircraft currently flying near a geographic location. " +
        "Provide latitude, longitude, and search radius in kilometers. " +
        "Server calculates the bounding box and queries OpenSky API for all aircraft in that area. " +
        "Returns list of aircraft with position, velocity, altitude, callsign, and origin country.",
      inputSchema: {
        type: "object",
        properties: {
          latitude: {
            type: "number",
            minimum: -90,
            maximum: 90,
            description: "Center point latitude in decimal degrees (-90 to 90, e.g., 52.2297 for Warsaw)",
          },
          longitude: {
            type: "number",
            minimum: -180,
            maximum: 180,
            description: "Center point longitude in decimal degrees (-180 to 180, e.g., 21.0122 for Warsaw)",
          },
          radius_km: {
            type: "number",
            minimum: 1,
            maximum: 1000,
            description: "Search radius in kilometers (1-1000, e.g., 25 for 25km radius)",
          },
        },
        required: ["latitude", "longitude", "radius_km"],
      },
      _meta: {
        "ui/resourceUri": UI_RESOURCES.flightMap.uri
      }
    },
  ];

  return jsonRpcResponse(request.id, {
    tools,
  });
}

/**
 * Handle tools/call request (execute a tool)
 *
 * LOCATION 3 of 4: Switch statement for tool routing
 */
async function handleToolsCall(
  server: McpServer,
  request: {
    jsonrpc: string;
    id: number | string;
    method: string;
    params?: {
      name: string;
      arguments?: Record<string, any>;
    };
  },
  env: Env,
  userId: string,
  userEmail: string
): Promise<Response> {
  if (!request.params || !request.params.name) {
    return jsonRpcResponse(request.id, null, {
      code: -32602,
      message: "Invalid params: name is required",
    });
  }

  const toolName = request.params.name;
  const toolArgs = request.params.arguments || {};
  const actionId = crypto.randomUUID();

  logger.info({
    event: 'tool_started',
    tool: toolName,
    user_id: userId,
    user_email: userEmail,
    action_id: actionId,
    args: toolArgs,
  });

  const startTime = Date.now();

  try {
    // Execute tool logic based on tool name (FREE - no auth or token checks)

    let result: any;

    switch (toolName) {
      case "getAircraftByIcao":
        result = await executeGetAircraftByIcaoTool(toolArgs, env);
        break;

      case "findAircraftNearLocation":
        result = await executeFindAircraftNearLocationTool(toolArgs, env);
        break;

      default:
        logger.error({
          event: 'tool_failed',
          tool: toolName,
          user_id: userId,
          user_email: userEmail,
          action_id: actionId,
          error: `Unknown tool: ${toolName}`,
          error_code: 'unknown_tool',
        });
        return jsonRpcResponse(request.id, null, {
          code: -32601,
          message: `Unknown tool: ${toolName}`,
        });
    }

    const duration_ms = Date.now() - startTime;

    logger.info({
      event: 'tool_completed',
      tool: toolName,
      user_id: userId,
      user_email: userEmail,
      action_id: actionId,
      duration_ms,
      tokens_consumed: 0,
    });

    return jsonRpcResponse(request.id, result);
  } catch (error) {
    logger.error({
      event: 'tool_failed',
      tool: toolName,
      user_id: userId,
      user_email: userEmail,
      action_id: actionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonRpcResponse(request.id, null, {
      code: -32603,
      message: `Tool execution error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * LOCATION 4 of 4: Tool execution functions (FREE - no auth or tokens)
 */

/**
 * Execute getAircraftByIcao tool (FREE)
 */
async function executeGetAircraftByIcaoTool(
  args: Record<string, any>,
  env: Env
): Promise<any> {
  const TOOL_NAME = "getAircraftByIcao";

  // Initialize OpenSky client
  const localState: State = {
    opensky_access_token: null,
    opensky_token_expires_at: null,
  };
  const setLocalState = async (newState: Partial<State>) => {
    Object.assign(localState, newState);
  };
  const openskyClient = new OpenSkyClient(env, localState, setLocalState);

  // Execute tool logic (FREE - no auth or token checks)
  const aircraft = await openskyClient.getAircraftByIcao(args.icao24);

  const result = aircraft
    ? JSON.stringify(aircraft, null, 2)
    : `No aircraft found with ICAO24: ${args.icao24} (aircraft may not be currently flying)`;

  return {
    content: [{ type: "text" as const, text: result }],
  };
}

/**
 * Execute findAircraftNearLocation tool (FREE)
 */
async function executeFindAircraftNearLocationTool(
  args: Record<string, any>,
  env: Env
): Promise<any> {
  const TOOL_NAME = "findAircraftNearLocation";

  // Initialize OpenSky client
  const localState: State = {
    opensky_access_token: null,
    opensky_token_expires_at: null,
  };
  const setLocalState = async (newState: Partial<State>) => {
    Object.assign(localState, newState);
  };
  const openskyClient = new OpenSkyClient(env, localState, setLocalState);

  // Execute tool logic (FREE - no auth or token checks)
  const aircraftList = await openskyClient.findAircraftNearLocation(
    args.latitude,
    args.longitude,
    args.radius_km
  );

  const result = aircraftList.length > 0
    ? JSON.stringify({
        search_center: { latitude: args.latitude, longitude: args.longitude },
        radius_km: args.radius_km,
        aircraft_count: aircraftList.length,
        aircraft: aircraftList
      }, null, 2)
    : `No aircraft currently flying within ${args.radius_km}km of (${args.latitude}, ${args.longitude})`;

  const structuredResult = {
    search_center: { latitude: args.latitude, longitude: args.longitude },
    radius_km: args.radius_km,
    origin_country_filter: null,
    aircraft_count: aircraftList.length,
    aircraft: aircraftList
  };

  return {
    content: [{
      type: "text" as const,
      text: result
    }],
    structuredContent: structuredResult
  };
}

/**
 * Create a JSON-RPC 2.0 response
 */
function jsonRpcResponse(
  id: number | string,
  result: any = null,
  error: { code: number; message: string } | null = null
): Response {
  const response: any = {
    jsonrpc: "2.0",
    id,
  };

  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Helper function to return JSON error responses
 *
 * @param message - Error message
 * @param status - HTTP status code
 * @returns JSON error response
 */
function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({
      error: message,
      status: status,
    }),
    {
      status: status,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}
