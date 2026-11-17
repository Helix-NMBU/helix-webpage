import { createTransfer, definePrimitive, transferMessage, type TransferDraft, type TransferLists } from "@ui-sdk/core";
import { createParts } from "@ui-sdk/react/primitive";

type BoardTransferOptions = {
  lists: TransferLists;
  canMove: (id: string) => boolean;
  accepts?: (column: string) => boolean;
  columnLabel: (column: string) => string;
  onMove: (id: string, column: string) => void;
};

const boardTransfer = definePrimitive({
  name: "board-transfer",
  options: { lists: "value", canMove: "callback", accepts: "callback", columnLabel: "callback", onMove: "callback" },
  state: ({ lists }: BoardTransferOptions) => ({ lists, move: null as TransferDraft | null }),
  sync: ({ lists }) => ({ lists }),
  api: (context) => {
    let pointerWasDragging = false;
    let suppressClickUntil = 0;
    context.onDestroy(context.store.subscribe(() => {
      const pointerDragging = context.store.get().move?.pointer === true;
      if (pointerWasDragging && !pointerDragging) suppressClickUntil = Date.now() + 250;
      pointerWasDragging = pointerDragging;
    }));

    const transfer = createTransfer(context, {
      key: "lists",
      draft: "move",
      disabled: (id) => !context.options().canMove(id),
      accepts: (_id, column) => context.options().accepts?.(column) ?? true,
      label: (id) => context.element("card", id)?.getAttribute("aria-label") ?? undefined,
      listLabel: (column) => context.options().columnLabel(column),
      message: (message) => message.type === "drop"
        ? `Move requested for ${message.label} to ${message.list}.`
        : transferMessage(message),
      createAutoScroll: { edge: 48, speed: 12 },
      set: (_lists, { key, from, to }) => {
        const { lists, canMove, accepts, onMove } = context.options();
        if (from === to || !lists[from]?.includes(key) || !canMove(key) || accepts?.(to) === false) return false;
        // The feature updates the rendered lists after its save or confirmation succeeds.
        onMove(key, to);
        return true;
      },
    });
    return {
      transfer,
      suppressClick: () => pointerWasDragging || Date.now() < suppressClickUntil,
    };
  },
  slots: (slot) => ({
    root: slot({
      bind: (element, { api }) => {
        function suppressDragClick(event: MouseEvent) {
          if (api.suppressClick()) {
            event.preventDefault();
            event.stopPropagation();
          }
        }
        element.addEventListener("click", suppressDragClick, true);
        return () => element.removeEventListener("click", suppressDragClick, true);
      },
    }),
    column: slot<{ value: string }>({
      props: { value: "string" },
      bind: (element, { api, key }) => api.transfer.bindList(element, key),
      attrs: ({ move }, { key }) => ({
        "data-over": move && move.from !== key && move.lists[key]?.includes(move.key) ? "" : undefined,
      }),
    }),
    card: slot<{ value: string; movable: boolean }>({
      props: { value: "string", movable: "boolean" },
      bind: (element, { api, key }) => api.transfer.bindItem(element, key),
      attrs: (state, { api, key, props }) => ({
        tabindex: props.movable ? "0" : undefined,
        "aria-keyshortcuts": props.movable ? "Space ArrowLeft ArrowRight Escape" : undefined,
        "data-movable": props.movable ? "" : undefined,
        "data-dragging": api.transfer.dragging(state, key) ? "" : undefined,
      }),
      on: {
        keydown: (event, { api, el, key, store }) => {
          if (event.target !== el) return;
          if (store.get().move?.key === key && ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            return;
          }
          api.transfer.keydown(event, key);
        },
        pointerdown: (event, { api, key }) => {
          if (event.target instanceof Element) {
            const control = event.target.closest("button, a, input, select, textarea, label, [contenteditable]");
            if (control && !control.hasAttribute("data-board-drag-handle")) return;
          }
          api.transfer.pointerdown(event, key);
        },
      },
    }),
  }),
});

export const {
  Root: BoardTransfer,
  Column: BoardTransferColumn,
  Card: BoardTransferCard,
} = createParts(boardTransfer, { root: "div", column: "section", card: "div" });
