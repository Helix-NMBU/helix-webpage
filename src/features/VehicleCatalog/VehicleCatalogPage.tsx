import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconChevronRight, IconCube } from "@tabler/icons-react";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import { Card } from "@libs/components/ui/card";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Label } from "@libs/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@libs/components/ui/sheet";
import { Skeleton } from "@libs/components/ui/skeleton";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { PropertyWidget } from "../MemberPlatform/PropertyWidget";
import { ProjectRequestError } from "../ProjectManagement/repository";
import { useWorkspace } from "../Workspace/WorkspaceContext";
import { componentArchived } from "./model";
import { vehicleCatalogRepository } from "./repository";
import { ComponentActions, ComponentEditor } from "./ComponentEditor";
import { canManageVehicleCatalog } from "./access";
import type { CatalogMutation, VehicleCatalog, VehicleComponent, VehicleProjectLink } from "./types";

type Save = (change: CatalogMutation) => Promise<boolean>;

function SystemCatalog({ catalog, save, onSystemDeleted, showArchived }: {
  catalog: VehicleCatalog; save: Save; onSystemDeleted: () => void; showArchived: boolean;
}) {
  const systems = catalog.components.filter(item => !item.parentId && (showArchived || !item.archived))
    .sort((first, second) => first.name.localeCompare(second.name));
  const people = new Map<string, VehicleCatalog["responsibilities"]>();
  for (const assignment of catalog.responsibilities) {
    const current = people.get(assignment.subsystemId);
    if (current) current.push(assignment);
    else people.set(assignment.subsystemId, [assignment]);
  }
  return <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
    {systems.map(system => <SystemCard key={system.id} system={system} catalog={catalog} save={save} onSystemDeleted={onSystemDeleted} showArchived={showArchived} people={people} />)}
  </div>;
}

function ProjectRows({ projects }: { projects: VehicleProjectLink[] }) {
  const navigate = useNavigate();
  return <ul className="-mx-2">
    {projects.map(project => <li key={project.id}>
      <Button type="button" variant="ghost" size="sm"
        className="h-auto min-h-8 w-full justify-start gap-2 whitespace-normal px-2 py-1.5 text-left font-normal text-foreground dark:text-white dark:hover:text-white"
        onClick={() => navigate(`/projects/${project.id}`)}>
        <IconCube className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="break-words">{project.name}</span>
      </Button>
    </li>)}
  </ul>;
}

function SystemCard({ system, catalog, save, onSystemDeleted, showArchived, people }: {
  system: VehicleComponent; catalog: VehicleCatalog; save: Save; onSystemDeleted: () => void; showArchived: boolean;
  people: Map<string, VehicleCatalog["responsibilities"]>;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const children = catalog.components.filter(item => item.parentId === system.id).sort((first, second) => first.name.localeCompare(second.name));
  const subsystems = showArchived ? children : children.filter(item => !item.archived);
  const eligibleMembers = new Set(catalog.members.map(member => member.id));
  const projectGroups = [system, ...children].map(component => ({
    component,
    projects: catalog.linkedProjects.filter(project => project.componentId === component.id),
  })).filter(group => group.projects.length > 0);
  const needsOwner = system.archived ? 0 : subsystems.filter(item => {
    const assignments = people.get(item.id);
    return !item.archived && !assignments?.some(({ memberId }) => memberId === null || eligibleMembers.has(memberId));
  }).length;
  return <Sheet>
    <Card className="h-full p-0">
      <SheetTrigger asChild>
        <button type="button" aria-label={`Open ${system.name}`} className="flex h-full min-w-0 flex-col gap-3 rounded-xl p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
          <span className="flex w-full items-start justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-2 font-medium">
              {system.name}<Badge variant="outline">{system.code}</Badge>
              {system.archived && <Badge variant="secondary">Archived</Badge>}
            </span>
            <IconChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </span>
          {system.description && <span className="text-sm text-muted-foreground">{system.description}</span>}
          <span className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{subsystems.length} {subsystems.length === 1 ? "subsystem" : "subsystems"}</span>
            {needsOwner > 0 && <span>{needsOwner} {needsOwner === 1 ? "needs" : "need"} a responsible person</span>}
          </span>
        </button>
      </SheetTrigger>
    </Card>
    <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl" onOpenAutoFocus={event => {
      if (title.current) {
        event.preventDefault();
        title.current.focus();
      }
    }}>
      <SheetHeader className="border-b pr-14">
        <SheetTitle ref={title} tabIndex={-1} className="flex flex-wrap items-center gap-2 outline-none">{system.name}<Badge variant="outline">{system.code}</Badge></SheetTitle>
        <SheetDescription>{system.description || `Subsystems and responsibilities for ${catalog.season}.`}</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto p-4">
        <PropertyWidget title="Subsystems" action={<div className="flex shrink-0 items-center gap-1">
          <ComponentActions component={system} catalog={catalog} save={save} onDeleted={onSystemDeleted} />
          {!system.archived && catalog.canAssignResponsibility && <ComponentEditor parent={system} catalog={catalog} save={save} label={`Add subsystem to ${system.name}`} />}
        </div>}>
          {subsystems.length ? <ul className="divide-y border-t">
            {subsystems.map(item => {
              const assignments = people.get(item.id) ?? [];
              const archived = componentArchived(item, catalog.components);
              return <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{item.name}</h3><span className="text-xs text-muted-foreground">{item.code}</span>
                    {archived && <Badge variant="secondary">Archived</Badge>}
                  </div>
                  {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                  <dl className="flex flex-wrap gap-x-2 text-sm">
                    <dt className="text-muted-foreground">Responsible</dt>
                    <dd>{assignments.length ? <ul className="list-none">
                      {assignments.map(({ memberId, name }) => <li key={memberId ?? name}>
                        {name}
                        {memberId === null && <span className="ml-2 text-xs text-muted-foreground">Member profile pending</span>}
                        {!archived && memberId && !eligibleMembers.has(memberId) && <span className="ml-2 text-xs text-muted-foreground">Needs reassignment</span>}
                      </li>)}
                    </ul> : "Unassigned"}</dd>
                  </dl>
                </div>
                <ComponentActions component={item} catalog={catalog} save={save} onDeleted={() => requestAnimationFrame(() => title.current?.focus())} />
              </li>;
            })}
          </ul> : <p className="text-sm text-muted-foreground">No subsystems yet.</p>}
        </PropertyWidget>
        <PropertyWidget title="Projects">
          {projectGroups.length ? <div className="space-y-3 border-t pt-3">
            {projectGroups.map(({ component, projects }) => <section key={component.id} aria-label={component.name} className="space-y-1">
              <h3 className="text-xs font-medium text-muted-foreground">{component.name}</h3>
              <ProjectRows projects={projects} />
            </section>)}
          </div> : <p className="text-sm text-muted-foreground">No linked projects in {catalog.season}.</p>}
        </PropertyWidget>
      </div>
    </SheetContent>
  </Sheet>;
}

export default function VehicleCatalogPage() {
  const directory = useWorkspace();
  const viewerId = directory?.data?.viewerId;
  const allowed = canManageVehicleCatalog(directory?.data);
  const [catalog, setCatalog] = useState<VehicleCatalog | null>(null);
  const [editSnapshot, setEditSnapshot] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [repository] = useState(vehicleCatalogRepository);
  const heading = useRef<HTMLHeadingElement>(null);
  const saving = useRef(false);
  const generation = useRef(0);
  const navigate = useNavigate();
  const notify = useNotify();

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const next = await repository.load();
      if (current === generation.current) {
        setCatalog(next);
        setEditSnapshot(value => value + 1);
      }
    } catch (error) {
      if (current !== generation.current) return;
      notify("Could not load vehicle systems", error instanceof Error ? error.message : "Please try again.", {
        variant: "error", href: null, action: { label: "Try again", onClick: () => void load() },
      });
      if (error instanceof ProjectRequestError && (error.status === 401 || error.status === 403)) {
        navigate(error.status === 401 ? "/login" : "/departments", { replace: true });
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [navigate, notify, repository]);

  useEffect(() => {
    if (!viewerId) return;
    if (allowed) {
      void load();
      return () => { generation.current++; };
    }
    notify("Management access required", "Your account cannot edit vehicle systems.", { variant: "error", href: null });
    navigate("/departments", { replace: true });
  }, [allowed, viewerId, load, navigate, notify]);

  const save: Save = async change => {
    if (saving.current) return false;
    saving.current = true;
    try {
      setCatalog(await repository.save(change));
      if ("action" in change) {
        notify("Catalog item deleted", "The vehicle catalog has been updated.", { variant: "success", href: null });
      } else {
        notify("Vehicle catalog saved", "Your changes have been saved.", { variant: "success", href: null });
      }
      return true;
    } catch (error) {
      const recover = error instanceof ProjectRequestError && (error.status === 404 || error.status === 409);
      notify("action" in change ? "Could not delete catalog item" : "Could not save vehicle systems", error instanceof Error ? error.message : "Please try again.", {
        variant: "error", href: null, ...(recover ? { action: { label: "Reload saved version", onClick: () => void load() } } : {}),
      });
      if (error instanceof ProjectRequestError && (error.status === 401 || error.status === 403)) {
        navigate(error.status === 401 ? "/login" : "/departments", { replace: true });
      }
      return false;
    } finally {
      saving.current = false;
    }
  };

  if ((!viewerId && directory?.loading) || (allowed && loading && !catalog)) return <section aria-label="Loading vehicle systems" className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-60 w-full" /></section>;
  if (!directory?.data) return <Button variant="outline" onClick={() => void directory?.refresh()}>Try again</Button>;
  if (!allowed) return null;
  if (!catalog) return <Button variant="outline" onClick={() => void load()}>Try again</Button>;

  return <section aria-labelledby="vehicle-systems-title" className="space-y-4">
    <header className="flex items-center justify-between gap-3">
      <div className="space-y-1">
        <h1 ref={heading} tabIndex={-1} id="vehicle-systems-title" className="text-lg font-medium outline-none">Vehicle systems</h1>
        <p className="text-sm text-muted-foreground">Manage the systems and subsystems used across seasons.</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {catalog.components.some(item => item.archived) && <div className="flex items-center gap-2">
          <Checkbox id="vehicle-show-archived" checked={showArchived} onCheckedChange={checked => setShowArchived(checked === true)} />
          <Label htmlFor="vehicle-show-archived">Show archived</Label>
        </div>}
        <ComponentEditor catalog={catalog} save={save} label="Add system" />
      </div>
    </header>
    <SystemCatalog key={editSnapshot} catalog={catalog} save={save} showArchived={showArchived} onSystemDeleted={() => requestAnimationFrame(() => heading.current?.focus())} />
  </section>;
}
