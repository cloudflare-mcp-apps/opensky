# Centralized Custom Login Integration Guide

**MANDATORY:** All MCP servers must integrate with the centralized custom login at `panel.wtyczki.ai`.

## Overview

This guide explains how to integrate your MCP server with the **centralized custom authentication system** hosted at `panel.wtyczki.ai/auth/login-custom`.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Centralized Login System                   │
│              (panel.wtyczki.ai - ONE instance)              │
│                                                             │
│  • Custom branded login UI (HTML/CSS)                      │
│  • WorkOS Magic Auth integration                           │
│  • Session management (USER_SESSIONS KV)                   │
│  • Database user verification                              │
└─────────────────────────────────────────────────────────────┘
                            ↓ session cookie
┌─────────────────────────────────────────────────────────────┐
│              MCP Servers (MULTIPLE instances)               │
│                                                             │
│  • nbp-exchange-mcp.wtyczki.ai                            │
│  • weather-mcp.wtyczki.ai                                  │
│  • translation-mcp.wtyczki.ai                              │
│  • ...more servers                                         │
│                                                             │
│  Each server:                                              │
│  ✓ Checks for session cookie                              │
│  ✓ Redirects to centralized login if needed               │
│  ✓ Validates session from shared KV                       │
│  ✓ Completes OAuth with database user data                │
└─────────────────────────────────────────────────────────────┘
```

### Why Centralized?

**Benefits:**
- ✅ **Single login experience** - Users authenticate once for ALL MCP servers
- ✅ **Consistent branding** - One UI design across entire platform
- ✅ **Easier maintenance** - Update login UI in one place
- ✅ **Shared sessions** - No re-login when switching between MCP servers
- ✅ **Security** - Centralized session management and user verification

**What You DON'T Need:**
- ❌ Custom login HTML/CSS files in your MCP server
- ❌ Custom auth route handlers in your MCP server
- ❌ WorkOS Magic Auth code sending logic
- ❌ Email/code verification UI

**What You DO Need:**
- ✅ Session validation logic in `/authorize` endpoint
- ✅ Database user lookup and verification
- ✅ OAuth completion with database user data
- ✅ USER_SESSIONS KV namespace (shared with centralized system)

---

## Authentication Flow

### Complete Flow Diagram

```
1. MCP Client initiates connection
   ↓
2. MCP Server /authorize endpoint
   ↓ checks for session cookie
   │
   ├─ Session exists & valid?
   │  ↓ YES
   │  5. Query database for user
   │  6. Check is_deleted flag
   │  7. Complete OAuth with user data
   │  8. MCP Client authenticated ✅
   │
   └─ NO session or expired?
      ↓
      3. Redirect to panel.wtyczki.ai/auth/login-custom
         ↓
         User sees branded login page
         ↓ enters email
         WorkOS sends Magic Auth code
         ↓ user enters 6-digit code
         Session created in USER_SESSIONS KV
         ↓
      4. Redirect back to MCP Server /authorize
         (now with session cookie)
         ↓
      5. Query database for user...
```

### Session Data Structure

Sessions are stored in the shared `USER_SESSIONS` KV namespace:

**Key format:** `workos_session:{uuid}`

**Value (JSON):**
```json
{
  "user_id": "uuid-from-database",
  "email": "user@example.com",
  "workos_user_id": "workos-uuid",
  "access_token": "workos-access-token",
  "refresh_token": "workos-refresh-token",
  "created_at": 1234567890000,
  "expires_at": 1234826890000
}
```

**Cookie:** `workos_session={uuid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=259200`

**Important:** The session's `user_id` field contains the **database user_id** (not WorkOS user ID).

---

## Implementation Steps

### Step 1: Create USER_SESSIONS KV Namespace

**IMPORTANT:** Use the **SHARED** KV namespace IDs from `CLOUDFLARE_CONFIG.md`.

Do NOT create a new namespace. Use the existing shared namespace:

```jsonc
// From CLOUDFLARE_CONFIG.md
{
  "binding": "USER_SESSIONS",
  "id": "e5ad189139cd44f38ba0224c3d596c73",          // Production
  "preview_id": "49c43fb4d6e242db87fd885ba46b5a1d"   // Preview
}
```

### Step 2: Update wrangler.jsonc

Add the shared USER_SESSIONS namespace to your `wrangler.jsonc`:

```jsonc
{
  "name": "your-mcp-server",
  "main": "src/index.ts",
  "compatibility_date": "2024-09-25",

  "kv_namespaces": [
    {
      "binding": "OAUTH_KV",
      "id": "your-oauth-kv-id",
      "preview_id": "your-oauth-preview-id"
    },
    // ADD THIS (exact IDs from CLOUDFLARE_CONFIG.md):
    {
      "binding": "USER_SESSIONS",
      "id": "e5ad189139cd44f38ba0224c3d596c73",
      "preview_id": "49c43fb4d6e242db87fd885ba46b5a1d"
    }
  ],

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "mcp-tokens-database",
      "database_id": "5e4ab4c8-2a57-4d02-aa13-0385d0cdc790"
    }
  ]
}
```

### Step 3: Update types.ts

Add `USER_SESSIONS` to your `Env` interface:

```typescript
// src/types.ts
export interface Env {
    /** KV namespace for storing OAuth tokens and session data */
    OAUTH_KV: KVNamespace;

    /** Durable Object namespace for MCP server instances */
    MCP_OBJECT: DurableObjectNamespace;

    /** D1 Database for token management (shared) */
    DB: D1Database;

    /** WorkOS Client ID */
    WORKOS_CLIENT_ID: string;

    /** WorkOS API Key */
    WORKOS_API_KEY: string;

    /** KV namespace for custom login session storage (shared, REQUIRED) */
    USER_SESSIONS?: KVNamespace;  // Add this line
}
```

### Step 4: Modify /authorize Endpoint

Update `src/authkit-handler.ts` to check for centralized login session:

```typescript
app.get("/authorize", async (c) => {
    // Parse the OAuth request from the MCP client
    const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
    if (!oauthReqInfo.clientId) {
        return c.text("Invalid request", 400);
    }

    // ============================================================
    // STEP 1: Check for session cookie from centralized login
    // ============================================================
    const cookieHeader = c.req.header('Cookie');
    let sessionToken: string | null = null;

    if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {} as Record<string, string>);
        sessionToken = cookies['workos_session'] || null;
    }

    // ============================================================
    // STEP 2: If no session, redirect to centralized custom login
    // ============================================================
    if (!sessionToken && c.env.USER_SESSIONS) {
        console.log('🔐 [OAuth] No session found, redirecting to centralized custom login');
        const loginUrl = new URL('https://panel.wtyczki.ai/auth/login-custom');
        loginUrl.searchParams.set('return_to', c.req.url);
        return Response.redirect(loginUrl.toString(), 302);
    }

    // ============================================================
    // STEP 3: Validate session if present
    // ============================================================
    if (sessionToken && c.env.USER_SESSIONS) {
        const sessionData = await c.env.USER_SESSIONS.get(
            `workos_session:${sessionToken}`,
            'json'
        );

        if (!sessionData) {
            console.log('🔐 [OAuth] Invalid session, redirecting to centralized custom login');
            const loginUrl = new URL('https://panel.wtyczki.ai/auth/login-custom');
            loginUrl.searchParams.set('return_to', c.req.url);
            return Response.redirect(loginUrl.toString(), 302);
        }

        const session = sessionData as {
            expires_at: number;
            user_id: string;
            email: string
        };

        // Check expiration
        if (session.expires_at < Date.now()) {
            console.log('🔐 [OAuth] Session expired, redirecting to centralized custom login');
            const loginUrl = new URL('https://panel.wtyczki.ai/auth/login-custom');
            loginUrl.searchParams.set('return_to', c.req.url);
            return Response.redirect(loginUrl.toString(), 302);
        }

        // ============================================================
        // STEP 4: Session valid - load user from database
        // ============================================================
        console.log(`✅ [OAuth] Valid session found for user: ${session.email}`);

        // CRITICAL: Query database for current user data (balance, deletion status)
        const dbUser = await getUserByEmail(c.env.DB, session.email);

        if (!dbUser) {
            console.log(`❌ [OAuth] User not found in database: ${session.email}`);
            return c.html(formatPurchaseRequiredPage(session.email), 403);
        }

        if (dbUser.is_deleted === 1) {
            console.log(`❌ [OAuth] Account deleted: ${session.email}`);
            return c.html(formatAccountDeletedPage(), 403);
        }

        // ============================================================
        // STEP 5: Complete OAuth authorization directly (skip WorkOS redirect)
        // ============================================================
        const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
            request: oauthReqInfo,
            userId: session.user_id,
            metadata: {},
            scope: [],
            props: {
                // WorkOS data (empty since we used centralized login)
                accessToken: '',
                organizationId: undefined,
                permissions: [],
                refreshToken: '',

                // Reconstructed User object
                user: {
                    id: session.user_id,
                    email: session.email,
                    emailVerified: true,
                    profilePictureUrl: null,
                    firstName: null,
                    lastName: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    lastSignInAt: new Date().toISOString(),
                    locale: null,
                    externalId: null,
                    metadata: {},
                    object: 'user' as const,
                },

                // Database user data (CRITICAL for token operations)
                userId: dbUser.user_id,
                email: dbUser.email,
            } satisfies Props,
        });

        return Response.redirect(redirectTo);
    }

    // ============================================================
    // STEP 6: Fallback to WorkOS (shouldn't normally reach here)
    // ============================================================
    console.log('⚠️ [OAuth] No session handling - falling back to WorkOS');
    return Response.redirect(
        c.get("workOS").userManagement.getAuthorizationUrl({
            provider: "authkit",
            clientId: c.env.WORKOS_CLIENT_ID,
            redirectUri: new URL("/callback", c.req.url).href,
            state: btoa(JSON.stringify(oauthReqInfo)),
        }),
    );
});
```

### Step 5: Keep /callback Handler Unchanged

Your `/callback` endpoint should remain as-is from the skeleton template. It handles the WorkOS fallback case.

**Important:** The `/callback` handler MUST also query the database and pass `dbUser.user_id` to Props, just like the session path does.

---

## Token System Compatibility

### Critical Requirement: Database user_id in Props

**The token consumption system requires `Props.userId` to be the database user_id.**

Both authentication paths (session-based and WorkOS fallback) MUST set Props as follows:

```typescript
props: {
    // WorkOS authentication data
    user: User,
    accessToken: string,
    refreshToken: string,
    permissions: string[],
    organizationId?: string,

    // Database user data (REQUIRED for token operations)
    userId: dbUser.user_id,  // ← Must be from database query
    email: dbUser.email,      // ← Must be from database query
}
```

### How Token Operations Work

1. **Tool execution starts** (e.g., `getCurrencyRate`)
2. **Get user_id from Props:**
   ```typescript
   const userId = this.props?.userId;  // Database user_id
   ```
3. **Check live balance:**
   ```typescript
   const balanceCheck = await checkBalance(this.env.DB, userId, TOOL_COST);
   ```
4. **Execute tool logic** if sufficient balance
5. **Consume tokens:**
   ```typescript
   await consumeTokensWithRetry(
     this.env.DB,
     userId,  // Uses database user_id
     TOOL_COST,
     "your-mcp-server",
     "getCurrencyRate",
     params,
     result,
     true,
     actionId
   );
   ```

### Why This Works

**Session-based path:**
- Centralized login queries database → stores `user_id` in session
- MCP server reads session → re-queries database for fresh data
- Passes `dbUser.user_id` to Props
- Token operations use `this.props.userId` ✅

**WorkOS fallback path:**
- MCP server gets email from WorkOS
- Queries database for user
- Passes `dbUser.user_id` to Props
- Token operations use `this.props.userId` ✅

**Both paths end with the same Props.userId from the database.**

---

## Verification Checklist

After implementing centralized login, verify:

- [ ] `USER_SESSIONS` KV namespace added to `wrangler.jsonc` (shared IDs)
- [ ] `USER_SESSIONS?` added to `Env` interface in `src/types.ts`
- [ ] `/authorize` endpoint checks for session cookie
- [ ] `/authorize` redirects to `https://panel.wtyczki.ai/auth/login-custom` if no session
- [ ] `/authorize` validates session from `USER_SESSIONS` KV
- [ ] `/authorize` queries database with `getUserByEmail(c.env.DB, session.email)`
- [ ] `/authorize` checks `dbUser.is_deleted` flag
- [ ] `/authorize` passes `dbUser.user_id` to `Props.userId`
- [ ] `/callback` endpoint also queries database and passes `dbUser.user_id`
- [ ] TypeScript compiles without errors: `npx tsc --noEmit`
- [ ] Deployed to production: `wrangler deploy`
- [ ] Tested in Cloudflare Workers AI Playground

---

## Testing

### 1. Deploy Your MCP Server

```bash
wrangler deploy
```

### 2. Test Authentication Flow

1. Open https://playground.ai.cloudflare.com/
2. Click "Add MCP Server"
3. Enter your server URL: `https://your-server.wtyczki.ai/sse`
4. Click "Connect"
5. **Expected:** Browser redirects to `https://panel.wtyczki.ai/auth/login-custom`
6. Enter your email address (must exist in database)
7. Enter 6-digit Magic Auth code
8. **Expected:** Redirected back to MCP server, OAuth completes
9. **Expected:** MCP tools appear in playground

### 3. Verify Session Sharing

1. While still authenticated, open a NEW tab
2. Connect to a DIFFERENT MCP server: `https://another-server.wtyczki.ai/sse`
3. **Expected:** NO login prompt (session cookie reused)
4. **Expected:** OAuth completes immediately
5. **Expected:** Tools available without re-authentication

### 4. Test Token Consumption

1. In playground, call a tool that costs tokens
2. Monitor logs: `wrangler tail --format pretty`
3. **Expected logs:**
   ```
   ✅ [OAuth] Valid session found for user: test@example.com
   [Token Consumption] Balance check for user abc-123: 100 tokens, needs 1, sufficient: true
   [Token Consumption] Consuming 1 tokens for user abc-123, server: your-mcp, tool: getTool
   [Token Consumption] ✅ Success! User abc-123: 100 → 99 tokens
   ```

### 5. Test Account Deletion

1. In database, set `is_deleted = 1` for test user
2. Try to connect to MCP server
3. **Expected:** "Account deleted" error page
4. **Expected:** Cannot use tools

---

## Common Issues

### Issue: "No session found, redirecting to centralized custom login" loop

**Causes:**
- Session cookie not being set by centralized login
- Cookie domain mismatch
- Browser blocking third-party cookies

**Fix:**
1. Check centralized login sets cookie with `Domain=.wtyczki.ai`
2. Verify cookie appears in browser DevTools → Application → Cookies
3. Check cookie `SameSite` is `Lax` not `Strict`

### Issue: "User not found in database"

**Causes:**
- User doesn't exist in shared token database
- Email mismatch between WorkOS and database
- Database binding incorrect

**Fix:**
1. Verify user exists:
   ```bash
   wrangler d1 execute DB --command="SELECT * FROM users WHERE email = 'test@example.com'"
   ```
2. Add test user via panel.wtyczki.ai (purchase tokens)
3. Check `wrangler.jsonc` has correct database_id

### Issue: "Invalid session" immediately after login

**Causes:**
- KV namespace mismatch (using different namespace than centralized login)
- Session key format incorrect
- KV replication delay

**Fix:**
1. Verify USER_SESSIONS namespace ID matches CLOUDFLARE_CONFIG.md
2. Check session key format: `workos_session:{uuid}` not `session:{uuid}`
3. Wait 2-3 seconds for KV replication (global consistency)

### Issue: Token operations fail with "User ID not found"

**Causes:**
- `Props.userId` not set correctly
- Using WorkOS user_id instead of database user_id
- getUserByEmail() not called

**Fix:**
1. Check Props assignment uses `dbUser.user_id` not `workosUser.id`
2. Verify database query happens before completeAuthorization()
3. Add logging: `console.log('Props.userId:', this.props?.userId);`

---

## Security Considerations

### 1. Session Security

- ✅ **HttpOnly cookies** prevent XSS access
- ✅ **Secure flag** enforces HTTPS-only
- ✅ **SameSite=Lax** prevents CSRF
- ✅ **72-hour expiry** limits session lifetime
- ✅ **Cryptographic UUIDs** prevent guessing

### 2. Database Checks

- ✅ **Always query fresh** - never cache user data
- ✅ **Check is_deleted** on every authentication
- ✅ **Verify email exists** before completing OAuth
- ✅ **Atomic transactions** for token consumption

### 3. Session Validation

- ✅ **Expiry check** on every request
- ✅ **Signature verification** via KV lookup
- ✅ **Database re-query** gets current balance and status

### 4. WorkOS Fallback

- ✅ **Maintained for compatibility** with non-cookie clients
- ✅ **Same database checks** as session path
- ✅ **Same Props structure** ensures consistency

---

## Architecture Decisions

### Why Centralized Login?

**Problem with per-server login:**
- Users must authenticate separately for each MCP server
- Duplicate login UI code in every server
- Inconsistent branding across servers
- Hard to maintain and update

**Solution with centralized login:**
- Single authentication for ALL MCP servers
- One UI to maintain
- Consistent user experience
- Shared session reduces friction

### Why Query Database Twice?

**Session flow queries database twice:**
1. At centralized login (stores user_id in session)
2. At MCP server (re-queries for fresh data)

**Reasons:**
- **Fresh balance:** User may have purchased tokens between login and tool use
- **Deletion check:** User may have deleted account while session active
- **Security:** Don't trust session data for authorization decisions
- **Auditability:** Log every authentication event

### Why Keep WorkOS Fallback?

**Even with centralized login, WorkOS path remains:**
- **MCP clients without cookie support** (some desktop clients)
- **Direct API access** (testing, automation)
- **Fallback for errors** in centralized system
- **Backward compatibility** with existing integrations

---

## Next Steps

1. ✅ Implement centralized login integration
2. ✅ Deploy and test thoroughly
3. ✅ Monitor authentication logs
4. ✅ Verify token operations work correctly
5. ✅ Test session sharing across multiple MCP servers
6. ✅ Update your server's README with authentication instructions

**Related Guides:**
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - Production deployment
