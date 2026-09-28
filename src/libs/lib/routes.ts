export type NavLinkConfig = {
  label: string;
  to: string;
};

export const desktopNavLinks: NavLinkConfig[] = [
  { label: "Home", to: "/" },
  { label: "The Garage", to: "/garage" },
  { label: "The Team", to: "/members" },
  { label: "Partners", to: "/sponsorpage" },
  { label: "Join Us", to: "/apply" },
];

export const mobilePrimaryNavLinks: NavLinkConfig[] = [
  { label: "The Garage", to: "/garage" },
  { label: "Partners", to: "/sponsorpage" },
];

export const mobileSecondaryNavLinks: NavLinkConfig[] = [
  { label: "Sponsor portal", to: "/portal/login" },
];

export const appCtaLinks: NavLinkConfig[] = [
  { label: "Sponsor portal", to: "/portal/login" },
];

export const knownRoutes = new Set([
  "/",
  "/sponsorpage",
  "/garage",
  "/members",
  "/apply",
  "/apply/form",
  "/sponsorportal-login",
  "/sponsorportal",
  "/portal",
  "/portal/login",
  "/portal/access-unavailable",
  "/cv-bank",
  "/cv-bank/login",
  "/cv-bank/profile",
  "/member/profile",
  "/member/opportunities",
  "/admin/sponsors",
  "/recruitment",
  "/recruitment/login",
]);

const hiddenChromePaths = new Set([
  "/sponsorportal",
  "/portal",
  "/portal/access-unavailable",
  "/recruitment",
  "/recruitment/login",
  "/cv-bank",
  "/cv-bank/login",
  "/cv-bank/profile",
  "/member/profile",
  "/member/opportunities",
  "/admin/sponsors",
]);

const hiddenNavbarOnlyPaths = new Set<string>([]);

const hiddenFooterOnlyPaths = new Set(["/portal/login"]);

export function hideFooter(pathname: string): boolean {
  return hiddenChromePaths.has(pathname) || hiddenFooterOnlyPaths.has(pathname);
}

export function hideNavbar(pathname: string): boolean {
  return hiddenChromePaths.has(pathname) || hiddenNavbarOnlyPaths.has(pathname);
}
