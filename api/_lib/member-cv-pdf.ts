import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderCvPdf } from "../../src/features/MemberCV/pdf-renderer.js";
import type { CvData, CvSharing, CvOutputLanguage } from "../../src/features/MemberCV/types.js";

// Vercel includes api/_lib/fonts/*.ttf from the function's project root.
let fontBytes: Promise<Buffer[]> | undefined;
function loadFonts(): Promise<Buffer[]> {
  fontBytes ??= Promise.all([
    "HelixCV-Light.ttf", "HelixCV-Medium.ttf", "HelixCV-Bold.ttf", "NotoSans-Regular.ttf", "NotoSans-Bold.ttf",
  ].map((name) => readFile(join(process.cwd(), "api/_lib/fonts", name)))).catch((error: unknown) => {
    fontBytes = undefined;
    throw error;
  });
  return fontBytes;
}

export async function generateCvPdf(data: CvData, sharing: CvSharing, language: CvOutputLanguage = "nb"): Promise<Uint8Array> {
  return renderCvPdf(data, sharing, await loadFonts(), language);
}
