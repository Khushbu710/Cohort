import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StateBadge } from "@/components/dataset/StateBadge";
import { ThresholdProgress } from "@/components/dataset/ThresholdProgress";
import { useDatasetState } from "@/hooks/useDatasets";
import { useFreezeDataset, useJoinDataset, useRevealResults, useSubmitResponse } from "@/hooks/useDatasetActions";
import { useWalletStore } from "@/store/wallet";
import { KNOWN_SCHEMAS } from "@/lib/config";

function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>{error instanceof Error ? error.message : "Unknown error"}</AlertDescription>
    </Alert>
  );
}

function JoinAndSubmitPanel({ contractAddress }: { contractAddress: string }) {
  const schema = KNOWN_SCHEMAS[0];
  const status = useWalletStore((s) => s.status);
  const join = useJoinDataset(contractAddress);
  const submit = useSubmitResponse(contractAddress);
  const [salaryBand, setSalaryBand] = useState<string>();
  const [companySize, setCompanySize] = useState<string>();

  if (status !== "connected") {
    return (
      <Alert>
        <AlertTitle>Connect your wallet to participate</AlertTitle>
        <AlertDescription>Joining and submitting a response both require a connected wallet.</AlertDescription>
      </Alert>
    );
  }

  const [salaryField, companySizeField] = schema.fields;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">1. Join this dataset</CardTitle>
          <CardDescription>Registers your organization as a participant. One join per organization.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => join.mutate()} disabled={join.isPending}>
            {join.isPending ? "Joining…" : join.isSuccess ? "Joined" : "Join dataset"}
          </Button>
          <ErrorNotice error={join.error} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">2. Submit your response</CardTitle>
          <CardDescription>Your answer is a private witness — it never leaves your browser as plaintext.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>{salaryField.label}</Label>
            <Select value={salaryBand} onValueChange={setSalaryBand}>
              <SelectTrigger>
                <SelectValue placeholder="Select a range" />
              </SelectTrigger>
              <SelectContent>
                {salaryField.options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{companySizeField.label}</Label>
            <Select value={companySize} onValueChange={setCompanySize}>
              <SelectTrigger>
                <SelectValue placeholder="Select a size" />
              </SelectTrigger>
              <SelectContent>
                {companySizeField.options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() =>
              submit.mutate({ salaryBand: BigInt(salaryBand ?? "0"), companySize: BigInt(companySize ?? "0") })
            }
            disabled={submit.isPending || salaryBand === undefined || companySize === undefined}
          >
            {submit.isPending ? "Submitting…" : submit.isSuccess ? "Submitted" : "Submit response"}
          </Button>
          <ErrorNotice error={submit.error} />
        </CardContent>
      </Card>
    </div>
  );
}

function FreezePanel({ contractAddress }: { contractAddress: string }) {
  const freeze = useFreezeDataset(contractAddress);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Threshold reached</CardTitle>
        <CardDescription>Freeze the dataset to lock in the final tallies before revealing results.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={() => freeze.mutate()} disabled={freeze.isPending}>
          {freeze.isPending ? "Freezing…" : "Freeze dataset"}
        </Button>
        <ErrorNotice error={freeze.error} />
      </CardContent>
    </Card>
  );
}

function RevealPanel({ contractAddress }: { contractAddress: string }) {
  const reveal = useRevealResults(contractAddress);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Frozen</CardTitle>
        <CardDescription>No more responses are accepted. Reveal the results to publish them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={() => reveal.mutate()} disabled={reveal.isPending}>
          {reveal.isPending ? "Revealing…" : "Reveal results"}
        </Button>
        <ErrorNotice error={reveal.error} />
      </CardContent>
    </Card>
  );
}

function ResultsView({ tallies }: { tallies: { fieldId: string; label: string; buckets: { optionId: string; label: string; count: number }[] }[] }) {
  return (
    <div className="space-y-6">
      {tallies.map((field) => {
        const total = field.buckets.reduce((sum, b) => sum + b.count, 0);
        return (
          <Card key={field.fieldId}>
            <CardHeader>
              <CardTitle className="text-sm">{field.label}</CardTitle>
              <CardDescription>{total} total responses</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {field.buckets.map((bucket) => {
                const percent = total > 0 ? Math.round((bucket.count / total) * 100) : 0;
                return (
                  <div key={bucket.optionId} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{bucket.label}</span>
                      <span className="text-muted-foreground">
                        {bucket.count} ({percent}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function DatasetDetail() {
  const { address } = useParams<{ address: string }>();
  const schema = KNOWN_SCHEMAS[0];
  const { data: snapshot, isLoading, isError, error } = useDatasetState(address, schema);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load this dataset</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Unknown error"}</AlertDescription>
      </Alert>
    );
  }

  if (!snapshot) {
    return (
      <Alert>
        <AlertTitle>Dataset not found</AlertTitle>
        <AlertDescription>No contract was found at this address on the configured network.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{schema.title}</h1>
            <p className="text-sm text-muted-foreground">{schema.description}</p>
          </div>
          <StateBadge state={snapshot.state} />
        </div>
        <ThresholdProgress responseCount={snapshot.responseCount} threshold={snapshot.threshold} />
        <p className="text-sm text-muted-foreground">{snapshot.participantCount} organizations joined</p>
      </div>

      {snapshot.state === "OPEN" && snapshot.responseCount >= snapshot.threshold && (
        <FreezePanel contractAddress={snapshot.contractAddress} />
      )}
      {snapshot.state === "OPEN" && <JoinAndSubmitPanel contractAddress={snapshot.contractAddress} />}
      {snapshot.state === "FROZEN" && <RevealPanel contractAddress={snapshot.contractAddress} />}
      {snapshot.state === "REVEALED" && <ResultsView tallies={snapshot.tallies} />}
    </div>
  );
}
