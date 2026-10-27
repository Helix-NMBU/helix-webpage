import { useState } from "react";
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
import { PROJECT_COLUMNS, projectView, visibleProjects, projectGroups, type ProjectColumn } from "./project-view";
import { ProjectEditor } from "../ProjectManagement/TaskEditor";
import { ProgressRing } from "../ProjectManagement/ProgressRing";
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
            {show("deadline") && <TableCell className="whitespace-nowrap">
              <TargetDate deadline={p.deadline} />
            </TableCell>}
            {show("tasks") && <TableCell className="tabular-nums">{p.total}</TableCell>}
            {show("status") && <TableCell>
              <ProgressRing
                label={p.name}
                done={p.done}
                total={p.total}
                percent={p.total ? Math.round((p.done / p.total) * 100) : 0}
                showTotal={false}
              />
            </TableCell>}
          </TableRow>
        ))}
        {!projects.length && (
          <NoResults columns={1 + columns.filter(column => column !== "milestones").length}>No projects to show.</NoResults>
        )}
      </TableBody>
    </Table>
  );
}
export function ProjectsPage() {
  const workspace = useWorkspace();
  const data = workspace?.data;
  const { projectId } = useParams();
  const [params, setParams] = useSearchParams();
  const notify = useNotify();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data) return <LoadDirectory />;
  const selected = projectId
    ? data.projects.find((p) => p.id === projectId)
    : null;
  if (projectId && !selected) return <Navigate to="/projects" replace />;
  const leadDepartments = data.departments
    .filter((d) => d.leadId === data.viewerId)
    .map((d) => d.name);
  const canCreate = data.canManageProjects || leadDepartments.length > 0;
  const options = projectView(params);
  const departmentId = options.department === "all" ? null : options.department;
  const department = data.departments.find((item) => item.id === departmentId);
  const projects = visibleProjects(data, options, search);
  const groups = projectGroups(projects, data, options.group);
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    const defaults: Record<string, string> = { view: "list", department: "all", lead: "all", priority: "all", completion: "all", sort: "deadline", group: "none", scale: "year" };
    if (value === defaults[key]) next.delete(key);
    else next.set(key, value);
    setParams(next);
  }
  function reset() {
    const next = new URLSearchParams(params);
    for (const key of ["view", "department", "lead", "priority", "completion", "sort", "group", "scale", "columns"]) next.delete(key);
    setSearch("");
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
        action={<div className="flex items-center gap-2">
          <ProjectViewMenu data={data} options={options} onChange={change} onReset={reset} />
          {canCreate && <Button size="sm" disabled={busy} onClick={() => setEditing(true)}>+ New project</Button>}
        </div>}
      >
        <>
          {departmentId && (
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3 text-sm">
              <span>{department?.name ?? "Unknown department"}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.delete("department");
                  setParams(next);
                }}
              >
                All projects
              </Button>
            </div>
          )}
          <Search label="Find projects" value={search} onChange={setSearch} />
          {options.view === "timeline" ? <ProjectTimeline projects={projects} groups={groups} scale={options.scale} onScale={value => change("scale", value)} /> : (groups.length ? groups : [{ id: "all", name: "", projects: [] }]).map(group => <section key={group.id} aria-label={group.name ? `Projects in ${group.name}` : "Projects list view"}>
            {group.name && <h2 className="border-y bg-muted/40 px-4 py-2 text-sm font-medium">{group.name} <span className="ml-2 text-xs text-muted-foreground">{group.projects.length}</span></h2>}
            <ProjectRows data={data} projects={group.projects} columns={options.columns} />
          </section>)}
        </>
      </Directory>
      {editing && canCreate && (
        <ProjectEditor
          project={null}
          category="production"
          members={data.members}
          busy={busy}
          onSave={save}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
