import light from "../../../api/_lib/fonts/HelixCV-Light.ttf?url";
import medium from "../../../api/_lib/fonts/HelixCV-Medium.ttf?url";
import bold from "../../../api/_lib/fonts/HelixCV-Bold.ttf?url";
import fallback from "../../../api/_lib/fonts/NotoSans-Regular.ttf?url";
import fallbackBold from "../../../api/_lib/fonts/NotoSans-Bold.ttf?url";
import type { CvData, CvOutputLanguage, CvSharing } from "./types";

let fonts: Promise<Uint8Array[]> | undefined;
export async function generateBrowserCvPdf(data: CvData, sharing: CvSharing, language: CvOutputLanguage): Promise<Blob> {
  fonts ??= Promise.all([light, medium, bold, fallback, fallbackBold].map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not load your CV.");
    return new Uint8Array(await response.arrayBuffer());
  })).catch((failure: unknown) => { fonts = undefined; throw failure; });
  const { renderCvPdf } = await import("./pdf-renderer");
  const bytes = await renderCvPdf(data, sharing, await fonts, language);
  return new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" });
}
