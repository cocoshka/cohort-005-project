import { describe, it, expect } from "vitest";
import { requireCoursePermission } from "../guards.server";

// A signed-out Request carries no session cookie, so the guard settles it
// before reading any Course Permissions.
async function thrownBy(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (thrown) {
    return thrown;
  }
  throw new Error("expected the guard to throw");
}

describe("requireCoursePermission for a signed-out visitor", () => {
  it("redirects a page load to login, keeping the path and search to return to", async () => {
    const request = new Request(
      "http://localhost/courses/intro/lessons/3?tab=notes"
    );

    const thrown = await thrownBy(
      requireCoursePermission(request, 1, "viewContent")
    );

    expect(thrown).toBeInstanceOf(Response);
    const response = thrown as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/login?redirectTo=%2Fcourses%2Fintro%2Flessons%2F3%3Ftab%3Dnotes"
    );
  });

  it("refuses a form submission with 401 'You must be logged in.'", async () => {
    const request = new Request("http://localhost/courses/intro/lessons/3", {
      method: "POST",
      body: new URLSearchParams({ intent: "add-comment" }),
    });

    const thrown = await thrownBy(
      requireCoursePermission(request, 1, "viewContent")
    );

    expect(thrown).toMatchObject({
      init: { status: 401 },
      data: "You must be logged in.",
    });
  });
});
