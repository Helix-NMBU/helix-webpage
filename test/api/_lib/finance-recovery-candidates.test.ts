import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { loadFinanceRecovery } from "../../../api/_lib/finance-recovery.js";
import { capabilitiesForProfiles } from "../../../src/features/Finance/access.js";
import type { CvDatabase } from "../../../api/_lib/member-cv-service.js";

it("lists only old unresolved and unreferenced candidates, without returning their keys", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create schema finance; create schema identity;
      create table identity.members (id uuid primary key, full_name text);
      create table finance.outbox (id uuid, event_type text, recipient_member_id uuid, status text, safe_error text, attempt_count integer, updated_at timestamptz, provider_message_id text);
      create table finance.outbox_attempts (outbox_id uuid, attempt_no integer, claimed_at timestamptz, provider_message_id text);
      create table finance.uploads (id uuid, member_id uuid, status text, commit_state text, created_at timestamptz, expires_at timestamptz, purchase_id uuid, staging_key text, final_key text);
      create table finance.documents (storage_key text);
      create table finance.upload_final_candidates (upload_id uuid, storage_key text, status text, created_at timestamptz, last_cleaned_at timestamptz);
      create function finance.upload_is_referenced(u finance.uploads) returns boolean language sql as $$ select u.purchase_id is not null $$;
      insert into identity.members values ('11111111-1111-4111-8111-111111111111', 'Example');
      insert into finance.uploads values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'finalized', 'settled', now(), now(), '33333333-3333-4333-8333-333333333333', 'private-staging', 'published-key');
      insert into finance.upload_final_candidates values
        ('22222222-2222-4222-8222-222222222222', 'orphan-key', 'pending', now() - interval '25 hours', null),
        ('22222222-2222-4222-8222-222222222222', 'young-key', 'pending', now(), null),
        ('22222222-2222-4222-8222-222222222222', 'published-key', 'pending', now() - interval '25 hours', null),
        ('22222222-2222-4222-8222-222222222222', 'already-cleaned-key', 'cleanup', now() - interval '25 hours', now());
    `);
    const db: CvDatabase = { query: async <T>(query: string, params?: unknown[]) => ({ rows: (await pg.query<T>(query, params)).rows }) };
    const result = await loadFinanceRecovery(db, { memberId: "11111111-1111-4111-8111-111111111111", seasonCode: "S27", viewVersion: 1, capabilities: capabilitiesForProfiles(["finance"]) });
    expect(result.uploads).toHaveLength(1);
    expect(result.uploads[0]).toMatchObject({ referenced: true, candidateCount: 1 });
    expect(JSON.stringify(result)).not.toContain("orphan-key");
    expect(JSON.stringify(result)).not.toContain("private-staging");
  } finally { await pg.close(); }
});
