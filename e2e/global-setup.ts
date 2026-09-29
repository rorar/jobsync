import { chromium, type BrowserContext, type FullConfig } from "@playwright/test";

// NextAuth v5 over http names its session cookie `authjs.session-token` (the
// `__Secure-` prefix is added only for https — @auth/core/lib/utils/cookie.js:49).
// The SAME string is the HKDF salt for the JWE: @auth/core/lib/utils/session.js:11
// reads `options.cookies.sessionToken.name` and passes it as `salt`, so a token
// encoded with any other salt decodes to nothing and the server treats the
// request as anonymous.
const SESSION_COOKIE = "authjs.session-token";

// The seeded account both seeds create (prisma/seed.ts:16, prisma/seed-e2e.ts:34).
const TEST_USER_EMAIL = "admin@example.com";
const TEST_USER_PASSWORD = "password123";

type MintedCookie = Parameters<BrowserContext["addCookies"]>[0][number];

/**
 * Mint the session cookie instead of signing in.
 *
 * Why this exists: signin is rate-limited to 5 per 15 minutes per IP
 * (src/lib/auth/auth-rate-limit.ts:24-25). `scripts/dev-e2e.sh` sets
 * E2E_AUTH_RATE_LIMIT_BYPASS to sidestep that, but the bypass is double-gated on
 * `NODE_ENV !== "production"` BY DESIGN, so it is inert for a production run
 * (E2E_PROD=1) — and it must stay inert; it is not a knob to loosen.
 *
 * A run spends three signins: this setup, e2e/smoke/signin.spec.ts:15 and
 * e2e/smoke/locale-switching.spec.ts:247. The two smoke tests exercise the auth
 * FLOW and must keep signing in for real. This one never did — it only needed a
 * session — so minting removes the one signin that was never the point, and two
 * consecutive runs then fit inside the real limit.
 *
 * This project uses JWT sessions, not database sessions: there is no `Session`
 * model in prisma/schema.prisma, and src/auth.config.ts:13 augments
 * `@auth/core/jwt`. A session therefore IS a cookie signed from AUTH_SECRET, and
 * nothing has to be written anywhere for one to exist.
 *
 * Returns null when it cannot mint — no AUTH_SECRET in this process, no seeded
 * user. The caller then signs in, and says so.
 */
async function mintSessionCookie(baseURL: string): Promise<MintedCookie | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.warn(
      "[global-setup] AUTH_SECRET is not in this process's environment, so the session " +
        "cookie cannot be minted. Falling back to a real sign-in, which spends one of the " +
        "5-per-15-minute signin budget. scripts/test-e2e.sh exports it for you.",
    );
    return null;
  }

  // Imported lazily and only on this path: a bare `playwright test` without a
  // provisioned database should fail on the first assertion, not on a Prisma
  // client it never needed.
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email: TEST_USER_EMAIL },
      select: { id: true },
    });
    if (!user) {
      console.warn(
        `[global-setup] no user ${TEST_USER_EMAIL} in ${process.env.DATABASE_URL ?? "the database"}; ` +
          "falling back to a real sign-in.",
      );
      return null;
    }

    const { encode } = await import("next-auth/jwt");
    // One hour: longer than any run this suite has taken (the record is 40.2
    // min) and short enough that a cookie left in e2e/.auth/user.json is not a
    // month-long credential lying in the worktree.
    const maxAge = 60 * 60;
    // `id` is what src/auth.config.ts:50 writes and its session callback reads;
    // `sub` is the JWT-standard fallback that same callback falls back to
    // (`token.id as string) || token.sub`). Setting both means the session
    // resolves whichever of the two a future refactor keeps.
    const value = await encode({
      token: { id: user.id, sub: user.id },
      secret,
      salt: SESSION_COOKIE,
      maxAge,
    });

    return {
      name: SESSION_COOKIE,
      value,
      domain: new URL(baseURL).hostname,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + maxAge,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function globalSetup(config: FullConfig) {
  // No stale-data purge here any more. Every run gets its own database
  // (scripts/e2e-db.sh), so there is no residue from a previous run to remove:
  // the file this used to clean is discarded and re-copied from a seeded
  // template before the server starts.

  const baseURL =
    config.projects[0]?.use?.baseURL ?? "http://localhost:3737";

  // Warm up the server. Under `next dev` this pays the Turbopack compile up
  // front instead of inside the first test; under `next start` there is nothing
  // to compile and it degenerates into a readiness poll, which is harmless and
  // still useful — the server may be seconds from binding.
  await warmUpServer(baseURL);

  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const cookie = await mintSessionCookie(baseURL);
    let authenticated = false;

    if (cookie) {
      await context.addCookies([cookie]);
      // Verify rather than assume. A minted cookie that the server rejects
      // leaves every crud test failing on its first navigation, far from the
      // cause; checking here costs one page load and names the problem.
      // `/dashboard` redirects to `/signin` for an anonymous request
      // (src/auth.config.ts:32-42), so the landing URL is the whole oracle.
      await page.goto(`${baseURL}/dashboard`);
      authenticated = new URL(page.url()).pathname.startsWith("/dashboard");
      if (authenticated) {
        console.log("[global-setup] session cookie minted; no signin spent.");
      } else {
        console.warn(
          "[global-setup] the minted session cookie was rejected (landed on " +
            `${page.url()}). Falling back to a real sign-in.`,
        );
        await context.clearCookies();
      }
    }

    if (!authenticated) {
      await page.goto(`${baseURL}/signin`);
      await page.getByPlaceholder("id@example.com").fill(TEST_USER_EMAIL);
      await page.getByLabel("Password").fill(TEST_USER_PASSWORD);
      await page.getByRole("button", { name: "Login" }).click();
      // The first AUTHENTICATED /dashboard load triggers a Turbopack compile that
      // can exceed 30 s on a slow VM (8 GB, no swap). scripts/test-e2e.sh raises
      // this via E2E_LOGIN_TIMEOUT_MS; the 30 s default is unchanged for fast hosts.
      const loginTimeout = Number(process.env.E2E_LOGIN_TIMEOUT_MS) || 30000;
      await page.waitForURL("**/dashboard", { timeout: loginTimeout });
    }

    await context.storageState({ path: "e2e/.auth/user.json" });
  } finally {
    await browser.close();
  }
}

/**
 * Hit key routes to trigger Turbopack compilation before tests start.
 * Retries with backoff until the server responds.
 */
async function warmUpServer(baseURL: string) {
  const routes = ["/signin", "/dashboard"];
  for (const route of routes) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const res = await fetch(`${baseURL}${route}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok || res.status === 307) break; // 307 = auth redirect, still means server is ready
      } catch {
        // Server not ready yet
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

export default globalSetup;
