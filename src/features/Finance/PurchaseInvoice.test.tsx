// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PurchaseInvoice } from "./PurchaseInvoice";
import type { FinancePurchaseSummary } from "./types";
const notify=vi.hoisted(()=>vi.fn());
vi.mock("../MemberPlatform/MemberNotifications",()=>({useNotify:()=>notify}));
let root:Root,container:HTMLDivElement;
const run=vi.fn(async()=>true),changed=vi.fn(async()=>undefined),ended=vi.fn();
const actions={open:vi.fn(async()=>({viewerUrl:"https://drive.google.com/file/d/linked-file/view"})),retry:vi.fn(async()=>({ok:true as const,viewVersion:1,warnings:[],errors:[]}))};
const row:FinancePurchaseSummary={id:"purchase",publicRef:"PUR-1",revision:2,status:"registered",buyerName:"Buyer",supplierName:"Supplier",requesterMemberId:null,requesterName:null,paymentMethod:"invoice",purchaseDate:"2026-11-22",justification:"Materials",documentKind:"invoice",documentNumber:null,voidReason:null,totalNok:"100.00",refundAccount:null,refundPhone:null,unpaid:true,invoice:{paid:false,paidOn:null,dueDate:null},reimbursement:null,lines:[],documents:[],exceptions:[]};
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);run.mockClear();notify.mockClear();actions.open.mockClear();container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function render(value=row,canLink=true){await act(async()=>root.render(<PurchaseInvoice row={value} canLink={canLink} busy={false} onRun={run} actions={actions} onChanged={changed} onAccessEnded={ended}/>));}
async function click(label:string){await act(async()=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent===label)!.click());}
async function input(value:string){await act(async()=>{const field=document.getElementById("invoice-url-purchase")!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(field,value);field.dispatchEvent(new Event("input",{bubbles:true}));});}
it("validates the file link and submits the current purchase revision through the authorized action",async()=>{
 await render();expect(container.textContent).toBe("Link to invoice");await click("Link to invoice");
 expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Google Drive file link");
 await input("https://drive.google.com/drive/folders/folder");await click("Save link");expect(run).not.toHaveBeenCalled();expect(notify).toHaveBeenCalledWith("Check invoice link",expect.any(String),expect.objectContaining({variant:"error"}));
 await input("https://drive.google.com/open?id=linked-file&usp=sharing");await click("Save link");
 expect(run).toHaveBeenCalledWith("link-invoice-purchase","2:https://drive.google.com/file/d/linked-file/view",expect.objectContaining({action:"linkPurchaseInvoice",purchaseId:"purchase",expectedRevision:2,viewerUrl:"https://drive.google.com/file/d/linked-file/view"}),"Invoice linked","Could not save invoice link");
 await vi.waitFor(()=>expect(document.querySelector('[role="dialog"]')).toBeNull());
});
it("uses the saved invoice reference without a duplicate missing-file label and reauthorizes opening it",async()=>{
 const anchor=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>undefined);
 await render({...row,documents:[{id:"pending",publicRef:"D-1",kind:"invoice",documentNumber:null,originalName:"Upload.pdf",backend:"google_drive",transferStatus:"needs_attention"},{id:"purchase:purchase",publicRef:"D-2",kind:"invoice",documentNumber:null,originalName:"Linked invoice",backend:"google_drive",transferStatus:"stored",viewerUrl:"https://drive.google.com/file/d/linked-file/view",canRetry:false}]});
 expect(container.textContent).toBe("View invoiceEdit link");await act(async()=>container.querySelector<HTMLAnchorElement>("a")!.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true})));expect(actions.open).toHaveBeenCalledWith("purchase:purchase");expect(anchor).toHaveBeenCalledOnce();
});
it("keeps linking controls unavailable to readers and voided records",async()=>{
 await render(row,false);expect(container.textContent).toBe("Invoice not found");expect(container.querySelector("button")).toBeNull();await render({...row,status:"voided"});expect(container.querySelector("button")).toBeNull();
});

it("prefills the active link, saves a correction with the latest revision and hides editing from readers",async()=>{
 const value={...row,documents:[{id:"uploaded",publicRef:"D-1",kind:"invoice" as const,documentNumber:null,originalName:"Original.pdf",backend:"google_drive" as const,transferStatus:"stored" as const,viewerUrl:"https://drive.google.com/file/d/original/view"},{id:"purchase:purchase",publicRef:"D-2",kind:"invoice" as const,documentNumber:null,originalName:"Linked invoice",backend:"google_drive" as const,transferStatus:"stored" as const,viewerUrl:"https://drive.google.com/file/d/current/view"}]};
 await render(value);expect(container.querySelectorAll("a")).toHaveLength(1);expect(container.querySelector("a")?.getAttribute("href")).toContain("current");
 await click("Edit link");expect((document.getElementById("invoice-url-purchase") as HTMLInputElement).value).toBe("https://drive.google.com/file/d/current/view");
 expect([...document.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="Save link")?.disabled).toBe(true);
 await input("https://drive.google.com/open?id=corrected");await click("Save link");
 expect(run).toHaveBeenCalledWith("link-invoice-purchase","2:https://drive.google.com/file/d/corrected/view",expect.objectContaining({expectedRevision:2,viewerUrl:"https://drive.google.com/file/d/corrected/view"}),"Invoice link updated","Could not save invoice link");
 await render(value,false);expect(container.textContent).toBe("View invoice");expect(container.querySelector("button")).toBeNull();
});
it("allows correcting the invoice originally supplied by an upload",async()=>{
 await render({...row,documents:[{id:"uploaded",publicRef:"D-1",kind:"invoice",documentNumber:null,originalName:"Original.pdf",backend:"google_drive",transferStatus:"stored",viewerUrl:"https://drive.google.com/file/d/original/view"}]});
 await click("Edit link");expect((document.getElementById("invoice-url-purchase") as HTMLInputElement).value).toBe("https://drive.google.com/file/d/original/view");
});
