import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMemberAccount } from "./MemberAccountContext";

const preferenceKeys: Array<[RegExp, readonly string[]]> = [
  [/^\/tasks\/?$/, ["view", "area", "status", "project", "milestone", "sort", "group", "completed", "columns", "search"]],
  [/^\/projects\/?$/, ["view", "department", "lead", "priority", "completion", "sort", "group", "scale", "columns", "search"]],
  [/^\/projects\/[^/]+\/?$/, ["view", "tab", "milestone", "status", "priority", "assignee", "completed", "sort", "group", "columns", "search", "collapsed"]],
  [/^\/departments\/[^/]+\/tasks\/?$/, ["view", "status", "priority", "assignee", "completed", "sort", "group", "columns", "search", "collapsed"]],
  [/^\/departments\/[^/]+\/projects\/?$/, ["view", "lead", "priority", "completion", "sort", "group", "scale", "columns", "search"]],
  [/^\/season-overview\/?$/, ["startEvent", "endEvent", "events", "overviewProjectColumns", "overviewMilestoneColumns"]],
  [/^\/departments\/?$/, ["search"]],
  [/^\/departments\/[^/]+\/?$/, ["tab"]],
];

function preferenceKey(user: string, path: string) {
  return `helix-member-view-preferences:${encodeURIComponent(user)}:${path}`;
}

function readPreferences(key: string) {
  try {
    const value = localStorage.getItem(key);
    return value ? new URLSearchParams(value) : new URLSearchParams();
  } catch {
    return new URLSearchParams();
  }
}

function writePreferences(
  key: string,
  params: URLSearchParams,
  allowed: readonly string[],
) {
  const saved = new URLSearchParams();
  for (const name of allowed) {
    for (const value of params.getAll(name)) saved.append(name, value);
  }
  try {
    if (saved.toString()) localStorage.setItem(key, saved.toString());
    else localStorage.removeItem(key);
  } catch {
    // Preferences still work for the current URL when browser storage is unavailable.
  }
}

/** Restores URL-backed filters and view options separately for each member and page. */
export function MemberPagePreferences() {
  const account = useMemberAccount();
  const location = useLocation();
  const navigate = useNavigate();
  const handledPath = useRef<string | null>(null);
  const user =
    account?.email.trim().toLowerCase() ||
    account?.name.trim().toLowerCase() ||
    "member";

  useEffect(() => {
    const allowed = preferenceKeys.find(([pattern]) =>
      pattern.test(location.pathname),
    )?.[1];
    if (!allowed) {
      handledPath.current = location.pathname;
      return;
    }

    const key = preferenceKey(user, location.pathname);
    const current = new URLSearchParams(location.search);
    const routeIdentity = `${user}:${location.pathname}`;
    if (handledPath.current !== routeIdentity) {
      handledPath.current = routeIdentity;
      const merged = readPreferences(key);
      for (const name of allowed) {
        if (current.has(name)) {
          merged.delete(name);
          for (const value of current.getAll(name)) merged.append(name, value);
        }
      }
      if (merged.toString() !== current.toString()) {
        navigate(
          {
            pathname: location.pathname,
            search: merged.toString() ? `?${merged}` : "",
            hash: location.hash,
          },
          { replace: true, state: location.state },
        );
        return;
      }
    }

    writePreferences(key, current, allowed);
  }, [location.hash, location.pathname, location.search, location.state, navigate, user]);

  return null;
}
