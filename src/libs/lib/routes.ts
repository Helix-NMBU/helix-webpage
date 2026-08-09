export type NavLinkConfig = {
  label: string;
  to: string;
};

export const desktopNavLinks: NavLinkConfig[] = [
  { label: "Home", to: "/" },
  { label: "Our Mission", to: "/about" },
  { label: "The Garage", to: "/garage" },
  { label: "The Team", to: "/members" },
  { label: "Partners", to: "/sponsorpage" },
  { label: "Join Us", to: "/apply" },
];

export const mobilePrimaryNavLinks: NavLinkConfig[] = [
  { label: "Our Mission", to: "/about" },
  { label: "The Garage", to: "/garage" },
  { label: "Partners", to: "/sponsorpage" },
];

export const mobileSecondaryNavLinks: NavLinkConfig[] = [
  { label: "Sponsorportal", to: "/sponsorportal-login" },
];

export const appCtaLinks: NavLinkConfig[] = [
  { label: "Sponsorportal", to: "/sponsorportal-login" },
];

export const knownRoutes = new Set([
  "/",
  "/sponsorpage",
  "/about",
  "/garage",
  "/members",
  "/apply",
  "/apply/form",
  "/sponsorportal-login",
  "/sponsorportal",
  "/cv-bank",
  "/cv-bank/login",
  "/cv-bank/profile",
  "/recruitment",
  "/recruitment/login",
]);

const hiddenChromePaths = new Set([
  "/sponsorportal",
  "/recruitment",
  "/recruitment/login",
  "/cv-bank",
  "/cv-bank/login",
  "/cv-bank/profile",
]);

const hiddenNavbarOnlyPaths = new Set([
  "/about",
]);

export function hideFooter(pathname: string): boolean {
  return hiddenChromePaths.has(pathname);
}

export function hideNavbar(pathname: string): boolean {
  return hiddenChromePaths.has(pathname) || hiddenNavbarOnlyPaths.has(pathname);
}