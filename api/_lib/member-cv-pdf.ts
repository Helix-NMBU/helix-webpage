import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFName, PDFString, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sharedCvData } from "../../src/features/MemberCV/model.js";
import type { CvData, CvSharing } from "../../src/features/MemberCV/types.js";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const BODY_SIZE = 10.5;
const LINE_HEIGHT = 15;
const BOTTOM = 56;
const WIDTH = PAGE_WIDTH - 2 * MARGIN;

// Vercel must include api/_lib/fonts/*.ttf in the member-cv function bundle.
// Read font files from the project root, including when Vercel bundles this module.
let fontBytes: Promise<[Buffer, Buffer]> | undefined;
function loadFonts(): Promise<[Buffer, Buffer]> {
  fontBytes ??= Promise.all([
    readFile(join(process.cwd(), "api/_lib/fonts/NotoSans-Regular.ttf")),
    readFile(join(process.cwd(), "api/_lib/fonts/NotoSans-Bold.ttf")),
  ]).catch((error: unknown) => {
    fontBytes = undefined;
    throw error;
  });
  return fontBytes;
}

function safeLink(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Invalid links are never turned into active PDF actions. */ }
  return undefined;
}

/** Generate the same privacy-filtered CV for personal preview and publication. */
export async function generateCvPdf(data: CvData, sharing: CvSharing): Promise<Uint8Array> {
  const cv = sharedCvData(data, sharing);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await loadFonts();
  const regular = await document.embedFont(regularBytes, { subset: true });
  const bold = await document.embedFont(boldBytes, { subset: true });
  const supported = new Set(regular.getCharacterSet());
  let page: PDFPage;
  let y: number;

  function newPage() {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }
  newPage();

  function ensureRoom(height: number) {
    if (y - height < BOTTOM) newPage();
  }

  function lines(value: string, font: PDFFont, size: number): string[] {
    const normalized = value.replace(/\r\n?/g, "\n").replace(/\t/g, " ");
    for (const character of normalized) {
      if (character !== "\n" && !supported.has(character.codePointAt(0)!)) {
        // Never replace member content with missing-glyph boxes or silently drop it.
        throw new Error(`The CV font does not support ${character}. Please use supported text.`);
      }
    }
    const result: string[] = [];
    for (const paragraph of normalized.split("\n")) {
      let line = "";
      for (const word of paragraph.trim().split(/ +/)) {
        if (!word) continue;
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= WIDTH) {
          line = candidate;
          continue;
        }
        if (line) { result.push(line); line = ""; }
        for (const character of word) {
          if (line && font.widthOfTextAtSize(line + character, size) > WIDTH) {
            result.push(line);
            line = "";
          }
          line += character;
        }
      }
      result.push(line);
    }
    return result;
  }

  function text(value: string, options: { bold?: boolean; size?: number; url?: string; gap?: number } = {}) {
    if (!value.trim()) return;
    const font = options.bold ? bold : regular;
    const size = options.size ?? BODY_SIZE;
    const height = size === BODY_SIZE ? LINE_HEIGHT : size * 1.4;
    for (const line of lines(value, font, size)) {
      ensureRoom(height);
      y -= height;
      if (!line) continue;
      page.drawText(line, { x: MARGIN, y, size, font, color: rgb(0.12, 0.12, 0.12) });
      const target = options.url && safeLink(options.url);
      if (target) {
        const annotation = document.context.register(document.context.obj({
          Type: "Annot", Subtype: "Link", Rect: [MARGIN, y - 2, MARGIN + font.widthOfTextAtSize(line, size), y + size],
          Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(target) },
        }));
        page.node.addAnnot(annotation);
      }
    }
    y -= options.gap ?? 3;
  }

  function section(title: string, render: () => void) {
    // Keep the heading with the beginning of its first entry on this page.
    ensureRoom(90);
    y -= 13;
    text(title, { bold: true, size: 13, gap: 7 });
    render();
  }

  function entry(title: string, detail: string, description: string, url = "") {
    ensureRoom(45);
    text(title, { bold: true });
    text(detail);
    text(description);
    text(url, { url });
    y -= 6;
  }

  text(cv.fullName, { bold: true, size: 25, gap: 6 });
  text(cv.headline, { size: 12 });
  text([cv.city, cv.contactEmail, cv.phone].filter(Boolean).join(" | "));
  text([cv.fieldOfStudy, cv.graduationYear].filter(Boolean).join(" | "));
  if (cv.summary.trim()) section("Om meg", () => text(cv.summary));

  const education = cv.education.filter((e) => [e.institution, e.degree, e.startDate, e.endDate, e.description].some((v) => v.trim()));
  if (education.length) section("Utdanning", () => education.forEach((e) => entry(
    [e.institution, e.degree].filter(Boolean).join(" | "),
    [e.startDate, e.endDate].filter(Boolean).join(" - "), e.description,
  )));
  const experience = cv.experience.filter((e) => [e.organization, e.title, e.startDate, e.endDate, e.description].some((v) => v.trim()));
  if (experience.length) section("Erfaring", () => experience.forEach((e) => entry(
    [e.title, e.organization].filter(Boolean).join(" | "),
    [e.startDate, e.endDate].filter(Boolean).join(" - "), e.description,
  )));
  const projects = cv.projects.filter((e) => [e.name, e.role, e.season, e.description, e.url].some((v) => v.trim()));
  if (projects.length) section("Helix og prosjekter", () => projects.forEach((e) => entry(
    [e.name, e.role].filter(Boolean).join(" | "), e.season, e.description, e.url,
  )));
  const skills = cv.skills.filter((v) => v.trim());
  if (skills.length) section("Ferdigheter", () => skills.forEach((skill) => text(skill)));
  const languages = cv.languages.filter((e) => e.name.trim() || e.level.trim());
  if (languages.length) section("Språk", () => languages.forEach((e) => text([e.name, e.level].filter(Boolean).join(" | "))));
  const links = cv.links.filter((e) => e.label.trim() || e.url.trim());
  if (links.length) section("Lenker", () => links.forEach((e) => {
    text(e.label, { bold: true });
    text(e.url, { url: e.url, gap: 7 });
  }));

  for (const [index, pdfPage] of document.getPages().entries()) {
    const footer = `${index + 1} / ${document.getPageCount()}`;
    pdfPage.drawText(footer, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(footer, 8), y: 29, font: regular, size: 8, color: rgb(0.4, 0.4, 0.4) });
  }
  // Explicit metadata contains no contacts from the source draft.
  document.setTitle(cv.fullName ? `CV - ${cv.fullName}` : "CV");
  document.setProducer("Helix medlemsportal");
  document.setCreator("Helix medlemsportal");
  document.catalog.set(PDFName.of("Lang"), PDFString.of("nb-NO"));
  return document.save();
}
