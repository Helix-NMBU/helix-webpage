import { useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@libs/components/ui/dialog";
import { DepartmentBudgetsPanel } from "./DepartmentBudgetsPanel";
import type { ProjectBudgetSystemChoice } from "./project-budget-types";

export function DepartmentBudgetDecision({ packageId, departmentId, departmentName, systems, onChanged }: {
  packageId: string;
  departmentId: string;
  departmentName: string;
  systems: ProjectBudgetSystemChoice[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button>Review changes</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{departmentName} budget decision</DialogTitle>
        <DialogDescription>This decision applies to the whole department submission, including all project changes.</DialogDescription>
      </DialogHeader>
      <DepartmentBudgetsPanel departmentId={departmentId} reviewPackageId={packageId} systems={systems} onDecided={() => { setOpen(false); void onChanged(); }} />
    </DialogContent>
  </Dialog>;
}
