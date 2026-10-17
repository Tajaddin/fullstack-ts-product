import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: ["/", "/courses", "/privacy"], disallow: ["/api/", "/admin", "/me", "/signin"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
