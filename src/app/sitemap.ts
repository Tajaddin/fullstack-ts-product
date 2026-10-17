import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/courses`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
