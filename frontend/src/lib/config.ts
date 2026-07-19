// The configuration layer: which network to talk to, and which contract
// addresses were actually deployed there. Written by scripts/deploy-
// registry.ts and scripts/deploy-dataset.ts (see scripts/lib/config.ts);
// this is the read side. Swapping environments (local devnet -> testnet)
// or redeploying is meant to require editing this file's source, not
// touching any contract-calling code below lib/midnight/.
import deployment from "@cohort/shared/deployments/local.json";
import type { DeploymentConfig } from "@cohort/shared";
import softwareCompensation from "@cohort/shared/datasets/software-compensation.json";
import type { DatasetSchema } from "@cohort/shared";

export const DEPLOYMENT = deployment as DeploymentConfig;

export const NETWORK_CONFIG = {
  indexer: DEPLOYMENT.indexer,
  indexerWS: DEPLOYMENT.indexerWS,
  node: DEPLOYMENT.node,
  proofServer: DEPLOYMENT.proofServer,
};

/** Every dataset schema this build of the frontend knows how to render.
 * Phase 3 ships one demo dataset; more schemas are added here as they're
 * compiled (see docs/ARCHITECTURE.md — the schema itself is still
 * compile-time fixed per contract, not deploy-time configurable). */
export const KNOWN_SCHEMAS: DatasetSchema[] = [softwareCompensation as DatasetSchema];

export function findSchema(slug: string): DatasetSchema | undefined {
  return KNOWN_SCHEMAS.find((schema) => schema.slug === slug);
}

export const REGISTRY_ADDRESS = DEPLOYMENT.registryAddress;
