# Transport Methods Guide

Complete guide to MCP transport methods and authentication options.

## Overview

This MCP server supports **DUAL TRANSPORTS** and **DUAL AUTHENTICATION** for maximum compatibility:

### Dual Transport Support

This MCP server supports **BOTH** transport methods:

| Transport | Endpoint | Status | Testing Platform |
|-----------|----------|--------|------------------|
| **SSE** | `/sse` | Legacy (will be deprecated) | Cloudflare Workers AI Playground |
| **Streamable HTTP** | `/mcp` | New standard (March 2025) | Cloudflare Workers AI Playground |

### Dual Authentication Support

This MCP server supports **TWO authentication methods**:

| Authentication | Clients | Flow |
|----------------|---------|------|
| **OAuth 2.1** | Claude Desktop, ChatGPT | Browser-based Magic Auth via WorkOS |
| **API Keys** | AnythingLLM, Cursor IDE, Scripts | `Authorization: Bearer wtyk_XXX` header |

**Key Points:**
- ✅ **Both auth methods work with both transports** (`/sse` and `/mcp`)
- ✅ **Same tools available** regardless of auth method
- ✅ **Same token system** - uses shared D1 database
- ✅ **Identical functionality** - no differences in tool behavior

### ⚠️ CRITICAL: Support Both Transports

**Both transports must be configured for maximum compatibility.**

**Must have this configuration:**
```typescript
apiHandlers: {
    '/sse': OpenSkyMcp.serveSSE('/sse'),  // Legacy SSE transport
    '/mcp': OpenSkyMcp.serve('/mcp'),     // Streamable HTTP transport (recommended)
}
```

**Authentication routing is automatic:**
- OAuth requests (no API key) → OAuthProvider
- API key requests (`wtyk_*` in header) → Direct tool access

## Why Support Both?

### Current Reality (SSE)
- Legacy transport method (Server-Sent Events)
- Two-endpoint architecture (one for requests, one for responses)
- Proven and stable
- Will eventually be deprecated
- Still supported in Cloudflare Workers AI Playground

### Future Standard (Streamable HTTP)
- Introduced March 2025 in MCP specification
- Single endpoint for bidirectional messaging
- Simpler architecture
- Will become the ONLY transport method
- Fully supported in Cloudflare Workers AI Playground

### Our Approach
✅ **Support both NOW** = Maximum compatibility during transition period
✅ **Zero code changes when SSE is deprecated** = Just update endpoint configurations
✅ **Future-proof** = Ready for when Streamable HTTP becomes the only standard

## Transport Details

### SSE (Server-Sent Events)

**How It Works:**
```
Client                    Server
  |------ Request ------->|
  |                       |
  |<----- SSE Stream -----|
  |       (Events)        |
  |       (Events)        |
  |       (Events)        |
```

**Endpoint:** `/sse`

**Configuration:**
```typescript
// In src/index.ts
export default new OAuthProvider({
    apiHandlers: {
        '/sse': OpenSkyMcp.serveSSE('/sse'),
        // ...
    }
});
```

**Client Configuration (Claude Desktop):**
```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["mcp-remote", "https://your-server.wtyczki.ai/sse"]
    }
  }
}
```

**Architecture:**
- Separate endpoints for requests and event streams
- Long-lived connections for event streaming
- Requires WebSocket fallback handling

### Streamable HTTP

**How It Works:**
```
Client                    Server
  |<==== Bidirectional ===>|
  |    Single Connection   |
  |    (Request/Response)  |
  |    (Streaming)         |
```

**Endpoint:** `/mcp`

**Configuration:**
```typescript
// In src/index.ts
export default new OAuthProvider({
    apiHandlers: {
        '/mcp': OpenSkyMcp.serve('/mcp'),
        // ...
    }
});
```

**Client Configuration (Claude Desktop):**
```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["mcp-remote", "https://your-server.wtyczki.ai/mcp"]
    }
  }
}
```

**Architecture:**
- Single endpoint handles everything
- Simpler connection management
- Native HTTP/2 streaming support

## Testing Both Transports

**CRITICAL:** All functional testing is done using **Cloudflare Workers AI Playground** at https://playground.ai.cloudflare.com/

### Pre-Deployment Validation (TypeScript Only)

```bash
# Install dependencies
npm install

# Run TypeScript type check (MUST pass with zero errors)
npx tsc --noEmit
```

**This is the ONLY validation required before deployment.** No local functional testing is performed.

### Deploy to Production

```bash
# Configure production secrets (first time only)
echo "client_id" | wrangler secret put WORKOS_CLIENT_ID
echo "api_key" | wrangler secret put WORKOS_API_KEY

# Deploy to production
wrangler deploy
```

### Test in Cloudflare Workers AI Playground

**Step 1: Open Playground**
1. Navigate to https://playground.ai.cloudflare.com/
2. Set model to `llama-3.3-70b-instruct-fp8-fast`

**Step 2: Connect SSE Transport**
1. In **MCP Servers** section, click "Add Server"
2. Enter URL: `https://your-server.wtyczki.ai/sse`
3. Complete OAuth flow (WorkOS Magic Auth)
4. Verify status shows **Connected**
5. Verify all tools are listed
6. Test each tool by asking the AI to use them

**Step 3: Connect Streamable HTTP Transport**
1. Disconnect the SSE server
2. Add new server with URL: `https://your-server.wtyczki.ai/mcp`
3. Complete OAuth flow
4. Verify status shows **Connected**
5. Verify all tools are listed
6. Test each tool by asking the AI to use them

**Step 4: Verify Both Transports Work Identically**
- Same tools available on both endpoints
- Same authentication flow
- Same results from tool executions
- Same token deductions recorded

### Monitor Live Requests

```bash
# Watch live requests in production
wrangler tail --format pretty

# Filter by transport
wrangler tail --format pretty | grep "/sse"
wrangler tail --format pretty | grep "/mcp"

# Monitor token deductions
wrangler tail --format pretty | grep -i token
```

### Verify Database Transactions

```bash
# Check logged transactions
wrangler d1 execute mcp-tokens-database --command="
  SELECT * FROM mcp_actions
  WHERE mcp_server_name = 'your-server-slug'
  ORDER BY created_at DESC LIMIT 10"
```

**Common Issues:**
- ❌ Connection fails → Check deployment succeeded, verify domain configuration
- ❌ OAuth loop → Verify WorkOS credentials and callback URL (`https://your-server.wtyczki.ai/callback`)
- ❌ Tools not showing → Check `wrangler tail` for errors in tool registration
- ❌ Token deduction fails → Verify D1 database binding in `wrangler.jsonc`

## Production Testing

### Test Production Endpoints

```bash
# SSE endpoint
curl https://your-server.wtyczki.ai/sse

# Streamable HTTP endpoint
curl https://your-server.wtyczki.ai/mcp

# OAuth endpoints (should work for both)
curl https://your-server.wtyczki.ai/authorize
curl https://your-server.wtyczki.ai/token
```

### Monitor Logs

```bash
# Watch live requests
wrangler tail --format pretty

# Filter by transport
wrangler tail --format pretty | grep "/sse"
wrangler tail --format pretty | grep "/mcp"
```

## Transport-Agnostic Implementation

### Your Tools Work Identically

```typescript
// This tool works on BOTH /sse and /mcp
this.server.tool(
    "myTool",
    "Tool description",
    { param: z.string() },
    async ({ param }) => {
        // Implementation is transport-agnostic
        // The McpAgent handles transport layer
        return { content: [{ type: "text", text: result }] };
    }
);
```

### Authentication Works on Both

```typescript
// OAuth flow works identically for both transports
// User authenticates once, can use either endpoint
// Props available via this.props on both
const userId = this.props?.userId;  // Works on /sse and /mcp
```

### State Management (If Used)

```typescript
// Durable Object state is transport-agnostic
this.state.conversationHistory;  // Same state on /sse and /mcp
await this.setState({ /* ... */ });  // Updates work on both
```

## Migration Path

### Phase 1: Support Both (NOW)

```typescript
// src/index.ts
export default new OAuthProvider({
    apiHandlers: {
        '/sse': OpenSkyMcp.serveSSE('/sse'),  // Legacy
        '/mcp': OpenSkyMcp.serve('/mcp'),      // Future
    },
    // ...
});
```

**Status:** ✅ You're here - Maximum compatibility

### Phase 2: SSE Deprecated (Future)

**When SSE is officially deprecated:**

1. **Update client configs** (users switch from `/sse` to `/mcp`)
2. **No server code changes needed** (both already supported)
3. **Monitor usage** (ensure all clients migrated)

### Phase 3: Remove SSE (Optional)

**After all clients migrated:**

```typescript
// src/index.ts
export default new OAuthProvider({
    apiHandlers: {
        // Remove SSE line
        '/mcp': OpenSkyMcp.serve('/mcp'),  // Only Streamable HTTP
    },
    // ...
});
```

**This is optional** - keeping both doesn't hurt

## Troubleshooting

### Issue: ChatGPT Shows "Something went wrong while configuring the connection"

**Symptoms:**
- OAuth completes successfully (user is authenticated)
- ChatGPT shows error: "Something went wrong while configuring the connection"
- Cloudflare logs show POST requests to `/` or root endpoint

**Root Cause:**
- Server is using old configuration (SSE only)
- Missing `/mcp` endpoint for Streamable HTTP

**Solution:**
```typescript
// ❌ OLD - SSE only (breaks ChatGPT)
export default new OAuthProvider({
    apiRoute: "/sse",
    apiHandler: OpenSkyMcp.mount("/sse") as any,
    // ...
});

// ✅ NEW - Dual transport (works with ChatGPT)
export default new OAuthProvider({
    apiHandlers: {
        '/sse': OpenSkyMcp.serveSSE('/sse'),  // For Claude
        '/mcp': OpenSkyMcp.serve('/mcp'),     // For ChatGPT ← REQUIRED
    },
    // ...
});
```

**Verify Fix:**
```bash
# Check both endpoints respond
curl -I https://your-server.wtyczki.ai/sse  # Should return 200/401
curl -I https://your-server.wtyczki.ai/mcp  # Should return 200/401

# Both should respond (not 404)
```

**Package Requirements:**
```bash
# Ensure you have v0.0.4 or later
npm list @cloudflare/workers-oauth-provider
# Should show: @cloudflare/workers-oauth-provider@0.0.11 or higher

# Update if needed:
npm install @cloudflare/workers-oauth-provider@latest
```

### Issue: SSE Connection Drops

```bash
# Check if Durable Object is hibernating properly
wrangler tail | grep "hibernation"

# SSE requires persistent connection management
# McpAgent handles this automatically
```

### Issue: Streamable HTTP Not Connecting

```bash
# Verify endpoint is deployed and accessible
curl -I https://your-server.wtyczki.ai/mcp

# Test in Cloudflare Workers AI Playground
# Navigate to https://playground.ai.cloudflare.com/
# Add server: https://your-server.wtyczki.ai/mcp
```

### Issue: Tools Work on SSE but Not HTTP

```typescript
// This shouldn't happen - implementation is transport-agnostic
// If it does, check:
// 1. Are you using @cloudflare/workers-oauth-provider v0.0.4+?
// 2. Is serve() method available (not just serveSSE)?

// Update if needed:
npm install @cloudflare/workers-oauth-provider@latest
```

### Issue: Authentication Fails on One Transport

```bash
# Check OAuth configuration
# Both transports use the same OAuth endpoints:
# - /authorize
# - /callback
# - /token
# - /register

# Test OAuth independently:
curl -I https://your-server.wtyczki.ai/authorize
```

## Performance Comparison

### SSE
- **Pros:** Well-tested, widely supported, proven stable
- **Cons:** Two-endpoint complexity, legacy approach
- **Performance:** Comparable (McpAgent optimizes both)

### Streamable HTTP
- **Pros:** Simpler architecture, future standard, single endpoint
- **Cons:** Newer (less client adoption currently)
- **Performance:** Comparable (modern HTTP/2 features)

**Recommendation:** Support both now, migrate to HTTP-only later

## Transport Support

**Primary Testing Platform:** **Cloudflare Workers AI Playground** (https://playground.ai.cloudflare.com/)

| Transport | Endpoint | Status | Playground Support |
|-----------|----------|--------|-------------------|
| **SSE** | `/sse` | Legacy (will be deprecated) | ✅ Fully supported |
| **Streamable HTTP** | `/mcp` | New standard (recommended) | ✅ Fully supported |

### Testing Both Transports

**CRITICAL:** All functional testing is done in Cloudflare Workers AI Playground after deployment.

**Both transports:**
- ✅ Tested in Cloudflare Workers AI Playground
- ✅ Support OAuth 2.1 authentication
- ✅ Work identically (same tools, same authentication, same results)
- ✅ Support token-based pricing with D1 database integration

## Configuration Examples

### Production Deployment

```bash
# Configure production secrets
echo "client_id" | wrangler secret put WORKOS_CLIENT_ID
echo "api_key" | wrangler secret put WORKOS_API_KEY

# Deploy to production
wrangler deploy
```

### Testing in Cloudflare Workers AI Playground

**OAuth Authentication:**
```
# SSE Transport
URL: https://your-server.wtyczki.ai/sse
Transport: SSE (automatic)
Auth: OAuth 2.1 (handled automatically)

# Streamable HTTP Transport
URL: https://your-server.wtyczki.ai/mcp
Transport: Streamable HTTP (automatic)
Auth: OAuth 2.1 (handled automatically)
```

### Testing API Key Authentication

**API Key with SSE Transport:**
```bash
curl -X POST https://your-server.wtyczki.ai/sse \
  -H "Authorization: Bearer wtyk_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

**API Key with Streamable HTTP Transport (Recommended):**
```bash
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

### AnythingLLM Configuration

**Recommended configuration for AnythingLLM:**
```json
{
  "mcpServers": {
    "your-server": {
      "type": "streamable",
      "url": "https://your-server.wtyczki.ai/mcp",
      "headers": {
        "Authorization": "Bearer wtyk_YOUR_API_KEY"
      },
      "anythingllm": {
        "autoStart": true
      }
    }
  }
}
```

**Configuration Notes:**
- Use `"type": "streamable"` - SSE has known SDK bugs with headers
- Use `/mcp` endpoint for best compatibility
- API keys are generated at `panel.wtyczki.ai`
- Format: `wtyk_` followed by 64 hex characters

## Best Practices

### 1. Test Both Transports in Cloudflare Playground

**After each deployment:**
1. Test `/sse` endpoint in Cloudflare Workers AI Playground
2. Test `/mcp` endpoint in Cloudflare Workers AI Playground
3. Verify both return identical results
4. Verify token deductions are recorded correctly

### 2. Document Both in Your README

```markdown
## Available Endpoints

- **SSE (Legacy):** `https://your-server.wtyczki.ai/sse`
- **Streamable HTTP (Recommended):** `https://your-server.wtyczki.ai/mcp`

Both endpoints support the same tools and authentication.
```

### 3. Monitor Usage Patterns

```bash
# Track which transport is most used
wrangler tail | grep -E "/(sse|mcp)" | sort | uniq -c
```

### 4. Keep Both Until SSE Officially Deprecated

```typescript
// Don't remove SSE support yet
// Keep both for maximum compatibility
// Update only when MCP spec officially deprecates SSE
```

## Summary

**Current State:**
- ✅ Support both SSE and Streamable HTTP
- ✅ No code changes needed in your tools
- ✅ Maximum client compatibility

**Future State:**
- Eventually: Streamable HTTP only
- No server code changes needed
- Just update client configurations

**Action Items:**
1. ✅ Use template with both transports
2. ✅ Test both endpoints locally
3. ✅ Deploy with both endpoints
4. ✅ Document both in client configs
5. ⏳ Monitor for SSE deprecation announcement
6. ⏳ Migrate clients to HTTP when ready

For deployment steps, see [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md).
