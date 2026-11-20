/** Resolve accounting ownership without changing the physical system identity.
 * A mapped legacy entry remains legacy until its genuine project replacement is approved.
 */
export function financeAllocationDepartment<T>(input:{source:"legacy"|"project";projectId:string|null;responsibleDepartmentId:string|null;unbudgeted:boolean},physical:T,responsible:ReadonlyMap<string,T>):T {
  if(input.projectId && input.responsibleDepartmentId && (input.source==="project"||input.unbudgeted)) {
    const owner=responsible.get(input.responsibleDepartmentId);
    if(!owner)throw new Error("The responsible budget department is missing from the financial catalog.");
    return owner;
  }
  return physical;
}
