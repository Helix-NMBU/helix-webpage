import { useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import { AssigneeAvatars } from "../ProjectManagement/TaskAssignees";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { useWorkspace } from "./WorkspaceContext";
import { ProjectDetailSkeleton } from "../MemberPlatform/LoadingSkeletons";
import { EmptyIllustration } from "../MemberPlatform/EmptyIllustration";
import {
  Directory,
  Search,
  NoResults,
  LoadDirectory,
} from "./DirectoryComponents";
import { IconCube, IconDiamonds } from "@tabler/icons-react";
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ProjectDetail } from "./ProjectDetail";
import { ProjectViewMenu } from "./ProjectViewMenu";
import { ProjectTimeline } from "./ProjectTimeline";
import { PROJECT_COLUMNS, PROJECT_COMPLETION_OPTIONS, defaultProjectGrouping, projectView, visibleProjects, projectGroups, type ProjectColumn } from "./project-view";
import { Choice, ProjectEditor } from "../ProjectManagement/TaskEditor";
import { TaskStatusIndicator } from "../ProjectManagement/TaskStatus";
import {
  PriorityIndicator,
  TargetDate,
} from "../ProjectManagement/MilestoneTableControls";
import type { ProjectMutation } from "../ProjectManagement/types";
import type { WorkspaceDirectory, WorkspaceProject } from "./types";
export function ProjectRows({
  data,
  projects,
  columns = PROJECT_COLUMNS.map(([key]) => key),
}: {
  data: WorkspaceDirectory;
  projects: WorkspaceProject[];
  columns?: ProjectColumn[];
}) {
  const navigate = useNavigate();
  const show = (column: ProjectColumn) => columns.includes(column);
  return (
    <Table aria-label="Projects list">
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-72 pl-4">Name</TableHead>
          {show("department") && <TableHead>Department</TableHead>}
          {show("priority") && <TableHead>Priority</TableHead>}
          {show("leads") && <TableHead>Leads</TableHead>}
          {show("start") && <TableHead>Start date</TableHead>}
          {show("deadline") && <TableHead>Target date</TableHead>}
          {show("tasks") && <TableHead>Tasks</TableHead>}
          {show("status") && <TableHead>Status</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="py-4 pl-4">
              <div className="flex items-center gap-3">
                <IconCube
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className="font-medium hover:underline"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  {p.name}
                </button>
                {show("milestones") && p.milestones[0] && (
                  <span
                    className="inline-flex max-w-52 items-center gap-1 truncate text-xs text-muted-foreground"
                    title={p.milestones[0].title}
                  >
                    <IconDiamonds
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    <span className="truncate">{p.milestones[0].title}</span>
                  </span>
                )}
              </div>
            </TableCell>
            {show("department") && <TableCell className="max-w-60 whitespace-normal text-muted-foreground">
              {p.departments.join(", ") || "—"}
            </TableCell>}
            {show("priority") && <TableCell>
              <PriorityIndicator priority={p.priority ?? "normal"} />
            </TableCell>}
            {show("leads") && <TableCell>
              <AssigneeAvatars
                assigneeIds={p.leadIds ?? []}
                members={data.members}
                assignmentRole="lead"
                showNames
              />
            </TableCell>}
            {show("start") && <TableCell className="whitespace-nowrap">{p.startDate ? <TargetDate deadline={p.startDate} /> : <span className="text-muted-foreground">Not set</span>}</TableCell>}
            {show("deadline") && <TableCell className="whitespace-nowrap">
              <TargetDate deadline={p.deadline} />
            </TableCell>}
            {show("tasks") && <TableCell className="tabular-nums">{p.total}</TableCell>}
            {show("status") && <TableCell>
              <TaskStatusIndicator status={p.status ?? "todo"} />
            </TableCell>}
          </TableRow>
        ))}
        {!projects.length && (
          <NoResults columns={1 + columns.filter(column => column !== "milestones").length}><div className="py-4"><EmptyIllustration kind="cube" /><p className="mt-2">No projects to show.</p></div></NoResults>
        )}
      </TableBody>
    </Table>
  );
}
export function ProjectsPage({ departmentIdScope }: { departmentIdScope?: string } = {}) {
  const workspace = useWorkspace();
  const data = workspace?.data;
  const { projectId } = useParams();
  const [params, setParams] = useSearchParams();
  const notify = useNotify();
  const search = params.get("search") ?? "";
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const timelineRef = useRef<{ centerToday: () => void }>(null);
  if (!data) return projectId && workspace?.loading ? <ProjectDetailSkeleton tab={params.get("tab")} board={params.get("view") === "board"} /> : <LoadDirectory title="Projects" columns={5} />;
  const selected = projectId
    ? data.projects.find((p) => p.id === projectId)
    : null;
  if (projectId && !selected) return <Navigate to="/projects" replace />;
  const leadDepartments = data.departments
    .filter((d) => (d.leadIds ?? (d.leadId ? [d.leadId] : [])).includes(data.viewerId))
    .map((d) => d.name);
  const options = projectView(params);
  const scopedOptions = departmentIdScope
    ? { ...options, department: departmentIdScope }
    : options;
  const departmentId = departmentIdScope ?? (options.department === "all" ? null : options.department);
  const department = data.departments.find((item) => item.id === departmentId);
  const canCreate = departmentIdScope
    ? data.canManageProjects || department && (department.leadIds ?? (department.leadId ? [department.leadId] : [])).includes(data.viewerId)
    : data.canManageProjects || leadDepartments.length > 0;
  const projects = visibleProjects(data, scopedOptions, search);
  const groups = projectGroups(projects, data, scopedOptions.group);
  function setSearch(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("search", value);
    else next.delete("search");
    setParams(next, { replace: true });
  }
  function change(key: string, value: string) {
    if (departmentIdScope && key === "department") return;
    const next = new URLSearchParams(params);
    const defaults: Record<string, string> = { view: "list", department: "all", lead: "all", priority: "all", completion: "all", sort: "deadline", group: defaultProjectGrouping(scopedOptions.view), scale: "year" };
    if (value === defaults[key]) next.delete(key);
    else next.set(key, value);
    setParams(next);
  }
  function clearFilters() {
    const next = new URLSearchParams(params);
    for (const key of ["department", "lead", "priority", "completion", "search", "group", "sort", "columns"]) next.delete(key);
    setParams(next);
  }
  async function save(change: ProjectMutation) {
    if (change.action !== "save_project" || busy || !workspace) return;
    setBusy(true);
    try {
      await workspace.saveProject(change);
      setEditing(false);
      notify(
        "Project saved",
        "The project list and progress have been updated.",
        { variant: "success", href: null },
      );
    } catch (error) {
      notify(
        "Could not save project",
        error instanceof Error ? error.message : "Try again.",
        { variant: "error", href: null },
      );
    } finally {
      setBusy(false);
    }
  }
  if (selected)
    return (
      <ProjectDetail key={selected.id} project={selected} directory={data} />
    );
  return (
    <>
      <Directory
        title="Projects"
        fill={scopedOptions.view === "timeline"}
        action={<div className="flex min-w-0 flex-wrap items-center gap-2">
          {departmentId && <span className="text-sm text-muted-foreground">{department?.name ?? "Unknown department"}</span>}
          {departmentId && !departmentIdScope && <Button variant="ghost" size="sm" onClick={() => { const next = new URLSearchParams(params); next.delete("department"); setParams(next); }}>All projects</Button>}
          <div className="w-48 max-w-full sm:w-64"><Search outside label="Find projects" value={search} onChange={setSearch} /></div>
          {canCreate && <Button size="sm" disabled={busy} onClick={() => setEditing(true)}>+ New project</Button>}
        </div>}
        toolbar={<div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="w-36">
            <Choice
              id="project-filter-completion"
              ariaLabel="Project completion"
              value={scopedOptions.completion}
              onChange={value => change("completion", value)}
              options={PROJECT_COMPLETION_OPTIONS}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {scopedOptions.view === "timeline" && <>
              <div className="w-28">
                <Choice id="project-timeline-scale" ariaLabel="Timeline scale" value={scopedOptions.scale} onChange={value => change("scale", value)} options={[{ value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "year", label: "Year" }]} />
              </div>
              <Button variant="outline" size="sm" onClick={() => timelineRef.current?.centerToday()}>Today</Button>
            </>}
            <ProjectViewMenu data={data} options={scopedOptions} onChange={change} onReset={clearFilters} hideDepartmentFilter={Boolean(departmentIdScope)} />
          </div>
        </div>}
      >
        <>
          {scopedOptions.view === "timeline" ? <ProjectTimeline projects={projects} groups={groups} directory={data} scale={scopedOptions.scale} timelineRef={timelineRef} /> : (groups.length ? groups : [{ id: "all", name: "", projects: [] }]).map(group => <section key={group.id} aria-label={group.name ? `Projects in ${group.name}` : "Projects list view"}>
            {group.name && <h2 className="border-y bg-muted/40 px-4 py-2 text-sm font-medium">{group.name} <span className="ml-2 text-xs text-muted-foreground">{group.projects.length}</span></h2>}
            <ProjectRows data={data} projects={group.projects} columns={scopedOptions.columns} />
          </section>)}
        </>
      </Directory>
      {editing && canCreate && (
        <ProjectEditor
          project={null}
          category="production"
          members={data.members}
          taskLeadCategories={canCreate ? ["production", "marketing", "operations", "partnership-deliverables"] : []}
          initialDepartments={departmentIdScope && department ? [department.name] : []}
          busy={busy}
          onSave={save}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
