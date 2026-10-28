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
// Keep recently visited departments in memory for the current member only.
// Never persist these records across sessions; authorization is checked on each miss.
const CACHE_MS = 15_000;
const homeCache = new Map<string, { data: DepartmentHome; expires: number }>();
const pending = new Map<string, Promise<DepartmentHome>>();
let cacheGeneration = 0;
export function clearDepartmentHomeCache() {
  cacheGeneration++;
  homeCache.clear();
  pending.clear();
}
export function cacheDepartmentHomeRepository(viewerId: string, repository: DepartmentHomeRepository): DepartmentHomeRepository {
  const keyFor = (id: string) => JSON.stringify([viewerId, id]);
  return {
    load(id) {
      const key = keyFor(id);
      const cached = homeCache.get(key);
      if (cached && cached.expires > Date.now()) return Promise.resolve(cached.data);
      homeCache.delete(key);
      const existing = pending.get(key);
      if (existing) return existing;
      const generation = cacheGeneration;
      const request = repository.load(id).then(data => {
        if (generation === cacheGeneration) homeCache.set(key, { data, expires: Date.now() + CACHE_MS });
        return data;
      }).catch(error => {
        if (generation === cacheGeneration && error instanceof WorkspaceRequestError && [401, 403].includes(error.status)) clearDepartmentHomeCache();
        throw error;
      }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
      pending.set(key, request);
      return request;
    },
    async save(change) {
      clearDepartmentHomeCache();
      const result = await repository.save(change);
      clearDepartmentHomeCache();
      return result;
    },
  };
}
export async function departmentHomeRepository(viewerId: string): Promise<DepartmentHomeRepository> {
  const repository = isLocalMemberMode()
    ? (await import("./local-department-home")).createLocalDepartmentHomeRepository()
    : createDepartmentHomeRepository();
  return cacheDepartmentHomeRepository(viewerId, repository);
}
