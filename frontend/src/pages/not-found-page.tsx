import { Compass } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";

export default function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={<Compass className="size-5" />}
        title="Page not found"
        description="That page doesn't exist in DBSynchro."
        action={<LinkButton to="/dashboard">Back to dashboard</LinkButton>}
      />
    </Card>
  );
}
