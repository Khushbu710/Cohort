import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useWalletStore } from "@/store/wallet";
import { useCreateDataset } from "@/hooks/useCreateDataset";
import { KNOWN_SCHEMAS, REGISTRY_ADDRESS } from "@/lib/config";

export default function CreateDataset() {
  const status = useWalletStore((s) => s.status);
  const navigate = useNavigate();
  const deploy = useCreateDataset();
  const schema = KNOWN_SCHEMAS[0];

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create a dataset</h1>
        <p className="text-sm text-muted-foreground">
          Deploys a new, independent instance of the Cohort protocol contract — its own participants, its own tally,
          its own threshold.
        </p>
      </div>

      <Alert>
        <AlertTitle>Schema is fixed for this deployment of the protocol</AlertTitle>
        <AlertDescription>
          Every dataset created right now uses the compiled &ldquo;{schema.title}&rdquo; schema ({schema.fields.length}{" "}
          questions). Deploy-time-configurable schemas are future work — see docs/ARCHITECTURE.md.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{schema.title}</CardTitle>
          <CardDescription>{schema.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="list-inside list-disc text-sm text-muted-foreground">
            {schema.fields.map((field) => (
              <li key={field.id}>
                {field.label} ({field.options.length} options)
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">Participation threshold: {schema.threshold} responses</p>

          {!REGISTRY_ADDRESS ? (
            <Alert>
              <AlertTitle>Protocol not yet deployed on this network</AlertTitle>
              <AlertDescription>No CohortRegistry address is configured yet.</AlertDescription>
            </Alert>
          ) : status !== "connected" ? (
            <Alert>
              <AlertTitle>Connect your wallet to deploy</AlertTitle>
              <AlertDescription>Deploying a dataset is a transaction, signed by your wallet.</AlertDescription>
            </Alert>
          ) : (
            <Button
              onClick={() =>
                deploy.mutate(schema.slug, {
                  onSuccess: (address) => navigate(`/datasets/${address}`),
                })
              }
              disabled={deploy.isPending}
            >
              {deploy.isPending ? "Deploying…" : "Deploy dataset"}
            </Button>
          )}
          {deploy.isError && (
            <Alert variant="destructive">
              <AlertTitle>Deployment failed</AlertTitle>
              <AlertDescription>{deploy.error instanceof Error ? deploy.error.message : "Unknown error"}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
