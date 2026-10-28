import { memberLoadFailure, memberSessionToken } from "../MemberCV/session";
import { CvRequestError } from "../MemberCV/repository";
import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import type { ProjectMutation, ProjectRepository, ProjectWorkspace } from "./types";

export class ProjectRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export function createProjectRepository(token?: () => Promise<string>, request: typeof fetch = fetch): ProjectRepository {
  const owner = { current: null as string | null };
  const getToken = token ?? (() => memberSessionToken(owner));
  async function call(mutation?: ProjectMutation): Promise<ProjectWorkspace> {
    let accessToken: string;
    try { accessToken = await getToken(); }
    catch (error) {
      if (error instanceof CvRequestError) throw new ProjectRequestError(error.message, [401, 403].includes(error.status) ? 401 : error.status);
      throw error;
    }
    const response = await request("/api/projects", {
      method: mutation ? "POST" : "GET", cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}`, ...(mutation ? { "Content-Type": "application/json" } : {}) },
      ...(mutation ? { body: JSON.stringify(mutation) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof data.error === "string" ? data.error : "Could not load season work. Please try again.";
      // A server-rejected JWT must also invalidate the cached signed-in landing,
      // or /login would redirect straight back into the same rejected session.
      if (response.status === 401) memberLoadFailure(new CvRequestError(message, 401));
      throw new ProjectRequestError(message, response.status);
    }
    return data as ProjectWorkspace;
  }
  return { load: () => call(), mutate: mutation => call(mutation) };
}

let cached: { data: ProjectWorkspace; at: number } | null = null;
let pending: Promise<ProjectWorkspace> | null = null;
let cacheGeneration = 0;
export function clearProjectWorkspaceCache() { cached = null; pending = null; cacheGeneration++; }
export async function projectRepository(): Promise<ProjectRepository> {
  const base = isLocalMemberMode() ? (await import("./local-repository")).createLocalProjectRepository() : createProjectRepository();
  return {
    load() {
      if (cached && Date.now() - cached.at < 30_000) return Promise.resolve(cached.data);
      if (pending) return pending;
      const generation = cacheGeneration;
      const request = base.load().then(data => { if (generation === cacheGeneration) cached = { data, at: Date.now() }; return data; }).finally(() => { if (pending === request) pending = null; });
      pending = request;
      return request;
    },
    async mutate(change) {
      clearProjectWorkspaceCache();
      const generation = cacheGeneration;
      const data = await base.mutate(change);
      if (generation === cacheGeneration) cached = { data, at: Date.now() };
      return data;
    },
  };
}
