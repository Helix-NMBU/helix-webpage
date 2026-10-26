import { describe, expect, it, vi } from "vitest";
import { createWorkspaceRepository, WorkspaceRequestError } from "./repository";
import { directoryFixture } from "./fixtures.test-support";
import { isWorkspacePath } from "../ProjectManagement/routes";
describe("workspace API transport", () => {
  it("uses authenticated no-store requests to the existing consolidated member endpoint", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(directoryFixture()), { status: 200 }),
      );
    const repository = createWorkspaceRepository(
      async () => "test-token",
      request,
    );
    const data = await repository.load();
    expect(data.members).toHaveLength(2);
    expect(request).toHaveBeenCalledWith(
      "/api/member-login?__module=workspace",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: { Authorization: "Bearer test-token" },
      }),
    );
  });
  it("retains server errors without falling back to local records", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Admin required" }), {
        status: 403,
      }),
    );
    await expect(
      createWorkspaceRepository(async () => "verified", request).load(),
    ).rejects.toEqual(new WorkspaceRequestError("Admin required", 403));
  });
  it("allows only established workspace destinations through sign-in", () => {
    for (const path of [
      "/members",
      "/projects",
      "/departments",
      "/departments/software-and-autonomous",
      "/projects/10000000-0000-4000-8000-000000000001",
    ])
      expect(isWorkspacePath(path)).toBe(true);
    for (const path of [
      "//evil.invalid",
      "/departments/not-real",
      "/projects/not-real",
      "/members/other",
    ])
      expect(isWorkspacePath(path)).toBe(false);
  });
});
