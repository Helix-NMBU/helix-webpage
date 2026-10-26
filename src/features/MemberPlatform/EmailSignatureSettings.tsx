import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Switch } from "@libs/components/ui/switch";
import { Skeleton } from "@libs/components/ui/skeleton";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@libs/components/ui/collapsible";
import { EmailHtmlFrame } from "./EmailHtmlFrame";
import { useMemberAccount } from "./MemberAccountContext";
import { useMemberFeatureAccess } from "./MemberFeatureAccess";
import { useNotify } from "./MemberNotifications";
import { emailSignatureRequest } from "./email-signature-api";
import { defaultSignatureSettings, parseSignatureSettings, renderSignature, type SignatureSettings, type SignatureSnapshot } from "./email-signature";

function SignatureDisclosure({ title, summary, label, defaultOpen = false, children }: { title: string; summary?: ReactNode; label?: string; defaultOpen?: boolean; children: ReactNode }) {
  return <Collapsible defaultOpen={defaultOpen} className="min-w-0 rounded-md border">
    <CollapsibleTrigger type="button" aria-label={label} className="group flex w-full min-w-0 items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      {summary && <span className="flex min-w-0 max-w-[45%] items-center gap-2 truncate text-xs text-muted-foreground">{summary}</span>}
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
    <CollapsibleContent><div className="space-y-3 border-t p-3">{children}</div></CollapsibleContent>
  </Collapsible>;
}

export function EmailSignatureSettings() {
  const access = useMemberFeatureAccess();
  const account = useMemberAccount();
  const notify = useNotify();
  const owner = useRef<string | null>(access.authUserId);
  owner.current = access.authUserId;
  const isAdmin = access.member?.roles.some((role) => role.key === "platform_administrator") ?? false;
  const [saved, setSaved] = useState<SignatureSnapshot | null>(null);
  const [draft, setDraft] = useState<SignatureSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await emailSignatureRequest(owner);
      setSaved(result);
      setDraft(result.settings);
    } catch (error) {
      notify("Could not load signature", error instanceof Error ? error.message : "Please try again.", {
        id: "email-signature-load", variant: "error", href: null,
        action: { label: "Try again", onClick: () => void load() },
      });
    } finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!draft || !saved) return;
    setBusy(true);
    try {
      const settings = parseSignatureSettings(draft);
      const result = await emailSignatureRequest(owner, { settings, revision: saved.revision });
      setSaved(result);
      setDraft(result.settings);
      notify("Email signature saved", "New messages, replies, and forwards will use the shared signature.", { href: null });
    } catch (error) {
      notify("Could not save signature", error instanceof Error ? error.message : "Please try again.", { variant: "error", href: null });
    } finally { setBusy(false); }
  }

  function patchLine(index: number, patch: Partial<SignatureSettings["lines"][number]>) {
    setDraft((current) => current ? { ...current, lines: current.lines.map((line, i) => i === index ? { ...line, ...patch } : line) } : current);
  }

  let preview = saved?.signature ?? { html: "", text: "" };
  if (draft) {
    try { preview = renderSignature(parseSignatureSettings({ ...draft, enabled: true }), saved?.member ?? { name: account?.name ?? "", email: account?.email ?? "", role: account?.helixRole ?? "", phone: "" }); }
    catch { /* Keep the last saved preview while a field is incomplete. Save validates every field. */ }
  }
  const changed = JSON.stringify(draft) !== JSON.stringify(saved?.settings);

  return <Card id="email-signature" size="sm" className="scroll-mt-8 shadow-none">
    <CardHeader>
      <CardTitle className="text-base">Email signature</CardTitle>
      <CardDescription className="text-xs leading-5">Shared across all members. Only Platform Administrators can edit the design.</CardDescription>
    </CardHeader>
    <CardContent className="gap-4">
      {loading ? <div role="status" aria-label="Loading signature"><Skeleton className="h-32 w-full" /></div> : !draft ? <Button variant="outline" onClick={() => void load()}>Reload signature</Button> : <>
        {isAdmin ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3"><Switch id="signature-enabled" checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} /><Label htmlFor="signature-enabled" className="text-xs">Include in outgoing emails</Label></div>
              <Button type="button" variant="outline" size="sm" onClick={() => {
                setDraft({ ...structuredClone(defaultSignatureSettings), enabled: draft.enabled });
                notify("Helix design loaded", "Save the signature to apply this design to every member.", { variant: "info", href: null });
              }}>Use Helix design</Button>
            </div>
            <SignatureDisclosure title="Organization logo" summary={draft.logoUrl ? "Configured" : "None"}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="signature-logo">Logo URL</Label><Input id="signature-logo" type="url" placeholder="https://.../logo.png" value={draft.logoUrl} onChange={(event) => setDraft({ ...draft, logoUrl: event.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="signature-logo-alt">Logo description</Label><Input id="signature-logo-alt" value={draft.logoAlt} onChange={(event) => setDraft({ ...draft, logoAlt: event.target.value })} /></div>
              </div>
              <p className="text-xs text-muted-foreground">Use a publicly accessible HTTPS image.</p>
            </SignatureDisclosure>
            <SignatureDisclosure title="Signature text" summary={`${draft.lines.length} lines`}>
              <p className="text-xs leading-5 text-muted-foreground">Dynamic fields: {"{member.name}"}, {"{member.role}"}, {"{member.phone}"}, {"{member.email}"}. Missing role and phone lines are omitted.</p>
              <div className="space-y-2">{draft.lines.map((line, index) => <SignatureDisclosure key={index} title={line.text || "New text line"} label={`Signature line ${index + 1} settings`} defaultOpen={!line.text} summary={<><span aria-hidden="true" className="size-3 shrink-0 rounded-sm border" style={{ backgroundColor: line.color }} /><span className="whitespace-nowrap">{line.fontSize ?? 14}px{line.fontWeight === 700 ? " · Bold" : ""}</span></>}>
                <div className="flex items-center gap-2"><Input aria-label={`Signature line ${index + 1}`} value={line.text} maxLength={400} className="h-8" onChange={(event) => patchLine(index, { text: event.target.value })} />
                  <Button type="button" variant="ghost" size="sm" aria-label={`Remove line ${index + 1}`} onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, i) => i !== index) })}>Remove</Button></div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2"><Label htmlFor={`signature-line-color-${index}`} className="text-xs">Color</Label><Input id={`signature-line-color-${index}`} aria-label={`Color for line ${index + 1}`} type="color" value={line.color} className="h-8 w-10 p-1" onChange={(event) => patchLine(index, { color: event.target.value })} /></div>
                  <div className="flex items-center gap-2"><Label htmlFor={`signature-line-size-${index}`} className="text-xs">Size (px)</Label><Input id={`signature-line-size-${index}`} aria-label={`Font size for line ${index + 1}`} type="number" min={10} max={40} value={line.fontSize ?? 14} className="h-8 w-20" onChange={(event) => patchLine(index, { fontSize: Number(event.target.value) })} /></div>
                  <Label className="flex items-center gap-2 text-xs"><Checkbox aria-label={`Bold line ${index + 1}`} checked={line.fontWeight === 700} onCheckedChange={(checked) => patchLine(index, { fontWeight: checked === true ? 700 : 400 })} />Bold</Label>
                </div>
              </SignatureDisclosure>)}</div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="outline" size="sm" disabled={draft.lines.length >= 12} onClick={() => setDraft({ ...draft, lines: [...draft.lines, { text: "", color: "#202124", fontSize: 14, fontWeight: 400 }] })}>Add text line</Button>
                <div className="flex items-center gap-2"><Label htmlFor="signature-line-spacing" className="text-xs">Spacing (px)</Label><Input id="signature-line-spacing" type="number" min={0} max={16} value={draft.lineSpacing ?? 0} className="h-8 w-20" onChange={(event) => setDraft({ ...draft, lineSpacing: Number(event.target.value) })} /></div>
              </div>
            </SignatureDisclosure>
            <SignatureDisclosure title="Helix website and social links" summary={`${draft.links.length} links`}>
              <div className="space-y-2">{draft.links.map((link, index) => <SignatureDisclosure key={index} title={link.label || "New link"} label={`Link ${index + 1} settings`} defaultOpen={!link.label} summary={<span className="truncate">{link.url.replace(/^https:\/\//, "")}</span>}>
                <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                  <div className="space-y-1.5"><Label htmlFor={`signature-link-label-${index}`} className="text-xs">Label</Label><Input id={`signature-link-label-${index}`} aria-label={`Link ${index + 1} label`} placeholder="LinkedIn" value={link.label} className="h-8" onChange={(event) => setDraft({ ...draft, links: draft.links.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></div>
                  <div className="space-y-1.5"><Label htmlFor={`signature-link-url-${index}`} className="text-xs">URL</Label><Input id={`signature-link-url-${index}`} aria-label={`Link ${index + 1} URL`} type="url" placeholder="https://..." value={link.url} className="h-8" onChange={(event) => setDraft({ ...draft, links: draft.links.map((item, i) => i === index ? { ...item, url: event.target.value } : item) })} /></div>
                </div>
                <Button type="button" variant="ghost" size="sm" aria-label={`Remove link ${index + 1}`} onClick={() => setDraft({ ...draft, links: draft.links.filter((_, i) => i !== index) })}>Remove link</Button>
              </SignatureDisclosure>)}</div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="outline" size="sm" disabled={draft.links.length >= 8} onClick={() => setDraft({ ...draft, links: [...draft.links, { label: "", url: "" }] })}>Add link</Button>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2"><Label htmlFor="signature-link-color" className="text-xs">Color</Label><Input id="signature-link-color" type="color" value={draft.linkColor} className="h-8 w-10 p-1" onChange={(event) => setDraft({ ...draft, linkColor: event.target.value })} /></div>
                  <div className="flex items-center gap-2"><Label htmlFor="signature-link-size" className="text-xs">Size (px)</Label><Input id="signature-link-size" type="number" min={10} max={40} value={draft.linkFontSize ?? 14} className="h-8 w-20" onChange={(event) => setDraft({ ...draft, linkFontSize: Number(event.target.value) })} /></div>
                </div>
              </div>
            </SignatureDisclosure>
          </fieldset>
          <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={busy || !changed}>{busy ? "Saving…" : "Save signature"}</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load()}>Reload saved signature</Button></div>
        </form> : <p className="text-sm text-muted-foreground">{draft.enabled ? "Included in new messages, replies, and forwards." : "The shared signature is currently disabled."}</p>}
        <div className="space-y-2"><h3 className="text-xs font-medium">Preview for {saved?.member?.name || account?.name || "your account"}</h3><div className="overflow-hidden rounded-md border bg-white"><EmailHtmlFrame html={preview.html} plainText={preview.text} fitContent /></div></div>
      </>}
    </CardContent>
  </Card>;
}
