/**
 * API Key Authentication Handler for OpenSky Flight Tracker
 *
 * This module provides API key authentication support for MCP clients that don't support
 * OAuth flows (like AnythingLLM, Cursor IDE, custom scripts).
 *
 * Authentication flow:
 * 1. Extract API key from Authorization header
 * 2. Validate key using validateApiKey()
 * 3. Get user from database
 * 4. Create MCP server with tools
 * 5. Handle MCP protocol request
 * 6. Return response
 *
 * TODO: When you add new tools to server.ts, you MUST also:
 * 1. Register them in getOrCreateServer() (around line 260)
 * 2. Add tool executor functions (around line 770)
 * 3. Add cases to handleToolsCall() (around line 750)
 * 4. Add tool schemas to handleToolsList() (around line 625)
 */

import { validateApiKey } from "./auth/apiKeys";
import { getUserById } from "./shared/tokenUtils";
import type { Env, State } from "./types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createUIResource } from "@mcp-ui/server";
import { OpenSkyClient } from "./api-client";
import { checkBalance, consumeTokensWithRetry } from "./shared/tokenConsumption";
import { formatInsufficientTokensError, formatAccountDeletedError } from "./shared/tokenUtils";
import { sanitizeOutput, redactPII } from 'pilpat-mcp-security';
import { generateFlightMapHTML } from "./optional/ui/flight-map-generator";
import { TOOL_METADATA, getToolDescription } from './tools/descriptions.js';
import { SERVER_INSTRUCTIONS } from './server-instructions.js';
import { logger } from './shared/logger';

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
 * @param pathname - Request pathname (/sse or /mcp)
 * @returns MCP protocol response
 */
export async function handleApiKeyRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string
): Promise<Response> {
  try {
    logger.info({
      event: 'transport_request',
      transport: pathname === '/sse' ? 'sse' : 'http',
      method: 'api_key_auth',
      user_email: 'pending',
    });

    // 1. Extract API key from Authorization header
    const authHeader = request.headers.get("Authorization");
    const apiKey = authHeader?.replace("Bearer ", "");

    if (!apiKey) {
      logger.warn({
        event: 'auth_attempt',
        method: 'api_key',
        success: false,
        reason: 'missing_authorization_header',
      });
      return jsonError("Missing Authorization header", 401);
    }

    // 2. Validate API key and get user_id
    const userId = await validateApiKey(apiKey, env);

    if (!userId) {
      logger.warn({
        event: 'api_key_validated',
        user_id: 'unknown',
        key_prefix: apiKey.substring(0, 8),
        success: false,
      });
      return jsonError("Invalid or expired API key", 401);
    }

    // 3. Get user from database
    const dbUser = await getUserById(env.TOKEN_DB, userId);

    if (!dbUser) {
      // getUserById already checks is_deleted, so null means not found OR deleted
      logger.warn({
        event: 'user_lookup',
        lookup_by: 'id',
        user_id: userId,
        found: false,
      });
      return jsonError("User not found or account deleted", 404);
    }

    logger.info({
      event: 'auth_attempt',
      method: 'api_key',
      user_email: dbUser.email,
      user_id: userId,
      success: true,
    });

    // 4. Create or get cached MCP server with tools
    const server = await getOrCreateServer(env, userId, dbUser.email);

    // 5. Handle the MCP request using the appropriate transport
    if (pathname === "/sse") {
      return await handleSSETransport(server, request);
    } else if (pathname === "/mcp") {
      return await handleHTTPTransport(server, request, env, userId, dbUser.email);
    } else {
      return jsonError("Invalid endpoint. Use /sse or /mcp", 400);
    }
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
  // Check cache first
  const cached = serverCache.get(userId);
  if (cached) {
    logger.info({
      event: 'cache_operation',
      operation: 'hit',
      key: `server_${userId}`,
    });
    return cached;
  }

  logger.info({
    event: 'cache_operation',
    operation: 'miss',
    key: `server_${userId}`,
  });

  // Create new MCP server
  const server = new McpServer({
    name: "OpenSky Flight Tracker (API Key)",
    version: "1.0.0",
  });

  // Initialize OpenSky API client with local state management
  // Note: In API key path, state is not persisted across requests
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
  // Tool 1: Get Aircraft by ICAO24 (1 token cost)
  // ========================================================================
  server.registerTool(
    "getAircraftByIcao",
    {
      title: TOOL_METADATA.getAircraftByIcao.title,
      description: getToolDescription("getAircraftByIcao"),
      inputSchema: {
        icao24: z.string().length(6).regex(/^[0-9a-fA-F]{6}$/)
          .describe("ICAO 24-bit address (6 hex characters, e.g., '3c6444' or 'a8b2c3')"),
      }
    },
    async ({ icao24 }) => {
      // Implementation handled in executeGetAircraftByIcaoTool()
      return { content: [{ type: "text" as const, text: "Tool registered" }] };
    }
  );

  // ========================================================================
  // Tool 2: Find Aircraft Near Location (3 tokens cost)
  // ========================================================================
  server.registerTool(
    "findAircraftNearLocation",
    {
      title: TOOL_METADATA.findAircraftNearLocation.title,
      description: getToolDescription("findAircraftNearLocation"),
      inputSchema: {
        latitude: z.number().min(-90).max(90)
          .describe("Center point latitude in decimal degrees (-90 to 90, e.g., 52.2297 for Warsaw)"),
        longitude: z.number().min(-180).max(180)
          .describe("Center point longitude in decimal degrees (-180 to 180, e.g., 21.0122 for Warsaw)"),
        radius_km: z.number().min(1).max(1000)
          .describe("Search radius in kilometers (1-1000, e.g., 25 for 25km radius)"),
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
    key: `server_${userId}`,
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
    method: 'json_rpc',
    user_email: userEmail,
  });

  /**
   * Security: Token-based authentication provides primary protection
   * - API key validation (database lookup, format check)
   * - User account verification (is_deleted flag)
   * - Token balance validation
   * - Cloudflare Workers infrastructure (runs on *.workers.dev, not localhost)
   * No origin whitelist - breaks compatibility with MCP clients (Claude, Cursor, custom clients)
   */

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
      user_email: userEmail,
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
    user_email: userEmail,
    user_id: userId,
    action_id: actionId,
    args: toolArgs,
  });

  const startTime = Date.now();

  try {
    // Execute tool logic based on tool name
    // This duplicates the logic from getOrCreateServer() but is necessary
    // because McpServer doesn't expose a way to call tools directly

    let result: any;

    switch (toolName) {
      case "getAircraftByIcao":
        result = await executeGetAircraftByIcaoTool(toolArgs, env, userId);
        break;

      case "findAircraftNearLocation":
        result = await executeFindAircraftNearLocationTool(toolArgs, env, userId);
        break;

      default:
        logger.error({
          event: 'tool_failed',
          tool: toolName,
          user_email: userEmail,
          user_id: userId,
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
    const toolCost = TOOL_METADATA[toolName as keyof typeof TOOL_METADATA]?.cost.tokens || 0;

    logger.info({
      event: 'tool_completed',
      tool: toolName,
      user_email: userEmail,
      user_id: userId,
      action_id: actionId,
      duration_ms,
      tokens_consumed: toolCost,
    });

    return jsonRpcResponse(request.id, result);
  } catch (error) {
    logger.error({
      event: 'tool_failed',
      tool: toolName,
      user_email: userEmail,
      user_id: userId,
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
 * LOCATION 4 of 4: Tool execution functions
 */

/**
 * Execute getAircraftByIcao tool (1 token)
 */
async function executeGetAircraftByIcaoTool(
  args: Record<string, any>,
  env: Env,
  userId: string
): Promise<any> {
  const TOOL_COST = TOOL_METADATA.getAircraftByIcao.cost.tokens;
  const TOOL_NAME = "getAircraftByIcao";
  const actionId = crypto.randomUUID();

  const balanceCheck = await checkBalance(env.TOKEN_DB, userId, TOOL_COST);

  if (balanceCheck.userDeleted) {
    return {
      content: [{ type: "text" as const, text: formatAccountDeletedError(TOOL_NAME) }],
      isError: true,
    };
  }

  if (!balanceCheck.sufficient) {
    return {
      content: [
        {
          type: "text" as const,
          text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST),
        },
      ],
      isError: true,
    };
  }

  // Initialize OpenSky client
  const localState: State = {
    opensky_access_token: null,
    opensky_token_expires_at: null,
  };
  const setLocalState = async (newState: Partial<State>) => {
    Object.assign(localState, newState);
  };
  const openskyClient = new OpenSkyClient(env, localState, setLocalState);

  // Execute tool logic
  const aircraft = await openskyClient.getAircraftByIcao(args.icao24);

  const result = aircraft
    ? JSON.stringify(aircraft, null, 2)
    : `No aircraft found with ICAO24: ${args.icao24} (aircraft may not be currently flying)`;

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
    logger.warn({
      event: 'pii_redacted',
      tool: TOOL_NAME,
      pii_types: detectedPII,
      count: detectedPII.length,
    });
  }

  const finalResult = redacted;
  // ⭐ End of Step 4.5

  await consumeTokensWithRetry(
    env.TOKEN_DB,
    userId,
    TOOL_COST,
    "opensky",
    TOOL_NAME,
    args,
    finalResult,
    true,
    actionId
  );

  return {
    content: [{ type: "text" as const, text: finalResult }],
  };
}

/**
 * Execute findAircraftNearLocation tool (3 tokens)
 */
async function executeFindAircraftNearLocationTool(
  args: Record<string, any>,
  env: Env,
  userId: string
): Promise<any> {
  const TOOL_COST = TOOL_METADATA.findAircraftNearLocation.cost.tokens;
  const TOOL_NAME = "findAircraftNearLocation";
  const actionId = crypto.randomUUID();

  const balanceCheck = await checkBalance(env.TOKEN_DB, userId, TOOL_COST);

  if (balanceCheck.userDeleted) {
    return {
      content: [{ type: "text" as const, text: formatAccountDeletedError(TOOL_NAME) }],
      isError: true,
    };
  }

  if (!balanceCheck.sufficient) {
    return {
      content: [
        {
          type: "text" as const,
          text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST),
        },
      ],
      isError: true,
    };
  }

  // Initialize OpenSky client
  const localState: State = {
    opensky_access_token: null,
    opensky_token_expires_at: null,
  };
  const setLocalState = async (newState: Partial<State>) => {
    Object.assign(localState, newState);
  };
  const openskyClient = new OpenSkyClient(env, localState, setLocalState);

  // Execute tool logic
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
    logger.warn({
      event: 'pii_redacted',
      tool: TOOL_NAME,
      pii_types: detectedPII,
      count: detectedPII.length,
    });
  }

  const finalResult = redacted;
  // ⭐ End of Step 4.5

  await consumeTokensWithRetry(
    env.TOKEN_DB,
    userId,
    TOOL_COST,
    "opensky",
    TOOL_NAME,
    args,
    finalResult,
    true,
    actionId
  );

  // Return as MCP-UI resource with interactive map
  if (aircraftList.length > 0) {
    const mapHTML = generateFlightMapHTML({
      search_center: { latitude: args.latitude, longitude: args.longitude },
      radius_km: args.radius_km,
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
        description: `${aircraftList.length} aircraft near ${args.latitude}, ${args.longitude}`,
        // CSP configuration for MCP Apps hosts (SEP-1724)
        ui: {
          csp: {
            // OpenStreetMap tile servers for map rendering
            resourceDomains: [
              'https://*.tile.openstreetmap.org',
              'https://unpkg.com'
            ]
          }
        }
      }
    });

    return {
      content: [uiResource as any],
      structuredContent: {
        search_center: { latitude: args.latitude, longitude: args.longitude },
        radius_km: args.radius_km,
        aircraft_count: aircraftList.length,
        aircraft: aircraftList
      }
    };
  } else {
    return {
      content: [
        {
          type: "text" as const,
          text: `No aircraft currently flying within ${args.radius_km}km of (${args.latitude}, ${args.longitude})`
        }
      ]
    };
  }
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
 * Handle SSE (Server-Sent Events) transport for MCP protocol
 *
 * SSE is used by AnythingLLM and other clients for real-time MCP communication.
 * This uses the standard MCP SDK SSEServerTransport for Cloudflare Workers.
 *
 * @param server - Configured MCP server instance
 * @param request - Incoming HTTP request
 * @returns SSE response stream
 */
async function handleSSETransport(server: McpServer, request: Request): Promise<Response> {
  logger.info({
    event: 'transport_request',
    transport: 'sse',
    method: 'sse_setup',
    user_email: 'system',
  });

  try {
    // For Cloudflare Workers, we need to return a Response with a ReadableStream
    // The MCP SDK's SSEServerTransport expects Node.js streams, so we'll implement
    // SSE manually for Cloudflare Workers compatibility

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Send SSE headers
    const response = new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });

    // Connect server to client (handle in background)
    // Note: This is a simplified implementation for API key auth
    // Full SSE support would require handling POST messages from client

    (async () => {
      try {
        // Send initial connection event
        await writer.write(encoder.encode("event: message\n"));
        await writer.write(encoder.encode('data: {"status":"connected"}\n\n'));

        logger.info({
          event: 'sse_connection',
          status: 'established',
          user_email: 'system',
        });

        // Keep connection alive
        const keepAliveInterval = setInterval(async () => {
          try {
            await writer.write(encoder.encode(": keepalive\n\n"));
          } catch (e) {
            clearInterval(keepAliveInterval);
          }
        }, 30000);

        // Note: Full MCP protocol implementation would go here
        // For MVP, we're providing basic SSE connectivity
      } catch (error) {
        logger.error({
          event: 'sse_connection',
          status: 'error',
          user_email: 'system',
          error: error instanceof Error ? error.message : String(error),
        });
        await writer.close();
      }
    })();

    return response;
  } catch (error) {
    logger.error({
      event: 'sse_connection',
      status: 'error',
      user_email: 'system',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
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
