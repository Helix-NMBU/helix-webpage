import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import pg from "pg";
import { MemberCvError } from "./member-cv-error.js";
import { withVerifyFullSsl } from "./pg-ssl.js";

export type GmailConnection = {
  email: string;
  connectedAt: string;
};

export interface GmailConnectionDb {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

let pool: pg.Pool | undefined;

function database(): GmailConnectionDb {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new MemberCvError(503, "Member portal server configuration is missing.");
  pool ??= new pg.Pool({ connectionString: withVerifyFullSsl(connectionString), max: 1 });
  return {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const result = await pool!.query(sql, params);
      return { rows: result.rows as T[] };
    },
  };
}

function encryptionKey(env: NodeJS.ProcessEnv): Buffer {
  const value = env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!value) throw new MemberCvError(503, "Gmail connection is not configured yet.");
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, "hex");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 32) return decoded;
  throw new MemberCvError(503, "Gmail connection is not configured yet.");
}

export function encryptRefreshToken(token: string, env: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptRefreshToken(value: string, env: NodeJS.ProcessEnv = process.env): string {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new MemberCvError(503, "Stored Gmail credentials are invalid.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(env), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new MemberCvError(503, "Stored Gmail credentials are invalid.");
  }
}

export function createGmailConnectionStore(
  db: GmailConnectionDb = database(),
  env: NodeJS.ProcessEnv = process.env,
) {
  return {
    async memberEmail(memberId: string): Promise<string | null> {
      const result = await db.query<{ email: string }>("select email from identity.members where id = $1", [memberId]);
      return result.rows[0]?.email ?? null;
    },
    async save(memberId: string, email: string, refreshToken: string, scope: string): Promise<void> {
      await db.query(
        `insert into identity.gmail_connections (member_id, gmail_email, refresh_token_ciphertext, granted_scope)
         values ($1, $2, $3, $4)
         on conflict (member_id) do update set gmail_email = excluded.gmail_email,
           refresh_token_ciphertext = excluded.refresh_token_ciphertext,
           granted_scope = excluded.granted_scope, updated_at = now()`,
        [memberId, email, encryptRefreshToken(refreshToken, env), scope],
      );
    },
    async read(memberId: string): Promise<GmailConnection | null> {
      const result = await db.query<{ gmail_email: string; connected_at: string }>(
        "select gmail_email, connected_at from identity.gmail_connections where member_id = $1",
        [memberId],
      );
      const row = result.rows[0];
      return row ? { email: row.gmail_email, connectedAt: row.connected_at } : null;
    },
    async readCredentials(memberId: string): Promise<{ email: string; refreshToken: string; scope: string } | null> {
      const result = await db.query<{ gmail_email: string; refresh_token_ciphertext: string; granted_scope: string }>(
        "select gmail_email, refresh_token_ciphertext, granted_scope from identity.gmail_connections where member_id = $1",
        [memberId],
      );
      const row = result.rows[0];
      return row ? {
        email: row.gmail_email,
        refreshToken: decryptRefreshToken(row.refresh_token_ciphertext, env),
        scope: row.granted_scope,
      } : null;
    },
    async disconnect(memberId: string): Promise<string | null> {
      const result = await db.query<{ refresh_token_ciphertext: string }>(
        "select refresh_token_ciphertext from identity.gmail_connections where member_id = $1",
        [memberId],
      );
      const refreshToken = result.rows[0] ? decryptRefreshToken(result.rows[0].refresh_token_ciphertext, env) : null;
      await db.query("delete from identity.gmail_connections where member_id = $1", [memberId]);
      return refreshToken;
    },
  };
}

export type GmailConnectionStore = ReturnType<typeof createGmailConnectionStore>;
