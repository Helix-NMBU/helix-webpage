import { readableProfileDate } from "../../src/features/MemberCV/profile-inputs.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFName, PDFString, rgb, type Color, type PDFFont, type PDFPage } from "pdf-lib";
import { sharedCvData } from "../../src/features/MemberCV/model.js";
import { groupExperience } from "../../src/features/MemberCV/experience.js";
import type { CvData, CvSharing } from "../../src/features/MemberCV/types.js";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 64;
const BOTTOM = 48;
const WIDTH = PAGE_WIDTH - 2 * MARGIN;
const BODY_SIZE = 10.5;
const NAVY = rgb(0, 0, 122 / 255);
const INK = rgb(0.08, 0.08, 0.08);
const WHITE = rgb(1, 1, 1);
const RULE = rgb(0.58, 0.58, 0.58);
const LEFT_WIDTH = 172;
const COLUMN_GAP = 30;
const RIGHT_X = MARGIN + LEFT_WIDTH + COLUMN_GAP;
const RIGHT_WIDTH = WIDTH - LEFT_WIDTH - COLUMN_GAP;

type Weight = "light" | "medium" | "bold";
type LayoutLine = { text: string; font: PDFFont; size: number; height: number; gap: number; url?: string };

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

function safeLink(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Invalid links never become active PDF actions. */ }
  return undefined;
}

/** Generate the same privacy-filtered CV for personal preview and publication. */
export async function generateCvPdf(data: CvData, sharing: CvSharing): Promise<Uint8Array> {
  const cv = sharedCvData(data, sharing);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const embedded = await Promise.all((await loadFonts()).map((bytes) => document.embedFont(bytes, { subset: true })));
  const fonts: Record<Weight, PDFFont> = { light: embedded[0], medium: embedded[1], bold: embedded[2] };
  const fallback: Record<Weight, PDFFont> = { light: embedded[3], medium: embedded[4], bold: embedded[4] };
  const characterSets = new Map(embedded.map((font) => [font, new Set(font.getCharacterSet())]));
  let page!: PDFPage;
  let y = 0;
  let whiteSection: string | undefined;
  const darkFooters = new Set<PDFPage>();

  function newPage(dark = false) {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    if (dark) {
      page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: NAVY });
      darkFooters.add(page);
    }
  }
  newPage();

  function fontFor(value: string, weight: Weight): PDFFont {
    const characters = [...value].filter((character) => character !== "\n");
    if (characters.every((character) => characterSets.get(fonts[weight])!.has(character.codePointAt(0)!))) return fonts[weight];
    for (const character of characters) {
      if (!characterSets.get(fallback[weight])!.has(character.codePointAt(0)!)) {
        throw new Error(`The CV font does not support ${character}. Please use supported text.`);
      }
    }
    // A paragraph uses one fallback font so mixed Latin/Greek/Cyrillic text
    // retains its shaping, wrapping and extraction order.
    return fallback[weight];
  }

  function layout(value: string, options: { weight?: Weight; size?: number; width?: number; gap?: number; url?: string } = {}): LayoutLine[] {
    if (!value.trim()) return [];
    const size = options.size ?? BODY_SIZE;
    const width = options.width ?? WIDTH;
    const result: LayoutLine[] = [];
    for (const paragraph of value.replace(/\r\n?/g, "\n").replace(/\t/g, " ").split("\n")) {
      const font = fontFor(paragraph, options.weight ?? "light");
      const push = (text: string) => result.push({ text, font, size, height: size * 1.42, gap: 0, url: options.url });
      let line = "";
      for (const word of paragraph.trim().split(/ +/)) {
        if (!word) continue;
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
        if (line) { push(line); line = ""; }
        for (const character of word) {
          if (line && font.widthOfTextAtSize(line + character, size) > width) { push(line); line = ""; }
          line += character;
        }
      }
      push(line);
    }
    result[result.length - 1].gap = options.gap ?? 4;
    return result;
  }

  function draw(line: LayoutLine, x: number, baseline: number, color: Color, rightAligned = false, width = WIDTH) {
    if (!line.text) return;
    const lineWidth = line.font.widthOfTextAtSize(line.text, line.size);
    const lineX = rightAligned ? x + width - lineWidth : x;
    page.drawText(line.text, { x: lineX, y: baseline, font: line.font, size: line.size, color });
    const target = line.url && safeLink(line.url);
    if (target) {
      const annotation = document.context.register(document.context.obj({
        Type: "Annot", Subtype: "Link", Rect: [lineX, baseline - 2, lineX + lineWidth, baseline + line.size],
        Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(target) },
      }));
      page.node.addAnnot(annotation);
    }
  }

  function heading(title: string, dark = false) {
    const color = dark ? WHITE : NAVY;
    const line = layout(title, { weight: "medium", size: 16, gap: 0 })[0];
    y -= line.height;
    draw(line, MARGIN, y, color);
    y -= 13;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.6, color: dark ? WHITE : RULE });
    y -= 18;
  }

  function whitePage() {
    newPage();
    if (whiteSection) heading(`${whiteSection} (forts.)`);
  }
  function ensureWhiteRoom(height: number) { if (y - height < BOTTOM) whitePage(); }

  function text(value: string, options: { weight?: Weight; size?: number; gap?: number; url?: string; color?: Color } = {}) {
    for (const line of layout(value, options)) {
      ensureWhiteRoom(line.height);
      y -= line.height;
      draw(line, MARGIN, y, options.color ?? INK);
      y -= line.gap;
    }
  }

  function section(title: string, render: () => void) {
    // Check before activating the new heading, so a page break never repeats
    // the previous section or leaves a heading without its first content line.
    whiteSection = undefined;
    ensureWhiteRoom(125);
    y -= 18;
    whiteSection = title;
    heading(title);
    render();
    whiteSection = undefined;
  }

  function column(lines: LayoutLine[], index: number, top: number, x: number, width: number, color: Color, rightAligned = false) {
    let cursor = top;
    let firstBaseline: number | undefined;
    while (index < lines.length && cursor - lines[index].height >= BOTTOM) {
      const line = lines[index++];
      cursor -= line.height;
      firstBaseline ??= cursor;
      draw(line, x, cursor, color, rightAligned, width);
      cursor -= line.gap;
    }
    return { index, y: cursor, firstBaseline };
  }

  function whiteColumns(left: LayoutLine[], right: LayoutLine[], leftWidth: number, rightWidth: number) {
    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < left.length || rightIndex < right.length) {
      ensureWhiteRoom(22);
      const leftResult = column(left, leftIndex, y, MARGIN, leftWidth, INK);
      const rightResult = column(right, rightIndex, y, PAGE_WIDTH - MARGIN - rightWidth, rightWidth, INK, true);
      y = Math.min(leftResult.y, rightResult.y);
      leftIndex = leftResult.index;
      rightIndex = rightResult.index;
      if (leftIndex < left.length || rightIndex < right.length) whitePage();
    }
  }

  const hasContent = (values: (string | undefined)[]) => values.some((value) => typeof value === "string" && value.trim());
  const label = (name: string, value?: string) => value?.trim() ? `${name}: ${value}` : "";
  const period = (start?: string, end?: string) => [start, end].filter((value): value is string => Boolean(value)).map((value) => value === "Present" ? "Nå" : readableProfileDate(value)).join(" - ");

  // The reference's portrait is deferred. Introduction uses the available width.
  const contactWidth = 180;
  const headline = layout(cv.headline, { weight: "medium", size: 14, width: WIDTH - contactWidth - 20 });
  const contacts = [cv.contactEmail, cv.phone, cv.city].flatMap((value) => layout(value, { size: 10, width: contactWidth, gap: 1 }));
  if (headline.length || contacts.length) {
    // Both top columns use the template navy, including consent-filtered contacts.
    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < headline.length || rightIndex < contacts.length) {
      const leftResult = column(headline, leftIndex, y, MARGIN, WIDTH - contactWidth - 20, NAVY);
      const rightResult = column(contacts, rightIndex, y, PAGE_WIDTH - MARGIN - contactWidth, contactWidth, NAVY, true);
      y = Math.min(leftResult.y, rightResult.y);
      leftIndex = leftResult.index;
      rightIndex = rightResult.index;
      if (leftIndex < headline.length || rightIndex < contacts.length) whitePage();
    }
    y -= 21;
  }
  text(cv.fullName, { weight: "bold", size: 32, color: NAVY, gap: 12 });
  text(cv.summary, { gap: 9 });
  text([cv.fieldOfStudy, cv.graduationYear].filter(Boolean).join(" | "), { gap: 7 });

  const education = cv.education.filter((entry) => hasContent([entry.institution, entry.degree, entry.startDate, entry.endDate, entry.description, entry.fieldOfStudy, entry.grade, entry.activities]));
  if (education.length) section("Utdanning", () => {
    for (const entry of education) {
      ensureWhiteRoom(48);
      const dateWidth = 140;
      const degreeWidth = WIDTH - dateWidth - 20;
      whiteColumns([
        ...layout(entry.degree, { weight: "medium", size: 12, width: degreeWidth, gap: 3 }),
        ...layout(entry.institution, { width: degreeWidth }),
      ], layout(period(entry.startDate, entry.endDate), { width: dateWidth }), degreeWidth, dateWidth);
      text(label("Studieretning", entry.fieldOfStudy));
      text(label("Karakter", entry.grade));
      text(label("Aktiviteter", entry.activities));
      text(entry.description);
      y -= 17;
    }
  });

  const experience = cv.experience.filter((entry) => hasContent([entry.organization, entry.title, entry.startDate, entry.endDate, entry.description, entry.employmentType, entry.location, entry.locationType, entry.department, entry.season, entry.url]));
  const projects = cv.projects.filter((entry) => hasContent([entry.name, entry.role, entry.season, entry.description, entry.url, entry.startDate, entry.endDate]));
  const languages = cv.languages.filter((entry) => entry.name.trim() || entry.level.trim());
  const links = cv.links.filter((entry) => entry.label.trim() || entry.url.trim());
  const hasWhiteTail = Boolean(projects.length || languages.length || links.length || cv.references?.trim());

  if (experience.length) {
    whiteSection = undefined;
    // Start the band only when its heading and first role can share a page.
    if (y - 155 < BOTTOM) newPage(true);
    else {
      y -= 18;
      page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: y, color: NAVY });
      darkFooters.add(page);
      y -= 27;
    }
    heading("Erfaring", true);
    const experiencePage = () => { newPage(true); heading("Erfaring (forts.)", true); };
    const bounded = (value: string, width: number, size = BODY_SIZE): LayoutLine | undefined => {
      if (!value.trim()) return undefined;
      const normalized = value.trim().replace(/\s+/g, " ");
      const font = fontFor(normalized, "medium");
      let title = normalized;
      while (title && font.widthOfTextAtSize(`${title}${title === normalized ? "" : "..."} (forts.)`, size) > width) title = [...title].slice(0, -1).join("");
      return { text: `${title}${title === normalized ? "" : "..."} (forts.)`, font, size, height: size * 1.42, gap: 4 };
    };
    for (const group of groupExperience(experience)) {
      const connected = group.roles.length > 1;
      // A very long single title must not hide its organization until a later
      // page while the paired description has already started on this page.
      const separateOrganization = connected || layout(group.roles[0].title, { weight: "medium", size: 12, width: LEFT_WIDTH }).length > 3;
      const indent = connected ? 14 : 0;
      const leftX = MARGIN + indent;
      const leftWidth = LEFT_WIDTH - indent;
      const segments = new Map<PDFPage, { top: number; bottom: number; dots: number[] }>();
      const mark = (baseline: number, bottom: number) => {
        if (!connected) return;
        const dotY = baseline + 4;
        const segment = segments.get(page) ?? { top: dotY, bottom, dots: [] };
        segment.bottom = Math.min(segment.bottom, bottom);
        segment.dots.push(dotY);
        segments.set(page, segment);
      };
      if (y - 80 < BOTTOM) experiencePage();
      if (separateOrganization && group.organization) {
        const organization = layout(group.organization, { weight: "medium", size: 12, width: LEFT_WIDTH, gap: 7 });
        let index = 0;
        while (index < organization.length) {
          const result = column(organization, index, y, MARGIN, LEFT_WIDTH, WHITE);
          index = result.index;
          y = result.y;
          if (index < organization.length) experiencePage();
        }
      }
      for (const role of group.roles) {
        if (y - 64 < BOTTOM) {
          experiencePage();
          if (separateOrganization) {
            const context = bounded(group.organization, LEFT_WIDTH, 12);
            if (context) { y -= context.height; draw(context, MARGIN, y, WHITE); y -= context.gap; }
          }
        }
        const left = [
          ...layout(role.title, { weight: "medium", size: 12, width: leftWidth, gap: 3 }),
          ...(!separateOrganization ? layout(group.organization, { width: leftWidth, gap: 3 }) : []),
          ...layout(period(role.startDate, role.endDate), { size: 10, width: leftWidth }),
          ...layout([role.employmentType, role.location, role.locationType].filter(Boolean).join(" | "), { size: 10, width: leftWidth }),
          ...layout([label("Avdeling", role.department), label("Sesong", role.season)].filter(Boolean).join(" | "), { size: 10, width: leftWidth }),
        ];
        const right = [...layout(role.description, { width: RIGHT_WIDTH, gap: 7 }), ...layout(role.url ?? "", { width: RIGHT_WIDTH, url: role.url })];
        let leftIndex = 0;
        let rightIndex = 0;
        let continued = false;
        while (leftIndex < left.length || rightIndex < right.length) {
          const top = y;
          let leftTop = top;
          let marker: number | undefined;
          if (continued) {
            for (const context of [bounded(group.organization, leftWidth, 12), bounded(role.title, leftWidth, 12)]) {
              if (context) { leftTop -= context.height; draw(context, leftX, leftTop, WHITE); marker ??= leftTop; leftTop -= context.gap; }
            }
          }
          const leftResult = column(left, leftIndex, leftTop, leftX, leftWidth, WHITE);
          const rightResult = column(right, rightIndex, top, RIGHT_X, RIGHT_WIDTH, WHITE);
          y = Math.min(leftResult.y, rightResult.y);
          marker ??= leftResult.firstBaseline ?? rightResult.firstBaseline;
          if (marker !== undefined) mark(marker, y + 3);
          if (right.length) page.drawLine({ start: { x: RIGHT_X - COLUMN_GAP / 2, y: top - 3 }, end: { x: RIGHT_X - COLUMN_GAP / 2, y: y + 3 }, thickness: 0.55, color: WHITE });
          leftIndex = leftResult.index;
          rightIndex = rightResult.index;
          if (leftIndex < left.length || rightIndex < right.length) { experiencePage(); continued = true; }
        }
        y -= 22;
      }
      for (const [segmentPage, segment] of segments) {
        const x = MARGIN + 2;
        segmentPage.drawLine({ start: { x, y: segment.top }, end: { x, y: segment.bottom }, thickness: 0.65, color: rgb(0.75, 0.75, 0.9) });
        for (const baseline of segment.dots) segmentPage.drawCircle({ x, y: baseline, size: 2, color: WHITE });
      }
      y -= 9;
    }
    if (hasWhiteTail) {
      const boundary = y - 7;
      if (boundary - 140 < BOTTOM) newPage();
      else {
        // The band was painted first. Restore the white area only below the
        // finished roles, before any following white-section content is drawn.
        page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: boundary, color: WHITE });
        darkFooters.delete(page);
        y = boundary - 8;
      }
    }
  }

  if (projects.length) section("Prosjekter", () => {
    for (const entry of projects) {
      ensureWhiteRoom(48);
      text([entry.name, entry.role].filter(Boolean).join(" | "), { weight: "medium", size: 12 });
      text([entry.season, period(entry.startDate, entry.endDate)].filter(Boolean).join(" | "));
      text(entry.description);
      text(entry.url, { url: entry.url });
      y -= 15;
    }
  });
  if (languages.length) section("Språk", () => languages.forEach((entry) => text([entry.name, entry.level].filter(Boolean).join(" | "))));
  if (links.length) section("Lenker", () => links.forEach((entry) => {
    text(entry.label, { weight: "medium" });
    text(entry.url, { url: entry.url, gap: 9 });
  }));
  if (cv.references?.trim()) section("Referanser", () => text(cv.references!));

  for (const [index, pdfPage] of document.getPages().entries()) {
    const footer = `${index + 1} / ${document.getPageCount()}`;
    pdfPage.drawText(footer, { x: PAGE_WIDTH - MARGIN - fonts.light.widthOfTextAtSize(footer, 8), y: 26, font: fonts.light, size: 8, color: darkFooters.has(pdfPage) ? WHITE : RULE });
  }
  document.setTitle(cv.fullName ? `CV - ${cv.fullName}` : "CV");
  document.setProducer("Helix medlemsportal");
  document.setCreator("Helix medlemsportal");
  document.catalog.set(PDFName.of("Lang"), PDFString.of("nb-NO"));
  return document.save();
}
