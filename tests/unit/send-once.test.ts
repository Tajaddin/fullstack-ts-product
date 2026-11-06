import type { Job } from "bullmq";
import { describe, expect, it } from "vitest";
import type { Mail } from "@/lib/email";
import { sendOnce, type Outgoing } from "@/worker/index";

// The part of a BullMQ job sendOnce uses; BullMQ keeps progress in Redis between attempts.
function job(): Pick<Job, "progress" | "updateProgress"> {
  const j: Pick<Job, "progress" | "updateProgress"> = {
    progress: 0,
    updateProgress: async (p) => {
      j.progress = p;
    },
  };
  return j;
}

const outgoing = (...who: string[]): Outgoing[] =>
  who.map((w) => ({ userId: w, mail: { to: `${w}@example.edu`, subject: "s", text: "t", kind: "reminder" } }));

describe("sendOnce", () => {
  it("retries only the addresses that failed, and a failure does not stop the ones after it", async () => {
    const delivered: string[] = [];
    let bFails = true;
    const send = async (mail: Mail) => {
      if (mail.to === "b@example.edu" && bFails) throw new Error("451 try again later");
      delivered.push(mail.to);
    };
    const j = job();
    const mails = outgoing("a", "b", "c");

    await expect(sendOnce(j, mails, send)).rejects.toThrow("1 of 3 e-mails failed");
    expect(delivered).toEqual(["a@example.edu", "c@example.edu"]);

    bFails = false;
    expect(await sendOnce(j, mails, send)).toBe(1);
    expect(delivered).toEqual(["a@example.edu", "c@example.edu", "b@example.edu"]);

    // A further attempt has nobody left to mail.
    expect(await sendOnce(j, mails, send)).toBe(0);
    expect(delivered).toHaveLength(3);
  });
});
