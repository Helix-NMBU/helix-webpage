import { useCallback, useEffect, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Skeleton } from "@libs/components/ui/skeleton";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { ProjectRequestError } from "../ProjectManagement/repository";
import { componentLabel } from "./model";
import { vehicleCatalogRepository } from "./repository";
import type { ProjectVehicleScope } from "./types";

export function ProjectVehicleField({ projectId, busy }: { projectId: string; busy: boolean }) {
  const [repository] = useState(vehicleCatalogRepository);
  const [scope, setScope] = useState<ProjectVehicleScope | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const current = useRef(0);
  const writing = useRef(false);
  const notify = useNotify();

  const load = useCallback(async () => {
    const version = ++current.current;
    setLoading(true);
    try {
      const result = await repository.loadProject(projectId);
      if (current.current === version) setScope(result);
    } catch (error) {
      if (current.current !== version) return;
      notify("Could not load vehicle system", error instanceof Error ? error.message : "Please try again.", {
        variant: "error", href: null, action: { label: "Try again", onClick: () => void load() },
      });
    } finally {
      if (current.current === version) setLoading(false);
    }
  }, [notify, projectId, repository]);

  useEffect(() => {
    void load();
    return () => { current.current++; };
  }, [load]);

  async function save(value: string) {
    if (!scope?.canEdit || writing.current) return;
    writing.current = true;
    setSaving(true);
    const version = current.current;
    try {
      const result = await repository.saveProject(projectId, { componentId: value === "none" ? null : value, expectedRevision: scope.revision });
      if (current.current !== version) return;
      setScope(result);
      notify("Vehicle system saved", "The project classification has been updated.", { variant: "success", href: null });
    } catch (error) {
      if (current.current !== version) return;
      const conflict = error instanceof ProjectRequestError && error.status === 409;
      notify("Could not save vehicle system", error instanceof Error ? error.message : "Please try again.", {
        variant: "error", href: null, ...(conflict ? { action: { label: "Reload", onClick: () => void load() } } : {}),
      });
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }

  if (!scope) return loading ? <Skeleton className="h-5 w-24" /> : null;
  const label = componentLabel(scope.componentId, scope.components);
  if (!scope.canEdit) return <span>{label}</span>;
  const options = scope.components.map(item => ({ id: item.id, label: componentLabel(item.id, scope.components) }))
    .sort((first, second) => first.label.localeCompare(second.label));
  return <Select value={scope.componentId ?? "none"} disabled={busy || loading || saving} onValueChange={value => void save(value)}>
    <SelectTrigger aria-label="Project vehicle system" className="-mx-2 h-auto min-h-8 w-[calc(100%+1rem)] gap-1 border-transparent bg-transparent px-2 py-1 text-left shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted [&>svg:last-child]:opacity-0">
      <SelectValue><span className="block min-w-0 truncate" title={label}>{label}</span></SelectValue>
    </SelectTrigger>
    <SelectContent position="popper">
      <SelectItem value="none">No vehicle system</SelectItem>
      {options.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
    </SelectContent>
  </Select>;
}
