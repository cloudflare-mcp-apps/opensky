# MCP Server Customization Guide

Complete step-by-step guide for customizing the skeleton template to build your own MCP server.

**Estimated Time:** 15-30 minutes

## ⚠️ BEFORE YOU START

**CRITICAL:** Read `/CLOUDFLARE_CONFIG.md` at the repository root FIRST. This file contains:
- Cloudflare Account ID
- Shared KV namespace IDs (exact values - NEVER create new ones!)
- Shared D1 database ID (exact value - NEVER change this!)
- WorkOS credentials (shared across ALL MCP servers)
- Domain patterns
- Standard wrangler.jsonc template

**Use the exact IDs from CLOUDFLARE_CONFIG.md** - do not guess or create new infrastructure.

## Prerequisites

- Node.js 18+ installed
- Wrangler CLI installed (`npm install -g wrangler`)
- WorkOS account ([dashboard.workos.com](https://dashboard.workos.com))
- Cloudflare account

## Step 1: Clone and Renam

### 1.1 Copy Template

```bash
cd /path/to/your/projects
cp -r mcp-server-skeleton weather-mcp
cd weather-mcp
```

### 1.2 Find and Replace

Replace these strings across all files:

| Find | Replace With | Example |
|------|--------------|---------|
| `OpenSkyMcp` | `WeatherMCP` | Your class name |
| `opensky` | `weather-mcp` | Your server slug |
| `OpenSky Flight Tracker` | `Weather MCP Server` | Human-readable name |

**Using Command Line:**
```bash
# macOS/Linux
find . -type f -name "*.ts" -o -name "*.json" -o -name "*.md" | xargs sed -i '' 's/OpenSkyMcp/WeatherMCP/g'
find . -type f -name "*.ts" -o -name "*.json" -o -name "*.md" | xargs sed -i '' 's/opensky/weather-mcp/g'
```

## Step 2: Configure Environment

### 2.1 Get Shared Credentials from CLOUDFLARE_CONFIG.md

**IMPORTANT:** All MCP servers use SHARED infrastructure. Get exact values from `/CLOUDFLARE_CONFIG.md`:

1. **WorkOS Credentials** (shared across ALL servers):
   ```
   WORKOS_CLIENT_ID=client_01XXXXXXXXXXXXXXXXXXXXXX  # Get from CLOUDFLARE_CONFIG.md
   WORKOS_API_KEY=sk_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX  # Get from CLOUDFLARE_CONFIG.md
   ```

2. **KV Namespace IDs** (shared across ALL servers):
   ```jsonc
   // CACHE_KV
   "id": "fa6ff790f146478e85ea77ae4a5caa4b"
   "preview_id": "4b37112559f2429191633d98781645ca"

   // OAUTH_KV
   "id": "b77ec4c7e96043fab0c466a978c2f186"
   "preview_id": "cf8ef9f38ab24ae583d20dd4e973810c"
   ```

3. **D1 Database ID** (shared across ALL servers):
   ```
   database_id: "ebb389aa-2d65-4d38-a0da-50c7da9dfe8b"
   ```

### 2.2 Create Local Environment File

```bash
# Copy template
cp .dev.vars.example .dev.vars

# Edit .dev.vars and add the SHARED WorkOS credentials from CLOUDFLARE_CONFIG.md
nano .dev.vars  # or use your editor
```

**Copy these exact values from CLOUDFLARE_CONFIG.md:**
```bash
WORKOS_CLIENT_ID=client_01XXXXXXXXXXXXXXXXXXXXXX  # Get from CLOUDFLARE_CONFIG.md
WORKOS_API_KEY=sk_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX  # Get from CLOUDFLARE_CONFIG.md

# Add any custom API keys for YOUR server below
# YOUR_CUSTOM_API_KEY=...
```

### 2.3 Verify wrangler.jsonc Uses Shared Infrastructure

**DO NOT create new KV namespaces or D1 databases!** The skeleton already has the correct shared IDs from CLOUDFLARE_CONFIG.md.

Verify your `wrangler.jsonc` has these exact values:

```jsonc
"kv_namespaces": [
    {
        "binding": "CACHE_KV",
        "id": "fa6ff790f146478e85ea77ae4a5caa4b",
        "preview_id": "4b37112559f2429191633d98781645ca"
    },
    {
        "binding": "OAUTH_KV",
        "id": "b77ec4c7e96043fab0c466a978c2f186",
        "preview_id": "cf8ef9f38ab24ae583d20dd4e973810c"
    }
],
"d1_databases": [
    {
        "binding": "TOKEN_DB",
        "database_name": "mcp-tokens-database",
        "database_id": "ebb389aa-2d65-4d38-a0da-50c7da9dfe8b"
    }
]
```

**If these don't match CLOUDFLARE_CONFIG.md exactly, copy the correct values from there.**

## Step 3: Customize Types

### 3.1 Update Environment Bindings

Edit `src/types.ts`:

```typescript
export interface Env {
    // Required bindings (DON'T REMOVE)
    OAUTH_KV: KVNamespace;
    MCP_OBJECT: DurableObjectNamespace;
    DB: D1Database;
    WORKOS_CLIENT_ID: string;
    WORKOS_API_KEY: string;

    // ADD YOUR CUSTOM BINDINGS HERE:
    WEATHER_API_KEY?: string;           // Your API key
    WEATHER_API_URL?: string;           // Your API URL

    // Workers AI (if needed)
    // AI?: Ai;

    // R2 Storage (if needed)
    // MY_BUCKET?: R2Bucket;
}
```

### 3.2 Define API Response Types

Add your API response types:

```typescript
// Example: Weather API response
export interface WeatherApiResponse {
    location: string;
    temperature: number;
    condition: string;
    humidity: number;
    timestamp: string;
}

// Example: Tool result
export interface WeatherResult {
    location: string;
    current: {
        temp: number;
        condition: string;
    };
    forecast: Array<{
        date: string;
        high: number;
        low: number;
    }>;
}
```

### 3.3 Update wrangler.jsonc

If you added custom secrets, add them to production:

```bash
# Add secrets
wrangler secret put WEATHER_API_KEY
wrangler secret put WEATHER_API_URL

# Add to .dev.vars for local development
```

## Step 4: Implement API Client (10 minutes)

### 4.1 Replace Placeholder

Edit `src/api-client.ts`:

```typescript
export class WeatherApiClient {
    private env: Env;
    private baseUrl: string;

    constructor(env: Env) {
        this.env = env;
        this.baseUrl = env.WEATHER_API_URL || "https://api.weather.com";
    }

    async getCurrentWeather(location: string): Promise<WeatherApiResponse> {
        const url = `${this.baseUrl}/current?location=${encodeURIComponent(location)}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.env.WEATHER_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Weather API error: ${response.status}`);
        }

        return response.json();
    }

    async getForecast(location: string, days: number): Promise<WeatherApiResponse> {
        // Implement forecast logic
    }
}
```

### 4.2 Add Error Handling

```typescript
async getCurrentWeather(location: string): Promise<WeatherApiResponse> {
    try {
        const response = await fetch(/* ... */);

        if (!response.ok) {
            // Log error for debugging
            console.error(`[Weather API] Error: ${response.status}`, await response.text());
            throw new Error(`Weather API returned ${response.status}`);
        }

        return response.json();
    } catch (error) {
        console.error('[Weather API] Request failed:', error);
        throw new Error(`Failed to fetch weather: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
```

## Step 5: Define Tools

**CRITICAL:** This skeleton supports **dual authentication** (OAuth + API keys). When you add tools, you MUST add them to **TWO files**:

1. **`src/server.ts`** - For OAuth clients (Claude Desktop, ChatGPT)
2. **`src/api-key-handler.ts`** - For API key clients (AnythingLLM, Cursor IDE, scripts)

### 5.1 Tool Structure (OAuth Path)

Edit `src/server.ts` and replace example tools:

```typescript
export class WeatherMCP extends McpAgent<Env, unknown, Props> {
    server = new McpServer({
        name: "Weather MCP Server",
        version: "1.0.0",
    });

    async init() {
        const apiClient = new WeatherApiClient(this.env);

        // Tool 1: Get current weather (1 token)
        this.server.tool(
            "getCurrentWeather",
            "Get current weather conditions for a location. " +
            "Returns temperature, condition, humidity, and wind speed. " +
            "⚠️ This tool costs 1 token per use.",
            {
                location: z.string().min(1).describe(
                    "City name or coordinates (e.g., 'London' or '51.5074,-0.1278')"
                ),
            },
            async ({ location }) => {
                const TOOL_COST = 1;
                const TOOL_NAME = "getCurrentWeather";

                // 0. Pre-generate action_id for idempotency
                const actionId = crypto.randomUUID();

                try {
                    // 1. Get user ID
                    const userId = this.props?.userId;
                    if (!userId) {
                        throw new Error("User ID not found");
                    }

                    // 2. Check balance
                    const balanceCheck = await checkBalance(
                        this.env.TOKEN_DB, userId, TOOL_COST
                    );

                    // 3. Insufficient tokens?
                    if (!balanceCheck.sufficient) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: formatInsufficientTokensError(
                                    TOOL_NAME,
                                    balanceCheck.currentBalance,
                                    TOOL_COST
                                )
                            }],
                            isError: true
                        };
                    }

                    // 4. Execute API call and capture result
                    const weather = await apiClient.getCurrentWeather(location);

                    // 5. Consume tokens WITH RETRY and idempotency protection
                    await consumeTokensWithRetry(
                        this.env.TOKEN_DB,
                        userId,
                        TOOL_COST,
                        "weather-mcp",
                        TOOL_NAME,
                        { location },    // action params
                        weather,         // action result - logged for audit
                        true,            // success flag
                        actionId         // pre-generated for idempotency
                    );

                    // 6. Return result
                    return {
                        content: [{
                            type: "text" as const,
                            text: JSON.stringify(weather, null, 2)
                        }]
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

        // Add more tools following the same pattern...
    }
}
```

### 5.2 Tool Structure (API Key Path)

**CRITICAL:** Every tool you add to `src/server.ts` MUST also be added to `src/api-key-handler.ts`.

Edit `src/api-key-handler.ts` and update in **FOUR locations**:

**Location 1: getOrCreateServer() - Register Tool (around line 260)**
```typescript
// Add your tool registration in getOrCreateServer()
server.tool(
    "getCurrentWeather",
    "Get current weather conditions for a location. " +
    "⚠️ This tool costs 1 token per use.",
    {
        location: z.string().min(1).describe("City name or coordinates"),
    },
    async ({ location }) => {
        const TOOL_COST = 1;
        const TOOL_NAME = "getCurrentWeather";
        const actionId = crypto.randomUUID();

        try {
            const balanceCheck = await checkBalance(env.TOKEN_DB, userId, TOOL_COST);

            if (balanceCheck.userDeleted) {
                return {
                    content: [{ type: "text" as const, text: formatAccountDeletedError(TOOL_NAME) }],
                    isError: true,
                };
            }

            if (!balanceCheck.sufficient) {
                return {
                    content: [{
                        type: "text" as const,
                        text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST),
                    }],
                    isError: true,
                };
            }

            const apiClient = new WeatherApiClient(env);
            const result = await apiClient.getCurrentWeather(location);

            await consumeTokensWithRetry(
                env.TOKEN_DB, userId, TOOL_COST,
                "weather-mcp", TOOL_NAME,
                { location }, result, true, actionId
            );

            return {
                content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
);
```

**Location 2: handleToolsList() - Add Schema (around line 625)**
```typescript
// Add your tool schema to the tools array
const tools = [
    {
        name: "getCurrentWeather",
        description: "Get current weather conditions for a location. ⚠️ This tool costs 1 token per use.",
        inputSchema: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    minLength: 1,
                    description: "City name or coordinates",
                },
            },
            required: ["location"],
        },
    },
    // ... other tools
];
```

**Location 3: handleToolsCall() - Add Switch Case (around line 750)**
```typescript
switch (toolName) {
    case "getCurrentWeather":
        result = await executeCurrentWeatherTool(toolArgs, env, userId);
        break;

    // ... other tools
}
```

**Location 4: Create Executor Function (around line 770)**
```typescript
/**
 * Execute getCurrentWeather tool
 */
async function executeCurrentWeatherTool(
    args: Record<string, any>,
    env: Env,
    userId: string
): Promise<any> {
    const TOOL_COST = 1;
    const TOOL_NAME = "getCurrentWeather";
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
            content: [{
                type: "text" as const,
                text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST),
            }],
            isError: true,
        };
    }

    const apiClient = new WeatherApiClient(env);
    const result = await apiClient.getCurrentWeather(args.location);

    await consumeTokensWithRetry(
        env.TOKEN_DB, userId, TOOL_COST,
        "weather-mcp", TOOL_NAME,
        args, result, true, actionId
    );

    return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
}
```

**Verification Checklist:**
- [ ] Tool added to `src/server.ts` (OAuth path)
- [ ] Tool added to `getOrCreateServer()` in `src/api-key-handler.ts`
- [ ] Tool schema added to `handleToolsList()` in `src/api-key-handler.ts`
- [ ] Tool case added to `handleToolsCall()` switch in `src/api-key-handler.ts`
- [ ] Tool executor function created in `src/api-key-handler.ts`
- [ ] Both implementations use identical token costs and logic

### 5.3 Input Validation

Always validate input BEFORE checking tokens:

```typescript
async ({ startDate, endDate }) => {
    // VALIDATE FIRST (don't charge for invalid input)
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
        return {
            content: [{ type: "text" as const, text: "Error: Invalid date range" }],
            isError: true
        };
    }

    // NOW check tokens...
    const balanceCheck = await checkBalance(/* ... */);
}
```

### 5.3 Set Token Costs

Choose appropriate costs based on:
- API costs (if you're charged per call)
- Computational complexity


## Step 6: Configure Centralized Authentication

**MANDATORY:** All MCP servers integrate with the centralized authentication system at `panel.wtyczki.ai`.

### 6.1 What is Centralized Authentication?

**Architecture:**
```
┌────────────────────────────────────┐
│   Centralized Login (ONE instance) │
│   panel.wtyczki.ai/auth/login-custom│
│                                    │
│   • Custom branded UI             │
│   • WorkOS Magic Auth             │
│   • Session management            │
└────────────────────────────────────┘
              ↓ session cookie
┌────────────────────────────────────┐
│   MCP Servers (MULTIPLE instances) │
│                                    │
│   • your-server.wtyczki.ai        │
│   • weather-mcp.wtyczki.ai        │
│   • All other MCP servers...      │
└────────────────────────────────────┘
```

**Benefits:**
- ✅ **Single login** for all MCP servers
- ✅ **Consistent branding** across entire platform
- ✅ **No duplicate code** - session validation already in skeleton
- ✅ **Easy maintenance** - update login UI in one place
- ✅ **Shared sessions** - users authenticate once

### 6.2 What's Already Implemented

**Good news:** The skeleton template already includes session validation! You don't need to create custom login files.

**Pre-built in skeleton:**
- ✅ `src/authkit-handler.ts` - Session validation in `/authorize` endpoint
- ✅ `src/tokenUtils.ts` - Database user verification with `is_deleted` check
- ✅ `src/types.ts` - USER_SESSIONS in Env interface
- ✅ `src/props.ts` - Props structure with userId and email

**What the skeleton does:**
1. Checks for `workos_session` cookie from centralized login
2. Redirects to `panel.wtyczki.ai/auth/login-custom` if no session
3. Validates session from shared USER_SESSIONS KV namespace
4. Queries database for current user data (balance, is_deleted status)
5. Completes OAuth with database user_id

### 6.3 Quick Setup (2 minutes)

**ONLY ONE STEP NEEDED:** Add USER_SESSIONS namespace to `wrangler.jsonc`

**Step 1: Get SHARED namespace IDs from CLOUDFLARE_CONFIG.md**

Open `/CLOUDFLARE_CONFIG.md` and find:
```jsonc
// USER_SESSIONS KV namespace (SHARED across all MCP servers)
{
  "binding": "USER_SESSIONS",
  "id": "e5ad189139cd44f38ba0224c3d596c73",          // Production
  "preview_id": "49c43fb4d6e242db87fd885ba46b5a1d"   // Preview
}
```

**Step 2: Add to your `wrangler.jsonc`**

```jsonc
{
  "name": "your-mcp-server",
  "kv_namespaces": [
    {
      "binding": "CACHE_KV",
      "id": "fa6ff790f146478e85ea77ae4a5caa4b",
      "preview_id": "4b37112559f2429191633d98781645ca"
    },
    {
      "binding": "OAUTH_KV",
      "id": "b77ec4c7e96043fab0c466a978c2f186",
      "preview_id": "cf8ef9f38ab24ae583d20dd4e973810c"
    },
    // ADD THIS - exact IDs from CLOUDFLARE_CONFIG.md:
    {
      "binding": "USER_SESSIONS",
      "id": "e5ad189139cd44f38ba0224c3d596c73",
      "preview_id": "49c43fb4d6e242db87fd885ba46b5a1d"
    }
  ]
}
```

**That's it!** No custom UI files, no route handlers, no authentication code needed.

### 6.4 How Authentication Works

**User Experience:**
1. User clicks "Connect" in MCP client (ChatGPT, Claude, etc.)
2. Your MCP server `/authorize` checks for `workos_session` cookie
3. **No session?** → Redirect to `panel.wtyczki.ai/auth/login-custom`
   - User sees custom branded login (same for all servers)
   - User enters email → receives 6-digit Magic Auth code
   - User enters code → session created, redirect back to your server
4. **Session exists?** → Validate from USER_SESSIONS KV
   - Query database for user (balance, is_deleted check)
   - Complete OAuth with database user_id
5. User can now use MCP tools

**Session Sharing:**
- User authenticates once at `panel.wtyczki.ai`
- Cookie works for ALL MCP servers at `*.wtyczki.ai`
- No re-login when switching between servers

### 6.5 Verification

**⚠️ CRITICAL: USER_SESSIONS Must Be Required**

USER_SESSIONS must be **required** (not optional) in your Env interface:

```typescript
// ✅ CORRECT - Required (no ?)
USER_SESSIONS: KVNamespace;

// ❌ WRONG - Optional (has ?)
USER_SESSIONS?: KVNamespace;
```

**Why This Matters:**
- Optional binding allows `c.env.USER_SESSIONS` to be `undefined` at runtime
- Code silently falls back to default WorkOS UI (`exciting-domain-65.authkit.app`)
- Users see default WorkOS UI instead of branded login at `panel.wtyczki.ai`
- No error message - appears to work but breaks centralized authentication

**Check that your setup is correct:**

```bash
# Verify wrangler.jsonc has USER_SESSIONS
grep -A 3 "USER_SESSIONS" wrangler.jsonc

# Expected output:
# {
#   "binding": "USER_SESSIONS",
#   "id": "e5ad189139cd44f38ba0224c3d596c73",
#   "preview_id": "49c43fb4d6e242db87fd885ba46b5a1d"
# }
```

```bash
# Verify types.ts includes USER_SESSIONS as REQUIRED (no ?)
grep "USER_SESSIONS" src/types.ts

# Expected output:
# USER_SESSIONS: KVNamespace;  // Required, not optional!
```

```bash
# CRITICAL: Verify it's NOT optional (this should return nothing)
grep "USER_SESSIONS?: KVNamespace" src/types.ts
# No output = correct (USER_SESSIONS is required)
```

```bash
# Verify authkit-handler.ts has session validation
grep "workos_session" src/authkit-handler.ts

# Expected output:
# sessionToken = cookies['workos_session'] || null;
```

### 6.6 Token System Compatibility

**CRITICAL:** The centralized login maintains full compatibility with the token system.

**How it works:**
```typescript
// 1. Session from centralized login contains database user_id
const session = { user_id: "abc-123", email: "user@example.com" };

// 2. Your MCP server queries database for fresh data
const dbUser = await getUserByEmail(this.env.DB, session.email);

// 3. Props.userId set to database user_id
props: {
    userId: dbUser.user_id,  // ← Used by token operations
    email: dbUser.email
}

// 4. Tools use Props.userId for token management
const userId = this.props?.userId;
await checkBalance(this.env.DB, userId, TOOL_COST);
```

### 6.7 Complete Architecture Documentation

For detailed information about the centralized authentication system:

📖 **[CUSTOM_LOGIN_GUIDE.md](CUSTOM_LOGIN_GUIDE.md)**

This guide includes:
- Complete authentication flow diagrams
- Session data structure specification
- Database query patterns
- Token system compatibility proof
- Troubleshooting common issues
- Security considerations

### 6.8 AnythingLLM Configuration (API Key Authentication)

**NEW:** The skeleton now supports **API key authentication** for clients like AnythingLLM that don't support OAuth flows.

#### What is API Key Authentication?

**Dual Authentication Architecture:**
```
┌─────────────────────────────────────┐
│   OAuth Clients                     │
│   (Claude Desktop, ChatGPT)         │
│   → /authorize → WorkOS → Tools    │
└─────────────────────────────────────┘
              AND
┌─────────────────────────────────────┐
│   API Key Clients                   │
│   (AnythingLLM, Cursor, Scripts)    │
│   → Authorization: Bearer wtyk_XXX  │
│   → Direct access to tools          │
└─────────────────────────────────────┘
```

**Benefits:**
- ✅ **Simpler integration** - No OAuth flow required
- ✅ **Same tools** - Identical functionality to OAuth
- ✅ **Same token system** - Uses shared D1 database
- ✅ **Dual transport** - Works with both `/sse` and `/mcp` endpoints

#### AnythingLLM Setup

**Step 1: Get API Key**

API keys are generated from the mcp-token-system dashboard at `panel.wtyczki.ai`. Users can create keys with custom names (e.g., "AnythingLLM", "Cursor IDE").

**Step 2: Configure AnythingLLM**

Create configuration file for AnythingLLM (usually at `storage/plugins/agent-skills.json`):

```json
{
  "mcpServers": {
    "your-server": {
      "type": "streamable",
      "url": "https://your-server.wtyczki.ai/mcp",
      "headers": {
        "Authorization": "Bearer wtyk_YOUR_API_KEY_HERE"
      },
      "anythingllm": {
        "autoStart": true
      }
    }
  }
}
```

**Configuration Notes:**
- Use `"type": "streamable"` (not `"sse"` - that has a known SDK bug with headers)
- Use `/mcp` endpoint for modern Streamable HTTP transport
- API key format: `wtyk_` followed by 64 hex characters
- `autoStart: true` enables the server automatically

**Step 3: Verify Connection**

1. Start/restart AnythingLLM
2. Navigate to Agent Skills page
3. Look for green status indicator
4. Verify your tools are listed

#### Testing API Key Authentication

```bash
# Test API key validation
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# Expected: Protocol version and capabilities
```

#### What's Already Implemented

The skeleton includes **complete API key support**:

- ✅ `src/apiKeys.ts` - Key validation and management
- ✅ `src/api-key-handler.ts` - Request handling for API key clients
- ✅ `src/index.ts` - Dual authentication routing
- ✅ LRU cache for server instances (max 1000 servers)
- ✅ JSON-RPC 2.0 protocol support
- ✅ Same 7-step token pattern with idempotency
- ✅ Identical tools to OAuth path

#### API Key Security

**Built-in security features:**
- SHA-256 hashing (keys never stored in plaintext)
- Expiration checking on every request
- User deletion verification
- Last used timestamp for audit trail
- Format validation (wtyk_ + 64 hex chars)

## Step 7: Update Configuration Files

### 7.1 wrangler.jsonc

```jsonc
{
  "name": "weather-mcp",                    // Your server name
  "migrations": [
    {
      "new_sqlite_classes": ["WeatherMCP"],  // Your class name
      "tag": "v1"
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "class_name": "WeatherMCP",          // Your class name
        "name": "MCP_OBJECT"
      }
    ]
  }
  // ... rest stays the same
}
```

### 7.2 package.json

```json
{
  "name": "weather-mcp",
  "description": "Weather MCP server with token integration",
  // ... dependencies stay the same
}
```

## Common Customization Patterns

### Pattern 1: Add Workers AI

```typescript
// src/types.ts
export interface Env {
    AI?: Ai;  // Add this
}

// wrangler.jsonc
"ai": {
    "binding": "AI"
}

// src/server.ts
const response = await this.env.AI.run(
    "@cf/meta/llama-3-8b-instruct",
    { prompt: userPrompt }
);
```

### Pattern 2: Add R2 Storage

```typescript
// src/types.ts
export interface Env {
    MY_BUCKET?: R2Bucket;
}

// wrangler.jsonc
"r2_buckets": [
    {
        "binding": "MY_BUCKET",
        "bucket_name": "my-bucket"
    }
]

// src/server.ts
await this.env.MY_BUCKET.put("key", data);
```

### Pattern 3: Add State Management

```typescript
// src/types.ts
export type State = {
    conversationHistory: string[];
    userPreferences: Record<string, unknown>;
};

// src/server.ts
export class WeatherMCP extends McpAgent<Env, State, Props> {
    initialState: State = {
        conversationHistory: [],
        userPreferences: {},
    };

    async init() {
        // Access state: this.state
        // Update state: await this.setState({ ... })
    }
}
```

## Troubleshooting

### Issue: Type Errors

```bash
# Regenerate Cloudflare types
npm run cf-typegen

# Check types
npx tsc --noEmit
```

### Issue: KV Namespace Not Found

**DO NOT create new namespaces!** Use the shared ones from CLOUDFLARE_CONFIG.md.

```bash
# Verify you're using the correct shared IDs
# CACHE_KV: fa6ff790f146478e85ea77ae4a5caa4b
# OAUTH_KV: b77ec4c7e96043fab0c466a978c2f186

# If wrangler.jsonc has different IDs, update them to match CLOUDFLARE_CONFIG.md
```

### Issue: Authentication Fails

1. Check WorkOS credentials are configured as production secrets
2. Verify redirect URI in WorkOS Dashboard: `https://your-server.wtyczki.ai/callback`

### Issue: Token Database Error

- Database ID must be: `ebb389aa-2d65-4d38-a0da-50c7da9dfe8b` (from CLOUDFLARE_CONFIG.md)
- This is the shared database for ALL MCP servers
- Check binding name is `TOKEN_DB` in wrangler.jsonc (NOT `DB`)
- Verify exact ID matches CLOUDFLARE_CONFIG.md

## Next Steps

1. ✅ Customization complete → Run TypeScript validation (`npx tsc --noEmit`)
2. ✅ TypeScript passes → Deploy to production (`wrangler deploy`)
3. ✅ Deploy complete → Configure custom domain
4. ✅ Domain configured → Test in Cloudflare Workers AI Playground

See [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) for production deployment guide.
