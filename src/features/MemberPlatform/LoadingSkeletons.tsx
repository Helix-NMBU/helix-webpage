import { Skeleton } from "@libs/components/ui/skeleton";
import { useLocation } from "react-router-dom";
import type { FinancePageId } from "../Finance/routes";

function Rows({ columns = 4, rows = 4 }: { columns?: number; rows?: number }) {
  return <div className="overflow-hidden rounded-xl border bg-card">
    <div className="grid gap-4 border-b px-4 py-3" style={{ gridTemplateColumns: `2fr repeat(${columns - 1}, minmax(0, 1fr))` }} aria-hidden="true">
      {Array.from({ length: columns }, (_, index) => <Skeleton key={index} className="h-3 w-3/4" />)}
    </div>
    {Array.from({ length: rows }, (_, row) => <div key={row} className="grid items-center gap-4 border-b px-4 py-4 last:border-0" style={{ gridTemplateColumns: `2fr repeat(${columns - 1}, minmax(0, 1fr))` }} aria-hidden="true">
      {Array.from({ length: columns }, (_, column) => <Skeleton key={column} className={`h-4 ${column === 0 ? "w-4/5" : "w-2/3"}`} />)}
    </div>)}
  </div>;
}
function Board() {
  return <div className="flex gap-3 overflow-hidden" aria-hidden="true">{[0, 1, 2].map(column => <div key={column} className="w-[22rem] flex-none space-y-3 rounded-xl bg-muted/60 p-3 dark:bg-black/20"><Skeleton className="h-4 w-24" />{[0, 1, 2].map(card => <div key={card} className="space-y-3 rounded-lg border bg-card p-4"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-3 w-2/3" /><div className="flex justify-between"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="size-6 rounded-full" /></div></div>)}</div>)}</div>;
}
export function TaskListSkeleton({ label = "Loading tasks", title = "Tasks", board = false, personal = false }: { label?: string; title?: string; board?: boolean; personal?: boolean }) {
  return <section role="status" aria-label={label} className={`space-y-4 ${personal ? "mx-auto w-full max-w-7xl py-5" : "min-w-0"}`}>
    <div className="flex items-center justify-between gap-3"><h1 className={personal ? "text-2xl font-medium tracking-tight" : "text-xl font-medium"}>{title}</h1><div className="flex gap-2"><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-8" /></div></div>
    {!personal && <Skeleton className="h-9 w-full max-w-sm" />}
    {board ? <Board /> : <Rows columns={personal ? 5 : 4} />}
  </section>;
}
export function SeasonOverviewSkeleton() {
  return <section role="status" aria-label="Loading Season Overview" className="mx-auto w-full max-w-7xl space-y-10 py-6">
    <div className="space-y-2"><h1 className="text-3xl font-medium tracking-tight">Season Overview</h1><Skeleton className="h-4 w-80 max-w-full" /></div>
    <section className="space-y-3"><h2 className="text-base font-medium">Progress</h2><div className="space-y-3 rounded-xl border bg-card p-4"><div className="flex h-44 gap-3" aria-hidden="true"><div className="flex flex-col justify-between py-1">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-2 w-5" />)}</div><div className="flex-1 border-b border-l"><div className="flex h-full flex-col justify-between">{[0, 1, 2, 3].map(i => <div key={i} className="border-t border-dashed border-muted-foreground/15" />)}</div></div></div><div className="flex flex-wrap gap-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-3 w-24" />)}</div><Skeleton className="h-4 w-20" /><Rows columns={5} rows={3} /></div></section>
    <section className="space-y-3"><h2 className="text-base font-medium">Projects</h2><Rows columns={5} rows={3} /></section>
    <section className="space-y-3"><h2 className="text-base font-medium">Upcoming Milestones</h2><Rows columns={4} rows={2} /></section>
  </section>;
}
export function TaskDetailSkeleton() {
  return <section role="status" aria-label="Loading task" className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex justify-between pb-4"><Skeleton className="h-8 w-16" /><Skeleton className="h-8 w-24" /></div>
    <div className="grid min-w-0 flex-1 gap-6 md:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="space-y-7 px-2 pt-4 md:px-6"><Skeleton className="h-7 w-2/3" /><div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-3/5" /></div></div>
      <aside className="rounded-xl border bg-card p-4 md:mr-2"><h2 className="mb-5 text-sm font-medium text-muted-foreground">Properties</h2><div className="space-y-5">{[0, 1, 2, 3, 4, 5].map(index => <div key={index} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-28 max-w-full" /></div>)}</div></aside>
    </div>
  </section>;
}
export function FinanceContentSkeleton({ page, label = "Loading finance page", canRegister = false }: { page: FinancePageId; label?: string; canRegister?: boolean }) {
  return <div role="status" aria-label={label} className="space-y-6">
    <div className="flex justify-between gap-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-8 w-28" /></div>
    {page === "purchases" ? <>{canRegister && <div className="space-y-5 rounded-lg border p-6"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-2/3" /><div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map(i => <div key={i} className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-9 w-full" /></div>)}</div><Skeleton className="h-9 w-32" /></div>}<Rows columns={4} rows={3} /></> : page === "financing" ? <div className="space-y-4">{[0, 1, 2].map(i => <div key={i} className="space-y-3 rounded-xl border p-5"><div className="flex justify-between"><Skeleton className="h-5 w-44" /><Skeleton className="h-8 w-20" /></div><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/3" /></div>)}</div> : <div className="space-y-6">{[0, 1, 2].map(i => <section key={i} className="space-y-3"><Skeleton className="h-6 w-40" /><div className="flex flex-wrap gap-4">{[0, 1, 2, 3].map(j => <Skeleton key={j} className="h-4 w-28" />)}</div><Skeleton className="h-4 w-48" />{page === "budgets" ? <><div className="space-y-2 pt-3"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-2/3" /></div><Rows columns={4} rows={2} /></> : <Skeleton className="h-8 w-28" />}</section>)}</div>}
  </div>;
}
export function RecruitmentListSkeleton({ positions = false }: { positions?: boolean }) {
  return <div role="status" aria-label={positions ? "Loading positions" : "Loading applications"} className="space-y-5">
    {!positions && <><div className="flex items-end gap-4"><div className="space-y-2"><Skeleton className="h-3 w-12" /><Skeleton className="h-9 w-20" /></div><div className="flex-1 space-y-2"><Skeleton className="h-3 w-36" /><Skeleton className="h-9 w-full" /></div></div><Skeleton className="h-4 w-24" /></>}
    <div className="divide-y rounded-lg border">{[0, 1, 2, 3].map(i => <div key={i} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"><div className="space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-32" /></div><div className="flex gap-3"><Skeleton className={positions ? "h-8 w-32" : "h-3 w-20"} />{positions && <><Skeleton className="size-9" /><Skeleton className="size-9" /></>}</div></div>)}</div>
  </div>;
}
export function RecruitmentPageSkeleton({ label = "Checking recruitment access" }: { label?: string }) {
  return <main role="status" aria-label={label} className="mx-auto max-w-5xl space-y-8"><div className="flex items-center justify-between"><h1 className="text-3xl font-medium">Recruiting</h1><Skeleton className="size-9" /></div><div className="flex gap-2"><Skeleton className="h-9 w-28" /><Skeleton className="h-9 w-24" /></div><RecruitmentListSkeleton /></main>;
}
export function FinancePageSkeleton({ page, label = "Loading finance" }: { page: FinancePageId; label?: string }) {
  return <section role="status" aria-label={label} className="mx-auto w-full max-w-5xl space-y-8 px-2 py-8 sm:px-6"><div className="space-y-3"><p className="text-sm text-muted-foreground">Finance</p><h1 className="text-3xl font-medium capitalize tracking-tight">{page[0].toUpperCase() + page.slice(1)}</h1><Skeleton className="h-4 w-80 max-w-full" /></div><div className="flex gap-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8 w-24" />)}</div><FinanceContentSkeleton page={page} /></section>;
}
export function SignatureSkeleton({ editor = false }: { editor?: boolean }) {
  return <div role="status" aria-label="Loading signature" className="space-y-3">{editor && <><div className="flex justify-between"><Skeleton className="h-5 w-40" /><Skeleton className="h-8 w-28" /></div>{[0, 1, 2].map(i => <div key={i} className="flex items-center justify-between rounded-md border p-3"><Skeleton className="h-4 w-36" /><Skeleton className="h-4 w-14" /></div>)}</>}<div className="flex items-start gap-4 rounded-md border p-4"><Skeleton className="size-12 rounded" /><div className="space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-40" /></div></div></div>;
}
export function MemberRouteSkeleton() {
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);
  const board = params.get("view") === "board";
  const timeline = params.get("view") === "timeline";
  const financePage = pathname.split("/")[2];
  const page: FinancePageId = financePage === "purchases" || financePage === "budgets" || financePage === "financing" ? financePage : "overview";
  let content = <section className="mx-auto flex w-full max-w-3xl flex-col justify-center gap-8 px-2 py-12 sm:px-6"><div className="space-y-4"><Skeleton className="h-4 w-28" /><Skeleton className="h-10 w-96 max-w-full" /><Skeleton className="h-4 w-56" /></div><div className="flex flex-wrap gap-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-9 w-44" />)}</div><div className="space-y-6 rounded-xl border p-4"><Skeleton className="h-4 w-2/3" /><div className="h-14" /><div className="flex justify-between"><Skeleton className="h-8 w-32" /><Skeleton className="size-9 rounded-full" /></div></div></section>;
  if (pathname === "/season-overview") content = <SeasonOverviewSkeleton />;
  else if (/^\/tasks\/[^/]+/.test(pathname)) content = <TaskDetailSkeleton />;
  else if (pathname === "/tasks" || /\/tasks\/?$/.test(pathname)) content = <TaskListSkeleton personal={pathname === "/tasks"} title={pathname === "/tasks" ? "My tasks" : "Tasks"} board={board} />;
  else if (pathname.startsWith("/finance")) content = <FinancePageSkeleton page={page} />;
  else if (pathname === "/recruiting") content = <RecruitmentPageSkeleton />;
  else if (/^\/projects\/[^/]+/.test(pathname)) content = <ProjectDetailSkeleton tab={params.get("tab")} board={board} />;
  else if (/^\/departments\/[^/]+\/projects\/?$/.test(pathname)) content = <div className="space-y-4"><h1 className="text-lg font-medium">Projects</h1><Skeleton className="h-8 w-56" />{timeline ? <TimelineSkeleton /> : <Rows columns={5} />}</div>;
  else if (/^\/departments\/[^/]+/.test(pathname)) content = <DepartmentHomeSkeleton tab={params.get("tab")} />;
  else if (pathname === "/profile") content = <div className="space-y-5"><div><h1 className="text-2xl font-medium">Profile</h1><p className="text-muted-foreground">Manage your profile, CV and sponsor visibility.</p></div><ProfileContentSkeleton /></div>;
  else if (pathname === "/mail") content = <MailShellSkeleton />;
  else if (pathname === "/settings") content = <SettingsPageSkeleton />;
  else if (pathname === "/notifications") content = <NotificationsSkeleton />;
  else if (pathname.startsWith("/teams/")) content = <TeamPageSkeleton />;
  else if (["/members", "/projects", "/departments"].includes(pathname)) content = <div className="space-y-4"><h1 className="text-lg font-medium capitalize">{pathname.slice(1)}</h1><Skeleton className="h-8 w-56" />{pathname === "/projects" && timeline ? <TimelineSkeleton /> : <Rows columns={5} />}</div>;
  return content;
}

export function WorkspaceShellSkeleton({ label = "Loading your workspace" }: { label?: string }) {
  return <div role="status" aria-label={label} className="flex min-h-screen w-full"><aside aria-hidden="true" className="hidden w-64 shrink-0 space-y-6 border-r p-4 md:block"><Skeleton className="h-10 w-40" />{[0, 1, 2].map(group => <div key={group} className="space-y-4"><Skeleton className="h-3 w-20" />{[0, 1, 2].map(row => <div key={row} className="flex items-center gap-3"><Skeleton className="size-4" /><Skeleton className="h-4 w-28" /></div>)}</div>)}</aside><div className="min-w-0 flex-1"><div aria-hidden="true" className="flex h-16 items-center gap-3 border-b px-6"><Skeleton className="size-5" /><Skeleton className="h-4 w-40" /></div><div className="p-6"><MemberRouteSkeleton /></div></div></div>;
}

export function ActivitySkeleton() {
  return <section role="status" aria-label="Loading project activity" className="space-y-4"><h2 className="text-xl font-medium">Activity</h2><Skeleton className="h-3 w-72 max-w-full" /><div className="divide-y rounded-xl border px-4">{[0, 1, 2, 3].map(i => <div key={i} className="flex items-center justify-between gap-4 py-4"><div className="space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-32" /></div><Skeleton className="h-3 w-20" /></div>)}</div></section>;
}

export function ResourceSkeleton() {
  return <div role="status" aria-label="Loading department resources" className="flex max-w-xl items-center justify-between gap-4 rounded-lg border p-4"><div className="flex items-center gap-3"><Skeleton className="size-5 shrink-0" /><div className="space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-56 max-w-full" /></div></div><Skeleton className="size-4" /></div>;
}
export function ProjectDetailSkeleton({ label = "Loading project", tab, board = false }: { label?: string; tab?: string | null; board?: boolean }) {
  return <section role="status" aria-label={label} className="flex min-h-0 flex-1 flex-col gap-4"><div className="flex gap-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-9 w-24 rounded-full" />)}</div><div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_21rem]"><div className="space-y-6 py-2">{tab === "tasks" ? <TaskListSkeleton label="Loading project tasks" board={board} /> : tab === "activity" ? <ActivitySkeleton /> : <><Skeleton className="h-7 w-2/3" /><div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div><div className="grid grid-cols-3 gap-5 border-y py-5">{[0, 1, 2].map(i => <div key={i} className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-6 w-10" /></div>)}</div><Skeleton className="h-9 w-24" /></>}</div><aside className="space-y-5 border-t px-4 pt-4 md:border-l md:border-t-0">{[0, 1, 2, 3, 4].map(i => <div key={i} className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-4 w-32" /></div>)}</aside></div></section>;
}
export function DepartmentHomeSkeleton({ label = "Loading department", tab }: { label?: string; tab?: string | null }) {
  if (tab === "members" || tab === "documents") return <section role="status" aria-label={label} className="space-y-8"><div className="flex gap-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-9 w-24 rounded-full" />)}</div><h1 className="text-xl font-medium">{tab === "members" ? "Members" : "Documents"}</h1>{tab === "members" ? <Rows columns={4} /> : <ResourceSkeleton />}</section>;
  return <section role="status" aria-label={label} className="space-y-8"><div className="flex gap-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-9 w-24 rounded-full" />)}</div><div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_18rem]"><div className="space-y-8"><div className="space-y-3"><Skeleton className="h-8 w-56" /><Skeleton className="h-4 w-3/4" /></div><div className="space-y-4"><h2 className="text-lg font-medium">Department resources</h2><ResourceSkeleton /></div></div><aside className="space-y-6">{[0, 1, 2].map(i => <div key={i} className="space-y-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-32" /></div>)}</aside></div></section>;
}
export function ProfileContentSkeleton() {
  return <section role="status" aria-label="Loading profile" className="space-y-6"><div className="space-y-6 rounded-xl border bg-card p-6"><div className="flex items-center gap-4"><Skeleton className="size-16 rounded-xl" /><div className="space-y-2"><Skeleton className="h-5 w-44" /><Skeleton className="h-4 w-36" /><Skeleton className="h-4 w-48" /></div></div><div className="grid grid-cols-2 gap-5 border-t pt-5">{[0, 1].map(i => <div key={i} className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-4 w-32" /></div>)}</div></div><div className="space-y-4"><h2 className="text-xl font-medium">CV</h2><div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-5"><div className="space-y-3"><Skeleton className="h-5 w-36" /><Skeleton className="h-5 w-44" /></div><div className="flex gap-2"><Skeleton className="size-8" /><Skeleton className="size-8" /></div></div></div></section>;
}
export function TeamPageSkeleton() {
  return <section role="status" aria-label="Loading feature access" className="mx-auto w-full max-w-5xl space-y-8 px-2 py-8 sm:px-6"><div className="space-y-3"><Skeleton className="h-4 w-28" /><Skeleton className="h-9 w-48" /><Skeleton className="h-4 w-80 max-w-full" /></div><div className="space-y-4 rounded-xl border p-6"><Skeleton className="h-5 w-32" /><Rows columns={3} /></div></section>;
}

function MailShellSkeleton() {
  return <div className="grid min-h-[65vh] overflow-hidden rounded-xl border md:grid-cols-[20rem_minmax(0,1fr)]"><div className="border-b md:border-b-0 md:border-r"><div className="space-y-4 p-4"><div className="flex justify-between"><Skeleton className="h-6 w-28" /><Skeleton className="size-8" /></div><Skeleton className="h-9 w-full" /></div><div className="divide-y">{[0, 1, 2, 3].map(i => <div key={i} className="space-y-2 p-4"><div className="flex justify-between"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-12" /></div><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-4/5" /></div>)}</div></div><div className="hidden space-y-6 p-6 md:block"><Skeleton className="h-6 w-2/3" /><div className="space-y-2"><Skeleton className="h-4 w-44" /><Skeleton className="h-3 w-32" /></div><div className="space-y-2 border-t pt-6">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-3 w-4/5" />)}</div></div></div>;
}
function SettingsPageSkeleton() {
  return <section className="mx-auto w-full max-w-3xl space-y-8 px-2 py-8 sm:px-6"><div className="space-y-3"><h1 className="text-3xl font-medium">Settings</h1><p className="text-muted-foreground">Your connected accounts and workspace access.</p></div><div className="space-y-4 rounded-xl border p-6"><h2 className="font-medium">App connections</h2><Skeleton className="h-4 w-72 max-w-full" />{[0, 1].map(i => <div key={i} className="flex items-center gap-3 border-t py-3"><Skeleton className="size-8" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-32" /></div><Skeleton className="h-8 w-24" /></div>)}</div><div className="space-y-4 rounded-xl border p-6"><h2 className="font-medium">Email signature</h2><SignatureSkeleton /></div></section>;
}
function NotificationsSkeleton() {
  return <section className="mx-auto w-full max-w-4xl space-y-6 py-8"><div className="space-y-2"><h1 className="text-3xl font-medium">Notifications</h1><p className="text-sm text-muted-foreground">Updates from your member platform.</p></div><div className="divide-y rounded-xl border">{[0, 1, 2].map(i => <div key={i} className="flex gap-3 p-5"><Skeleton className="size-4" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-24" /></div></div>)}</div></section>;
}

export function TimelineSkeleton() {
  return <div className="space-y-3 rounded-xl border p-4" aria-hidden="true"><div className="flex justify-between"><Skeleton className="h-4 w-32" /><Skeleton className="h-8 w-32" /></div>{[0, 1, 2, 3].map(i => <div key={i} className="flex items-center gap-4 border-t py-3"><Skeleton className="h-4 w-36" /><Skeleton className={`h-6 ${i % 2 ? "w-1/3" : "w-1/2"}`} /></div>)}</div>;
}
