import { readableProfileDate } from "../../src/features/MemberCV/profile-inputs.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFName, PDFString, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sharedCvData } from "../../src/features/MemberCV/model.js";
import { groupExperience } from "../../src/features/MemberCV/experience.js";
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
  let pageContinuation: (() => void) | undefined;

  function newPage() {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }
  newPage();

  function ensureRoom(height: number) {
    if (y - height < BOTTOM) {
      newPage();
      pageContinuation?.();
    }
  }

  function lines(value: string, font: PDFFont, size: number, width = WIDTH): string[] {
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
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          line = candidate;
          continue;
        }
        if (line) { result.push(line); line = ""; }
        for (const character of word) {
          if (line && font.widthOfTextAtSize(line + character, size) > width) {
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

  function text(value: string, options: { bold?: boolean; size?: number; url?: string; gap?: number; indent?: number; onLine?: (lineY: number) => void } = {}) {
    if (!value.trim()) return;
    const font = options.bold ? bold : regular;
    const size = options.size ?? BODY_SIZE;
    const height = size === BODY_SIZE ? LINE_HEIGHT : size * 1.4;
    const x = MARGIN + (options.indent ?? 0);
    for (const line of lines(value, font, size, WIDTH - (options.indent ?? 0))) {
      ensureRoom(height);
      y -= height;
      if (!line) continue;
      page.drawText(line, { x, y, size, font, color: rgb(0.12, 0.12, 0.12) });
      options.onLine?.(y);
      const target = options.url && safeLink(options.url);
      if (target) {
        const annotation = document.context.register(document.context.obj({
          Type: "Annot", Subtype: "Link", Rect: [x, y - 2, x + font.widthOfTextAtSize(line, size), y + size],
          Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(target) },
        }));
        page.node.addAnnot(annotation);
      }
    }
    y -= options.gap ?? 3;
  }

  function section(title: string, render: () => void, minimumHeight = 90) {
    // Keep the heading with the beginning of its first entry on this page.
    ensureRoom(minimumHeight);
    y -= 13;
    text(title, { bold: true, size: 13, gap: 7 });
    render();
  }

  function entry(title: string, detail: string, description: string, url = "", extra: string[] = []) {
    ensureRoom(45);
    text(title, { bold: true });
    text(detail);
    extra.forEach((value) => text(value));
    text(description);
    text(url, { url });
    y -= 6;
  }

  text(cv.fullName, { bold: true, size: 25, gap: 6 });
  text(cv.headline, { size: 12 });
  text([cv.city, cv.contactEmail, cv.phone].filter(Boolean).join(" | "));
  text([cv.fieldOfStudy, cv.graduationYear].filter(Boolean).join(" | "));
  if (cv.summary.trim()) section("Om meg", () => text(cv.summary));

  const hasContent = (values: (string | undefined)[]) => values.some((value) => typeof value === "string" && value.trim());
  const label = (name: string, value?: string) => value?.trim() ? `${name}: ${value}` : "";
  const period = (start?: string, end?: string) => [start, end].filter((value): value is string => Boolean(value)).map((value) => value === "Present" ? "Nå" : readableProfileDate(value)).join(" - ");
  const education = cv.education.filter((e) => hasContent([e.institution, e.degree, e.startDate, e.endDate, e.description, e.fieldOfStudy, e.grade, e.activities]));
  if (education.length) section("Utdanning", () => education.forEach((e) => entry(
    [e.institution, e.degree].filter(Boolean).join(" | "),
    period(e.startDate, e.endDate), e.description, "",
    [label("Studieretning", e.fieldOfStudy), label("Karakter", e.grade), label("Aktiviteter", e.activities)],
  )));
  const experience = cv.experience.filter((e) => hasContent([e.organization, e.title, e.startDate, e.endDate, e.description, e.employmentType, e.location, e.locationType, e.department, e.season, e.url]));
  const experienceGroups = groupExperience(experience);
  const firstGroup = experienceGroups[0];
  const firstRole = firstGroup?.roles[0];
  const experienceHeadingRoom = firstRole ? 75
    + lines(firstGroup.organization, bold, 12).length * 16.8
    + (firstRole.title ? lines(firstRole.title, bold, BODY_SIZE, WIDTH - (firstGroup.roles.length > 1 ? 18 : 0)).length * LINE_HEIGHT : 0) : 90;
  if (experience.length) section("Erfaring", () => {
    for (const group of experienceGroups) {
      const connected = group.roles.length > 1;
      const indent = connected ? 18 : 0;
      // Each page gets its own segment. A connector never spans a page break
      // or extends into the next organization or Projects section.
      const segments = new Map<PDFPage, { top: number; bottom: number; dots: number[] }>();
      let markRole = false;
      const onLine = (lineY: number) => {
        if (!connected) return;
        const baseline = lineY + BODY_SIZE / 2;
        const segment = segments.get(page) ?? { top: baseline, bottom: baseline, dots: [] };
        segment.bottom = baseline;
        if (markRole) { segment.dots.push(baseline); markRole = false; }
        segments.set(page, segment);
      };
      const roleText = (value: string, options: { bold?: boolean; url?: string } = {}) => text(value, { ...options, indent, onLine });
      const organization = (continued = false) => {
        if (group.organization) text(`${group.organization}${continued ? " (forts.)" : ""}`, { bold: true, size: 12, gap: 5 });
      };
      const blockHeight = (value: string, font: PDFFont, size = BODY_SIZE, gap = 3, width = WIDTH - indent) => value.trim() ? lines(value, font, size, width).length * (size === BODY_SIZE ? LINE_HEIGHT : size * 1.4) + gap : 0;
      for (const [index, role] of group.roles.entries()) {
        pageContinuation = undefined;
        const previousPage = page;
        const organizationHeight = blockHeight(group.organization, bold, 12, 5, WIDTH);
        ensureRoom(organizationHeight + blockHeight(role.title, bold) + blockHeight(period(role.startDate, role.endDate), regular) + LINE_HEIGHT);
        if (index === 0 || page !== previousPage) organization(index > 0);
        markRole = true;
        roleText(role.title, { bold: true });
        pageContinuation = () => {
          organization(true);
          markRole = true;
          // Keep the individual position clear when its description spans pages.
          roleText(role.title ? `${role.title} (forts.)` : "", { bold: true });
        };
        roleText(period(role.startDate, role.endDate));
        roleText([role.employmentType, role.location, role.locationType].filter(Boolean).join(" | "));
        roleText([label("Avdeling", role.department), label("Sesong", role.season)].filter(Boolean).join(" | "));
        roleText(role.description);
        roleText(role.url ?? "", { url: role.url });
        pageContinuation = undefined;
        y -= 9;
      }
      for (const [segmentPage, segment] of segments) {
        const x = MARGIN + 5;
        const color = rgb(0.65, 0.65, 0.65);
        segmentPage.drawLine({ start: { x, y: segment.top }, end: { x, y: segment.bottom }, thickness: 0.8, color });
        for (const dotY of segment.dots) segmentPage.drawCircle({ x, y: dotY, size: 2.5, color });
      }
      y -= 3;
    }
  }, Math.max(90, experienceHeadingRoom));
  const projects = cv.projects.filter((e) => hasContent([e.name, e.role, e.season, e.description, e.url, e.startDate, e.endDate]));
  if (projects.length) section("Prosjekter", () => projects.forEach((e) => entry(
    [e.name, e.role].filter(Boolean).join(" | "),
    [e.season, period(e.startDate, e.endDate)].filter(Boolean).join(" | "), e.description, e.url,
  )));
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
