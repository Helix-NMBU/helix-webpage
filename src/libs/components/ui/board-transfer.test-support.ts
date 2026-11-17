import { act } from "react";
import { vi } from "vitest";

export async function dragBoardCard(card: Element, target: Element) {
  const source = card.closest("section")!;
  const sourceRect = new DOMRect(10, 10, 100, 150);
  const targetRect = source === target ? sourceRect : new DOMRect(120, 10, 100, 150);
  const sourceBounds = vi.spyOn(source, "getBoundingClientRect").mockReturnValue(sourceRect);
  const targetBounds = source === target ? undefined : vi.spyOn(target, "getBoundingClientRect").mockReturnValue(targetRect);
  const cardBounds = vi.spyOn(card, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 25, 80, 50));
  const hitTest = vi.spyOn(document, "elementFromPoint").mockImplementation(x => x < 110 ? source : target);

  function pointer(type: string, x: number, buttons: number) {
    return new PointerEvent(type, { pointerId: 1, pointerType: "mouse", isPrimary: true, clientX: x, clientY: 40, button: 0, buttons, bubbles: true, cancelable: true });
  }

  try {
    await act(async () => {
      card.dispatchEvent(pointer("pointerdown", 35, 1));
      card.dispatchEvent(pointer("pointermove", targetRect.left + 55, 1));
      card.dispatchEvent(pointer("pointerup", targetRect.left + 55, 0));
    });
  } finally {
    hitTest.mockRestore();
    sourceBounds.mockRestore();
    targetBounds?.mockRestore();
    cardBounds.mockRestore();
  }
}
