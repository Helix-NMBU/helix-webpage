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
  { label: "Get in Touch", to: "/contact" },
  { label: "Sponsorportal", to: "/sponsorportal-login" },
];

export const appCtaLinks: NavLinkConfig[] = [
  { label: "Get in Touch", to: "/contact" },
  { label: "Sponsorportal", to: "/sponsorportal-login" },
];

export const knownRoutes = new Set([
  "/",
  "/sponsorpage",
  "/about",
  "/contact",
  "/garage",
  "/members",
  "/apply",
  "/sponsorportal-login",
  "/sponsorportal",
  "/cv-bank",
  "/cv-bank/login",
  "/cv-bank/profile",
]);

const hiddenChromePaths = new Set([
  "/sponsorportal",
  "/cv-bank",
  "/cv-bank/login",
  "/cv-bank/profile",
]);

export function hideChrome(pathname: string): boolean {
  return hiddenChromePaths.has(pathname);
}