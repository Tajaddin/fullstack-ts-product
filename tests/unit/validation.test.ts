import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  courseCode,
  createGroupSchema,
  createMeetupSchema,
  createReportSchema,
  fieldErrors,
  listGroupsQuerySchema,
} from "@/lib/validation";

describe("course codes", () => {
  it("normalises spacing and case", () => {
    expect(courseCode.parse(" cop 4530 ")).toBe("COP4530");
    expect(courseCode.parse("MAC2311")).toBe("MAC2311");
    expect(courseCode.parse("cis 4930c")).toBe("CIS4930C");
  });
  it("rejects anything else", () => {
    for (const bad of ["COP", "4530", "COPX4530", "COP 45300", "", "drop table"]) {
      expect(courseCode.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("groups", () => {
  it("applies defaults and bounds", () => {
    const g = createGroupSchema.parse({ courseCode: "cop 4530", name: "Tuesday sets" });
    expect(g).toMatchObject({ courseCode: "COP4530", name: "Tuesday sets", capacity: 8, visibility: "public", description: "" });
    expect(createGroupSchema.safeParse({ courseCode: "COP4530", name: "ab" }).success).toBe(false);
    expect(createGroupSchema.safeParse({ courseCode: "COP4530", name: "Tuesday", capacity: 1 }).success).toBe(false);
    expect(createGroupSchema.safeParse({ courseCode: "COP4530", name: "Tuesday", capacity: 51 }).success).toBe(false);
    expect(createGroupSchema.parse({ courseCode: "COP4530", name: "Tuesday", capacity: "12" }).capacity).toBe(12);
  });
  it("list queries coerce paging", () => {
    expect(listGroupsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(listGroupsQuerySchema.parse({ page: "3", pageSize: "50", course: "cop 4530" })).toMatchObject({
      page: 3,
      pageSize: 50,
      course: "COP4530",
    });
    expect(listGroupsQuerySchema.safeParse({ pageSize: 51 }).success).toBe(false);
  });
});

describe("meetups", () => {
  const groupId = "6f1d3a2e-4b5c-4d6e-8f90-1a2b3c4d5e6f";
  it("parses an ISO instant and defaults the length", () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const m = createMeetupSchema.parse({ groupId, startsAt: soon, location: "LIB 207" });
    expect(m.startsAt).toBeInstanceOf(Date);
    expect(m.durationMinutes).toBe(60);
  });
  it("rejects the past, bad ids and absurd lengths", () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    expect(createMeetupSchema.safeParse({ groupId, startsAt: past, location: "LIB" }).success).toBe(false);
    expect(
      createMeetupSchema.safeParse({ groupId: "nope", startsAt: new Date(Date.now() + 1e6).toISOString(), location: "LIB" }).success,
    ).toBe(false);
    expect(createMeetupSchema.safeParse({ groupId, startsAt: "tomorrow", location: "LIB" }).success).toBe(false);
    expect(
      createMeetupSchema.safeParse({ groupId, startsAt: new Date(Date.now() + 1e6).toISOString(), location: "LIB", durationMinutes: 1000 })
        .success,
    ).toBe(false);
  });
});

describe("reports and errors", () => {
  it("needs a real reason", () => {
    expect(
      createReportSchema.safeParse({ targetType: "group", targetId: "6f1d3a2e-4b5c-4d6e-8f90-1a2b3c4d5e6f", reason: "bad" }).success,
    ).toBe(false);
  });
  it("flattens issues per field", () => {
    const r = createGroupSchema.safeParse({ courseCode: "x", name: "a", capacity: 0 });
    expect(r.success).toBe(false);
    const fields = fieldErrors((r as { error: ZodError }).error);
    expect(Object.keys(fields).sort()).toEqual(["capacity", "courseCode", "name"]);
  });
});
