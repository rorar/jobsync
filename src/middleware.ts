import { NextRequest, NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const authHandler = NextAuth(authConfig).auth;

/**
 * Adds CORS headers for allowed dev origins in development mode.
 * Reads from process.env.ALLOWED_DEV_ORIGINS which is kept up-to-date
 * at runtime by the env-sync server action (no restart required).
 */
function addDevCorsHeaders(request: NextRequest, response: NextResponse): NextResponse {
  if (process.env.NODE_ENV !== "development") return response;

  const origin = request.headers.get("origin");
  if (!origin) return response;

  const allowed =
    process.env.ALLOWED_DEV_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [];

  const isAllowed = allowed.some(
    (o) => origin === o || origin.includes(o) || o.includes(origin)
  );

  if (isAllowed) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  return response;
}

/**
 * Strips sensitive query parameters from auth routes.
 * Prevents credential leakage via URL when forms fall back to GET.
 */
function sanitizeAuthUrl(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  const isAuthRoute = pathname === "/signin" || pathname === "/signup";
  if (isAuthRoute && (searchParams.has("email") || searchParams.has("password"))) {
    const cleanUrl = new URL(pathname, request.url);
    return NextResponse.redirect(cleanUrl, { status: 303 });
  }
  return null;
}

/**
 * Adds security headers to all responses.
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export default async function middleware(request: NextRequest) {
  // Layer 3: Strip credentials from auth route URLs before any processing
  const sanitized = sanitizeAuthUrl(request);
  if (sanitized) return addSecurityHeaders(sanitized);

  // Run the NextAuth middleware
  const authResponse = await (authHandler as any)(request);
  const response = authResponse ?? NextResponse.next();

  // Add security headers
  addSecurityHeaders(response);

  // Add CORS headers for allowed dev origins
  return addDevCorsHeaders(request, response);
}

export const config = {
  // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
  matcher: [
    // "/((?!api|_next/static|_next/image|.*\\.png$).*)",
    "/dashboard",
    "/dashboard/:path*",
    "/signin",
    "/signup",
    "/api/v1/:path*",
  ],
};
