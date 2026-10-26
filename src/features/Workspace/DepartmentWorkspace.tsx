import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  IconBrandGoogleDrive,
  IconCube,
  IconExternalLink,
  IconLink,
  IconSettings,
  IconUserSquare,
} from "@tabler/icons-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import { Skeleton } from "@libs/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@libs/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@libs/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import { Badge } from "@libs/components/ui/badge";
import { AssigneeAvatars } from "../ProjectManagement/TaskAssignees";
import type { ProjectDepartment } from "../ProjectManagement/types";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { getDepartmentIcon } from "./department-icons";
import {
  departmentHomeRepository,
  type DepartmentHomeRepository,
} from "./department-home-repository";
import {
  googleDriveFolder,
  type DepartmentHome,
  type DepartmentHomeChange,
} from "./department-home";
import { WorkspaceRequestError } from "./repository";
import { departmentPath, type WorkspaceDirectory } from "./types";
import { monthDate } from "./DirectoryComponents";

function DepartmentSettings({
  home,
  busy,
  onSave,
  onClose,
}: {
  home: DepartmentHome;
  busy: boolean;
  onSave: (change: DepartmentHomeChange) => Promise<void>;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(home.description);
  const [folder, setFolder] = useState(home.driveFolderUrl ?? "");
  const notify = useNotify();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    try {
      const driveFolderUrl = googleDriveFolder(folder);
      await onSave({
        action: "save_department_home",
        departmentId: home.departmentId,
        expectedRevision: home.revision,
        description,
        driveFolderUrl,
      });
    } catch (error) {
      notify(
        "Could not save department settings",
        error instanceof Error
          ? error.message
          : "Check the department details.",
        { variant: "error", href: null },
      );
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Department settings</DialogTitle>
          <DialogDescription>
            Add a description and the department’s shared Google Drive folder.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={busy} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="department-description">Description</Label>
              <Textarea
                autoFocus
                id="department-description"
                rows={4}
                maxLength={2000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department-drive-folder">
                Shared Google Drive folder
              </Label>
              <Input
                id="department-drive-folder"
                type="url"
                maxLength={2048}
                placeholder="https://drive.google.com/drive/folders/…"
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Documents stay in Google Drive. Members need access to the
                shared folder in Google Drive.
              </p>
            </div>
          </fieldset>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save settings"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function DriveResource({
  home,
  onConfigure,
  compact = false,
}: {
  home: DepartmentHome;
  onConfigure: () => void;
  compact?: boolean;
}) {
  if (!home.driveFolderUrl)
    return (
      <div className="space-y-3 py-2">
        <p className="text-sm text-muted-foreground">
          No shared Drive folder has been linked.
        </p>
        {home.canEdit && (
          <Button variant="outline" size="sm" onClick={onConfigure}>
            Link shared folder
          </Button>
        )}
      </div>
    );
  return (
    <a
      className={`group flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 ${compact ? "max-w-xl" : ""}`}
      href={home.driveFolderUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="flex items-center gap-3">
        <IconBrandGoogleDrive
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground"
        />
        <span>
          <span className="block text-sm font-medium">Shared Google Drive</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Open the department’s documents and resources
          </span>
        </span>
      </span>
      <IconExternalLink
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
    </a>
  );
}
export function DepartmentWorkspace({
  department,
  data,
}: {
  department: ProjectDepartment;
  data: WorkspaceDirectory;
}) {
  const [home, setHome] = useState<DepartmentHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const repository = useRef<Promise<DepartmentHomeRepository> | null>(null);
  const generation = useRef(0);
  const alive = useRef(false);
  const saving = useRef(false);
  const [params, setParams] = useSearchParams();
  const selected = params.get("tab");
  const tab =
    selected === "documents" || selected === "members" ? selected : "overview";
  const notify = useNotify();
  const navigate = useNavigate();
  const DepartmentIcon = getDepartmentIcon(department.name);
  const members = data.members.filter((member) =>
    department.memberIds.includes(member.id),
  );
  const projects = data.projects.filter((project) =>
    project.departments.includes(department.name),
  );
  const getRepository = useCallback(
    () => (repository.current ??= departmentHomeRepository()),
    [],
  );
  const load = useCallback(async () => {
    if (saving.current) return;
    const current = ++generation.current;
    setLoading(true);
    try {
      const next = await (await getRepository()).load(department.id);
      if (alive.current && generation.current === current) setHome(next);
    } catch (error) {
      if (!alive.current || generation.current !== current) return;
      setHome(null);
      notify(
        "Could not load department workspace",
        error instanceof Error ? error.message : "Try again.",
        {
          variant: "error",
          href: null,
          action: { label: "Try again", onClick: () => void load() },
        },
      );
      if (
        error instanceof WorkspaceRequestError &&
        [401, 403].includes(error.status)
      )
        navigate(error.status === 401 ? "/login" : "/departments", {
          replace: true,
        });
    } finally {
      if (alive.current && generation.current === current) setLoading(false);
    }
  }, [getRepository, department.id, notify, navigate]);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, [load]);
  function selectTab(value: string) {
    const next = new URLSearchParams(params);
    if (value === "overview") next.delete("tab");
    else next.set("tab", value);
    setParams(next);
  }
  async function save(change: DepartmentHomeChange) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    const current = ++generation.current;
    try {
      const next = await (await getRepository()).save(change);
      if (!alive.current || generation.current !== current) return;
      setHome(next);
      setEditing(false);
      notify(
        "Department settings saved",
        "The description and shared Drive folder have been updated.",
        { variant: "success", href: null },
      );
    } catch (error) {
      if (alive.current) {
        notify(
          "Could not save department settings",
          error instanceof Error
            ? error.message
            : "Your input has been kept. Try again.",
          { variant: "error", href: null },
        );
        if (
          error instanceof WorkspaceRequestError &&
          [401, 403].includes(error.status)
        ) {
          setHome(null);
          setEditing(false);
          navigate(error.status === 401 ? "/login" : "/departments", {
            replace: true,
          });
        }
      }
    } finally {
      saving.current = false;
      if (alive.current) {
        setBusy(false);
        setLoading(false);
      }
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${departmentPath(department.name)}`,
      );
      notify(
        "Department link copied",
        "Share it with members of this department.",
        { variant: "success", href: null },
      );
    } catch {
      notify(
        "Could not copy link",
        "Copy the department URL from your browser’s address bar.",
        { variant: "error", href: null },
      );
    }
  }
  return (
    <section
      aria-label={`${department.name} workspace`}
      className="space-y-4 pb-8"
    >
      <header className="flex items-center justify-between border-b pb-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <DepartmentIcon
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
          {department.name}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Copy department link"
          onClick={() => void copyLink()}
        >
          <IconLink aria-hidden="true" className="size-4" />
        </Button>
      </header>
      <Tabs className="flex-col" value={tab} onValueChange={selectTab}>
        <TabsList
          aria-label="Department workspace"
          className="h-auto gap-2 rounded-none bg-transparent p-0"
        >
          <TabsTrigger
            value="overview"
            className="rounded-full border bg-muted/40 px-4 py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="documents"
            className="rounded-full border bg-muted/40 px-4 py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground"
          >
            Documents
          </TabsTrigger>
          <TabsTrigger
            value="members"
            className="rounded-full border bg-muted/40 px-4 py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground"
          >
            Members
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-7">
          <div className="mx-auto grid max-w-6xl gap-10 px-1 py-2 md:grid-cols-[minmax(0,1fr)_13rem] md:gap-12 lg:px-8">
            <div className="min-w-0 space-y-10">
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <DepartmentIcon aria-hidden="true" className="size-7" />
                  </span>
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {department.name}
                  </h1>
                </div>
                {home?.description ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {home.description}
                  </p>
                ) : home?.canEdit ? (
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => setEditing(true)}
                  >
                    Add a description…
                  </button>
                ) : null}
              </div>
              <section
                aria-labelledby="department-resources-title"
                className="space-y-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <h2
                    id="department-resources-title"
                    className="text-lg font-medium"
                  >
                    Department resources
                  </h2>
                  {home?.canEdit && home.driveFolderUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(true)}
                    >
                      Edit
                    </Button>
                  )}
                </div>
                {loading && !home ? (
                  <Skeleton
                    className="h-20 w-full"
                    aria-label="Loading department resources"
                  />
                ) : home ? (
                  <DriveResource
                    home={home}
                    onConfigure={() => setEditing(true)}
                    compact
                  />
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void load()}
                  >
                    Try again
                  </Button>
                )}
              </section>
            </div>
            <aside className="space-y-8">
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Members
                </h2>
                <button
                  type="button"
                  className="rounded-md text-left focus-visible:outline focus-visible:outline-2"
                  aria-label={`View ${members.length} department members`}
                  onClick={() => selectTab("members")}
                >
                  <AssigneeAvatars
                    assigneeIds={members.map((member) => member.id)}
                    members={members}
                    assignmentRole="member"
                    maxVisible={5}
                  />
                </button>
              </div>
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Lead
                </h2>
                <AssigneeAvatars
                  assigneeIds={department.leadId ? [department.leadId] : []}
                  members={data.members}
                  assignmentRole="lead"
                  showNames
                />
              </div>
              <nav aria-label="Department quick links" className="space-y-1">
                <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                  Go to
                </h2>
                <Button
                  className="w-full justify-start gap-2 px-0 font-normal"
                  variant="ghost"
                  onClick={() => selectTab("documents")}
                >
                  <IconBrandGoogleDrive aria-hidden="true" className="size-4" />
                  Documents
                </Button>
                <Button
                  className="w-full justify-start gap-2 px-0 font-normal"
                  variant="ghost"
                  onClick={() => selectTab("members")}
                >
                  <IconUserSquare aria-hidden="true" className="size-4" />
                  Members
                </Button>
                <Button
                  className="w-full justify-start gap-2 px-0 font-normal"
                  variant="ghost"
                  onClick={() =>
                    navigate(
                      `/projects?department=${encodeURIComponent(department.id)}`,
                    )
                  }
                >
                  <IconCube aria-hidden="true" className="size-4" />
                  Projects
                  <span className="ml-auto text-xs text-muted-foreground">
                    {projects.length}
                  </span>
                </Button>
                {home?.canEdit && (
                  <Button
                    className="w-full justify-start gap-2 px-0 font-normal"
                    variant="ghost"
                    onClick={() => setEditing(true)}
                  >
                    <IconSettings aria-hidden="true" className="size-4" />
                    Department settings
                  </Button>
                )}
              </nav>
            </aside>
          </div>
        </TabsContent>
        <TabsContent
          value="documents"
          className="mx-auto mt-8 w-full max-w-6xl space-y-6 px-1 lg:px-8"
        >
          <div className="space-y-2">
            <h1 className="text-xl font-medium">Documents</h1>
            <p className="text-sm text-muted-foreground">
              Documents are stored in the department’s shared Google Drive
              folder.
            </p>
          </div>
          {loading && !home ? (
            <Skeleton className="h-20 w-full" />
          ) : home ? (
            <DriveResource
              home={home}
              onConfigure={() => setEditing(true)}
              compact
            />
          ) : (
            <Button variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          )}
        </TabsContent>
        <TabsContent value="members" className="mt-8 space-y-4">
          <h1 className="text-xl font-medium">
            Members{" "}
            <span className="ml-1 text-sm text-muted-foreground">
              {members.length}
            </span>
          </h1>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Department role</TableHead>
                  <TableHead>Helix title</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="py-4 pl-4">
                      <AssigneeAvatars
                        assigneeIds={[member.id]}
                        members={data.members}
                        assignmentRole="member"
                        showNames
                      />
                    </TableCell>
                    <TableCell>
                      {department.leadId === member.id ? (
                        <Badge variant="secondary">Lead</Badge>
                      ) : (
                        "Member"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.helixRole || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {monthDate(member.joinedAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {!members.length && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No active members.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
      {editing && home?.canEdit && (
        <DepartmentSettings
          key={home.revision}
          home={home}
          busy={busy}
          onSave={save}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  );
}
