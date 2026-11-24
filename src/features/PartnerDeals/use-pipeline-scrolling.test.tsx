// @vitest-environment happy-dom
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { usePipelineScrolling } from "./use-pipeline-scrolling";
const host=document.createElement("div");let root:ReturnType<typeof createRoot>;
function Harness(){const area=useRef<HTMLElement>(null),board=useRef<HTMLDivElement>(null);usePipelineScrolling(area,board,true);return <main ref={area}><h1>Pipeline</h1><div ref={board} data-board><section data-pipeline-column><h2>Lead</h2><div data-pipeline-cards><button>Card</button></div><p>Value</p></section><section data-pipeline-column><h2>Contacted</h2><div data-pipeline-cards/></section></div></main>;}
afterEach(async()=>{if(root)await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it("routes horizontal gestures from the header or a column to the board and vertical gestures only to the hovered column",async()=>{
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);document.body.append(host);root=createRoot(host);await act(async()=>root.render(<Harness/>));
  const board=host.querySelector<HTMLElement>("[data-board]")!,lists=host.querySelectorAll<HTMLElement>("[data-pipeline-cards]");
  Object.defineProperties(board,{scrollWidth:{value:2000},clientWidth:{value:700}});
  for(const list of lists)Object.defineProperties(list,{scrollHeight:{value:1200},clientHeight:{value:300}});
  const wheel=(element:Element,options:WheelEventInit)=>{
    const event=new WheelEvent("wheel",{bubbles:true,cancelable:true,...options});
    // Happy DOM's WheelEvent extends UIEvent and omits mouse modifier fields.
    Object.defineProperties(event,{shiftKey:{value:options.shiftKey??false},ctrlKey:{value:options.ctrlKey??false},metaKey:{value:options.metaKey??false}});
    element.dispatchEvent(event);return event;
  };
  expect(wheel(host.querySelector("h1")!,{deltaX:120}).defaultPrevented).toBe(true);expect(board.scrollLeft).toBe(120);
  wheel(lists[0].querySelector("button")!,{deltaX:80,deltaY:2});expect(board.scrollLeft).toBe(200);expect(lists[0].scrollTop).toBe(0);
  wheel(host.querySelector("h2")!,{deltaY:100});expect(lists[0].scrollTop).toBe(100);expect(lists[1].scrollTop).toBe(0);expect(board.scrollLeft).toBe(200);
  wheel(lists[1],{deltaY:50});expect(lists[1].scrollTop).toBe(50);expect(lists[0].scrollTop).toBe(100);
  wheel(lists[0],{deltaY:3,deltaMode:WheelEvent.DOM_DELTA_LINE});expect(lists[0].scrollTop).toBe(148);
  wheel(lists[0],{deltaY:60,shiftKey:true});expect(board.scrollLeft).toBe(260);
  expect(wheel(lists[0],{deltaY:20,ctrlKey:true}).defaultPrevented).toBe(false);expect(lists[0].scrollTop).toBe(148);
  expect(wheel(host.querySelector("h1")!,{deltaY:50}).defaultPrevented).toBe(false);
});
