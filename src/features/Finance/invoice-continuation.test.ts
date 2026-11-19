import {describe,expect,it,vi} from "vitest";
import {continueRegisteredInvoices} from "./invoice-continuation";
import type {FinanceMutationResult} from "./types";
const saved:FinanceMutationResult={ok:true,id:"purchase-id",viewVersion:1,warnings:[],errors:[],invoiceEvidence:{pending:2,transferring:0,stored:0,needsAttention:0}};
describe("automatic invoice continuation",()=>{
 it("resumes every pending batch and preserves the saved purchase identity",async()=>{const request=vi.fn().mockResolvedValueOnce({...saved,invoiceEvidence:{pending:1,transferring:0,stored:1,needsAttention:0}}).mockResolvedValueOnce({...saved,invoiceEvidence:{pending:0,transferring:0,stored:2,needsAttention:0}});const result=await continueRegisteredInvoices(saved,request);expect(request).toHaveBeenCalledTimes(2);expect(request.mock.calls[0][0]).toMatchObject({action:"continueInvoiceTransfers",purchaseId:"purchase-id"});expect(result.id).toBe(saved.id);expect(result.invoiceEvidence?.stored).toBe(2);});
 it("never automatically loops attention jobs and bounds pending continuation",async()=>{const request=vi.fn(async()=>saved);await continueRegisteredInvoices(saved,request);expect(request).toHaveBeenCalledTimes(5);request.mockClear();await continueRegisteredInvoices({...saved,invoiceEvidence:{pending:0,transferring:0,stored:0,needsAttention:2}},request);expect(request).not.toHaveBeenCalled();});
 it("retains saved actual outcome on session loss or network failure",async()=>{const request=vi.fn(async()=>{throw Object.assign(new Error("Signed out"),{status:401});});const result=await continueRegisteredInvoices(saved,request);expect(result.id).toBe(saved.id);expect(result.ok).toBe(true);expect(result.warnings[0].message).toContain("purchase is saved");expect(request).toHaveBeenCalledTimes(1);});
});
