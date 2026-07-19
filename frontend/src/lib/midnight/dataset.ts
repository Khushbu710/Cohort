// Read-only access to a CohortDataset ledger. No wallet needed — see
// providers.ts. Tally lookups rely on the naming convention documented in
// contracts/src/dataset/CohortDataset.compact: bucket counters are named
// `${field.id}${option.id}` (e.g. "salaryBand0"), so a generic DatasetSchema
// can be read off a contract that only Phase 3 knows is that specific shape.
import type { DatasetLifecycleState, DatasetSchema } from "@cohort/shared";
import { getPublicDataProvider } from "./providers";
import { ledger, DatasetState } from "@cohort/contracts/managed/dataset/contract/index.js";

export interface TallyBucket {
  optionId: string;
  label: string;
  count: number;
}

export interface DatasetSnapshot {
  contractAddress: string;
  state: DatasetLifecycleState;
  threshold: number;
  participantCount: number;
  responseCount: number;
  tallies: Array<{ fieldId: string; label: string; buckets: TallyBucket[] }>;
}

export async function readDatasetState(contractAddress: string, schema: DatasetSchema): Promise<DatasetSnapshot | null> {
  const state = await getPublicDataProvider().queryContractState(contractAddress);
  if (!state) return null;

  const decoded = ledger(state.data) as unknown as Record<string, unknown>;

  const tallies = schema.fields.map((field) => ({
    fieldId: field.id,
    label: field.label,
    buckets: field.options.map((option) => ({
      optionId: option.id,
      label: option.label,
      count: Number((decoded[`${field.id}${option.id}`] as bigint | undefined) ?? 0n),
    })),
  }));

  return {
    contractAddress,
    state: DatasetState[decoded.state as number] as DatasetLifecycleState,
    threshold: Number(decoded.threshold as bigint),
    participantCount: Number(decoded.participantCount as bigint),
    responseCount: Number(decoded.responseCount as bigint),
    tallies,
  };
}
