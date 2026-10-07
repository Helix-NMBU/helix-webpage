export type UnsavedAction = "reload" | "logout";

/** Resolves every in-app confirmation, including cancellation during session cleanup. */
export function createUnsavedConfirmation(
  onRequest: (action: UnsavedAction | null) => void,
) {
  let pending: ((accepted: boolean) => void) | null = null;
  function finish(accepted: boolean) {
    const resolve = pending;
    pending = null;
    resolve?.(accepted);
  }
  return {
    request(action: UnsavedAction): Promise<boolean> {
      finish(false);
      return new Promise((resolve) => {
        pending = resolve;
        onRequest(action);
      });
    },
    resolve(accepted: boolean) {
      finish(accepted);
      onRequest(null);
    },
    dispose() {
      finish(false);
    },
  };
}
