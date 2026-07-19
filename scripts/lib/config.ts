// The configuration layer the frontend consumes: which network to talk to,
// and which addresses the deploy scripts actually deployed to. Read by
// frontend/src/lib/config.ts at build/runtime; written by the deploy
// scripts below. This is the "changing only contract addresses and
// network configuration" surface referenced in docs/ARCHITECTURE.md.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { DeploymentConfig } from "@cohort/shared";
import { LOCAL_DEVNET } from "./network.js";

export type { DeploymentConfig, DeployedDataset } from "@cohort/shared";

const CONFIG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "packages",
  "shared",
  "deployments",
  "local.json",
);

function defaultConfig(): DeploymentConfig {
  return {
    networkId: "Undeployed",
    indexer: LOCAL_DEVNET.indexer,
    indexerWS: LOCAL_DEVNET.indexerWS,
    node: LOCAL_DEVNET.node,
    proofServer: LOCAL_DEVNET.proofServer,
    registryAddress: null,
    datasets: [],
  };
}

export function readDeploymentConfig(): DeploymentConfig {
  if (!existsSync(CONFIG_PATH)) return defaultConfig();
  return { ...defaultConfig(), ...JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) };
}

export function writeDeploymentConfig(config: DeploymentConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
