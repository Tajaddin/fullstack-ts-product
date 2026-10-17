import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

// Shared by the proxy (no database) and the full Auth.js instance in auth.ts (with the Drizzle adapter).
// The dev login exists only outside production builds and only when AUTH_DEV_LOGIN=true.
export const devLoginEnabled = process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";
export const googleEnabled = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

const protectedPrefixes = ["/me", "/admin", "/groups/new"];

export const authConfig = {
  providers: [
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            authorization: { params: { prompt: "select_account" } },
          }),
        ]
      : []),
    ...(devLoginEnabled
      ? [
          Credentials({
            id: "dev",
            name: "Development login",
            credentials: {
              email: { label: "E-mail", type: "email" },
              name: { label: "Name", type: "text" },
            },
            async authorize(credentials) {
              const email = String(credentials?.email ?? "")
                .trim()
                .toLowerCase();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
              const name = String(credentials?.name ?? "").trim() || null;
              const [{ findOrCreateUserByEmail }, { db }] = await Promise.all([import("@/server/users"), import("@/db/client")]);
              const user = await findOrCreateUserByEmail(db(), email, name);
              return { id: user.id, email: user.email, name: user.name, image: user.image };
            },
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/signin" },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const needsUser = protectedPrefixes.some((p) => path === p || path.startsWith(`${p}/`));
      return needsUser ? !!auth?.user : true;
    },
  },
} satisfies NextAuthConfig;
