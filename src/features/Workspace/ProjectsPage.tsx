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
import { Navigate, useNavigate, useParams } from "react-router-dom";
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
}: {
  data: WorkspaceDirectory;
  projects: WorkspaceProject[];
}) {
  const navigate = useNavigate();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-72 pl-4">Name</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Leads</TableHead>
          <TableHead>Target date</TableHead>
          <TableHead>Tasks</TableHead>
          <TableHead>Status</TableHead>
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
                {p.milestones[0] && (
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
            <TableCell className="max-w-60 whitespace-normal text-muted-foreground">
              {p.departments.join(", ") || "—"}
            </TableCell>
            <TableCell>
              <PriorityIndicator priority={p.priority ?? "normal"} />
            </TableCell>
            <TableCell>
              <AssigneeAvatars
                assigneeIds={p.leadIds ?? []}
                members={data.members}
                assignmentRole="lead"
                showNames
              />
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <TargetDate deadline={p.deadline} />
            </TableCell>
            <TableCell className="tabular-nums">{p.total}</TableCell>
            <TableCell>
              <ProgressRing
                label={p.name}
                done={p.done}
                total={p.total}
                percent={p.total ? Math.round((p.done / p.total) * 100) : 0}
                showTotal={false}
              />
            </TableCell>
          </TableRow>
        ))}
        {!projects.length && (
          <NoResults columns={7}>No projects to show.</NoResults>
        )}
      </TableBody>
    </Table>
  );
}
export function ProjectsPage() {
  const workspace = useWorkspace();
  const data = workspace?.data;
  const { projectId } = useParams();
  const navigate = useNavigate();
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
  const canEdit =
    canCreate &&
    (!selected ||
      data.canManageProjects ||
      selected.departments.some((d) => leadDepartments.includes(d)));
  const projects = data.projects.filter((p) =>
    `${p.name} ${p.departments.join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
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
  return (
    <>
      <Directory
        title={selected?.name ?? "Projects"}
        action={
          canEdit ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              {selected ? "Edit project" : "New project"}
            </Button>
          ) : undefined
        }
      >
        {selected ? (
          <>
            <div className="space-y-3 border-b p-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/projects")}
              >
                All projects
              </Button>
              {selected.description && (
                <p className="text-sm text-muted-foreground">
                  {selected.description}
                </p>
              )}
              {data.projectAccess && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate(
                      `/project-management/${selected.category}?project=${selected.id}`,
                    )
                  }
                >
                  View tasks and milestones
                </Button>
              )}
            </div>
            <ProjectRows data={data} projects={[selected]} />
            <div className="border-t p-4">
              <h2 className="mb-3 text-sm font-medium">Milestones</h2>
              {selected.milestones.length ? (
                selected.milestones.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <IconDiamonds
                        aria-hidden="true"
                        className="size-4 text-muted-foreground"
                      />
                      {m.title}
                    </span>
                    <TargetDate deadline={m.deadline} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No open milestones.
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <Search label="Find projects" value={search} onChange={setSearch} />
            <ProjectRows data={data} projects={projects} />
          </>
        )}
      </Directory>
      {editing && canEdit && (
        <ProjectEditor
          project={selected ?? null}
          category={selected?.category ?? "production"}
          members={data.members}
          busy={busy}
          onSave={save}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
