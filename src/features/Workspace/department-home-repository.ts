import { memberLoadFailure, memberSessionToken } from "../MemberCV/session";
import { CvRequestError } from "../MemberCV/repository";
import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import { WorkspaceRequestError } from "./repository";
import type { DepartmentHome, DepartmentHomeChange } from "./department-home";
export interface DepartmentHomeRepository {
  load(id: string): Promise<DepartmentHome>;
  save(change: DepartmentHomeChange): Promise<DepartmentHome>;
}
export function createDepartmentHomeRepository(
  token?: () => Promise<string>,
  request: typeof fetch = fetch,
): DepartmentHomeRepository {
  const owner = { current: null as string | null };
  async function call(
    id: string,
    change?: DepartmentHomeChange,
  ): Promise<DepartmentHome> {
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
    const response = await request(
      `/api/member-login?__module=workspace&department=${encodeURIComponent(id)}`,
      {
        method: change ? "POST" : "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(change ? { "Content-Type": "application/json" } : {}),
        },
        ...(change ? { body: JSON.stringify(change) } : {}),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof body.error === "string"
          ? body.error
          : "Could not load the department workspace. Try again.";
      if (response.status === 401)
        memberLoadFailure(new CvRequestError(message, 401));
      throw new WorkspaceRequestError(message, response.status);
    }
    return body as DepartmentHome;
  }
  return {
    load: (id) => call(id),
    save: (change) => call(change.departmentId, change),
  };
}
export async function departmentHomeRepository(): Promise<DepartmentHomeRepository> {
  return isLocalMemberMode()
    ? (
        await import("./local-department-home")
      ).createLocalDepartmentHomeRepository()
    : createDepartmentHomeRepository();
}
