export type CvPreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; url: string; name: string };

type Download = (
  path: string,
) => Promise<{ data: Blob | null; error: unknown }>;
type ObjectUrls = Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;

/** Keeps an authenticated file fetch local to the viewer's lifetime. */
export function createAuthenticatedCvViewer(
  download: Download,
  onState: (state: CvPreviewState) => void,
  urls: ObjectUrls = URL,
) {
  let request = 0;
  let objectUrl: string | null = null;
  function cancel() {
    request += 1;
    if (objectUrl) urls.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  return {
    clear() {
      cancel();
      onState({ status: "idle" });
    },
    dispose: cancel,
    async open(path: string, name: string): Promise<boolean> {
      cancel();
      const current = request;
      onState({ status: "loading" });
      try {
        // The downloader must use Storage.download with the current authenticated session.
        const { data, error } = await download(path);
        if (request !== current) return false;
        if (error || !data) throw new Error("CV access was denied.");
        objectUrl = urls.createObjectURL(data);
        onState({ status: "ready", url: objectUrl, name });
        return true;
      } catch {
        if (request === current)
          onState({
            status: "error",
            message:
              "Could not open this CV. Your sponsor agreement or this member's sharing choices may have changed. Try again to check access.",
          });
        return false;
      }
    },
  };
}
