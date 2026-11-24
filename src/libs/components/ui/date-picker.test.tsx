// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createAgent } from "@ui-sdk/react/agent";
import { DatePicker } from "./date-picker";
const agent=createAgent();
let root:Root,host:HTMLDivElement;
const change=vi.fn(async()=>true);
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);change.mockReset().mockResolvedValue(true);host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function open(){await act(async()=>root.render(<DatePicker label="Start date" value="2026-11-24" onChange={change}/>));await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Start date"]')!.click());}
it("selects a date with the keyboard and restores trigger focus",async()=>{
 await open();
 const selected=document.querySelector<HTMLElement>('[role="gridcell"][data-value="2026-11-24"]')!;
 expect(selected.hasAttribute("data-selected")).toBe(true);
 await act(async()=>selected.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true,cancelable:true})));
 const focused=document.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')!;
 expect(focused.getAttribute("data-value")).toBe("2026-11-25");
 await act(async()=>focused.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true})));
 expect(change).toHaveBeenCalledWith("2026-11-25");
 await vi.waitFor(()=>expect(document.activeElement).toBe(document.querySelector('[aria-label="Start date"]')));
});
it("allows retrying a failed pointer selection and clearing a date",async()=>{
 change.mockResolvedValueOnce(false);await open();
 const click=async()=>act(async()=>document.querySelector<HTMLElement>('[role="gridcell"][data-value="2026-11-27"]')!.click());
 await click();expect(document.querySelector('[data-slot="calendar"]')).not.toBeNull();await click();
 expect(change).toHaveBeenCalledTimes(2);
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Start date"]')!.click());
 await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent === "Clear date")!.click());
 expect(change).toHaveBeenLastCalledWith(null);
});
it("exposes the calendar by name and accepts a date through the SDK agent",async()=>{
 await open();const entries=agent.snapshot().filter(entry=>!entry.offPage && entry.component !== "more");
 for(const entry of entries)expect(entry.label).toBeTruthy();
 expect(entries.map(entry=>entry.label)).toContain("Start date calendar");
 let result;await act(async()=>{result=await agent.act({steps:[{ref:"Start date calendar",action:"setValue",args:["2026-12-02"]}]});});
 expect(result).toMatchObject({ok:true});expect(change).toHaveBeenCalledWith("2026-12-02");
});
