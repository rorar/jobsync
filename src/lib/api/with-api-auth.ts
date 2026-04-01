import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "./auth";
import { checkRateLimit } from "./rate-limit";
import { errorResponse } from "./response";

interface ApiContext {
  userId: string;
  params?: Record<string, string>;
}

type RouteContext = { params: Promise<Record<string, string>> };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
  "Access-Control-Max-Age": "86400",
} as const;

/**
 * Higher-order function that wraps an API v1 route handler with:
 * 1. CORS preflight handling
 * 2. API Key authentication
 * 3. Rate limiting (60 req/min per key)
 * 4. Global error catching
 *
 * The wrapped handler receives the authenticated userId as second argument.
 *
 * CORS: Uses Access-Control-Allow-Origin: * because auth is via API key
 * (not cookies), so wildcard is safe. External consumers (n8n, browser
 * extensions, scripts) need cross-origin access.
 */
export function withApiAuth(
  handler: (req: NextRequest, ctx: ApiContext) => Promise<Response>,
) {
  return async (req: NextRequest, routeCtx: RouteContext) => {
    // 0. Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      // 1. Rate limit by IP BEFORE auth — prevents DoS via invalid key flooding (ADR-019)
      // SECURITY NOTE: x-forwarded-for is spoofable without a trusted reverse proxy.
      // In production, configure nginx/Caddy to overwrite x-forwarded-for with the real client IP.
      // The fallback uses a unique value per request to prevent shared-bucket DoS.
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || `anon-${Date.now()}`;
      const ipRateResult = checkRateLimit(`ip:${clientIp}`, 120, 60_000);
      if (!ipRateResult.allowed) {
        const res = errorResponse(
          "RATE_LIMITED",
          "Too many requests. Try again later.",
          429,
        );
        res.headers.set("Retry-After", String(Math.max(1, ipRateResult.resetAt - Math.floor(Date.now() / 1000))));
        return addCorsHeaders(res);
      }

      // 2. Authenticate
      const authResult = await validateApiKey(req);
      if (!authResult) {
        return addCorsHeaders(errorResponse(
          "UNAUTHORIZED",
          "Invalid or missing API key. Provide a valid key via Authorization: Bearer <key> or X-API-Key header.",
          401,
        ));
      }

      // 3. Rate limit by API key (stricter, per-key)
      const rateResult = checkRateLimit(authResult.keyHash);
      if (!rateResult.allowed) {
        const res = errorResponse(
          "RATE_LIMITED",
          "Rate limit exceeded. Try again later.",
          429,
        );
        res.headers.set("X-RateLimit-Limit", String(rateResult.limit));
        res.headers.set("X-RateLimit-Remaining", "0");
        res.headers.set("X-RateLimit-Reset", String(rateResult.resetAt));
        res.headers.set("Retry-After", String(Math.max(1, rateResult.resetAt - Math.floor(Date.now() / 1000))));
        return addCorsHeaders(res);
      }

      // 3. Resolve route params
      const params = routeCtx?.params ? await routeCtx.params : undefined;

      // 4. Call handler
      const response = await handler(req, {
        userId: authResult.userId,
        params,
      });

      // 5. Add rate limit, security, and CORS headers
      response.headers.set("X-RateLimit-Limit", String(rateResult.limit));
      response.headers.set("X-RateLimit-Remaining", String(rateResult.remaining));
      response.headers.set("X-RateLimit-Reset", String(rateResult.resetAt));
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Content-Type-Options", "nosniff");

      return addCorsHeaders(response);
    } catch (error) {
      console.error("[Public API] Unhandled error:", error);
      return addCorsHeaders(errorResponse(
        "INTERNAL_ERROR",
        "An unexpected error occurred.",
        500,
      ));
    }
  };
}

function addCorsHeaders(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
