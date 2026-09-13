/**
 * @jest-environment node
 *
 * Node environment, not jsdom: `Response.redirect()` (used by the /signin
 * branch below) is Node's native implementation; jsdom's polyfill doesn't
 * implement the static `.redirect()` method and throws `TypeError:
 * Response.redirect is not a function` under the default environment.
 *
 * Regression test for E2E-B49: the `authorized` callback's "already signed in
 * -> bounce to /dashboard" branch used to fire for EVERY matched route that
 * wasn't `/dashboard` itself — including `/api/v1/:path*`, which shares the
 * same middleware matcher (`src/middleware.ts:87`) for CORS/security headers,
 * not for this redirect. Any Public API v1 caller who also carried a valid
 * NextAuth session cookie (e.g. the browser extension, ROADMAP 2.17, running
 * in the same browser as a logged-in dashboard tab) was silently redirected
 * away from the API route regardless of a valid `Authorization: Bearer`
 * token. Found 2026-09-13 via an E2E fixture whose `page.request` shares the
 * browser context's cookies with `page`'s own navigations.
 *
 * These tests exercise `authConfig.callbacks.authorized` directly. It depends
 * only on `next-auth`'s types (no Prisma), so no DB mock is required — same
 * pattern as `auth-jwt-minimization.spec.ts`.
 */

import { authConfig } from "@/auth.config";

type AuthorizedCallback = NonNullable<
  NonNullable<typeof authConfig.callbacks>["authorized"]
>;

const authorized = authConfig.callbacks!.authorized as AuthorizedCallback;

function makeArgs(pathname: string, isLoggedIn: boolean) {
  const nextUrl = new URL(`http://localhost:3737${pathname}`);
  return {
    auth: isLoggedIn ? { user: { id: "user-1" } } : null,
    request: { nextUrl } as unknown as Request,
  } as Parameters<AuthorizedCallback>[0];
}

describe("authConfig.callbacks.authorized", () => {
  describe("/api/v1/* — Public API routes", () => {
    it("allows a logged-out request through (route's own withApiAuth decides)", () => {
      expect(authorized(makeArgs("/api/v1/jobs", false))).toBe(true);
    });

    it("allows a logged-in request through too — regression for E2E-B49", () => {
      // Before the fix this returned a redirect Response to /dashboard,
      // which is exactly what broke every Public API call made from a
      // browser context that also held a valid dashboard session cookie.
      const result = authorized(makeArgs("/api/v1/jobs/some-id", true));
      expect(result).toBe(true);
    });
  });

  describe("/dashboard/* — protected pages", () => {
    it("denies a logged-out request", () => {
      expect(authorized(makeArgs("/dashboard", false))).toBe(false);
    });

    it("allows a logged-in request", () => {
      expect(authorized(makeArgs("/dashboard/myjobs", true))).toBe(true);
    });
  });

  describe("/signin, /signup — auth pages", () => {
    it("allows a logged-out request (needs to see the form)", () => {
      expect(authorized(makeArgs("/signin", false))).toBe(true);
    });

    it("redirects a logged-in request to /dashboard (unchanged behavior)", () => {
      const result = authorized(makeArgs("/signin", true));
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBeGreaterThanOrEqual(300);
      expect((result as Response).status).toBeLessThan(400);
      expect((result as Response).headers.get("location")).toContain("/dashboard");
    });
  });
});
