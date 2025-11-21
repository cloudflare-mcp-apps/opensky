# OpenSky Flight Tracker - Quick Start Template

Production-ready template for building Cloudflare MCP servers with integrated token system.

## Features

✅ **Dual Transport Support** - Both SSE (legacy) and Streamable HTTP (future standard)
✅ **ChatGPT Ready** - Works with ChatGPT out-of-the-box (requires `/mcp` endpoint)
✅ **Claude Desktop Compatible** - Works with Claude Desktop via `/sse` endpoint
✅ **Token System Integration** - Pay-per-use with shared D1 database
✅ **WorkOS Magic Auth** - Email + 6-digit code authentication
✅ **Production-Ready** - Complete error handling, logging, type safety

## Quick Setup

### 1. Clone and Rename

```bash
# Copy skeleton template
cp -r mcp-server-skeleton my-new-mcp
cd my-new-mcp

# Find and replace in all files:
# "OpenSkyMcp" → "MyServerMCP"
# "opensky" → "my-server-mcp"
```

### 2. Configure Secrets

```bash
# Copy environment template
cp .dev.vars.example .dev.vars

# Edit .dev.vars with your WorkOS credentials
# Get from: https://dashboard.workos.com/

# Create KV namespace
wrangler kv namespace create OAUTH_KV

# Update wrangler.jsonc with the KV ID from output
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Customize Your Server

Edit these files:
- `src/server.ts` - Replace example tools with your actual tools
- `src/api-client.ts` - Implement your API client
- `src/types.ts` - Add custom types and bindings
- `wrangler.jsonc` - Update server name and class names

### 5. Test Locally

```bash
# Type check (MUST pass with zero errors)
npx tsc --noEmit
```

### 6. Deploy to Production

```bash
# Configure production secrets (first time only)
echo "client_id" | wrangler secret put WORKOS_CLIENT_ID
echo "api_key" | wrangler secret put WORKOS_API_KEY

# Deploy to Cloudflare
wrangler deploy

# Configure custom domain in Cloudflare Dashboard
# Workers & Pages → Your Worker → Settings → Domains & Routes
# Add: your-server.wtyczki.ai
```

### 7. Test in Cloudflare Workers AI Playground

**CRITICAL:** All functional testing is done in Cloudflare Workers AI Playground at https://playground.ai.cloudflare.com/

```
1. Navigate to https://playground.ai.cloudflare.com/
2. Set model to llama-3.3-70b-instruct-fp8-fast
3. In MCP Servers section, add your server:
   - SSE: https://your-server.wtyczki.ai/sse
   - HTTP: https://your-server.wtyczki.ai/mcp
4. Complete OAuth flow (Magic Auth)
5. Test all tools
```

## Available Endpoints

| Endpoint | Transport | Status | Testing |
|----------|-----------|--------|---------|
| `/sse` | Server-Sent Events | Legacy (will be deprecated) | Cloudflare Workers AI Playground |
| `/mcp` | Streamable HTTP | New standard (recommended) | Cloudflare Workers AI Playground |
| `/authorize` | OAuth | - | Auth flow start |
| `/callback` | OAuth | - | Auth callback |
| `/token` | OAuth | - | Token exchange |
| `/register` | OAuth | - | Dynamic client registration |

### Production URLs

- **SSE Transport:** `https://your-server.wtyczki.ai/sse`
- **Streamable HTTP:** `https://your-server.wtyczki.ai/mcp`

Both transports work identically and are tested in Cloudflare Workers AI Playground after deployment.

## Testing Approach

**CRITICAL:** All functional testing is done using **Cloudflare Workers AI Playground** after deployment.

**Pre-Deployment (TypeScript Only):**
```bash
npx tsc --noEmit  # MUST pass with zero errors
```

**Post-Deployment (Functional Testing):**
1. Navigate to https://playground.ai.cloudflare.com/
2. Set model to `llama-3.3-70b-instruct-fp8-fast`
3. Test SSE transport: `https://your-server.wtyczki.ai/sse`
4. Test Streamable HTTP: `https://your-server.wtyczki.ai/mcp`
5. Verify both work identically

## Token System

### How It Works

1. User authenticates via WorkOS Magic Auth
2. OAuth callback checks token database
3. If user not in database → 403 error page
4. If user in database → Access granted
5. Each tool execution checks balance
6. Tokens deducted after successful execution
7. All transactions logged atomically

### Example Tools Included

- **simpleLookup** - 1 token (basic API call)
- **processData** - 2 tokens (data processing)
- **aiInference** - 3 tokens (AI operations)

### Token Costs Guide

| Complexity | Cost | Examples |
|------------|------|----------|
| Simple lookup | 1 token | API queries, DB lookups |
| Data processing | 2 tokens | Aggregation, transformations |
| AI inference | 3-5 tokens | LLM calls, generation |
| Image generation | 5-10 tokens | DALL-E, Stable Diffusion |
| Video processing | 10-20 tokens | Analysis, transcription |

## Documentation

- **[CUSTOMIZATION_GUIDE.md](docs/CUSTOMIZATION_GUIDE.md)** - Step-by-step customization
- **[TRANSPORT_GUIDE.md](docs/TRANSPORT_GUIDE.md)** - Transport comparison & testing
- **[DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md)** - Production deployment

**Note:** Tool pricing is defined in each project's idea file (Section 5: Tool Pricing & Token Costs).

## Project Structure

```
mcp-server-skeleton/
├── src/
│   ├── index.ts              # Entry point (dual transport)
│   ├── server.ts             # McpAgent with example tools
│   ├── authkit-handler.ts    # WorkOS OAuth + DB check
│   ├── types.ts              # Type definitions
│   ├── props.ts              # Auth context
│   ├── tokenUtils.ts         # Token management
│   └── api-client.ts         # API client template
├── docs/                     # Detailed guides
├── wrangler.jsonc            # Cloudflare config
├── package.json              # Dependencies
└── README.md                 # This file
```

## Key TODO Items

When customizing, search for `// TODO:` comments in:

1. **wrangler.jsonc**
   - Update server name
   - Update class names
   - Add KV namespace ID
   - Add custom bindings

2. **src/server.ts**
   - Rename `OpenSkyMcp` class
   - Replace example tools
   - Update tool costs
   - Update server name in `deductTokens()`

3. **src/api-client.ts**
   - Implement actual API client
   - Add API methods
   - Handle authentication

4. **src/types.ts**
   - Add custom environment variables
   - Define API response types
   - Add tool result types

## Database Configuration

**Shared D1 Database:**
- **ID:** `ebb389aa-2d65-4d38-a0da-50c7da9dfe8b`
- **Name:** `mcp-tokens-database`
- **DO NOT CHANGE** - Must be the same across all MCP servers

## Support

For issues or questions:
- Check [docs/](docs/) for detailed guides
- Review example tools in `src/server.ts`
- Test with MCP Inspector for debugging

## Next Steps

1. **Customize** - Follow [CUSTOMIZATION_GUIDE.md](docs/CUSTOMIZATION_GUIDE.md)
2. **Test** - Use both `/sse` and `/mcp` endpoints
3. **Deploy** - Push to Cloudflare and configure domain
4. **Monitor** - Use `wrangler tail` for live logs

---

