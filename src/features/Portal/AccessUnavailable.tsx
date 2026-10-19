import { Link } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { usePortalAuth } from "./PortalAuth";
import "./portal.css";

export default function AccessUnavailable() {
  const { signOut } = usePortalAuth();
  return (
    <div className="portal-state">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <p className="portal-eyebrow">Portal access</p>
          <CardTitle className="text-3xl">Access is unavailable.</CardTitle>
          <CardDescription>Your invitation may have expired, your contact may have been removed, or your current agreement may not include portal access. No sponsor or member data has been shown.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild><a href="mailto:sponsorships@helixnmbu.no">Contact sponsorships</a></Button>
          <Button variant="secondary" onClick={() => void signOut()}>Sign out</Button>
          <Button asChild variant="outline"><Link to="/">Return home</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
