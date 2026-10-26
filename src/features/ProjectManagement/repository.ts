import { memberSessionToken } from "../MemberCV/session";
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
    if (!response.ok) throw new ProjectRequestError(typeof data.error === "string" ? data.error : "Could not load project management. Please try again.", response.status);
    return data as ProjectWorkspace;
  }
  return { load: () => call(), mutate: mutation => call(mutation) };
}

export async function projectRepository(): Promise<ProjectRepository> {
  if (isLocalMemberMode()) return (await import("./local-repository")).createLocalProjectRepository();
  return createProjectRepository();
}
