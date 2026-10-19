export type TeamContact = {
  name: string;
  role: string;
  email: string;
  phone?: string;
  photo?: string;
};

// The Helix member sponsors reach out to, shown on the portal overview. Update when the role changes hands.
export const teamContact: TeamContact = {
  name: "Henrik Engdal",
  role: "Board Member",
  email: "henrik.engdal@helixnmbu.no",
  photo: "/portrettbilder/henrik_engdal.webp",
};
