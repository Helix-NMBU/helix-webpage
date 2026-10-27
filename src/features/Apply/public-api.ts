// The public website and member platform deploy in separate Vercel projects.
// Use the configured member backend only on the production public domains.
export function publicWebsiteApiUrl(location = globalThis.location): string {
  return location?.protocol === "https:" && ["helixnmbu.no", "www.helixnmbu.no"].includes(location.hostname)
    ? "https://internal.helixnmbu.no/api/website"
    : "/api/website";
}
