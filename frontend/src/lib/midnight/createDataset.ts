// Deploys a new CohortDataset instance from the browser (via the connected
// wallet) and registers it with CohortRegistry. Same deployContract/
// registerDataset pattern as scripts/deploy-dataset.ts, just driven by a
// connected Lace wallet instead of a headless one.
//
// Note on scope: the contract's *schema* (fields/options) is fixed at
// compile time (see contracts/src/dataset/CohortDataset.compact) — this
// only lets a user configure a new instance's threshold and its display
// metadata, not new survey questions. Generic runtime-configurable schemas
// are future work (see docs/ARCHITECTURE.md's Phase 3 notes).
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js/contracts";
import { encodeContractAddress } from "@midnight-ntwrk/compact-runtime";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { Contract as DatasetContract, type Witnesses } from "@cohort/contracts/managed/dataset/contract/index.js";
import { Contract as RegistryContract } from "@cohort/contracts/managed/registry/contract/index.js";
import { getPublicDataProvider } from "./providers";
import { REGISTRY_ADDRESS } from "../config";
import { createWalletProofProvider, type MidnightWalletProvider } from "./wallet";

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

function randomBytes32(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function sha256(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

function privateStateProviderFor(walletProvider: MidnightWalletProvider) {
  const accountId = walletProvider.address;
  const storagePassword = `${Buffer.from(accountId).toString("base64")}!`;
  return levelPrivateStateProvider({
    privateStateStoreName: "cohort-frontend-db",
    accountId,
    privateStoragePasswordProvider: () => storagePassword,
  });
}

// The explicit fetchFunc override works around a real bug: FetchZkConfigProvider's
// default `fetch` import (from cross-fetch) loses its `this` binding to `window`
// under Vite's dev-time module serving, causing "Illegal invocation" — window.fetch
// bound explicitly sidesteps it.
const datasetZkConfigProvider = new FetchZkConfigProvider<"join" | "submit" | "freeze" | "revealResults">(
  `${window.location.origin}/zk-config/dataset`,
  window.fetch.bind(window),
);
const registryZkConfigProvider = new FetchZkConfigProvider<"registerDataset">(
  `${window.location.origin}/zk-config/registry`,
  window.fetch.bind(window),
);

const datasetCompiledContract = CompiledContract.make<InstanceType<typeof DatasetContract<OrgPrivateState>>>(
  "cohortDataset",
  DatasetContract,
).pipe(CompiledContract.withWitnesses(witnesses), CompiledContract.withCompiledFileAssets(`${window.location.origin}/zk-config/dataset`));
const registryCompiledContract = CompiledContract.make("cohortRegistry", RegistryContract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(`${window.location.origin}/zk-config/registry`),
);

export async function deployNewDataset(walletProvider: MidnightWalletProvider, schemaSlug: string): Promise<string> {
  if (!REGISTRY_ADDRESS) {
    throw new Error("No CohortRegistry is deployed on this network yet.");
  }

  const datasetProviders = {
    walletProvider,
    midnightProvider: walletProvider,
    publicDataProvider: getPublicDataProvider(),
    privateStateProvider: privateStateProviderFor(walletProvider),
    proofProvider: await createWalletProofProvider(walletProvider.api, datasetZkConfigProvider),
    zkConfigProvider: datasetZkConfigProvider,
  };

  const datasetId = randomBytes32();
  const deployed = await deployContract(datasetProviders, {
    compiledContract: datasetCompiledContract,
    privateStateId: `cohortDataset:new:${Date.now()}`,
    initialPrivateState: {
      datasetId,
      secretKey: new Uint8Array(32),
      answers: { salaryBand: 0n, companySize: 0n },
    },
  });
  const contractAddress = deployed.deployTxData.public.contractAddress;

  const registryProviders = {
    walletProvider,
    midnightProvider: walletProvider,
    publicDataProvider: getPublicDataProvider(),
    privateStateProvider: privateStateProviderFor(walletProvider),
    proofProvider: await createWalletProofProvider(walletProvider.api, registryZkConfigProvider),
    zkConfigProvider: registryZkConfigProvider,
  };
  const registry = await findDeployedContract(registryProviders, {
    compiledContract: registryCompiledContract,
    contractAddress: REGISTRY_ADDRESS,
  });
  const schemaHash = await sha256(schemaSlug);
  await registry.callTx.registerDataset(encodeContractAddress(contractAddress), schemaHash);

  return contractAddress;
}
