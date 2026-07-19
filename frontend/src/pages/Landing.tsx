import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const EXAMPLE_CATEGORIES = [
  "Software Compensation",
  "Cybersecurity Incidents",
  "Fraud Intelligence",
  "Manufacturing Quality",
  "AI Benchmarking",
  "ESG Reporting",
];

export default function Landing() {
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col items-center gap-4 py-12 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Cohort</h1>
        <p className="max-w-xl text-muted-foreground">
          A protocol for confidential, dataset-agnostic industry surveys on Midnight. Organizations join, submit, and
          contribute to anonymous aggregate results — never revealing who submitted what.
        </p>
        <div className="flex gap-3">
          <Button asChild>
            <Link to="/explore">Explore datasets</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/datasets/new">Create a dataset</Link>
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-center text-sm font-medium text-muted-foreground">
          One protocol, any industry benchmark — this is not a salary app
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {EXAMPLE_CATEGORIES.map((category) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-sm">{category}</CardTitle>
                <CardDescription>Example dataset category</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Join once, unlinkably</CardTitle>
            <CardDescription>
              A dataset-scoped nullifier proves your organization hasn&apos;t joined before — without revealing who you
              are.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Private answers</CardTitle>
            <CardDescription>
              Your response is a private witness. The chain only ever sees that one valid bucket was incremented.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Threshold-gated reveal</CardTitle>
            <CardDescription>
              Results are frozen and revealed only once enough organizations have participated.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </div>
  );
}
