// Deploys a CohortDataset contract instance to the local devnet, then
// registers it with the already-deployed CohortRegistry so the frontend
// can discover it. Reuses the same provider wiring as deploy-registry.ts
// (scripts/lib/network.ts) — nothing here duplicates that setup.
//
// Run `pnpm deploy:registry` first.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { encodeContractAddress } from "@midnight-ntwrk/compact-runtime";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js/contracts";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { makeLocalProviders } from "./lib/network.js";
import { readDeploymentConfig, writeDeploymentConfig } from "./lib/config.js";
import { Contract as DatasetContract, type Witnesses } from "@cohort/contracts/managed/dataset/contract/index.js";
import { Contract as RegistryContract } from "@cohort/contracts/managed/registry/contract/index.js";

interface Answers {
  salaryBand: bigint;
  companySize: bigint;
}

interface OrgPrivateState {
  datasetId: Uint8Array;
  secretKey: Uint8Array;
  answers: Answers;
}

const witnesses: Witnesses<OrgPrivateState> = {
  configuredDatasetId: (context) => [context.privateState, context.privateState.datasetId],
  localSecretKey: (context) => [context.privateState, context.privateState.secretKey],
  surveyAnswers: (context) => [context.privateState, context.privateState.answers],
};

const datasetZkConfigDir = fileURLToPath(new URL("../contracts/managed/dataset", import.meta.url));
const registryZkConfigDir = fileURLToPath(new URL("../contracts/managed/registry", import.meta.url));

const datasetCompiledContract = CompiledContract.make<InstanceType<typeof DatasetContract<OrgPrivateState>>>("cohortDataset", DatasetContract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(datasetZkConfigDir),
);
const registryCompiledContract = CompiledContract.make("cohortRegistry", RegistryContract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(registryZkConfigDir),
);

const SCHEMA_PATH = new URL("../packages/shared/datasets/software-compensation.json", import.meta.url);

function schemaHash(): Uint8Array {
  const raw = readFileSync(SCHEMA_PATH, "utf-8");
  return createHash("sha256").update(raw).digest();
}

function newDatasetId(): Uint8Array {
  const id = new Uint8Array(32);
  crypto.getRandomValues(id);
  return id;
}

async function main() {
  const config = readDeploymentConfig();
  if (!config.registryAddress) {
    throw new Error("No registry deployed yet — run `pnpm deploy:registry` first.");
  }

  const providers = await makeLocalProviders<"join" | "submit" | "freeze" | "revealResults">(datasetZkConfigDir);

  const datasetId = newDatasetId();
  console.log("Deploying CohortDataset (software-compensation)...");
  const deployedDataset = await deployContract(providers, {
    compiledContract: datasetCompiledContract,
    privateStateId: "cohortDataset",
    initialPrivateState: {
      datasetId,
      secretKey: new Uint8Array(32), // the deployer isn't a survey participant; unused by the constructor
      answers: { salaryBand: 0n, companySize: 0n },
    },
  });
  const datasetAddress = deployedDataset.deployTxData.public.contractAddress;
  console.log("CohortDataset deployed at", datasetAddress);

  const hash = schemaHash();
  console.log("Registering with CohortRegistry at", config.registryAddress, "...");
  const registryProviders = await makeLocalProviders<"registerDataset">(registryZkConfigDir);
  const registry = await findDeployedContract(registryProviders, {
    compiledContract: registryCompiledContract,
    contractAddress: config.registryAddress,
  });
  await registry.callTx.registerDataset(encodeContractAddress(datasetAddress), hash);
  console.log("Registered.");

  config.datasets.push({
    slug: "software-compensation",
    contractAddress: datasetAddress,
    schemaHash: Buffer.from(hash).toString("hex"),
  });
  writeDeploymentConfig(config);
  console.log("Saved to packages/shared/deployments/local.json");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
