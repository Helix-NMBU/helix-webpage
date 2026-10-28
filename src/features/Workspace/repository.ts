import { memberLoadFailure, memberSessionToken } from "../MemberCV/session";
import { CvRequestError } from "../MemberCV/repository";
import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import type {
  MemberChange,
  WorkspaceDirectory,
  WorkspaceRepository,
} from "./types";
import type { ProjectMutation } from "../ProjectManagement/types";
export class WorkspaceRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function createWorkspaceRepository(
  token?: () => Promise<string>,
  request: typeof fetch = fetch,
): WorkspaceRepository {
  const owner = { current: null as string | null };
  async function call(
    change?: MemberChange | ProjectMutation | { action: "save_space_order"; order: string[] },
  ): Promise<WorkspaceDirectory> {
    let accessToken: string;
    try {
      accessToken = await (token ?? (() => memberSessionToken(owner)))();
    } catch (error) {
      if (error instanceof CvRequestError)
        throw new WorkspaceRequestError(
          error.message,
          [401, 403].includes(error.status) ? 401 : error.status,
        );
      throw error;
    }
    const response = await request("/api/member-login?__module=workspace", {
      method: change ? "POST" : "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(change ? { "Content-Type": "application/json" } : {}),
      },
      ...(change ? { body: JSON.stringify(change) } : {}),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof body.error === "string"
          ? body.error
          : "Could not load workspace. Try again.";
      if (response.status === 401)
        memberLoadFailure(new CvRequestError(message, 401));
      throw new WorkspaceRequestError(message, response.status);
    }
    return body as WorkspaceDirectory;
  }
  return { load: () => call(), saveMember: call, saveProject: call, saveSpaceOrder: order => call({ action: "save_space_order", order }) };
}
export async function workspaceRepository(): Promise<WorkspaceRepository> {
  return isLocalMemberMode()
    ? (await import("./local-repository")).createLocalWorkspaceRepository()
    : createWorkspaceRepository();
}
