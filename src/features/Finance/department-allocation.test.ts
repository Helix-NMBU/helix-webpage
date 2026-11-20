import {describe,expect,it} from "vitest";
import {financeAllocationDepartment} from "./department-allocation";
describe("responsible budget department allocation",()=>{
  const mechanical={key:"mechanical"},electrical={key:"electrical"},owners=new Map([["mechanical-id",mechanical]]);
  it("allocates a project's whole approved plan to its owner while retaining physical system identity",()=>{
    expect(financeAllocationDepartment({source:"project",projectId:"project",responsibleDepartmentId:"mechanical-id",unbudgeted:false},electrical,owners)).toBe(mechanical);
    expect(electrical).toEqual({key:"electrical"});
  });
  it("keeps adopted but not approved legacy plans in their original system department",()=>{
    expect(financeAllocationDepartment({source:"legacy",projectId:"project",responsibleDepartmentId:"mechanical-id",unbudgeted:false},electrical,owners)).toBe(electrical);
  });
  it("attributes project-scoped incurred unbudgeted cost before a header exists",()=>{
    expect(financeAllocationDepartment({source:"legacy",projectId:"project",responsibleDepartmentId:"mechanical-id",unbudgeted:true},electrical,owners)).toBe(mechanical);
    expect(financeAllocationDepartment({source:"legacy",projectId:null,responsibleDepartmentId:null,unbudgeted:true},electrical,owners)).toBe(electrical);
  });
});
