import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  outboxTransport,
  sendEachEmail,
  sendEmail,
  type Email,
  type MailTransport,
} from "./mailer.server";

describe("sendEmail", () => {
  it("writes the message to the outbox when there is no Postmark token", async () => {
    const directory = mkdtempSync(join(tmpdir(), "outbox-"));

    await sendEmail(
      { to: "liam@example.com", subject: "Hello", body: "Hi Liam" },
      outboxTransport(directory)
    );

    const files = readdirSync(directory);
    expect(files).toHaveLength(1);
    const written = JSON.parse(readFileSync(join(directory, files[0]), "utf8"));
    expect(written).toMatchObject({
      to: "liam@example.com",
      subject: "Hello",
      body: "Hi Liam",
    });
  });
});

describe("sendEachEmail", () => {
  it("sends every email even when one fails, and logs the failure instead of throwing", async () => {
    const sent: string[] = [];
    const transport: MailTransport = {
      async send(email: Email) {
        if (email.to === "broken@example.com") throw new Error("Rejected");
        sent.push(email.to);
      },
    };
    const logged: unknown[][] = [];

    await sendEachEmail(
      [
        { to: "broken@example.com", subject: "A", body: "A" },
        { to: "ana@example.com", subject: "B", body: "B" },
      ],
      transport,
      (...args) => logged.push(args)
    );

    expect(sent).toEqual(["ana@example.com"]);
    expect(logged).toHaveLength(1);
    expect(String(logged[0][0])).toContain("broken@example.com");
  });
});
