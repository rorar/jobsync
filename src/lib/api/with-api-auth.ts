import { NextRequest } from "next/server";
import { validateApiKey } from "./auth";
import { checkRateLimit } from "./rate-limit";
import { errorResponse } from "./response";

interface ApiContext {
  userId: string;
  params?: Record<string, string>;
}

type RouteContext = { params: Promise<Record<string, string>> };

/**
 * Higher-order function that wraps an API v1 route handler with:
 * 1. API Key authentication
 * 2. Rate limiting (60 req/min per key)
 * 3. Global error catching
 *
 * The wrapped handler receives the authenticated userId as second argument.
 */
export function withApiAuth(
  handler: (req: NextRequest, ctx: ApiContext) => Promise<Response>,
) {
  return async (req: NextRequest, routeCtx: RouteContext) => {
    try {
      // 1. Authenticate
      const authResult = await validateApiKey(req);
      if (!authResult) {
        return errorResponse(
          "UNAUTHORIZED",
          "Invalid or missing API key. Provide a valid key via Authorization: Bearer <key> or X-API-Key header.",
          401,
        );
      }

      // 2. Rate limit
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
        res.headers.set("Retry-After", String(rateResult.resetAt - Math.floor(Date.now() / 1000)));
        return res;
      }

      // 3. Resolve route params
      const params = routeCtx?.params ? await routeCtx.params : undefined;

      // 4. Call handler
      const response = await handler(req, {
        userId: authResult.userId,
        params,
      });

      // 5. Add rate limit and security headers
      response.headers.set("X-RateLimit-Limit", String(rateResult.limit));
      response.headers.set("X-RateLimit-Remaining", String(rateResult.remaining));
      response.headers.set("X-RateLimit-Reset", String(rateResult.resetAt));
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Content-Type-Options", "nosniff");

      return response;
    } catch (error) {
      console.error("[Public API] Unhandled error:", error);
      return errorResponse(
        "INTERNAL_ERROR",
        "An unexpected error occurred.",
        500,
      );
    }
  };
}
