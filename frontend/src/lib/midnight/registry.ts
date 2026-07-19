// Read-only access to the CohortRegistry ledger — the dataset discovery
// list. No wallet needed; see providers.ts.
import { decodeContractAddress } from "@midnight-ntwrk/compact-runtime";
import { bytesToHex } from "../utils";
import { getPublicDataProvider } from "./providers";
// compactc now emits plain ESM (.js), so this is a normal named import —
// no CJS/ESM interop workaround needed any more.
import { ledger } from "@cohort/contracts/managed/registry/contract/index.js";

export interface RegisteredDataset {
  index: bigint;
  contractAddress: string;
  schemaHash: string;
}

/** Every dataset the registry knows about, in registration order. */
export async function listRegisteredDatasets(registryAddress: string): Promise<RegisteredDataset[]> {
  const state = await getPublicDataProvider().queryContractState(registryAddress);
  if (!state) return [];

  const decoded = ledger(state.data);
  const results: RegisteredDataset[] = [];
  for (const [index, addressBytes] of decoded.datasetAddresses) {
    const schemaHashBytes = decoded.datasetSchemaHashes.lookup(index);
    results.push({
      index,
      contractAddress: decodeContractAddress(addressBytes),
      schemaHash: bytesToHex(schemaHashBytes),
    });
  }
  return results.sort((a, b) => Number(a.index - b.index));
}
