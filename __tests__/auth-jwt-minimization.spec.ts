/**
 * Regression tests for GDPR-JWT (Welle 1 — Foundation/GDPR).
 *
 * GDPR Art. 5(1)(c) data minimisation: the NextAuth JWT must carry ONLY the
 * user `id`. `name` and `email` (and any other PII NextAuth seeds on sign-in)
 * must be stripped from the token payload. Display fields are resolved from the
 * DB in the session callback (src/auth.ts) where needed.
 *
 * These tests exercise `authConfig.callbacks.jwt` / `.session` directly. They
 * import `auth.config.ts` (which depends only on `next-auth`, no Prisma), so no
 * DB mock is required.
 */

import { authConfig } from "@/auth.config";

type JwtCallback = NonNullable<NonNullable<typeof authConfig.callbacks>["jwt"]>;
type SessionCallback = NonNullable<
  NonNullable<typeof authConfig.callbacks>["session"]
>;

const jwt = authConfig.callbacks!.jwt as JwtCallback;
const session = authConfig.callbacks!.session as SessionCallback;

// The jwt callback receives a rich arg set from NextAuth; for these unit tests
// only `token` and `user` are read, so we cast a minimal shape.
const callJwt = (args: { token: Record<string, unknown>; user?: unknown }) =>
  jwt(args as Parameters<JwtCallback>[0]);

const callSession = (args: {
  session: { user: Record<string, unknown> };
  token: Record<string, unknown>;
}) => session(args as unknown as Parameters<SessionCallback>[0]);

describe("GDPR-JWT minimisation — jwt callback", () => {
  it("persists the user id into the token on sign-in", async () => {
    const token = await callJwt({
      token: {},
      user: { id: "user-123", name: "Alice", email: "alice@example.com" },
    });
    expect(token).toMatchObject({ id: "user-123" });
  });

  it("strips name from the token even when NextAuth seeded it on sign-in", async () => {
    const token = (await callJwt({
      // NextAuth's default flow seeds name/email/picture onto the token before
      // our callback runs — simulate that pre-seeded state here.
      token: { name: "Alice", email: "alice@example.com", picture: "pic.png" },
      user: { id: "user-123", name: "Alice", email: "alice@example.com" },
    })) as Record<string, unknown>;

    expect(token).not.toHaveProperty("name");
    expect(token.name).toBeUndefined();
  });

  it("strips email from the token even when NextAuth seeded it on sign-in", async () => {
    const token = (await callJwt({
      token: { name: "Alice", email: "alice@example.com", picture: "pic.png" },
      user: { id: "user-123", name: "Alice", email: "alice@example.com" },
    })) as Record<string, unknown>;

    expect(token).not.toHaveProperty("email");
    expect(token.email).toBeUndefined();
  });

  it("strips picture from the token", async () => {
    const token = (await callJwt({
      token: { name: "Alice", email: "alice@example.com", picture: "pic.png" },
      user: { id: "user-123" },
    })) as Record<string, unknown>;

    expect(token).not.toHaveProperty("picture");
  });

  it("the persisted token carries no PII claims on subsequent calls (no user arg)", async () => {
    // First call: sign-in.
    const signedIn = (await callJwt({
      token: { name: "Alice", email: "alice@example.com", picture: "pic.png" },
      user: { id: "user-123", name: "Alice", email: "alice@example.com" },
    })) as Record<string, unknown>;

    // Subsequent request: NextAuth re-invokes jwt with the existing token and no user.
    const reused = (await callJwt({ token: signedIn })) as Record<
      string,
      unknown
    >;

    expect(reused.id).toBe("user-123");
    expect(reused).not.toHaveProperty("name");
    expect(reused).not.toHaveProperty("email");
    expect(reused).not.toHaveProperty("picture");

    // The full set of own keys must be id-only (sub may be present from NextAuth
    // internals, but no name/email/picture PII).
    const piiKeys = Object.keys(reused).filter((k) =>
      ["name", "email", "picture"].includes(k),
    );
    expect(piiKeys).toEqual([]);
  });
});

describe("GDPR-JWT minimisation — session callback (edge baseline)", () => {
  it("exposes session.user.id from token.id", async () => {
    const result = (await callSession({
      session: { user: {} },
      token: { id: "user-123" },
    })) as unknown as { user: Record<string, unknown> };

    expect(result.user.id).toBe("user-123");
  });

  it("falls back to token.sub when token.id is absent", async () => {
    const result = (await callSession({
      session: { user: {} },
      token: { sub: "user-sub-456" },
    })) as unknown as { user: Record<string, unknown> };

    expect(result.user.id).toBe("user-sub-456");
  });

  it("does not read name/email from the token (they are not in the JWT)", async () => {
    // Even if a token somehow carried name/email, the edge session callback
    // must not surface them — the id is the only thing it trusts from the token.
    const result = (await callSession({
      session: { user: {} },
      token: { id: "user-123", name: "ShouldNotLeak", email: "leak@x.com" },
    })) as unknown as { user: Record<string, unknown> };

    expect(result.user.id).toBe("user-123");
    expect(result.user.name).toBeUndefined();
    expect(result.user.email).toBeUndefined();
  });
});
