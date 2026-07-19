import { useRegisteredDatasets } from "@/hooks/useDatasets";
import { useDatasetState } from "@/hooks/useDatasets";
import { DatasetCard } from "@/components/dataset/DatasetCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { REGISTRY_ADDRESS } from "@/lib/config";
import type { DatasetListEntry } from "@/hooks/useDatasets";

function DatasetCardWithState({ entry }: { entry: DatasetListEntry }) {
  const { data: snapshot } = useDatasetState(entry.contractAddress, entry.schema);
  return <DatasetCard schema={entry.schema} snapshot={snapshot} contractAddress={entry.contractAddress} />;
}

export default function Explore() {
  const { data: datasets, isLoading, isError, error } = useRegisteredDatasets();

  if (!REGISTRY_ADDRESS) {
    return (
      <Alert>
        <AlertTitle>Protocol not yet deployed on this network</AlertTitle>
        <AlertDescription>
          No CohortRegistry address is configured. Run the deploy scripts (see the project README) and the datasets
          registered there will appear here automatically — no code changes needed.
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t reach the indexer</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Unknown error"}</AlertDescription>
      </Alert>
    );
  }

  if (!datasets || datasets.length === 0) {
    return (
      <Alert>
        <AlertTitle>No datasets registered yet</AlertTitle>
        <AlertDescription>Be the first — create a dataset to get started.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {datasets.map((entry) => (
        <DatasetCardWithState key={entry.contractAddress} entry={entry} />
      ))}
    </div>
  );
}
