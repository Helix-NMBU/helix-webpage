import { describe, expect, it, vi } from "vitest";
import { createUnsavedConfirmation } from "./confirmation";

describe("async unsaved-change confirmation", () => {
  it("waits for an explicit decision before allowing a destructive navigation action", async () => {
    const onRequest = vi.fn();
    const confirmation = createUnsavedConfirmation(onRequest);
    const action = vi.fn();
    const pending = confirmation.request("logout").then((accepted) => {
      if (accepted) action();
    });
    expect(onRequest).toHaveBeenLastCalledWith("logout");
    await Promise.resolve();
    expect(action).not.toHaveBeenCalled();
    confirmation.resolve(true);
    await pending;
    expect(action).toHaveBeenCalledTimes(1);
    expect(onRequest).toHaveBeenLastCalledWith(null);
  });
  it("keeps unsaved input when the dialog is canceled or dismissed", async () => {
    const confirmation = createUnsavedConfirmation(vi.fn());
    const reload = vi.fn();
    const pending = confirmation.request("reload").then((accepted) => {
      if (accepted) reload();
    });
    confirmation.resolve(false);
    await pending;
    expect(reload).not.toHaveBeenCalled();
  });
  it("cancels an outstanding action when a session change closes the dialog", async () => {
    const confirmation = createUnsavedConfirmation(vi.fn());
    const pending = confirmation.request("reload");
    confirmation.resolve(false);
    confirmation.resolve(true);
    expect(await pending).toBe(false);
  });
  it("resolves outstanding requests as canceled when the editor unmounts", async () => {
    const onRequest = vi.fn();
    const confirmation = createUnsavedConfirmation(onRequest);
    const pending = confirmation.request("logout");
    onRequest.mockClear();
    confirmation.dispose();
    expect(await pending).toBe(false);
    expect(onRequest).not.toHaveBeenCalled();
  });
  it("cancels a replaced request rather than leaving an unresolved promise or approving both actions", async () => {
    const confirmation = createUnsavedConfirmation(vi.fn());
    const first = confirmation.request("reload");
    const second = confirmation.request("logout");
    expect(await first).toBe(false);
    confirmation.resolve(true);
    expect(await second).toBe(true);
  });
});
