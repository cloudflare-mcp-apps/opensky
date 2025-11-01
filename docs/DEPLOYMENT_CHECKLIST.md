# Production Deployment Checklist

Complete checklist for deploying your MCP server to production on Cloudflare.

## Pre-Deployment

### ✅ Pre-Deployment Validation

- [ ] Type checking passes (`npx tsc --noEmit`)
- [ ] All `// TODO:` items completed or documented
- [ ] wrangler.jsonc properly configured
- [ ] Production secrets ready

### ✅ Authentication Configuration (CRITICAL)

- [ ] USER_SESSIONS in `wrangler.jsonc` (exact ID: `e5ad189139cd44f38ba0224c3d596c73`)
- [ ] USER_SESSIONS **required** in `src/types.ts` (NOT optional: no `?`)
- [ ] Consistency script passed: `./scripts/verify-consistency.sh`
  ```bash
  # Check 1/9: USER_SESSIONS in wrangler.jsonc
  # Check 2/9: USER_SESSIONS required in types.ts
  # Should show ✅ for both checks
  ```
- [ ] No optional USER_SESSIONS binding:
  ```bash
  ! grep -q "USER_SESSIONS?: KVNamespace" src/types.ts && echo "✅ Required"
  ```

**Why This Matters:**
- ❌ Optional USER_SESSIONS causes silent fallback to default WorkOS UI
- ✅ Required USER_SESSIONS enforces centralized branded login at `panel.wtyczki.ai`

### ✅ Code Quality

- [ ] All `// TODO:` items completed or documented
- [ ] Server name updated everywhere (OpenSkyMcp → YourMCP)
- [ ] Token costs set appropriately (as defined in your project's idea file, Section 5)
- [ ] Error messages are user-friendly (Polish for token errors)
- [ ] API client implemented (if applicable)
- [ ] Input validation before token checks
- [ ] Proper error handling in all tools

### ✅ Configuration Files

- [ ] `wrangler.jsonc` updated:
  - [ ] Server name
  - [ ] Class names in migrations
  - [ ] Class names in durable_objects
  - [ ] KV namespace ID
  - [ ] D1 database binding (correct ID)
- [ ] `package.json` updated (name, description)
- [ ] `.gitignore` includes `.dev.vars`
- [ ] `.dev.vars.example` documented

### ✅ WorkOS Configuration

- [ ] WorkOS application created
- [ ] Redirect URI configured: `https://your-server.wtyczki.ai/callback`
- [ ] Client ID and API Key ready
- [ ] Magic Auth enabled

## Deployment Steps

### Step 1: Push to GitHub (Source of Truth)

**IMPORTANT:** GitHub is the single source of truth for all deployments. After initial setup, all deployments happen automatically via GitHub integration.

```bash
# Initialize git (if not already)
git init

# Add all files
git add .

# Commit
git commit -m "Initial MCP server implementation"

# Add remote (use correct URL from repos_mcp.md)
git remote add origin https://github.com/patpil-cloudflare-mcp/your-server-mcp.git

# Push
git push -u origin main
```

**Checklist:**
- [ ] Repository created on GitHub (under patpil-cloudflare-mcp organization)
- [ ] Repository URL added to `/Users/patpil/Documents/ai-projects/Cloudflare_mcp/repos_mcp.md`
- [ ] Code pushed successfully
- [ ] `.dev.vars` NOT committed (check .gitignore)
- [ ] Main branch is `main` (not master)

### Step 2: Configure Secrets in Cloudflare

```bash
# Set WorkOS credentials
wrangler secret put WORKOS_CLIENT_ID
# Enter your client ID

wrangler secret put WORKOS_API_KEY
# Enter your API key (starts with sk_)

# Set any custom secrets
wrangler secret put YOUR_API_KEY
# Enter your API keys if needed
```

**Checklist:**
- [ ] WORKOS_CLIENT_ID set
- [ ] WORKOS_API_KEY set
- [ ] Custom API keys set (if applicable)
- [ ] Verify secrets: `wrangler secret list`

### Step 3: Create KV Namespace (Production)

```bash
# Create production KV namespace
wrangler kv namespace create OAUTH_KV

# Output example:
# { binding = "OAUTH_KV", id = "abc123..." }

# Update wrangler.jsonc with production ID
```

**Checklist:**
- [ ] KV namespace created
- [ ] ID added to `wrangler.jsonc`
- [ ] Binding name is `OAUTH_KV`

### Step 4: Deploy Worker (Initial One-Time Manual Deployment)

**NOTE:** This is a ONE-TIME manual deployment. After GitHub integration setup, all future deployments happen automatically.

```bash
# Final type check
npx tsc --noEmit

# Initial deployment (creates worker in Cloudflare)
wrangler deploy

# Output shows:
# - Upload successful
# - Worker deployed
# - URLs (both workers.dev and custom if configured)
```

**Checklist:**
- [ ] Type check passed
- [ ] Deployment successful
- [ ] Workers.dev URL received (temporary)
- [ ] No deployment errors
- [ ] Worker appears in Cloudflare Dashboard (Workers & Pages)

### Step 5: Configure Custom Domain

**In Cloudflare Dashboard:**

1. Navigate to: **Workers & Pages** → **Your Worker** → **Settings** → **Domains & Routes**

2. Click **Add Custom Domain**

3. Enter your domain:
   - Example: `weather.wtyczki.ai`
   - Example: `news.wtyczki.ai`
   - Example: `your-server.wtyczki.ai`

4. Cloudflare will:
   - Create DNS records automatically
   - Provision SSL certificate
   - Make domain active (~5-10 minutes)

**Checklist:**
- [ ] Custom domain added
- [ ] DNS records created (automatic)
- [ ] SSL certificate provisioned
- [ ] Domain shows "Active" status
- [ ] **IMPORTANT:** Domain is on `wtyczki.ai` (not workers.dev)

### Step 6: Setup GitHub Integration (CRITICAL)

**This enables automatic deployments on every push to main branch.**

#### Method 1: Workers Builds (Recommended)

1. **Navigate to Cloudflare Dashboard:**
   - Go to **Workers & Pages**
   - Click on your Worker
   - Select **Settings** tab
   - Click **Builds** section

2. **Connect GitHub:**
   - Click **Connect** button
   - Select **GitHub** as Git provider
   - Authorize **Cloudflare Workers and Pages** app (if first time)
   - Select your repository from dropdown

3. **Configure Build Settings:**
   - **Production Branch:** `main`
   - **Root Directory:** `/` (leave default)
   - **Build Command:** _(leave empty)_
   - **Deploy Command:** `npx wrangler deploy`

4. **Save Configuration:**
   - Click **Save and Deploy** (or similar)
   - Cloudflare will attempt first build immediately

5. **Optional: Enable Preview Builds:**
   - Go to **Settings** → **Builds** → **Branch control**
   - Enable **"Builds for non-production branches"**
   - This creates preview URLs for pull requests

**Checklist:**
- [ ] GitHub integration connected
- [ ] Repository selected correctly
- [ ] Production branch set to `main`
- [ ] Deploy command is `npx wrangler deploy`
- [ ] First build triggered automatically
- [ ] Build completed successfully (check Deployments tab)

#### Method 2: GitHub Actions (Alternative)

If you need more control or custom build logic:

1. **Create Cloudflare API Token:**
   - Dashboard → Profile → API Tokens
   - Create Token → Use "Edit Cloudflare Workers" template
   - Save token securely

2. **Add GitHub Secrets:**
   - Go to repository Settings → Secrets and variables → Actions
   - Add `CLOUDFLARE_ACCOUNT_ID` (from CLOUDFLARE_CONFIG.md)
   - Add `CLOUDFLARE_API_TOKEN` (from step 1)

3. **Create Workflow File:**
   - Copy `.github/workflows/deploy.yml` from template
   - Commit and push to repository

**See:** `/GITHUB_INTEGRATION_GUIDE.md` for detailed GitHub Actions setup

### Step 7: Test GitHub Integration

**Verify automatic deployment works:**

```bash
# Make a trivial change
echo "# GitHub Integration Verified" >> README.md

# Commit and push
git add README.md
git commit -m "test: Verify GitHub integration"
git push origin main
```

**Monitor Deployment:**
1. Go to Cloudflare Dashboard → Workers & Pages → Your Worker → **Deployments**
2. Should see new deployment triggered within 10 seconds
3. Watch build logs in real-time
4. Deployment should complete in 1-2 minutes

**Check GitHub:**
1. Go to your repository on GitHub
2. Click on the commit you just pushed
3. Should see **Cloudflare Workers** check run (green checkmark)

**Checklist:**
- [ ] Commit pushed to main branch
- [ ] Deployment triggered automatically in Cloudflare
- [ ] Build logs visible in Cloudflare Dashboard
- [ ] Deployment completed successfully
- [ ] GitHub check run shows success
- [ ] No manual `wrangler deploy` needed

### Step 8: Update WorkOS Redirect URI

**In WorkOS Dashboard:**

1. Go to: **Applications** → **Your Application** → **Configuration**

2. Configure **Redirect URI**: `https://your-server.wtyczki.ai/callback`

3. Save changes

**Checklist:**
- [ ] Production callback URL configured
- [ ] Changes saved in WorkOS Dashboard

### Step 9: Test Production Deployment

#### Test 1: Basic Connectivity

```bash
# Test SSE endpoint
curl -I https://your-server.wtyczki.ai/sse

# Test Streamable HTTP endpoint
curl -I https://your-server.wtyczki.ai/mcp

# Test OAuth authorize
curl -I https://your-server.wtyczki.ai/authorize

# All should return 200 or redirect (not 404)
```

**Checklist:**
- [ ] `/sse` endpoint responds
- [ ] `/mcp` endpoint responds
- [ ] `/authorize` endpoint responds

#### Test 2: Cloudflare Workers AI Playground Testing

**CRITICAL:** All functional testing is done using Cloudflare Workers AI Playground at https://playground.ai.cloudflare.com/

**Step 1: Open Playground**
1. Navigate to https://playground.ai.cloudflare.com/
2. Ensure model is set to `llama-3.3-70b-instruct-fp8-fast`

**Step 2: Connect SSE Transport**
1. In **MCP Servers** section (left sidebar)
2. Enter URL: `https://your-server.wtyczki.ai/sse`
3. Click **Connect**
4. Complete OAuth flow (WorkOS Magic Auth)
5. Verify status shows **Connected**
6. Verify tools are listed

**Step 3: Connect Streamable HTTP Transport**
1. Disconnect SSE server (if connected)
2. In **MCP Servers** section
3. Enter URL: `https://your-server.wtyczki.ai/mcp`
4. Click **Connect**
5. Complete OAuth flow
6. Verify status shows **Connected**
7. Verify tools are listed

**Step 4: Test Tool Execution**
1. In chat interface, ask AI to use your tools
2. Example: "Use the [tool_name] tool to [description]"
3. Verify tool executes successfully
4. Verify results are returned correctly

**Step 4.5: Test Centralized Login Redirect (CRITICAL)**

**This verifies USER_SESSIONS is configured correctly:**

1. Open https://playground.ai.cloudflare.com/
2. In **MCP Servers** section, enter URL: `https://your-server.wtyczki.ai/sse`
3. Click **Connect**
4. **CRITICAL CHECK:** Verify browser redirects to `https://panel.wtyczki.ai/auth/login-custom`
   - ✅ **CORRECT:** Redirects to `panel.wtyczki.ai/auth/login-custom` (centralized branded login)
   - ❌ **WRONG:** Redirects to `exciting-domain-65.authkit.app` (default WorkOS UI)
5. **If redirected to default WorkOS UI:**
   - Check `wrangler.jsonc` has USER_SESSIONS binding
   - Check `src/types.ts` has `USER_SESSIONS: KVNamespace` (not optional with `?`)
   - Run `./scripts/verify-consistency.sh` to find the issue
   - Redeploy after fixing
   - Retest from step 1

**Step 5: Test Token System**
```bash
# Monitor token deductions in real-time
wrangler tail --format pretty | grep -i token

# Or check database:
wrangler d1 execute mcp-tokens-database --command="
  SELECT user_id, tool_name, tokens_consumed, created_at
  FROM mcp_actions
  WHERE mcp_server_name = 'your-server-mcp'
  ORDER BY created_at DESC
  LIMIT 10"
```

**Step 6: Test Database User Check**
- **Non-database user:** Use email NOT in database → Should get 403 error page
- **Database user:** Use email in database → Should connect successfully

**Step 7: Test Insufficient Balance**
1. Set user balance to 0 in database
2. Try to use a tool in Playground
3. Verify Polish error message appears

**OAuth Auth Checklist:**
- [ ] Playground opens successfully
- [ ] SSE endpoint connects
- [ ] Streamable HTTP endpoint connects
- [ ] OAuth flow completes (Magic Auth)
- [ ] Tools are listed correctly
- [ ] Tools execute successfully
- [ ] Results are returned correctly
- [ ] Tokens deducted from balance
- [ ] Transactions logged in database
- [ ] Non-database users get 403 page
- [ ] Polish error message for insufficient balance

#### Test 3: API Key Authentication Testing

**CRITICAL:** The skeleton supports **dual authentication** (OAuth + API keys). Test both methods.

**Step 1: Test API Key Validation**
```bash
# Test with valid API key
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_YOUR_VALID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# Expected: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05",...}}

# Test with invalid API key
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_invalid_key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"initialize","params":{}}'

# Expected: {"error":"Invalid or expired API key","status":401}
```

**Step 2: Test Tools List**
```bash
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_YOUR_VALID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{}}'

# Expected: Array of tools with schemas
```

**Step 3: Test Tool Execution**
```bash
# Test first tool (replace with your actual tool name)
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_YOUR_VALID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"simpleLookup","arguments":{"query":"test"}}}'

# Expected: Tool result with content array
```

**Step 4: Verify Token Deduction**
```bash
# Check database for API key transactions
wrangler d1 execute mcp-tokens-database --command="
  SELECT user_id, tool_name, tokens_consumed, success, created_at
  FROM mcp_actions
  WHERE mcp_server_name = 'your-server-mcp'
  AND created_at > datetime('now', '-5 minutes')
  ORDER BY created_at DESC
  LIMIT 10"

# Should show BOTH OAuth and API key executions
```

**Step 5: Test AnythingLLM Integration (Optional)**

If you have AnythingLLM running locally or in staging:

1. Create configuration in `storage/plugins/agent-skills.json`:
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

2. Restart AnythingLLM
3. Navigate to Agent Skills page
4. Look for green status indicator
5. Test tools in agent conversation

**API Key Auth Checklist:**
- [ ] Valid API key authenticates successfully
- [ ] Invalid API key returns 401 error
- [ ] Expired API key returns 401 error
- [ ] Deleted user's key returns 404 error
- [ ] Tools list returns correct schemas
- [ ] Tool execution works correctly
- [ ] Tokens deducted from user balance
- [ ] Transactions logged with correct user_id
- [ ] Insufficient balance returns Polish error message
- [ ] Both OAuth and API key paths work identically
- [ ] AnythingLLM connects successfully (if tested)

### Step 10: Update Deployment Registry

**Update the central registry to track GitHub integration status:**

```bash
cd /Users/patpil/Documents/ai-projects/Cloudflare_mcp

# Edit deployed-servers.md
# Add new row with:
# - Server name
# - Worker name
# - Domain
# - GitHub repo URL
# - GitHub Integration: ✅ Connected (or 🔧 Actions)
# - Deployment date
# - Status: 🟢 Active

git add deployed-servers.md
git commit -m "docs: Add [server-name] to deployment registry"
git push origin main
```

**Checklist:**
- [ ] Added entry to `deployed-servers.md`
- [ ] GitHub Integration status marked as ✅ Connected
- [ ] All fields filled correctly
- [ ] Changes committed to main repository

### Step 11: Monitor Initial Usage

```bash
# Watch live logs
wrangler tail --format pretty

# Filter for errors
wrangler tail --format pretty | grep -i error

# Monitor token operations
wrangler tail --format pretty | grep "Token"
```

**Monitor for:**
- [ ] Successful OAuth flows
- [ ] Tool executions
- [ ] Token deductions
- [ ] Any errors or warnings
- [ ] Performance issues

## Post-Deployment

### ✅ GitHub Integration Verification

**Ensure GitHub is working as source of truth:**

```bash
# Test workflow: Make code change → Push → Auto-deploy
echo "// Test comment" >> src/server.ts
git add src/server.ts
git commit -m "test: Verify auto-deployment workflow"
git push origin main

# Monitor deployment in Cloudflare Dashboard
# Should deploy automatically within 2 minutes
```

**Checklist:**
- [ ] GitHub push triggers automatic deployment
- [ ] Build completes successfully
- [ ] GitHub check run shows success
- [ ] No manual `wrangler deploy` needed
- [ ] Deployment visible in Cloudflare Dashboard

### ✅ Branch Protection (Recommended)

**Setup branch protection for production safety:**

1. Go to GitHub repository → **Settings** → **Branches**
2. Click **Add rule** for `main` branch
3. Enable:
   - ✅ Require pull request reviews before merging
   - ✅ Require status checks to pass before merging
     - Select "Cloudflare Workers" check
   - ✅ Require branches to be up to date before merging

**Benefits:**
- Prevents direct pushes to main
- Requires code review before deployment
- Ensures builds pass before merge
- Uses preview deployments for testing

**Checklist:**
- [ ] Branch protection enabled for `main`
- [ ] Pull request reviews required
- [ ] Status checks required (Cloudflare Workers)
- [ ] Team members notified of new workflow

### ✅ Documentation Updates

- [ ] Update README with production URL
- [ ] Document both endpoints (`/sse` and `/mcp`)
- [ ] Add client configuration examples
- [ ] Document available tools
- [ ] Include token costs
- [ ] Document GitHub integration setup (reference GITHUB_INTEGRATION_GUIDE.md)

### ✅ Database Verification

```sql
-- Check if transactions are being logged
SELECT COUNT(*) FROM mcp_actions
WHERE mcp_server_name = 'your-server-name'
AND created_at > datetime('now', '-1 hour');

-- Check user activity
SELECT
    user_id,
    tool_name,
    tokens_consumed,
    success,
    created_at
FROM mcp_actions
WHERE mcp_server_name = 'your-server-name'
ORDER BY created_at DESC
LIMIT 10;
```

**Checklist:**
- [ ] Transactions being logged
- [ ] User IDs correct
- [ ] Token amounts correct
- [ ] Success flags accurate

### ✅ Performance Monitoring

```bash
# Check worker metrics in Cloudflare Dashboard:
# Workers & Pages → Your Worker → Metrics

# Monitor:
# - Requests per second
# - Errors
# - CPU time
# - Duration
```

**Checklist:**
- [ ] Response times acceptable (<1s for simple tools)
- [ ] No error spikes
- [ ] CPU usage reasonable
- [ ] No timeout errors

### ✅ Security Verification

**Check:**
- [ ] OAuth working correctly
- [ ] Database checks enforced
- [ ] Token validation working
- [ ] No CORS issues
- [ ] HTTPS enforced (custom domain)
- [ ] Secrets not exposed in logs

**Test attack scenarios:**
- [ ] Can't access tools without auth
- [ ] Can't bypass token checks
- [ ] Invalid tokens rejected
- [ ] SQL injection prevented (Durable Objects handles this)

### ✅ Client Testing

**All testing is done with Cloudflare Workers AI Playground:**
- [ ] Playground connection successful
- [ ] Both transports tested (`/sse` and `/mcp`)
- [ ] OAuth flow working
- [ ] All tools execute correctly
- [ ] Token system functioning properly

## Rollback Plan

### If Issues Found

**Option 1: Revert Commit (Recommended with GitHub Integration)**
```bash
# Revert the problematic commit
git revert HEAD
git push origin main

# Cloudflare automatically deploys the reverted version
# Monitor in Dashboard → Deployments
```

**Option 2: Manual Rollback (Immediate)**
```bash
# List recent deployments
wrangler deployments list

# Rollback to specific deployment
wrangler rollback --deployment-id <previous-deployment-id>

# Then fix issue and push to GitHub
```

**Option 3: Fix Forward (Best Practice)**
```bash
# Create fix branch
git checkout -b fix/deployment-issue

# Fix issue locally
# Test type safety
npx tsc --noEmit

# Commit fix
git add .
git commit -m "fix: Resolve deployment issue"
git push origin fix/deployment-issue

# Create PR → Review → Merge
# Automatic deployment happens on merge to main
```

**Option 4: Hotfix (Emergency)**
```bash
# For critical production issues
git checkout -b hotfix/critical-issue

# Fix issue
# Test locally
npx tsc --noEmit

# Commit and push
git add .
git commit -m "hotfix: Critical production issue"
git push origin hotfix/critical-issue

# Create PR → Fast review → Merge
# Or bypass protection if absolutely necessary:
git checkout main
git merge hotfix/critical-issue
git push origin main  # Triggers automatic deployment
```

## Common Issues

### Issue: Domain SSL Not Provisioning

**Wait 10-15 minutes** - SSL provisioning takes time

If still failing:
- [ ] Check domain DNS is pointed to Cloudflare
- [ ] Verify domain is active in Cloudflare
- [ ] Check for conflicting DNS records

### Issue: OAuth Redirects Failing

**Check:**
- [ ] Redirect URI in WorkOS matches exactly
- [ ] Include `/callback` path
- [ ] Use `https://` (not `http://`)
- [ ] No trailing slash

### Issue: 403 for Valid Users

**Verify:**
- [ ] User email in database
- [ ] Email matches exactly (case-sensitive)
- [ ] Database binding configured
- [ ] D1 database ID correct

### Issue: Tools Not Appearing

**Check:**
- [ ] Durable Object migrations correct
- [ ] Class names match in all files
- [ ] Tools defined in `init()` method
- [ ] No JavaScript errors in logs

### Issue: Token Deduction Not Working

**Verify:**
- [ ] Database binding (DB) configured
- [ ] Database ID correct
- [ ] `consumeTokensWithRetry()` called after execution
- [ ] User ID available in `this.props`

## Maintenance

### Regular Checks (Weekly)

- [ ] Check error logs
- [ ] Monitor token usage patterns
- [ ] Verify database transactions
- [ ] Check performance metrics
- [ ] Update dependencies (monthly)

### Monitoring Queries

```sql
-- Weekly token usage
SELECT
    DATE(created_at) as date,
    COUNT(*) as requests,
    SUM(tokens_consumed) as tokens
FROM mcp_actions
WHERE mcp_server_name = 'your-server'
AND created_at > datetime('now', '-7 days')
GROUP BY DATE(created_at);

-- Error rate
SELECT
    success,
    COUNT(*) as count
FROM mcp_actions
WHERE mcp_server_name = 'your-server'
AND created_at > datetime('now', '-1 day')
GROUP BY success;
```

## Success Criteria

Deployment is successful when:

**Technical Functionality:**
- ✅ Both `/sse` and `/mcp` endpoints respond
- ✅ Cloudflare Workers AI Playground connects successfully
- ✅ OAuth flow completes without errors
- ✅ Database user check working (403 for non-users)
- ✅ All tools execute correctly in Playground
- ✅ Tokens deducted accurately
- ✅ Transactions logged properly in D1 database
- ✅ Custom domain active with SSL
- ✅ No errors in production logs
- ✅ Performance metrics acceptable

**GitHub Integration:**
- ✅ GitHub connected to Cloudflare Worker (Workers Builds or Actions)
- ✅ Push to main triggers automatic deployment
- ✅ Build completes successfully in < 2 minutes
- ✅ GitHub check runs show success status
- ✅ Deployment registry updated with ✅ Connected status
- ✅ No manual `wrangler deploy` needed for updates
- ✅ Preview builds working for pull requests (optional)

## Next Steps After Deployment

1. **Verify GitHub Integration** - Make a test commit and verify auto-deployment
2. **Setup Branch Protection** - Protect main branch with required reviews
3. **Monitor for 24 hours** - Watch for any issues
4. **Gather user feedback** - Are tools working as expected?
5. **Analyze usage patterns** - Which tools are popular?
6. **Optimize token costs** - Adjust based on data
7. **Document workflow** - Share GitHub-first approach with team
8. **Plan next server** - Use template for next deployment!

---

**Deployment Complete!** 🚀

Your MCP server is now live at:
- **SSE:** `https://your-server.wtyczki.ai/sse`
- **Streamable HTTP:** `https://your-server.wtyczki.ai/mcp`

**GitHub Integration Active:**
- Push to `main` → Automatic deployment to Cloudflare
- GitHub is now the single source of truth
- No manual `wrangler deploy` needed

**Daily Workflow:**
```bash
# Make changes locally
# Test with: npx tsc --noEmit

# Commit and push
git add .
git commit -m "feat: Your change description"
git push origin main

# Automatic deployment happens
# Monitor in Cloudflare Dashboard → Deployments
```
