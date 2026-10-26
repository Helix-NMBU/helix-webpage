import { useEffect, useMemo, useRef, useState } from "react";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function safeDocumentAttributes(element: Element, names: string[]): string {
  return names.flatMap((name) => {
    const value = element.getAttribute(name);
    return value === null ? [] : [`${name}="${escapeHtml(value)}"`];
  }).join(" ");
}

function sanitizeCss(css: string): string {
  return css
    .replace(/@import\s+(?:url\([^)]*\)|["'][^"']*["'])[^;]*;?/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/url\(\s*(['"]?)\s*(?:javascript|vbscript):[^)]*\)/gi, "url()")
    .replace(/(?:^|[;{])\s*(?:behavior|-moz-binding)\s*:[^;}]+;?/gi, "");
}

function emailDocument(html: string, plainText: string): string {
  const source = html.trim() || `<pre>${escapeHtml(plainText)}</pre>`;
  const parsed = new DOMParser().parseFromString(source, "text/html");
  parsed.querySelectorAll("script, iframe, frame, frameset, object, embed, form, input, button, textarea, select, option, link, meta, base, svg, math, video, audio, source, track, canvas, portal").forEach((element) => element.remove());
  parsed.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on") || ["srcdoc", "formaction", "xlink:href"].includes(name)) {
        element.removeAttribute(attribute.name);
      } else if (name === "style") {
        element.setAttribute(attribute.name, sanitizeCss(value));
      } else if (name === "href") {
        try {
          const url = new URL(value, window.location.origin);
          if (!["https:", "http:", "mailto:"].includes(url.protocol)) element.removeAttribute(attribute.name);
          else if (url.protocol === "http:" || url.protocol === "https:") {
            element.setAttribute("target", "_blank");
            element.setAttribute("rel", "noopener noreferrer");
          }
        } catch {
          element.removeAttribute(attribute.name);
        }
      } else if (name === "src" && element.tagName.toLowerCase() === "img") {
        try {
          const url = new URL(value, window.location.origin);
          if (url.protocol === "http:" || url.protocol === "https:") {
            element.setAttribute("src", url.href);
            element.setAttribute("referrerpolicy", "no-referrer");
            element.setAttribute("loading", "eager");
          } else if (url.protocol !== "data:" || !/^data:image\//i.test(value)) {
            element.removeAttribute("src");
          }
        } catch {
          element.removeAttribute("src");
        }
      } else if (["srcset", "background", "poster"].includes(name)) {
        element.removeAttribute(attribute.name);
      }
    }
  });

  const styles = [...parsed.querySelectorAll("style")].map((style) => {
    const css = sanitizeCss(style.textContent ?? "");
    return `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
  }).join("");
  const htmlAttributes = safeDocumentAttributes(parsed.documentElement, ["lang", "dir", "class"]);
  const bodyAttributes = safeDocumentAttributes(parsed.body, ["id", "lang", "dir", "class"]);
  const htmlStyle = `${sanitizeCss(parsed.documentElement.getAttribute("style") ?? "")};height:100%!important;overflow:hidden!important`;
  const bodyStyle = `${sanitizeCss(parsed.body.getAttribute("style") ?? "")};box-sizing:border-box;height:100%!important;max-height:100%;overflow-x:auto!important;overflow-y:auto!important;overscroll-behavior-y:contain!important`;
  const shellStyles = "html{height:100%;overflow:hidden}body{box-sizing:border-box;margin:0;padding:24px;color:#202124;font:14px/1.6 Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap;font:inherit}a{color:#1a73e8}";
  const scrollbarStyles = "body{scrollbar-width:thin;scrollbar-color:transparent transparent;transition:scrollbar-color .45s ease-out}body[data-scrolling='true']{scrollbar-color:color-mix(in srgb,#5f6368 65%,transparent) transparent}body::-webkit-scrollbar{width:8px;height:8px}body::-webkit-scrollbar-track{background:transparent}body::-webkit-scrollbar-thumb{background:transparent;border-radius:8px;transition:background-color .45s ease-out}body[data-scrolling='true']::-webkit-scrollbar-thumb{background:color-mix(in srgb,#5f6368 65%,transparent);transition-duration:120ms}";
  return `<!doctype html><html ${htmlAttributes} style="${escapeHtml(htmlStyle)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline';"><style>${shellStyles}</style>${styles}<style>${scrollbarStyles}</style></head><body ${bodyAttributes} style="${escapeHtml(bodyStyle)}">${parsed.body.innerHTML}</body></html>`;
}

export function EmailHtmlFrame({ html, plainText, fitContent = false }: { html: string; plainText: string; fitContent?: boolean }) {
  const srcDoc = useMemo(() => emailDocument(html, plainText), [html, plainText]);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const scrollIdleTimeout = useRef<number | null>(null);
  const [contentHeight, setContentHeight] = useState(160);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let scrollBody: HTMLElement | null = null;
    let contentObserver: ResizeObserver | null = null;
    const measureContent = () => {
      if (!fitContent || !scrollBody) return;
      const top = scrollBody.getBoundingClientRect().top;
      const bottom = Math.max(0, ...[...scrollBody.children].map((child) => child.getBoundingClientRect().bottom - top));
      const padding = Number.parseFloat(frame.contentWindow?.getComputedStyle(scrollBody).paddingBottom ?? "0") || 0;
      setContentHeight(Math.min(320, Math.max(96, Math.ceil(bottom + padding))));
    };
    const attachScrollListener = () => {
      contentObserver?.disconnect();
      scrollBody?.removeEventListener("scroll", handleScroll);
      scrollBody = frame.contentDocument?.body ?? null;
      scrollBody?.addEventListener("scroll", handleScroll, { passive: true });
      measureContent();
      if (fitContent && scrollBody && typeof ResizeObserver !== "undefined") {
        contentObserver = new ResizeObserver(measureContent);
        contentObserver.observe(scrollBody);
        for (const child of scrollBody.children) contentObserver.observe(child);
      }
    };
    const handleScroll = () => {
      if (!scrollBody) return;
      scrollBody.dataset.scrolling = "true";
      if (scrollIdleTimeout.current !== null) window.clearTimeout(scrollIdleTimeout.current);
      scrollIdleTimeout.current = window.setTimeout(() => {
        if (scrollBody) scrollBody.dataset.scrolling = "false";
        scrollIdleTimeout.current = null;
      }, 650);
    };
    frame.addEventListener("load", attachScrollListener);
    attachScrollListener();
    return () => {
      frame.removeEventListener("load", attachScrollListener);
      contentObserver?.disconnect();
      scrollBody?.removeEventListener("scroll", handleScroll);
      if (scrollIdleTimeout.current !== null) {
        window.clearTimeout(scrollIdleTimeout.current);
        scrollIdleTimeout.current = null;
      }
    };
  }, [srcDoc, fitContent]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={fitContent ? { height: contentHeight, flex: "none" } : undefined}>
      <iframe
        title="Email content"
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        ref={frameRef}
        srcDoc={srcDoc}
        className="h-full min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}
