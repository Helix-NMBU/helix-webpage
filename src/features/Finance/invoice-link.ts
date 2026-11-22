import type { ProjectBudgetInvoiceReference } from "./project-budget-types.js";

/** Store a file reference, never an arbitrary URL or a folder location. */
export function normalizeInvoiceDriveUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname !== "drive.google.com" || url.port || url.username || url.password || url.hash || [...url.searchParams.keys()].some(key => /token|authorization|session/i.test(key))) throw new Error();
    const fileId = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/(?:view|preview|edit))?\/?$/)?.[1]
      ?? (/^\/(?:open|uc)\/?$/.test(url.pathname) ? url.searchParams.get("id") : null);
    if (!fileId || !/^[A-Za-z0-9_-]{1,200}$/.test(fileId)) throw new Error();
    const resourceKey = url.searchParams.get("resourcekey");
    if (resourceKey && !/^[A-Za-z0-9_-]{1,200}$/.test(resourceKey)) throw new Error();
    return `https://drive.google.com/file/d/${fileId}/view${resourceKey ? `?resourcekey=${resourceKey}` : ""}`;
  } catch { throw new Error("Paste a Google Drive file link, rather than a folder or another website."); }
}
export function purchaseInvoiceReference(purchaseId: string, purchaseRef: string, viewerUrl: string): ProjectBudgetInvoiceReference {
  return { documentId: `purchase:${purchaseId}`, purchaseId, purchaseRef, originalName: "Linked invoice", backend: "google_drive", transferStatus: "stored", transferRevision: null, canRetry: false, viewerUrl };
}
