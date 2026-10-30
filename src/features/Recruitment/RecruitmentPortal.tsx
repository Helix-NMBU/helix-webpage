import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconBriefcase, IconRefresh } from "@tabler/icons-react";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { useRecruitmentAccess } from "../MemberPlatform/RecruitmentAccess";
import { Button } from "../../libs/components/ui/button";
import { RecruitmentListSkeleton } from "../MemberPlatform/LoadingSkeletons";
import { Input } from "../../libs/components/ui/input";
import { Label } from "../../libs/components/ui/label";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../libs/components/ui/empty";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../libs/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../libs/components/ui/select";
import { currentSeason } from "../../libs/lib/season";
import { PositionsPanel } from "./PositionsPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../libs/components/ui/tabs";
import { type ApplicationRow } from "./website-api";


export default function RecruitmentPortal() {
  const navigate = useNavigate();
  const notify = useNotify();
  const { deny, api, applications, positions, ready, loading, refresh: load, removeApplication, savePosition, deletePosition, setPositionVisibility } = useRecruitmentAccess();
  const [season, setSeason] = useState(currentSeason());
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [target, setTarget] = useState<{ row: ApplicationRow; reject: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const mutation = useRef(false);
  const fail = useCallback((error: unknown) => {
    const status = error && typeof error === "object" && "status" in error ? error.status : 0;
    notify("Could not load applications", error instanceof Error ? error.message : "Please try again.", { id: "recruitment-access", variant: "error", href: null });
    if (status === 401 || status === 403) {
      generation.current += 1;
      setTarget(null);
      if (status === 403) deny();
      navigate(status === 401 ? "/login" : "/", { replace: true });
    }
  }, [navigate, notify, deny]);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; generation.current += 1; };
  }, []);
  const seasons = [...new Set([currentSeason(), ...applications.map(a => a.season)])].sort().reverse();
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return applications.filter(a => (season === "all" || a.season === season)
      && [a.full_name, a.email, a.position_title, a.study_program, a.study_program_other ?? ""].some(value => value.toLowerCase().includes(query)));
  }, [applications, season, search]);
  const download = async (row: ApplicationRow, kind: "cv" | "photo") => {
    const current = generation.current;
    setDownloading(`${row.id}-${kind}`);
    try {
      const result = await api.file(row.id, kind);
      if (!active.current || current !== generation.current) return;
      // The bucket serves an attachment; no signed links are persisted or cached.
      const link = document.createElement("a");
      link.href = result.url; link.rel = "noreferrer"; link.download = "";
      document.body.append(link); link.click(); link.remove();
    } catch (error) { if (active.current) fail(error); }
    finally { if (active.current) setDownloading(null); }
  };
  const confirm = async () => {
    if (!target || mutation.current) return;
    const current = generation.current;
    mutation.current = true; setBusy(true);
    try {
      const result = await removeApplication(target.row.id, target.reject);
      if (!active.current || current !== generation.current) return;
      setTarget(null);
      notify("Application removed", result.emailStatus === "sent" ? "Rejection email sent." : "No email was sent.", { variant: "success", href: null });
      if (result.cleanupPending) notify("File deletion pending", "Contact Helix to complete cleanup.", { variant: "warning", href: null });
    } catch { /* The session provider reports failures and retains the application. */ }
    finally { mutation.current = false; if (active.current) setBusy(false); }
  };
  return (
    <main className="text-foreground">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-3xl font-medium">Recruiting</h1></div>
          <Button variant="outline" size="icon" aria-label="Refresh applications" title="Refresh applications" disabled={loading || busy} onClick={() => void load()}><IconRefresh aria-hidden="true" /></Button>
        </header>
        <Tabs defaultValue="applications">
          <TabsList aria-label="Recruiting views"><TabsTrigger value="applications">Applications</TabsTrigger><TabsTrigger value="positions">Positions</TabsTrigger></TabsList>
          <TabsContent value="positions"><PositionsPanel positions={positions} loading={loading} onSave={savePosition} onDelete={deletePosition} onVisibilityChange={setPositionVisibility} /></TabsContent>
          <TabsContent value="applications" className="space-y-6">
        {loading && <RecruitmentListSkeleton />}
        {ready && !loading && <>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2"><Label htmlFor="application-season">Season</Label><Select value={season} onValueChange={setSeason}><SelectTrigger id="application-season" className="w-20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All seasons</SelectItem>{seasons.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
            <div className="min-w-60 flex-1 space-y-2"><Label htmlFor="application-search">Search applications</Label><Input id="application-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, email, position or study program" /></div>
          </div>
          <p className="text-sm text-muted-foreground">{filtered.length} {filtered.length === 1 ? "application" : "applications"}</p>
          {filtered.length > 0 ? <div className="divide-y rounded-lg border">
            {filtered.map(row => <article key={row.id}>
              <Button variant="ghost" className="h-auto w-full justify-between gap-3 whitespace-normal rounded-none px-5 py-4 text-left font-normal" aria-expanded={openId === row.id} aria-controls={`application-${row.id}`} onClick={() => setOpenId(value => value === row.id ? null : row.id)}>
                <span><span className="block font-medium">{row.full_name}</span><span className="text-sm text-muted-foreground">{row.position_title} · {row.season}</span></span>
                <span className="text-sm text-muted-foreground">{new Date(row.created_at).toLocaleDateString("en-GB")}</span>
              </Button>
              {openId === row.id && <div id={`application-${row.id}`} className="space-y-5 border-t p-5">
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Email</dt><dd><a className="underline" href={`mailto:${row.email}`}>{row.email}</a></dd></div>
                  <div><dt className="text-muted-foreground">Phone</dt><dd>{row.phone}</dd></div>
                  <div><dt className="text-muted-foreground">Study program</dt><dd>{row.study_program_other || row.study_program}</dd></div>
                  <div><dt className="text-muted-foreground">Study year</dt><dd>{row.year_of_study}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-muted-foreground">Motivation</dt><dd className="whitespace-pre-wrap">{row.motivation}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-muted-foreground">Other departments</dt><dd>{row.interested_departments.join(", ") || "None selected"}</dd></div>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={downloading !== null} onClick={() => void download(row, "cv")}>{downloading === `${row.id}-cv` ? "Preparing CV…" : "Download CV"}</Button>
                  {row.photo_path && <Button variant="outline" disabled={downloading !== null} onClick={() => void download(row, "photo")}>Download photo</Button>}
                  <Button variant="outline" disabled={busy} onClick={() => setTarget({ row, reject: false })}>Delete application</Button>
                  <Button variant="destructive" disabled={busy} onClick={() => setTarget({ row, reject: true })}>Reject application</Button>
                </div>
              </div>}
            </article>)}
          </div> : <Empty className="min-h-64 gap-4 rounded-lg border-0 py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon"><IconBriefcase aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>No applications found.</EmptyTitle>
              <EmptyDescription>Try another season or change your search.</EmptyDescription>
            </EmptyHeader>
          </Empty>}
        </>}
          </TabsContent>
        </Tabs>
        <Dialog open={target !== null} onOpenChange={open => { if (!open && !busy) setTarget(null); }}>
          <DialogContent showCloseButton={!busy} onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => { if (busy) e.preventDefault(); }}>
            <DialogHeader><DialogTitle>{target?.reject ? "Reject" : "Delete"} {target?.row.full_name}?</DialogTitle>
              <DialogDescription>This removes the application and its files. This cannot be undone.{target?.reject ? " A rejection email is sent only when email delivery is enabled for this recipient." : " No email will be sent."}</DialogDescription>
            </DialogHeader>
            <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setTarget(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={() => void confirm()}>{busy ? "Removing…" : target?.reject ? "Reject application" : "Delete application"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
