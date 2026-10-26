import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { contactEmailEnabled, createContactHandler } from "../../../api/_lib/contact-service.js";

let pg: PGlite;
const send = vi.fn(async () => undefined);
let database = vi.fn();
const input = { name: "Visitor", email: "visitor@example.test", subject: "Partnership", message: "Please contact me." };
beforeAll(async () => { pg = new PGlite(); await pg.exec(readFileSync("db/migrations/006_contact_messages.sql", "utf8")); });
afterAll(async () => { await pg.close(); });
beforeEach(async () => { await pg.exec("delete from website.contact_messages"); send.mockReset(); database = vi.fn(() => pg); });
async function request(body: unknown = input, enabled = false, method = "POST") {
  let status = 0; let response: unknown;
  const res = { setHeader: vi.fn(), status(n: number) { status = n; return res; }, json(value: unknown) { response = value; return res; } };
  await createContactHandler({ database, send, enabled })({ method, body } as VercelRequest, res as unknown as VercelResponse);
  return { status, response };
}
describe("Neon contact receipt", () => {
  it("persists locally with email disabled", async () => {
    expect(await request()).toMatchObject({ status: 201, response: { ok: true } });
    expect((await pg.query("select name,email,email_status from website.contact_messages")).rows).toEqual([{ name: "Visitor", email: "visitor@example.test", email_status: "skipped" }]);
    expect(send).not.toHaveBeenCalled();
  });
  it("retains a received message when delivery fails, avoiding duplicate resubmission", async () => {
    send.mockRejectedValueOnce(new Error("mail credential must never reach the browser"));
    expect((await request(input, true)).status).toBe(201);
    expect((await pg.query("select email_status from website.contact_messages")).rows).toEqual([{ email_status: "failed" }]);
  });
  it.each([null, [], { ...input, email: "bad" }, { ...input, message: "x".repeat(8001) }])("rejects malformed input before opening the database", async body => {
    expect((await request(body)).status).toBe(400); expect(database).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it("exposes no public read endpoint", async () => { expect((await request(null, false, "GET")).status).toBe(405); expect(database).not.toHaveBeenCalled(); });
  it("does not return infrastructure errors or report unsaved messages as received", async () => {
    database.mockImplementation(() => { throw new Error("postgres://private-password"); });
    expect(await request()).toEqual({ status: 503, response: { error: "Could not save your message. Please try again." } });
    expect(send).not.toHaveBeenCalled();
  });
});
describe("local email boundary", () => {
  const configured = { RESEND_API_KEY: "test-only", CONTACT_TO_EMAIL: "post@example.test", WEBSITE_EMAIL_ENABLED: "true" };
  it("requires explicit production mode or an approved local recipient", () => {
    expect(contactEmailEnabled(configured)).toBe(false);
    expect(contactEmailEnabled({ ...configured, HELIX_ENVIRONMENT: "local" })).toBe(false);
    expect(contactEmailEnabled({ ...configured, HELIX_ENVIRONMENT: "local", WEBSITE_EMAIL_TEST_RECIPIENTS: "someone@example.test" })).toBe(false);
    expect(contactEmailEnabled({ ...configured, HELIX_ENVIRONMENT: "local", WEBSITE_EMAIL_TEST_RECIPIENTS: "post@example.test" })).toBe(true);
    expect(contactEmailEnabled({ ...configured, HELIX_ENVIRONMENT: "production" })).toBe(true);
  });
});
