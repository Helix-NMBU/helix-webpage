import { departmentAccess } from "../ProjectManagement/permissions";
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
import { DepartmentHomeSkeleton } from "../MemberPlatform/LoadingSkeletons";
import {
  Directory,
  Search,
  NoResults,
  LoadDirectory,
} from "./DirectoryComponents";
import { useEffect } from "react";
import { IconCheck, IconCube } from "@tabler/icons-react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge } from "@libs/components/ui/badge";
import { ORGANIZATION_DEPARTMENTS } from "../ProjectManagement/types";
import { getDepartmentIcon } from "./department-icons";
import { departmentPath } from "./types";
import { DepartmentWorkspace } from "./DepartmentWorkspace";
export function DepartmentsPage() {
  const workspace = useWorkspace();
  const data = workspace?.data;
  const { departmentId } = useParams();
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  function setSearch(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("search", value);
    else next.delete("search");
    setParams(next, { replace: true });
  }
  const navigate = useNavigate();
  const notify = useNotify();
  const selected = data?.departments.find(
    (d) => departmentPath(d.name) === `/departments/${departmentId}`,
  );
  const denied =
    !!data &&
    !!departmentId &&
    (!selected || !selected.memberIds.includes(data.viewerId));
  useEffect(() => {
    if (denied)
      notify(
        "Department access required",
        "You can open departments that you belong to.",
        { variant: "error", href: null },
      );
  }, [denied, notify]);
  if (!data) return departmentId && workspace?.loading ? <DepartmentHomeSkeleton tab={params.get("tab")} /> : <LoadDirectory title="Departments" columns={5} />;
  if (denied) return <Navigate to="/departments" replace />;
  if (selected)
    return (
      <DepartmentWorkspace
        key={selected.id}
        department={selected}
        data={data}
      />
    );
  const departments = ORGANIZATION_DEPARTMENTS.map((name) =>
    data.departments.find((d) => d.name === name),
  )
    .filter((department) => department !== undefined)
    .filter((department) =>
      `${department.name} ${data.members.filter(member => (department.leadIds ?? (department.leadId ? [department.leadId] : [])).includes(member.id)).map(member => member.name).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.memberIds.includes(data.viewerId)) -
        Number(a.memberIds.includes(data.viewerId)),
    );
  return (
    <Directory title="Departments">
      <Search label="Find departments" value={search} onChange={setSearch} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Name</TableHead>
            <TableHead>Leads</TableHead>
            <TableHead>Membership</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Active projects</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {departments.map((d) => {
            const DepartmentIcon = getDepartmentIcon(d.name);
            const joined = d.memberIds.includes(data.viewerId);
            const members = d.memberIds.filter((id) =>
              !d.viewerIds?.includes(id) && data.members.some((m) => m.id === id),
            );
            return (
              <TableRow
                key={d.id}
                className={joined ? undefined : "opacity-70 grayscale"}
              >
                <TableCell className="py-4 pl-4 font-medium">
                  <span className="inline-flex items-center gap-2">
                    <DepartmentIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    {joined ? (
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => navigate(departmentPath(d.name))}
                      >
                        {d.name}
                      </button>
                    ) : (
                      <span>{d.name}</span>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <AssigneeAvatars
                    assigneeIds={d.leadIds ?? (d.leadId ? [d.leadId] : [])}
                    members={data.members}
                    assignmentRole="lead"
                    showNames
                  />
                </TableCell>
                <TableCell>
                  {joined ? (
                    <Badge variant="outline" className="gap-1 font-normal">
                      <IconCheck aria-hidden="true" className="size-3" />
                      {departmentAccess(d, data.viewerId) === "lead" ? "Lead" : departmentAccess(d, data.viewerId) === "viewer" ? "Viewer" : "Member"}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">Not a member</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <AssigneeAvatars
                      assigneeIds={members}
                      members={data.members}
                      assignmentRole="member"
                    />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {d.memberIds.filter((id) => !d.viewerIds?.includes(id)).length}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-2 tabular-nums">
                    <IconCube
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                    {
                      data.projects.filter(
                        (p) =>
                          p.departments.includes(d.name) &&
                          (p.total === 0 || p.done < p.total),
                      ).length
                    }
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
          {!departments.length && (
            <NoResults columns={5}>No departments match your search.</NoResults>
          )}
        </TableBody>
      </Table>
    </Directory>
  );
}
