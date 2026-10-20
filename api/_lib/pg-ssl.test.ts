import { describe, expect, it } from "vitest";
import { withVerifyFullSsl } from "./pg-ssl.js";

describe("Postgres SSL mode", () => {
  it("rewrites weak sslmode values to verify-full and leaves other modes alone", () => {
    expect(withVerifyFullSsl("postgresql://user:secret@ep.neon.tech/neondb?sslmode=require")).toBe(
      "postgresql://user:secret@ep.neon.tech/neondb?sslmode=verify-full",
    );
    expect(withVerifyFullSsl("postgresql://user:secret@ep.neon.tech/neondb?sslmode=prefer&channel_binding=require")).toBe(
      "postgresql://user:secret@ep.neon.tech/neondb?sslmode=verify-full&channel_binding=require",
    );
    expect(withVerifyFullSsl("postgres://user:p%40ss@ep.neon.tech:5432/neondb?sslmode=verify-ca")).toBe(
      "postgres://user:p%40ss@ep.neon.tech:5432/neondb?sslmode=verify-full",
    );
    expect(withVerifyFullSsl("host=ep.neon.tech dbname=neondb sslmode=require")).toBe(
      "host=ep.neon.tech dbname=neondb sslmode=verify-full",
    );
    expect(withVerifyFullSsl("postgresql://user:secret@ep.neon.tech/neondb?sslmode=verify-full")).toBe(
      "postgresql://user:secret@ep.neon.tech/neondb?sslmode=verify-full",
    );
    expect(withVerifyFullSsl("postgresql://user:secret@ep.neon.tech/neondb?sslmode=disable")).toBe(
      "postgresql://user:secret@ep.neon.tech/neondb?sslmode=disable",
    );
    expect(withVerifyFullSsl("postgresql://user:secret@ep.neon.tech/neondb")).toBe(
      "postgresql://user:secret@ep.neon.tech/neondb",
    );
  });
});