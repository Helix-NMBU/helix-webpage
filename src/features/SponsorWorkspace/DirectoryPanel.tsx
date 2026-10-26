import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@libs/components/ui/alert";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@libs/components/ui/empty";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import type { SponsorContext } from "./types";
import type { PublishedCvProfile, SponsorCvResponse, SponsorDirectoryRequest, SponsorDirectoryResponse, SponsorProfileResponse } from "./directory-types";

const emptyFilters = { q: "", programme: "", year: "", department: "", skill: "" };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Could not load Talent Directory. Please try again.";

function ContactLinks({ contactEmail, phone }: { contactEmail?: string; phone?: string }) {
  return <div className="flex flex-wrap gap-2">
    {contactEmail && <Button variant="outline" size="sm" asChild><a href={`mailto:${encodeURIComponent(contactEmail)}`}>Email member</a></Button>}
    {phone && <Button variant="outline" size="sm" asChild><a href={`tel:${encodeURIComponent(phone)}`}>Call member</a></Button>}
  </div>;
}

function ProfileContent({ profile }: { profile: PublishedCvProfile }) {
  return <div className="space-y-6">
    <div className="space-y-2">
      {profile.headline && <p className="font-medium">{profile.headline}</p>}
      {profile.city && <p className="text-sm text-muted-foreground">{profile.city}</p>}
      {profile.summary && <p className="whitespace-pre-wrap text-sm leading-relaxed">{profile.summary}</p>}
      <ContactLinks contactEmail={profile.contactEmail} phone={profile.phone} />
    </div>
    {profile.education.length > 0 && <section className="space-y-3"><h3 className="font-semibold">Education</h3>{profile.education.map((entry) => <div key={entry.id} className="space-y-1 text-sm"><p className="font-medium">{entry.degree}, {entry.institution}</p><p className="text-muted-foreground">{entry.startDate} to {entry.endDate}</p>{entry.description && <p className="whitespace-pre-wrap">{entry.description}</p>}</div>)}</section>}
    {profile.experience.length > 0 && <section className="space-y-3"><h3 className="font-semibold">Experience</h3>{profile.experience.map((entry) => <div key={entry.id} className="space-y-1 text-sm"><p className="font-medium">{entry.title}, {entry.organization}</p><p className="text-muted-foreground">{entry.startDate} to {entry.endDate}</p>{entry.department && <p>{entry.department}</p>}{entry.description && <p className="whitespace-pre-wrap">{entry.description}</p>}</div>)}</section>}
    {profile.projects.length > 0 && <section className="space-y-3"><h3 className="font-semibold">Projects</h3>{profile.projects.map((entry) => <div key={entry.id} className="space-y-1 text-sm"><p className="font-medium">{entry.name}{entry.role ? `, ${entry.role}` : ""}</p>{entry.season && <p className="text-muted-foreground">{entry.season}</p>}{entry.description && <p className="whitespace-pre-wrap">{entry.description}</p>}{entry.url && <a className="underline underline-offset-4" href={entry.url} target="_blank" rel="noopener noreferrer">Project website</a>}</div>)}</section>}
    {profile.skills.length > 0 && <section className="space-y-2"><h3 className="font-semibold">Skills</h3><div className="flex flex-wrap gap-2">{profile.skills.map((skill, index) => <Badge variant="secondary" key={`${skill}-${index}`}>{skill}</Badge>)}</div></section>}
    {profile.languages.length > 0 && <section className="space-y-2"><h3 className="font-semibold">Languages</h3><ul className="space-y-1 text-sm">{profile.languages.map((entry) => <li key={entry.id}>{entry.name}{entry.level ? `, ${entry.level}` : ""}</li>)}</ul></section>}
    {profile.links.some((entry) => entry.url) && <section className="space-y-2"><h3 className="font-semibold">Links</h3><ul className="space-y-1 text-sm">{profile.links.filter((entry) => entry.url).map((entry) => <li key={entry.id}><a className="break-all underline underline-offset-4" href={entry.url} target="_blank" rel="noopener noreferrer">{entry.label || entry.url}</a></li>)}</ul></section>}
    {profile.references && <section className="space-y-2"><h3 className="font-semibold">References</h3><p className="whitespace-pre-wrap text-sm">{profile.references}</p></section>}
  </div>;
}

export function DirectoryPanel({ context, request }: { context: SponsorContext; request: SponsorDirectoryRequest }) {
  const formId = useId();
  const [draft, setDraft] = useState(emptyFilters);
  const [query, setQuery] = useState(emptyFilters);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<SponsorDirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<SponsorProfileResponse | null>(null);
  const [profileError, setProfileError] = useState("");
  const [cvError, setCvError] = useState("");
  const [cvBusy, setCvBusy] = useState(false);
  const [cvPreview, setCvPreview] = useState<string | null>(null);
  const cvController = useRef<AbortController | null>(null);
  const canBrowse = context.portal && context.directory;
  const queryString = new URLSearchParams(query).toString();

  useEffect(() => {
    if (!canBrowse) return;
    const controller = new AbortController();
    setLoading(true); setData(null); setError("");
    void request<SponsorDirectoryResponse>("directory", { query: Object.fromEntries(new URLSearchParams(queryString)), signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(errorMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canBrowse, context.authUserId, queryString, attempt, request]);

  useEffect(() => {
    setProfile(null); setProfileError(""); setCvPreview(null); setCvError(""); setCvBusy(false);
    if (!selected || !canBrowse) return;
    const controller = new AbortController();
    void request<SponsorProfileResponse>("profile", { query: { id: selected }, signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setProfile(result); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setProfileError(errorMessage(failure)); });
    return () => { controller.abort(); cvController.current?.abort(); };
  }, [selected, canBrowse, context.authUserId, request]);

  async function openCv(disposition: "inline" | "attachment") {
    if (!selected) return;
    cvController.current?.abort();
    const controller = new AbortController(); cvController.current = controller;
    setCvBusy(true); setCvError(""); setCvPreview(null);
    try {
      const grant = await request<SponsorCvResponse>("cv", { query: { id: selected, disposition }, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (disposition === "inline") setCvPreview(grant.url);
      else window.location.assign(grant.url);
    } catch (failure) {
      if (!controller.signal.aborted) setCvError(errorMessage(failure));
    } finally { if (!controller.signal.aborted) setCvBusy(false); }
  }

  if (!canBrowse) return <Alert><AlertDescription>Your current agreement does not include Talent Directory access.</AlertDescription></Alert>;

  function apply(event: FormEvent) { event.preventDefault(); setQuery({ ...draft }); }
  const filterFields = [
    { key: "programme", label: "Study programme", values: data?.filters.programmes ?? [] },
    { key: "year", label: "Graduation year", values: data?.filters.years ?? [] },
    { key: "department", label: "Helix department", values: data?.filters.departments ?? [] },
    { key: "skill", label: "Skill", values: data?.filters.skills ?? [] },
  ] as const;

  return <section className="space-y-6" aria-labelledby={`${formId}-title`}>
    <div><h1 id={`${formId}-title`} className="text-2xl font-semibold tracking-tight">Talent Directory</h1><p className="mt-2 text-sm text-muted-foreground">Find Helix members and explore the profiles they have chosen to share.</p></div>
    <form onSubmit={apply} className="space-y-4" aria-label="Filter members">
      <div className="space-y-2"><Label htmlFor={`${formId}-search`}>Search by name</Label><Input id={`${formId}-search`} type="search" value={draft.q} maxLength={200} placeholder="Member name" onChange={(event) => setDraft((value) => ({ ...value, q: event.target.value }))} /></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{filterFields.map((field) => <div className="min-w-0 space-y-2" key={field.key}>
        <Label htmlFor={`${formId}-${field.key}`}>{field.label}</Label><Select value={draft[field.key] ? `value:${draft[field.key]}` : "all"} onValueChange={(value) => setDraft((current) => ({ ...current, [field.key]: value === "all" ? "" : value.slice(6) }))}>
          <SelectTrigger id={`${formId}-${field.key}`}><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem>{field.values.map((value) => <SelectItem value={`value:${value}`} key={value}>{value}</SelectItem>)}</SelectContent>
        </Select>
      </div>)}</div>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={loading}>Apply filters</Button><Button type="button" variant="outline" onClick={() => { setDraft(emptyFilters); setQuery(emptyFilters); }}>Clear filters</Button></div>
    </form>
    {loading && <p className="text-sm text-muted-foreground" role="status">Loading members…</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button className="mt-3" type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>Try again</Button></AlertDescription></Alert>}
    {data && !loading && <>
      <p className="text-sm text-muted-foreground" aria-live="polite">{data.members.length} of {data.total} members</p>
      {data.members.length === 0 ? <Empty className="border"><EmptyHeader><EmptyTitle>{data.total === 0 ? "No shared profiles yet" : "No members match these filters"}</EmptyTitle><EmptyDescription>{data.total === 0 ? "Member profiles will appear after members choose to share them with sponsors." : "Try another name or clear a filter."}</EmptyDescription></EmptyHeader></Empty> : <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{data.members.map((member) => <Card key={member.id}>
        <CardHeader><CardTitle className="break-words">{member.fullName}</CardTitle>{member.headline && <CardDescription>{member.headline}</CardDescription>}</CardHeader>
        <CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{[member.programme, member.graduationYear].filter(Boolean).join(" · ") || "Profile available"}</p>{member.departments.length > 0 && <p className="text-sm">{member.departments.join(", ")}</p>}<div className="flex flex-wrap gap-2">{member.skills.map((skill) => <Badge key={skill} variant="secondary">{skill}</Badge>)}</div></CardContent>
        <CardFooter className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setSelected(member.id)}>View profile</Button><ContactLinks contactEmail={member.contactEmail} phone={member.phone} /></CardFooter>
      </Card>)}</div>}
    </>}
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>{profile?.member.fullName ?? "Member profile"}</DialogTitle><DialogDescription>Published information shared with sponsors.</DialogDescription></DialogHeader>
      {!profile && !profileError && <p role="status">Loading profile…</p>}
      {profileError && <Alert variant="destructive"><AlertDescription>{profileError}</AlertDescription></Alert>}
      {profile && <><ProfileContent profile={profile.profile} />{profile.member.canViewCv && <div className="flex flex-wrap gap-2"><Button type="button" disabled={cvBusy} onClick={() => void openCv("inline")}>View CV</Button><Button type="button" variant="outline" disabled={cvBusy} onClick={() => void openCv("attachment")}>Download CV</Button></div>}{cvBusy && <p role="status">Opening shared CV…</p>}{cvError && <Alert variant="destructive"><AlertDescription>{cvError}</AlertDescription></Alert>}{cvPreview && <div className="space-y-2"><a className="text-sm underline underline-offset-4" href={cvPreview} target="_blank" rel="noopener noreferrer">Open CV in a new tab</a><iframe title={`${profile.member.fullName}'s shared CV`} src={cvPreview} className="h-[55dvh] w-full rounded-md border" /></div>}</>}
    </DialogContent></Dialog>
  </section>;
}
