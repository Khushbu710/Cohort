import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StateBadge } from "./StateBadge";
import { ThresholdProgress } from "./ThresholdProgress";
import type { DatasetSchema } from "@cohort/shared";
import type { DatasetSnapshot } from "@/lib/midnight/dataset";

export function DatasetCard({ schema, snapshot, contractAddress }: { schema: DatasetSchema; snapshot: DatasetSnapshot | null | undefined; contractAddress: string }) {
  return (
    <Link to={`/datasets/${contractAddress}`}>
      <Card className="transition-colors hover:border-foreground/20">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{schema.title}</CardTitle>
              <CardDescription>{schema.category}</CardDescription>
            </div>
            {snapshot && <StateBadge state={snapshot.state} />}
          </div>
        </CardHeader>
        <CardContent>
          {snapshot ? (
            <ThresholdProgress responseCount={snapshot.responseCount} threshold={snapshot.threshold} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading status…</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
