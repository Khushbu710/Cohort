import { Progress } from "@/components/ui/progress";

export function ThresholdProgress({ responseCount, threshold }: { responseCount: number; threshold: number }) {
  const percent = threshold > 0 ? Math.min(100, Math.round((responseCount / threshold) * 100)) : 0;
  const reached = responseCount >= threshold;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Participation threshold</span>
        <span className={reached ? "font-medium text-foreground" : "text-muted-foreground"}>
          {responseCount} / {threshold} responses
        </span>
      </div>
      <Progress value={percent} />
    </div>
  );
}
