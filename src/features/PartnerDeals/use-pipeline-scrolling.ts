import { useEffect, type RefObject } from "react";

/** Horizontal wheel gestures belong to the board, including above a card list. */
export function usePipelineScrolling(root: RefObject<HTMLElement | null>, board: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const area = root.current, scroller = board.current;
    if (!enabled || !area || !scroller) return;
    const wheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
      const horizontal = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
      if (horizontal && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))) {
        if (scroller.scrollWidth <= scroller.clientWidth) return;
        const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? scroller.clientWidth : 1;
        event.preventDefault();
        scroller.scrollLeft += horizontal * unit;
        return;
      }
      const column = event.target instanceof Element ? event.target.closest("[data-pipeline-column]") : null;
      const cards = column?.querySelector<HTMLElement>("[data-pipeline-cards]");
      if (!event.deltaY || !cards || cards.scrollHeight <= cards.clientHeight) return;
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? cards.clientHeight : 1;
      event.preventDefault();
      cards.scrollTop += event.deltaY * unit;
    };
    // A non-passive listener avoids a second native scroll in a nested column.
    area.addEventListener("wheel",wheel,{passive:false});
    return () => area.removeEventListener("wheel",wheel);
  }, [root, board, enabled]);
}
