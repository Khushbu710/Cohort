// Shared data models. See docs/ARCHITECTURE.md §11 for the design rationale.
//
// Phase 1 note: DatasetSchema/DatasetField describe *any* dataset's shape,
// but the Phase 1 contract (contracts/src/dataset/CohortDataset.compact)
// only implements one hardcoded schema — the softwareCompensation dataset
// below. Deploy-time-configurable schemas are a Phase 3 concern.

export interface DatasetFieldOption {
  id: string;
  label: string;
}

export interface DatasetField {
  id: string;
  label: string;
  options: DatasetFieldOption[];
}

export type DatasetLifecycleState = "OPEN" | "FROZEN" | "REVEALED";

export interface DatasetSchema {
  slug: string;
  title: string;
  description: string;
  category: string;
  threshold: number;
  fields: DatasetField[];
}

export interface DatasetMeta {
  contractAddress: string;
  state: DatasetLifecycleState;
  participantCount: number;
  responseCount: number;
  threshold: number;
  schema: DatasetSchema;
}

export interface TallyOption {
  optionId: string;
  label: string;
  count: number;
  percentage: number;
}

export interface TallyResult {
  fieldId: string;
  options: TallyOption[];
}

export interface OrgProfile {
  walletAddress: string;
  orgName: string;
  industry: string;
  sizeBand: string;
}

// ── Deployment config ──────────────────────────────────────────────────
// Written by scripts/deploy-registry.ts + scripts/deploy-dataset.ts,
// read by the frontend (frontend/src/lib/config.ts) and by
// scripts/lib/config.ts. One shape, two consumers — not duplicated.

export interface DeployedDataset {
  slug: string;
  contractAddress: string;
  schemaHash: string;
}

export interface DeploymentConfig {
  networkId: "Undeployed";
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
  registryAddress: string | null;
  datasets: DeployedDataset[];
}
