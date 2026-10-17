import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Optimistic sign-in check for the pages that need a user (see authConfig.callbacks.authorized; Auth.js
// redirects to /signin when it fails). The real authorisation happens in the data access layer on every
// request. Security headers, including the Content-Security-Policy, are set in next.config.ts: the
// partially prerendered shell cannot carry a per-request nonce, so the policy is static.
export const proxy = NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|ico|webp|txt)).*)"],
};
