import { useEffect, useMemo, useRef, useState } from "react";
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
import type {
  ProjectBudgetScope,
  ProjectBudgetWorkspace,
} from "./project-budget-types";
import { ProjectBudgetPurchases } from "./ProjectBudgetPurchases";

function registeringScopes(
  workspace: ProjectBudgetWorkspace,
): ProjectBudgetScope[] {
  const invalid = () =>
    new Error(
      "The project list could not be read. Try loading projects again.",
    );
  if (
    !workspace ||
    !Number.isSafeInteger(workspace.viewVersion) ||
    workspace.viewVersion < 0 ||
    !Array.isArray(workspace.scopes) ||
    !Array.isArray(workspace.budgets)
  )
    throw invalid();
  for (const scope of workspace.scopes) {
    if (
      !scope ||
      typeof scope.projectId !== "string" ||
      !scope.projectId.trim() ||
      typeof scope.projectName !== "string" ||
      !scope.projectName.trim() ||
      !(
        scope.responsibleDepartmentId === null ||
        (typeof scope.responsibleDepartmentId === "string" &&
          scope.responsibleDepartmentId.trim())
      ) ||
      !scope.capabilities ||
      typeof scope.capabilities.canRegisterPurchase !== "boolean"
    )
      throw invalid();
  }
  return workspace.scopes.filter(
    (scope) =>
      scope.capabilities.canRegisterPurchase && scope.responsibleDepartmentId,
  );
}

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
  const generation = useRef(0);
  useEffect(() => {
    let active = true,
      request = 0;
    const epoch = ++generation.current;
    const current = () => active && epoch === generation.current;
    async function load() {
      const latest = ++request;
      try {
        const workspace = await repository.load();
        if (!current() || latest !== request) return;
        setScopes(registeringScopes(workspace));
      } catch (error) {
        if (!current() || latest !== request) return;
        notify(
          "Could not load projects",
          error instanceof Error ? error.message : "Please try again.",
          {
            variant: "error",
            href: null,
            action: {
              label: "Try again",
              onClick: () => {
                if (current() && latest === request) void load();
              },
            },
          },
        );
      }
    }
    void load();
    const stop = repository.watchSession?.(() => {
      if (!current()) return;
      active = false;
      generation.current++;
      setScopes([]);
      setSelected("");
      setDirty(false);
    });
    return () => {
      active = false;
      generation.current++;
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
