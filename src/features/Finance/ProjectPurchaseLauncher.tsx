import { useEffect, useMemo, useState } from "react";
import { Label } from "@libs/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@libs/components/ui/select";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { createProjectBudgetRepository } from "./project-budget-repository";
import type { ProjectBudgetScope } from "./project-budget-types";
import { ProjectBudgetPurchases } from "./ProjectBudgetPurchases";

/** The Finance entry point shares the same scoped registration used in project and department views. */
export function ProjectPurchaseLauncher({
  onChanged,
  onDirtyChange,
}: {
  onChanged: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const repository = useMemo(() => createProjectBudgetRepository(), []);
  const [scopes, setScopes] = useState<ProjectBudgetScope[]>([]);
  const [selected, setSelected] = useState("");
  const [dirty, setDirty] = useState(false);
  const notify = useNotify();
  useEffect(() => {
    let active = true;
    void repository.load().then(
      (workspace) => {
        if (active)
          setScopes(
            workspace.scopes.filter(
              (scope) =>
                scope.capabilities.canRegisterPurchase &&
                scope.responsibleDepartmentId,
            ),
          );
      },
      (error) => {
        if (active)
          notify(
            "Could not load projects",
            error instanceof Error ? error.message : "Please try again.",
            { variant: "error", href: null },
          );
      },
    );
    const stop = repository.watchSession?.(() => {
      active = false;
      setScopes([]);
      setSelected("");
      setDirty(false);
    });
    return () => {
      active = false;
      stop?.();
    };
  }, [repository, notify]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  const scope = scopes.find((item) => item.projectId === selected) ?? scopes[0];
  if (!scope) return null;
  return (
    <section
      className="space-y-4 rounded-lg border p-6"
      aria-label="Project purchases"
    >
      <h2 className="text-xl font-medium">Register a project purchase</h2>
      <div className="max-w-sm space-y-2">
        <Label htmlFor="finance-purchase-project">Project</Label>
        <Select
          value={scope.projectId}
          disabled={dirty}
          onValueChange={setSelected}
        >
          <SelectTrigger id="finance-purchase-project">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scopes.map((project) => (
              <SelectItem key={project.projectId} value={project.projectId}>
                {project.projectName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ProjectBudgetPurchases
        projectId={scope.projectId}
        responsibleDepartmentId={scope.responsibleDepartmentId!}
        onChanged={onChanged}
        onDirtyChange={setDirty}
      />
    </section>
  );
}
