import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { clientIp } from "@/lib/http";

vi.mock("@/server/session", () => ({ getCurrentUser: async () => null }));

const withHeaders = (headers: Record<string, string>) => new NextRequest("http://localhost:3100/api/v1/courses", { headers });

describe("clientIp", () => {
  it("uses the address Fly's proxy reports, not the client-written X-Forwarded-For", () => {
    // Fly appends the real address to whatever X-Forwarded-For the client sent.
    const spoofed = withHeaders({ "x-forwarded-for": "198.51.100.99, 203.0.113.5", "fly-client-ip": "203.0.113.5" });
    expect(clientIp(spoofed)).toBe("203.0.113.5");
    const rotated = withHeaders({ "x-forwarded-for": "198.51.100.100, 203.0.113.5", "fly-client-ip": "203.0.113.5" });
    expect(clientIp(rotated)).toBe(clientIp(spoofed));
  });

  it("puts requests without Fly in front into one bucket whatever they claim", () => {
    expect(clientIp(withHeaders({ "x-forwarded-for": "198.51.100.1" }))).toBe("local");
    expect(clientIp(withHeaders({ "x-real-ip": "198.51.100.2" }))).toBe("local");
    expect(clientIp(withHeaders({}))).toBe("local");
  });
});
