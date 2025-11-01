# OpenSky Flight Tracker MCP Server - Deployment Documentation

## Deployment Status: ✅ DEPLOYED

**Deployment Date:** November 1, 2025
**Worker Name:** opensky
**Custom Domain:** opensky.wtyczki.ai
**Version ID:** 826b1802-a9b2-498c-803a-f25fcbd6259f
**GitHub Repository:** https://github.com/patpil-cloudflare-mcp/opensky

---

## Deployment Summary

### Worker Configuration
- **Upload Size:** 3014.70 KiB (gzip: 473.77 KiB)
- **Startup Time:** 50 ms
- **Deployment Time:** 18.26 seconds total
  - Upload: 9.98 sec
  - Triggers: 8.28 sec

### Bindings Configured
- ✅ **Durable Object:** OpenSkyMcp (MCP_OBJECT)
- ✅ **KV Namespaces:**
  - OAUTH_KV: b77ec4c7e96043fab0c466a978c2f186
  - CACHE_KV: fa6ff790f146478e85ea77ae4a5caa4b
  - USER_SESSIONS: e5ad189139cd44f38ba0224c3d596c73
- ✅ **D1 Database:** mcp-tokens-database (TOKEN_DB)
- ✅ **Workers AI:** Enabled (AI binding)

### Production Secrets (Configured via wrangler secret put)
- ✅ WORKOS_CLIENT_ID
- ✅ WORKOS_API_KEY
- ✅ OPENSKY_CLIENT_ID
- ✅ OPENSKY_CLIENT_SECRET

---

## Tools Implemented (Dual Authentication)

All tools available via both OAuth 2.1 and API key authentication:

1. **getAircraftByIcao** (1 token)
   - Direct ICAO24 transponder address lookup
   - Fast, cheap operation

2. **findAircraftNearLocation** (3 tokens)
   - Geographic bounding box search
   - Radius-based aircraft discovery

3. **getAircraftByCallsign** (10 tokens)
   - Global scan with server-side filtering
   - Most expensive operation

---

## Next Steps

### ⚠️ MANUAL ACTION REQUIRED: GitHub Integration Setup

To enable automatic deployments on every git push, follow these steps:

#### Option 1: Workers Builds (Recommended - Zero Config)

1. **Navigate to Cloudflare Dashboard:**
   ```
   Workers & Pages → opensky → Settings → Builds
   ```

2. **Connect GitHub:**
   - Click **"Connect"** button
   - Authorize "Cloudflare Workers and Pages" GitHub App
   - Select repository: `patpil-cloudflare-mcp/opensky`

3. **Configure Build Settings:**
   - Production Branch: `main`
   - Root Directory: `/` (default)
   - Build Command: _(leave empty)_
   - Deploy Command: `npx wrangler deploy`

4. **Save Configuration**

5. **Test Integration:**
   ```bash
   cd /Users/patpil/Documents/ai-projects/Cloudflare_mcp/projects/opensky
   echo "# Test GitHub Integration" >> README.md
   git add README.md
   git commit -m "test: Verify GitHub automatic deployment"
   git push origin main
   ```

   **Expected Result:**
   - Deployment triggers within 10 seconds of push
   - GitHub check run appears in commit
   - Pull request comment shows build status
   - Worker updates automatically

#### Option 2: GitHub Actions (Advanced)

See `/Users/patpil/Documents/ai-projects/Cloudflare_mcp/GITHUB_INTEGRATION_GUIDE.md` for workflow configuration.

---

## Testing Checklist

### OAuth Authentication Testing
**Location:** https://playground.ai.cloudflare.com/

- [ ] Connect to opensky.wtyczki.ai/sse
- [ ] Complete OAuth flow (redirect to panel.wtyczki.ai)
- [ ] Verify Magic Auth code login
- [ ] Test getAircraftByIcao tool
- [ ] Test findAircraftNearLocation tool
- [ ] Test getAircraftByCallsign tool
- [ ] Verify token deductions in database
- [ ] Check logs: `wrangler tail --format pretty`

### API Key Authentication Testing
**Method:** curl commands

```bash
# Initialize session
curl -X POST https://opensky.wtyczki.ai/mcp/init \
  -H "Authorization: Bearer wtyk_your_api_key" \
  -H "Content-Type: application/json"

# List tools
curl -X POST https://opensky.wtyczki.ai/mcp/messages \
  -H "Authorization: Bearer wtyk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Call tool
curl -X POST https://opensky.wtyczki.ai/mcp/messages \
  -H "Authorization: Bearer wtyk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "getAircraftByIcao",
      "arguments": {"icao24": "3c6444"}
    }
  }'
```

- [ ] Initialize session via API key
- [ ] List available tools
- [ ] Execute each tool
- [ ] Verify token deductions
- [ ] Confirm database entries

### Database Verification
```bash
# Check token consumption logs
wrangler d1 execute mcp-tokens-database \
  --command "SELECT * FROM token_consumption WHERE server_name = 'opensky' ORDER BY timestamp DESC LIMIT 10"

# Verify both auth methods logged
wrangler d1 execute mcp-tokens-database \
  --command "SELECT DISTINCT auth_method FROM token_consumption WHERE server_name = 'opensky'"
```

Expected auth methods: `oauth`, `api_key`

---

## Registry Update Required

**After successful GitHub integration:**

Update `/Users/patpil/Documents/ai-projects/Cloudflare_mcp/deployed-servers.md` with:

```markdown
| opensky | OpenSky Flight Tracker | opensky.wtyczki.ai | https://github.com/patpil-cloudflare-mcp/opensky | ✅ Connected | Nov 1, 2025 | Active |
```

Also update `/Users/patpil/Documents/ai-projects/Cloudflare_mcp/repos_mcp.md` with:

```markdown
/Users/patpil/Documents/ai-projects/Cloudflare_mcp/projects/opensky
https://github.com/patpil-cloudflare-mcp/opensky
```

---

## Monitoring & Logs

### Live Logs
```bash
cd /Users/patpil/Documents/ai-projects/Cloudflare_mcp/projects/opensky
wrangler tail --format pretty
```

### Deployment History
```bash
wrangler deployments list
```

### Rollback (if needed)
```bash
wrangler rollback --deployment-id <previous-version-id>
```

---

## Architecture Notes

### OAuth Token Management
- OpenSky OAuth2 tokens expire after 30 minutes (1800 seconds)
- 5-minute buffer for auto-refresh (tokens refresh at 25 minutes)
- Tokens stored in Durable Object state (persistent across requests)
- Automatic refresh on expiry

### Geographic Calculations
- Bounding box uses flat-Earth approximation
- Good for < 100km radius searches
- Formula: latDelta = (radius / 6371) * (180 / PI)

### API Credit Costs (OpenSky Network)
- getAircraftByIcao: 1 OpenSky credit
- findAircraftNearLocation: 1-3 credits (based on area size)
- getAircraftByCallsign: 4 credits (global scan)

### Token Costs (Internal)
- Designed to align with computational complexity
- getAircraftByIcao: 1 token (cheap direct lookup)
- findAircraftNearLocation: 3 tokens (moderate geographic query)
- getAircraftByCallsign: 10 tokens (expensive global scan)

---

## Security Checklist

- ✅ credentials.json excluded from git (.gitignore)
- ✅ .dev.vars excluded from git (.gitignore)
- ✅ Production secrets configured via wrangler secret put
- ✅ PRP documentation files removed from repository
- ✅ Clean git history (no credentials in commits)
- ✅ workers.dev subdomain disabled (workers_dev: false)
- ✅ USER_SESSIONS KV namespace configured (centralized auth)

---

## Implementation Validation

- ✅ TypeScript compilation: PASSED (zero errors)
- ✅ verify-consistency.sh: ALL CHECKS PASSED
- ✅ Tool count parity: 3 tools in both OAuth and API key paths
- ✅ Dual authentication: Implemented across all 4 locations
- ✅ 7-step token pattern: Applied to all tools with idempotency
- ✅ Production deployment: SUCCESSFUL

---

## Endpoints

### OAuth Flow (MCP Clients)
- **SSE Transport:** `https://opensky.wtyczki.ai/sse`
- **Streamable HTTP:** `https://opensky.wtyczki.ai/mcp`

### API Key Authentication
- **Initialize:** `POST https://opensky.wtyczki.ai/mcp/init`
- **Messages:** `POST https://opensky.wtyczki.ai/mcp/messages`

### Authentication Flow
1. User connects via MCP client
2. Redirect to `https://panel.wtyczki.ai/auth/login-custom`
3. User enters email → Magic Auth code sent
4. User enters code → session created in USER_SESSIONS KV
5. Redirect back to opensky.wtyczki.ai → OAuth completes
6. User context loaded from database (userId, email)
7. All tools now accessible with automatic token management

---

## Support Resources

- **Cloudflare Workers Docs:** https://developers.cloudflare.com/workers/
- **OpenSky Network API:** https://openskynetwork.github.io/opensky-api/rest.html
- **MCP Protocol Spec:** https://spec.modelcontextprotocol.io/
- **WorkOS AuthKit:** https://workos.com/docs/authkit

---

**Status:** Ready for GitHub integration and testing
**Next Action:** Manual GitHub Builds configuration in Cloudflare Dashboard
