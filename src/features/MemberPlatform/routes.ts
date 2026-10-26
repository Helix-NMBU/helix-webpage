import { resolveAppHost } from "../../libs/lib/app-hosts";

export function isMemberPlatformHost(hostname: string): boolean {
  return resolveAppHost(hostname).application === "member";
}

export function isMemberPlatform(origin = typeof window === "undefined" ? "https://helixnmbu.no" : window.location.origin): boolean {
  try {
    return resolveAppHost(new URL(origin).hostname, {
      development: import.meta.env.DEV,
      mode: import.meta.env.MODE,
      memberPlatformPreview: import.meta.env.VITE_MEMBER_PLATFORM === "true",
    }).application === "member";
  } catch {
    return false;
  }
}

export function memberPaths(origin?: string) {
  return isMemberPlatform(origin) ? {
    home: "/", login: "/login", profile: "/profile",
  } : {
    home: "/member/profile", login: "/member/login", profile: "/member/profile",
  };
}
