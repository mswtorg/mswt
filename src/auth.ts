import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { activeUser } from "@/lib/auth/login";
import { authSecret, readSignedValue } from "@/lib/auth/signed";
import type { AdminRole } from "@/lib/admin/permissions";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: AdminRole } & DefaultSession["user"];
  }
  interface User {
    role?: AdminRole;
    sessionVersion?: number;
  }
}

/** Issued by the 2FA step; the only thing the credentials provider accepts. Valid for 60 s. */
export const SIGN_IN_TICKET = "admin-sign-in";
export type SignInTicket = { uid: string; sv: number };

/** Signed out after this long without a request (owner decision 2026-10-29: 2 hours, was 30 minutes). */
export const IDLE_TIMEOUT_S = 2 * 60 * 60;

// Admin sessions (SEC-09): password + TOTP happen in our own server actions; Auth.js only turns a
// fresh signed ticket into a 2-hour (idle) JWT session and re-checks the user on every request.
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret(),
  trustHost: true,
  basePath: "/api/auth",
  pages: { signIn: "/admin/login", error: "/admin/login" },
  session: { strategy: "jwt", maxAge: IDLE_TIMEOUT_S, updateAge: 60 },
  providers: [
    Credentials({
      credentials: { ticket: {} },
      async authorize(credentials) {
        const ticket = readSignedValue<SignInTicket>(SIGN_IN_TICKET, String(credentials?.ticket ?? ""));
        if (!ticket) return null;
        const user = await activeUser(ticket.uid, ticket.sv);
        if (!user) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.sv = user.sessionVersion;
      }
      if (typeof token.uid !== "string" || typeof token.sv !== "number") return null;
      // Deactivated, reset or 2FA-reset users lose their session immediately.
      const current = await activeUser(token.uid, token.sv);
      if (!current) return null;
      token.role = current.role;
      token.name = current.name;
      token.email = current.email;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.role = token.role as AdminRole;
      return session;
    },
  },
});
