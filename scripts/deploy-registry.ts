// Deploys the CohortRegistry singleton to the local devnet and records its
// address in packages/shared/deployments/local.json for the frontend (and
// deploy-dataset.ts) to read.
import { fileURLToPath } from "node:url";
import { deployContract } from "@midnight-ntwrk/midnight-js/contracts";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { makeLocalProviders } from "./lib/network.js";
import { readDeploymentConfig, writeDeploymentConfig } from "./lib/config.js";
import { Contract } from "@cohort/contracts/managed/registry/contract/index.js";

const zkConfigDir = fileURLToPath(new URL("../contracts/managed/registry", import.meta.url));

// NodeZkConfigProvider reads <dir>/keys/*.{prover,verifier} and
// <dir>/zkir/*.bzkir — those are siblings of contract/ in compactc's
// output, not nested under it.
const registryCompiledContract = CompiledContract.make("cohortRegistry", Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(zkConfigDir),
);

async function main() {
  const providers = await makeLocalProviders<"registerDataset">(zkConfigDir);

  console.log("Deploying CohortRegistry...");
  const deployed = await deployContract(providers, {
    compiledContract: registryCompiledContract,
  });

  const address = deployed.deployTxData.public.contractAddress;
  console.log("CohortRegistry deployed at", address);

  const config = readDeploymentConfig();
  config.registryAddress = address;
  writeDeploymentConfig(config);
  console.log("Saved to packages/shared/deployments/local.json");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
