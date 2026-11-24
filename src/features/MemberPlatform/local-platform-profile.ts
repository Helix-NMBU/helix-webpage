import { isLocalMemberMode, localMemberSignedIn } from "./local-mode";
import { isPlatformTesterPreview } from "./local-member-profile-selection";

/** Synthetic access for the dedicated signed-in loopback session only. */
export function isLocalPlatformTester(): boolean {
  return isLocalMemberMode() && localMemberSignedIn() && isPlatformTesterPreview(true);
}
