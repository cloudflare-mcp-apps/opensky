/**
 * Remote Token Validator for OpenSky MCP Server
 *
 * Validates tokens (OAuth Bearer or API keys) by calling the centralized
 * authentication service at panel.wtyczki.ai/oauth/userinfo.
 *
 * Architecture:
 * - mcp-oauth (panel.wtyczki.ai) = Authorization Server
 * - opensky (opensky.wtyczki.ai) = Resource Server
 *
 * This approach ensures:
 * - Single source of truth for all auth data
 * - No D1 database needed on resource servers
 * - Consistent auth behavior across all MCP servers
 */

import { logger } from "../shared/logger";

/**
 * User information returned from mcp-oauth /oauth/userinfo
 */
export interface UserInfo {
  /** User ID (sub claim) */
  sub: string;
  /** User email */
  email: string;
}

/**
 * Result of token validation
 */
export interface ValidationResult {
  /** User ID */
  userId: string;
  /** User email */
  email: string;
}

/**
 * Centralized OAuth provider URL
 * This is where all MCP servers validate tokens
 */
const MCP_OAUTH_URL = "https://panel.wtyczki.ai";

/**
 * Validate a token (OAuth Bearer or API key) by calling mcp-oauth
 *
 * Supports both:
 * - OAuth 2.1 access tokens (from /oauth/authorize flow)
 * - API keys (wtyk_* format from dashboard)
 *
 * @param token - The token to validate (Bearer token or API key)
 * @returns ValidationResult if valid, null if invalid
 */
export async function validateApiKey(
  token: string,
  _env: unknown // env not needed for remote validation
): Promise<ValidationResult | null> {
  try {
    const response = await fetch(`${MCP_OAUTH_URL}/oauth/userinfo`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      logger.warn({
        event: "auth_attempt",
        method: "api_key",
        success: false,
        reason: `Remote validation failed: ${response.status}`,
      });
      return null;
    }

    const userInfo = (await response.json()) as UserInfo;

    logger.info({
      event: "api_key_validated",
      user_id: userInfo.sub,
      key_prefix: token.substring(0, 8),
      success: true,
    });

    return {
      userId: userInfo.sub,
      email: userInfo.email,
    };
  } catch (error) {
    logger.error({
      event: "tool_failed",
      tool: "validateApiKey",
      error: error instanceof Error ? error.message : String(error),
      error_code: "remote_validation_error",
    });
    return null;
  }
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.substring(7);
}

/**
 * Create 401 Unauthorized response with WWW-Authenticate header
 */
export function unauthorizedResponse(message: string): Response {
  return new Response(JSON.stringify({ error: message, status: 401 }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="opensky", error="invalid_token"',
    },
  });
}
