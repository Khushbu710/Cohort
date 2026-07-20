// Write path: join / submit / freeze / reveal against a deployed
// CohortDataset. Reuses the exact witness shape and provider pattern
// verified in scripts/lib/network.ts + scripts/deploy-dataset.ts — the
// only thing that differs between the headless deploy script and this
// browser code is *which* WalletProvider/MidnightProvider implementation
// supplies the wallet (headless seed vs. connected browser wallet), and
// that proving is delegated to the wallet here instead of a local proof
// server (see wallet.ts's createWalletProofProvider).
import { findDeployedContract } from "@midnight-ntwrk/midnight-js/contracts";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { Contract, type Witnesses } from "@cohort/contracts/managed/dataset/contract/index.js";
import { getPublicDataProvider } from "./providers";
import { getOrgSecret } from "../crypto";
import { createWalletProofProvider, type MidnightWalletProvider } from "./wallet";

type DatasetCircuitId = "join" | "submit" | "freeze" | "revealResults";

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

// configuredDatasetId is only ever read by the constructor (already run at
// deploy time); join/submit/freeze/revealResults never call it, so any
// value here is inert for these calls.
const UNUSED_DATASET_ID = new Uint8Array(32);

// The explicit fetchFunc override works around a real bug: FetchZkConfigProvider's
// default `fetch` import (from cross-fetch) loses its `this` binding to `window`
// under Vite's dev-time module serving, causing "Illegal invocation" — window.fetch
// bound explicitly sidesteps it.
const datasetZkConfigProvider = new FetchZkConfigProvider<DatasetCircuitId>(
  `${window.location.origin}/zk-config/dataset`,
  window.fetch.bind(window),
);
const datasetCompiledContract = CompiledContract.make<InstanceType<typeof Contract<OrgPrivateState>>>("cohortDataset", Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(`${window.location.origin}/zk-config/dataset`),
);

async function getDatasetContract(walletProvider: MidnightWalletProvider, contractAddress: string, orgState: OrgPrivateState) {
  const accountId = walletProvider.address;
  const storagePassword = `${Buffer.from(accountId).toString("base64")}!`;
  const providers = {
    walletProvider,
    midnightProvider: walletProvider,
    publicDataProvider: getPublicDataProvider(),
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: "cohort-frontend-db",
      accountId,
      privateStoragePasswordProvider: () => storagePassword,
    }),
    proofProvider: await createWalletProofProvider(walletProvider.api, datasetZkConfigProvider),
    zkConfigProvider: datasetZkConfigProvider,
  };

  return findDeployedContract(providers, {
    compiledContract: datasetCompiledContract,
    contractAddress,
    privateStateId: `cohortDataset:${contractAddress}`,
    initialPrivateState: orgState,
  });
}

export async function joinDataset(walletProvider: MidnightWalletProvider, contractAddress: string): Promise<void> {
  const orgState: OrgPrivateState = {
    datasetId: UNUSED_DATASET_ID,
    secretKey: getOrgSecret(walletProvider.address),
    answers: { salaryBand: 0n, companySize: 0n },
  };
  const contract = await getDatasetContract(walletProvider, contractAddress, orgState);
  await contract.callTx.join();
}

export async function submitResponse(walletProvider: MidnightWalletProvider, contractAddress: string, answers: Answers): Promise<void> {
  const orgState: OrgPrivateState = {
    datasetId: UNUSED_DATASET_ID,
    secretKey: getOrgSecret(walletProvider.address),
    answers,
  };
  const contract = await getDatasetContract(walletProvider, contractAddress, orgState);
  await contract.callTx.submit();
}

export async function freezeDataset(walletProvider: MidnightWalletProvider, contractAddress: string): Promise<void> {
  const orgState: OrgPrivateState = {
    datasetId: UNUSED_DATASET_ID,
    secretKey: getOrgSecret(walletProvider.address),
    answers: { salaryBand: 0n, companySize: 0n },
  };
  const contract = await getDatasetContract(walletProvider, contractAddress, orgState);
  await contract.callTx.freeze();
}

export async function revealDatasetResults(walletProvider: MidnightWalletProvider, contractAddress: string): Promise<void> {
  const orgState: OrgPrivateState = {
    datasetId: UNUSED_DATASET_ID,
    secretKey: getOrgSecret(walletProvider.address),
    answers: { salaryBand: 0n, companySize: 0n },
  };
  const contract = await getDatasetContract(walletProvider, contractAddress, orgState);
  await contract.callTx.revealResults();
}
