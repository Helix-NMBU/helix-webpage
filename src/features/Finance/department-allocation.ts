import type {BudgetHierarchySystem} from "./budget-hierarchy.js";
/** Resolve accounting ownership without changing the physical system identity.
 * A mapped legacy entry remains legacy until its genuine project replacement is approved.
 */
export function financeAllocationDepartment<T>(input:{source:"legacy"|"project";projectId:string|null;responsibleDepartmentId:string|null;currentResponsibleDepartmentId?:string|null;unbudgeted:boolean},physical:T,responsible:ReadonlyMap<string,T>):T {
  const departmentId=input.currentResponsibleDepartmentId??input.responsibleDepartmentId;
  if(input.projectId && departmentId && (input.source==="project"||input.unbudgeted)) {
    const owner=responsible.get(departmentId);
    if(!owner)throw new Error("The responsible budget department is missing from the financial catalog.");
    return owner;
  }
  return physical;
}

/** Keep physical systems once in choices and partition their totals by accounting owner. */
export function allocatedSystemCatalog(systems:readonly BudgetHierarchySystem[],departments:readonly {departmentKey:string;departmentName:string;sortOrder:number}[],partitions:readonly {systemId:string;departmentKey:string}[]):BudgetHierarchySystem[] {
  const output=systems.map(system=>({...system,physicalDepartmentKey:system.physicalDepartmentKey??system.departmentKey}));
  for(const partition of partitions){
    if(output.some(system=>system.id===partition.systemId&&system.departmentKey===partition.departmentKey))continue;
    const physical=systems.find(system=>system.id===partition.systemId),department=departments.find(department=>department.departmentKey===partition.departmentKey);
    if(!physical||!department)throw new Error("The financial allocation catalog is incomplete.");
    output.push({...physical,departmentKey:department.departmentKey,departmentName:department.departmentName,sortOrder:department.sortOrder,physicalDepartmentKey:physical.physicalDepartmentKey??physical.departmentKey});
  }
  return output;
}
