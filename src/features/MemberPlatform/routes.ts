import { isLocalMemberMode } from "./local-mode";

export function isMemberPlatformHost(hostname: string): boolean {
  return hostname.toLowerCase() === "internal.helixnmbu.no";
}

export function isMemberPlatform(origin = typeof window === "undefined" ? "https://helixnmbu.no" : window.location.origin): boolean {
  const hostname = new URL(origin).hostname;
  const memberPlatformPreview = import.meta.env.VITE_MEMBER_PLATFORM === "true" && (
    hostname.endsWith(".vercel.app")
    || (import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(hostname))
  );
  return isMemberPlatformHost(hostname) || isLocalMemberMode(origin) || memberPlatformPreview;
}

export function memberPaths(origin?: string) {
  return isMemberPlatform(origin) ? {
    home: "/", login: "/login", profile: "/profile",
  } : {
    home: "/member/profile", login: "/member/login", profile: "/member/profile",
  };
}
