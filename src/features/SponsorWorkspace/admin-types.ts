export type SponsorAdministration = {
  organizations: { id: string; name: string; active: boolean }[];
  contacts: { id: string; organization_id: string; name: string; email: string; active: boolean }[];
  agreements: { id: string; organization_id: string; tier: string; starts_at: string; ends_at: string; revoked_at: string | null }[];
};
export type SponsorTransport = <T>(action: string, options?: RequestInit & { query?: Record<string, string> }) => Promise<T>;
