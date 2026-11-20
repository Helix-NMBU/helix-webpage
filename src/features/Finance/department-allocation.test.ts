import {buildBudgetHierarchy} from "./budget-hierarchy";
import {describe,expect,it} from "vitest";
import {financeAllocationDepartment,allocatedSystemCatalog} from "./department-allocation";
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

it("partitions one physical system between accounting departments without duplicating purchase choices",()=>{
 const physical={id:"shared",code:"SYS",name:"Shared",active:true,departmentKey:"electrical",departmentName:"Electronics",sortOrder:2};
 const ownerWithExtraFields={id:"DEPARTMENT-ID",departmentKey:"mechanical",departmentName:"Mechanical",sortOrder:1};
 const systems=allocatedSystemCatalog([physical],[ownerWithExtraFields,{departmentKey:"mechanical",departmentName:"Mechanical",sortOrder:1}],[{systemId:"shared",departmentKey:"mechanical"}]);
 const result=buildBudgetHierarchy({systems,items:[],unallocated:[{id:"protected",publicRef:"UNALLOC",systemId:"shared",actualNok:"25.00",note:null,revision:0,allocationDepartmentKey:"mechanical"},{id:"protected",publicRef:"UNALLOC",systemId:"shared",actualNok:"10.00",note:null,revision:0,allocationDepartmentKey:"electrical"}],includePrivateUnallocated:false});
 expect(result.departments.map(d=>[d.departmentKey,d.actualNok])).toEqual([["mechanical","25.00"],["electrical","10.00"]]);
 expect(result.choices.systems).toHaveLength(1);expect(result.choices.systems[0]).toMatchObject({id:"shared",departmentKey:"electrical"});
});
