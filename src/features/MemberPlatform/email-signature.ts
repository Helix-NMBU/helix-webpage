export type SignatureSettings = {
  enabled: boolean;
  logoUrl: string;
  logoAlt: string;
  lines: { text: string; color: string; fontSize?: number; fontWeight?: 400 | 700 }[];
  links: { label: string; url: string }[];
  linkColor: string;
  linkFontSize?: number;
  lineSpacing?: number;
};

export type SignatureMember = { name: string; email: string; role: string; phone: string };
export type RenderedSignature = { html: string; text: string };
export type SignatureSnapshot = { settings: SignatureSettings; revision: number; signature: RenderedSignature; member: SignatureMember };

export const defaultSignatureSettings: SignatureSettings = {
  enabled: false,
  logoUrl: "",
  logoAlt: "Helix NMBU",
  lines: [
    { text: "{member.name}", color: "#2334d6", fontSize: 32, fontWeight: 700 },
    { text: "Helix NMBU", color: "#080d4d", fontSize: 30, fontWeight: 700 },
    { text: "{member.role}", color: "#080d4d", fontSize: 24, fontWeight: 700 },
    { text: "Tlf: {member.phone}", color: "#222222", fontSize: 22, fontWeight: 400 },
  ],
  links: [
    { label: "Facebook", url: "https://www.facebook.com/profile.php?id=100091245669131" },
    { label: "Instagram", url: "https://instagram.com/helixnmbu" },
    { label: "LinkedIn", url: "https://www.linkedin.com/company/helix-nmbu" },
    { label: "Nettside", url: "https://helixnmbu.no" },
  ],
  linkColor: "#0000ee",
  linkFontSize: 20,
  lineSpacing: 4,
};

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function publicHttpsUrl(value: unknown, optional = false): string {
  if (optional && value === "") return "";
  if (typeof value !== "string" || value.length > 2000) throw new Error("Use a public HTTPS URL for the logo and links.");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) throw new Error();
    return url.href;
  } catch { throw new Error("Use a public HTTPS URL for the logo and links."); }
}

export function parseSignatureSettings(value: unknown): SignatureSettings {
  if (!value || typeof value !== "object") throw new Error("Check the signature settings.");
  const input = value as SignatureSettings;
  if (typeof input.enabled !== "boolean" || !Array.isArray(input.lines) || input.lines.length > 12 || !Array.isArray(input.links) || input.links.length > 8) throw new Error("Use up to 12 text lines and 8 links.");
  const color = (value: unknown) => {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error("Choose a six-digit hex color, such as #202124.");
    return value;
  };
  const text = (value: unknown, max: number) => {
    if (typeof value !== "string" || value.length > max || /[\r\n]/.test(value)) throw new Error(`Keep each signature field under ${max + 1} characters on one line.`);
    return value.trim();
  };
  const fontSize = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || Number(value) < 10 || Number(value) > 40) throw new Error("Choose a font size between 10 and 40 pixels.");
    return Number(value);
  };
  if (input.lineSpacing !== undefined && (!Number.isInteger(input.lineSpacing) || input.lineSpacing < 0 || input.lineSpacing > 16)) throw new Error("Choose line spacing between 0 and 16 pixels.");
  return {
    enabled: input.enabled,
    logoUrl: publicHttpsUrl(input.logoUrl, true),
    logoAlt: text(input.logoAlt, 150),
    linkColor: color(input.linkColor),
    linkFontSize: fontSize(input.linkFontSize, 14),
    lineSpacing: input.lineSpacing ?? 0,
    lines: input.lines.map((line) => {
      if (!line || typeof line !== "object") throw new Error("Check the signature text lines.");
      const template = text(line.text, 400);
      if (template.replace(/\{member\.(name|role|email|phone)\}/g, "").match(/[{}]/)) throw new Error("Use {member.name}, {member.role}, {member.email}, or {member.phone} in signature text.");
      if (line.fontWeight !== undefined && line.fontWeight !== 400 && line.fontWeight !== 700) throw new Error("Choose regular or bold signature text.");
      return { text: template, color: color(line.color), fontSize: fontSize(line.fontSize, 14), fontWeight: line.fontWeight ?? 400 };
    }),
    links: input.links.map((link) => {
      if (!link || typeof link !== "object") throw new Error("Check the signature links.");
      const label = text(link.label, 80);
      if (!label) throw new Error("Give each signature link a label.");
      return { label, url: publicHttpsUrl(link.url) };
    }),
  };
}

export function renderSignature(settings: SignatureSettings, member: SignatureMember): RenderedSignature {
  if (!settings.enabled) return { html: "", text: "" };
  const lines = settings.lines.filter((line) => !["role", "phone"].some((field) => line.text.includes(`{member.${field}}`) && !member[field as keyof SignatureMember]?.trim()))
    .map((line) => ({ ...line, text: line.text.replace(/\{member\.(name|role|email|phone)\}/g, (_, field: keyof SignatureMember) => member[field] ?? "").trim() })).filter((line) => line.text);
  const logo = settings.logoUrl ? `<td style="padding:0 16px 0 0;vertical-align:top"><img src="${escapeEmailHtml(settings.logoUrl)}" alt="${escapeEmailHtml(settings.logoAlt)}" width="88" style="display:block;width:88px;max-width:88px;height:auto;border:0"></td>` : "";
  const content = lines.map((line) => `<div style="margin:0 0 ${settings.lineSpacing ?? 0}px;color:${line.color};font-size:${line.fontSize ?? 14}px;font-weight:${line.fontWeight ?? 400};line-height:1.25">${escapeEmailHtml(line.text)}</div>`).join("");
  const links = settings.links.map((link) => `<a href="${escapeEmailHtml(link.url)}" style="color:${settings.linkColor};text-decoration:underline">${escapeEmailHtml(link.label)}</a>`).join(" | ");
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font:14px/1.35 Arial,sans-serif;color:#222222"><tbody><tr>${logo}<td style="padding:0;vertical-align:top">${content}${links ? `<div style="padding-top:4px;font-size:${settings.linkFontSize ?? 14}px;line-height:1.35">${links}</div>` : ""}</td></tr></tbody></table>`,
    text: [...lines.map((line) => line.text), ...settings.links.map((link) => `${link.label}: ${link.url}`)].join("\n"),
  };
}
