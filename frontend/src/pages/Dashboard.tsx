import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useWalletStore } from "@/store/wallet";
import { useMyParticipation } from "@/store/participation";
import { useRegisteredDatasets, useDatasetState } from "@/hooks/useDatasets";
import { StateBadge } from "@/components/dataset/StateBadge";
import type { DatasetListEntry } from "@/hooks/useDatasets";

function ParticipationCard({ entry, joined, submitted }: { entry: DatasetListEntry; joined: boolean; submitted: boolean }) {
  const { data: snapshot } = useDatasetState(entry.contractAddress, entry.schema);
  return (
    <Link to={`/datasets/${entry.contractAddress}`}>
      <Card className="transition-colors hover:border-foreground/20">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{entry.schema.title}</CardTitle>
              <CardDescription>{entry.contractAddress}</CardDescription>
            </div>
            {snapshot && <StateBadge state={snapshot.state} />}
          </div>
          <div className="flex gap-2 pt-1">
            <Badge variant={joined ? "default" : "outline"}>{joined ? "Joined" : "Not joined"}</Badge>
            <Badge variant={submitted ? "default" : "outline"}>{submitted ? "Submitted" : "No response yet"}</Badge>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const status = useWalletStore((s) => s.status);
  const address = useWalletStore((s) => s.address);
  const participation = useMyParticipation(address);
  const { data: datasets, isLoading } = useRegisteredDatasets();

  if (status !== "connected") {
    return (
      <Alert>
        <AlertTitle>Connect your wallet</AlertTitle>
        <AlertDescription>Your participation is tracked per wallet.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const myDatasets = (datasets ?? []).filter((entry) => participation[entry.contractAddress]);

  if (myDatasets.length === 0) {
    return (
      <Alert>
        <AlertTitle>You haven&apos;t joined any datasets yet</AlertTitle>
        <AlertDescription>
          Head to <Link to="/explore" className="underline">Explore</Link> to find one.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">My participation</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {myDatasets.map((entry) => (
          <ParticipationCard
            key={entry.contractAddress}
            entry={entry}
            joined={participation[entry.contractAddress].joined}
            submitted={participation[entry.contractAddress].submitted}
          />
        ))}
      </div>
    </div>
  );
}
