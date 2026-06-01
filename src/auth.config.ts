import type { NextAuthConfig } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
    };
  }
}

declare module "@auth/core/jwt" {
  /**
   * GDPR Art. 5(1)(c) data minimisation: the persisted JWT carries ONLY the
   * user id. `name`/`email`/`picture` are intentionally absent from the token
   * payload (stripped in the `jwt` callback). Display fields are resolved from
   * the DB in the `session` callback override in src/auth.ts.
   */
  interface JWT {
    id?: string;
  }
}

export const authConfig = {
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  secret: process.env.AUTH_SECRET,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false;
      } else if (isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },
    async jwt({ token, user }) {
      // GDPR Art. 5(1)(c) data minimisation: the persisted JWT carries ONLY
      // the user id. NextAuth's default sign-in flow seeds the token with the
      // user's name/email/picture; we strip them so no PII is written into the
      // (client-readable, signed) JWT. Display fields are resolved from the DB
      // in the session callback (see src/auth.ts) where/when they are needed.
      if (user?.id) {
        token.id = user.id;
      }
      delete token.name;
      delete token.email;
      delete token.picture;
      return token;
    },
    async session({ session, token }) {
      // Edge-safe baseline: expose the id. The Node-runtime override in
      // src/auth.ts additionally resolves display fields (name/email) from the
      // DB so they never have to live in the JWT.
      const userId = (token.id as string) || token.sub;
      if (userId) {
        session.user.id = userId;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
