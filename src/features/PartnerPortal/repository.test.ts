import { describe, expect, it, vi } from "vitest";
import { createPartnerRepository } from "./repository";
import { PartnerRequestError } from "./session";

describe("partner HTTP repository", () => {
  it("fetches a fresh bearer token for each read and never caches download URLs", async () => {
    const token = vi.fn().mockResolvedValueOnce("jwt-one").mockResolvedValueOnce("jwt-two").mockResolvedValueOnce("jwt-three");
    const fetchImpl = vi.fn(async () => Response.json({}));
    const repository = createPartnerRepository(token, fetchImpl);
    await repository.session();
    await repository.directory("org");
    await repository.download("org", "member");
    expect(token).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls).toEqual([
      ["/api/partner?action=session", expect.objectContaining({ cache: "no-store", headers: { Authorization: "Bearer jwt-one" } })],
      ["/api/partner?action=directory&organizationId=org", expect.objectContaining({ headers: { Authorization: "Bearer jwt-two" } })],
      ["/api/partner?action=download&organizationId=org&memberId=member", expect.objectContaining({ headers: { Authorization: "Bearer jwt-three" } })],
    ]);
  });
  it.each([401, 403, 503])("preserves server status %s for access recovery", async (status) => {
    const repository = createPartnerRepository(async () => "jwt", async () => Response.json({ error: "Access unavailable." }, { status }));
    await expect(repository.directory("org")).rejects.toMatchObject({ status, message: "Access unavailable." });
  });
  it("does not call protected endpoints without a token", async () => {
    const fetchImpl = vi.fn();
    const repository = createPartnerRepository(async () => { throw new PartnerRequestError("Sign in.", 401); }, fetchImpl);
    await expect(repository.session()).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("handles network errors and malformed responses", async () => {
    await expect(createPartnerRepository(async () => "jwt", async () => { throw new Error("private host"); }).session()).rejects.toMatchObject({ status: 0 });
    await expect(createPartnerRepository(async () => "jwt", async () => new Response("invalid json")).session()).rejects.toMatchObject({ status: 503 });
  });
});
