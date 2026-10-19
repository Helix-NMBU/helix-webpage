import { MemberCvError } from "./member-cv-error.js";

const HELIX_EMAIL = /^[^\s@]+@helixnmbu\.no$/;
export const HELIX_HOSTED_DOMAIN = "helixnmbu.no";

export type WorkspaceProof = {
  email: string;
  emailVerified: boolean;
  hd: string | undefined;
  googleSub: string;
  accountSub: string;
  banned: boolean;
};

/** Server-side Workspace check. A client-supplied hd hint is never accepted here. */
export function assertFreshHelixGoogleAccount(proof: WorkspaceProof): void {
  const email = proof.email.toLowerCase();
  if (proof.banned || !proof.emailVerified || !HELIX_EMAIL.test(email) || proof.hd !== HELIX_HOSTED_DOMAIN) {
    throw new MemberCvError(403, "Use your verified @helixnmbu.no Google Workspace account.");
  }
  if (!proof.googleSub || proof.googleSub !== proof.accountSub) {
    throw new MemberCvError(403, "Google and member identities do not match.");
  }
}

/** Later requests keep the binding that was proved from a Google ID token. */
export function assertLinkedHelixAccount(proof: Omit<WorkspaceProof, "hd"> & { storedSub: string; storedEmail: string }): void {
  const email = proof.email.toLowerCase();
  if (proof.banned || !proof.emailVerified || !HELIX_EMAIL.test(email) || email !== proof.storedEmail.toLowerCase()) {
    throw new MemberCvError(403, "Use your verified @helixnmbu.no Google Workspace account.");
  }
  if (!proof.accountSub || proof.accountSub !== proof.storedSub || proof.googleSub !== proof.accountSub) {
    throw new MemberCvError(403, "Your Google identity no longer matches this profile. Log in with Helix Google again.");
  }
}
