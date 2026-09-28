import { Download, Mail, MessageSquare, Phone, User } from "lucide-react";
import { supabase } from "@libs/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@libs/components/ui/avatar";
import { Button } from "@libs/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import type { SponsorResponse } from "./types";

const initials = (name: string | null) =>
  name ? name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() : null;

function MemberAvatar({ response, className }: { response: SponsorResponse; className?: string }) {
  const letters = initials(response.full_name);
  return (
    <Avatar className={className}>
      <AvatarImage src={response.profile_image_url ?? undefined} alt="" />
      <AvatarFallback className="bg-primary/10 text-primary">{letters ?? <User className="size-3/5" />}</AvatarFallback>
    </Avatar>
  );
}

export function InterestAvatars({ responses, max = 3 }: { responses: SponsorResponse[]; max?: number }) {
  return (
    <span className="flex -space-x-1.5">
      {responses.slice(0, max).map((response) => (
        <MemberAvatar key={response.id} response={response} className="size-6 text-[10px] font-medium ring-2 ring-white" />
      ))}
    </span>
  );
}

export function InterestDialog({ title, responses, open, onClose, onMessage }: {
  title: string;
  responses: SponsorResponse[];
  open: boolean;
  onClose: () => void;
  onMessage: (response: SponsorResponse) => void;
}) {
  const openCv = async (response: SponsorResponse) => {
    if (!supabase || !response.cv_url) return;
    const { data } = await supabase.storage.from(import.meta.env.VITE_SUPABASE_CV_BUCKET || "member-cvs").createSignedUrl(response.cv_url, 900);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    await supabase.rpc("log_portal_event", { event_type: "cv_viewed", entity_type: "response", entity_id: response.id, metadata: {} });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="portal-root max-h-[88svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Interested members</DialogTitle>
          <DialogDescription>{responses.length} {responses.length === 1 ? "member has" : "members have"} shown interest in “{title}”. Only details they chose to share are shown.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y">
          {responses.map((response) => (
            <li key={response.id} className="grid gap-3 py-4 first:pt-1 last:pb-1">
              <div className="flex items-center gap-3">
                <MemberAvatar response={response} className="size-10 text-sm font-medium" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{response.full_name ?? "Helix member"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[response.field_of_study, response.graduation_year && `Class of ${response.graduation_year}`].filter(Boolean).join(" · ") || "Profile not shared"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{new Date(response.created_at).toLocaleDateString()}</span>
              </div>
              <p className="rounded-md bg-muted px-3 py-2 text-sm leading-relaxed">{response.note}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onMessage(response)}><MessageSquare /> Message</Button>
                {response.email && <Button asChild size="sm" variant="outline"><a href={`mailto:${response.email}`}><Mail /> Email</a></Button>}
                {response.phone && <Button asChild size="sm" variant="outline"><a href={`tel:${response.phone}`}><Phone /> Call</a></Button>}
                {response.cv_url && <Button size="sm" variant="outline" onClick={() => void openCv(response)}><Download /> CV</Button>}
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
