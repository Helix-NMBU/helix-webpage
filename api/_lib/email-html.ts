import sanitizeHtml from "sanitize-html";

/** Preserve email layout without carrying executable markup into an outgoing quote. */
export function sanitizeQuotedEmail(html: string): string {
  const dimensions = [/^(?:auto|0|\d+(?:\.\d+)?(?:px|em|rem|pt|%))(?:\s+(?:0|\d+(?:\.\d+)?(?:px|em|rem|pt|%))){0,3}$/i];
  const colors = [/^(?:#[\da-f]{3,8}|[a-z]+|rgba?\([\d.,%\s]+\))$/i];
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img"],
    allowedAttributes: {
      "*": ["style", "align", "dir", "width", "height", "valign", "role", "cellpadding", "cellspacing", "border"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "style"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        color: colors, "background-color": colors,
        width: dimensions, height: dimensions, "max-width": dimensions,
        margin: dimensions, padding: dimensions,
        "font-size": dimensions, "line-height": [/^[\d.]+(?:px|em|pt|%)?$/],
        "font-family": [/^[\w\s,'"-]+$/],
        "font-weight": [/^(?:normal|bold|[1-9]00)$/],
        "font-style": [/^(?:normal|italic)$/],
        "text-align": [/^(?:left|right|center|justify)$/],
        "text-decoration": [/^(?:none|underline|line-through)$/],
        "white-space": [/^(?:normal|pre-wrap|pre-line)$/],
        "border-collapse": [/^(?:collapse|separate)$/],
        "vertical-align": [/^(?:top|middle|bottom|baseline)$/],
        display: [/^(?:block|inline|inline-block|table|table-row|table-cell)$/],
      },
    },
  });
}
