import { describe, expect, it } from "vitest";
import type { Mail } from "@/lib/email";
import { sendOnce, type Outgoing, type SentLog } from "@/worker/index";

// In memory, as the Redis set is: survives between attempts, and records every write it is given.
function log(): SentLog & { writes: string[] } {
  const writes: string[] = [];
  return {
    writes,
    load: async () => [...new Set(writes)],
    add: async (userId) => {
      writes.push(userId);
    },
  };
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
    const sent = log();
    const mails = outgoing("a", "b", "c");

    await expect(sendOnce(sent, mails, send)).rejects.toThrow("1 of 3 e-mails failed");
    expect(delivered).toEqual(["a@example.edu", "c@example.edu"]);

    bFails = false;
    expect(await sendOnce(sent, mails, send)).toBe(1);
    expect(delivered).toEqual(["a@example.edu", "c@example.edu", "b@example.edu"]);

    // A further attempt has nobody left to mail.
    expect(await sendOnce(sent, mails, send)).toBe(0);
    expect(delivered).toHaveLength(3);

    // One write of one id per e-mail sent, never the list so far.
    expect(sent.writes).toEqual(["a", "c", "b"]);
  });
});
