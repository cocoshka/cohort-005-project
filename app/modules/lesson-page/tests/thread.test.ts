import { describe, it, expect } from "vitest";
import { markdown } from "~/lib/text";
import { renderThread, type ThreadComment } from "../thread.server";

function comment(
  id: number,
  body: string,
  overrides: Partial<ThreadComment> = {}
): ThreadComment {
  return {
    id,
    body: markdown(body),
    createdAt: "2026-11-24T12:00:00Z",
    editedAt: null,
    deleted: false,
    author: {
      id: 1,
      name: "Emma Wilson",
      avatarUrl: null,
      isInstructor: false,
      isPlatformAdmin: false,
    },
    replies: [],
    ...overrides,
  };
}

describe("renderThread", () => {
  it("renders each body to HTML and keeps the raw markdown for editing", async () => {
    const [rendered] = await renderThread([comment(1, "**hello**")]);

    expect(rendered.bodyHtml).toContain("<strong>hello</strong>");
    expect(rendered.body).toBe("**hello**");
  });

  it("renders replies under their question", async () => {
    const thread = [
      comment(1, "question", { replies: [comment(2, "*answer*")] }),
    ];

    const [rendered] = await renderThread(thread);

    expect(rendered.replies).toHaveLength(1);
    expect(rendered.replies[0].bodyHtml).toContain("<em>answer</em>");
  });

  it("strips raw HTML from an untrusted comment", async () => {
    const [rendered] = await renderThread([
      comment(1, '<script>alert("x")</script>hi'),
    ]);

    expect(rendered.bodyHtml).not.toContain("<script");
  });

  it("renders nothing for a deleted comment", async () => {
    const [rendered] = await renderThread([
      comment(1, "", { deleted: true, replies: [comment(2, "still here")] }),
    ]);

    expect(rendered.bodyHtml).toBe("");
    expect(rendered.replies[0].bodyHtml).toContain("still here");
  });
});
