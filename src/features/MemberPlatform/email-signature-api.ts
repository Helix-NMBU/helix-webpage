import { memberSessionToken } from "../MemberCV/session";
import { defaultSignatureSettings, parseSignatureSettings, renderSignature, type SignatureSettings, type SignatureSnapshot } from "./email-signature";
import { isLocalMemberMode, localMemberAccount, localMemberSignedIn } from "./local-mode";

let localSnapshot = { settings: structuredClone(defaultSignatureSettings), revision: 0 };

export async function emailSignatureRequest(owner: { current: string | null }, change?: { settings: SignatureSettings; revision: number }): Promise<SignatureSnapshot> {
  if (isLocalMemberMode() && localMemberSignedIn()) {
    if (change) {
      if (change.revision !== localSnapshot.revision) throw new Error("The signature changed in another session. Reload it before saving again.");
      localSnapshot = { settings: parseSignatureSettings(change.settings), revision: change.revision + 1 };
    }
    const member = { ...localMemberAccount, role: localMemberAccount.helixRole ?? "", phone: "+47 12345678" };
    return { ...structuredClone(localSnapshot), signature: renderSignature(localSnapshot.settings, member), member };
  }
  const token = await memberSessionToken(owner);
  const response = await fetch("/api/gmail?action=signature", {
    method: change ? "POST" : "GET", cache: "no-store", credentials: "include",
    headers: { Authorization: `Bearer ${token}`, ...(change ? { "Content-Type": "application/json" } : {}) },
    ...(change ? { body: JSON.stringify(change) } : {}),
  });
  const body = await response.json().catch(() => null) as (SignatureSnapshot & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error || "Could not load email signature settings.");
  return { ...body, settings: parseSignatureSettings(body.settings) };
}
