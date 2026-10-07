import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

/** A real local PostgreSQL engine; only Supabase-owned auth/storage schemas are emulated. */
export async function portalDatabase(includeCvMigration = true) {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb default '{}'::jsonb);
    create table auth.identities(id text primary key, user_id uuid references auth.users(id), provider text, identity_data jsonb);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
    create function auth.role() returns text language sql stable as
      $$ select auth.jwt()->>'role' $$;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null);
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated,service_role;
    grant select on storage.buckets to authenticated,service_role;
  `);
  // PGlite lacks pgcrypto; the base schema only uses built-in gen_random_uuid().
  const base = await readFile(new URL("../../supabase/sponsor-portal-v2.sql", import.meta.url), "utf8");
  await db.exec(base.replace("create extension if not exists pgcrypto;", ""));
  // Supabase's default public-schema grants. The feature migration must explicitly restrict them.
  await db.exec(`
    grant select,insert,update,delete on all tables in schema public to anon,authenticated,service_role;
    grant usage,select on all sequences in schema public to authenticated,service_role;
    alter default privileges in schema public grant select,insert,update,delete on tables to anon,authenticated,service_role;
  `);
  if (includeCvMigration) {
    await db.exec(await readFile(new URL("../../supabase/member-cv-portal.sql", import.meta.url), "utf8"));
  }
  return db;
}

export async function asUser(db: PGlite, id: string, email: string, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, email, role })]);
  if (role === "anon") await db.exec("set role anon");
  else if (role === "service_role") await db.exec("set role service_role");
  else await db.exec("set role authenticated");
}

export async function asOwner(db: PGlite) { await db.exec("reset role"); }
