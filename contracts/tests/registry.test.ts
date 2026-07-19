// Exercises the compiled CohortRegistry contract: registration and
// discovery. The registry has no privacy surface — it's a public list of
// (contract address, schema hash) pairs — so unlike the dataset contract,
// no witnesses are involved here.
import { beforeEach, describe, expect, it } from "vitest";
import { type CircuitContext, createCircuitContext, createConstructorContext, sampleContractAddress } from "@midnight-ntwrk/compact-runtime";
import { Contract, ledger } from "../managed/registry/contract/index.js";

const COIN_PUBLIC_KEY = "00".repeat(32);

function bytes32(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

class RegistrySession {
  private readonly contract = new Contract<undefined>({});
  private readonly address = sampleContractAddress();
  private context: CircuitContext<undefined>;

  constructor() {
    const { currentPrivateState, currentContractState, currentZswapLocalState } = this.contract.initialState(
      createConstructorContext(undefined, COIN_PUBLIC_KEY),
    );
    this.context = createCircuitContext(this.address, currentZswapLocalState, currentContractState, currentPrivateState);
  }

  registerDataset(contractAddress: Uint8Array, schemaHash: Uint8Array) {
    const { result, context: next } = this.contract.impureCircuits.registerDataset(this.context, contractAddress, schemaHash);
    this.context = next;
    return result;
  }

  ledger() {
    return ledger(this.context.currentQueryContext.state);
  }
}

describe("CohortRegistry (Phase 2 dataset discovery)", () => {
  let registry: RegistrySession;

  beforeEach(() => {
    registry = new RegistrySession();
  });

  it("starts with no registered datasets", () => {
    const state = registry.ledger();
    expect(state.datasetCount).toBe(0n);
    expect(state.datasetAddresses.isEmpty()).toBe(true);
    expect(state.datasetSchemaHashes.isEmpty()).toBe(true);
  });

  it("registers a dataset and makes it discoverable by index", () => {
    const address = bytes32(1);
    const schemaHash = bytes32(2);
    registry.registerDataset(address, schemaHash);

    const state = registry.ledger();
    expect(state.datasetCount).toBe(1n);
    expect(state.datasetAddresses.lookup(0n)).toEqual(address);
    expect(state.datasetSchemaHashes.lookup(0n)).toEqual(schemaHash);
  });

  it("assigns increasing indices as more datasets register, preserving registration order for discovery", () => {
    const datasets = [
      { address: bytes32(10), schemaHash: bytes32(20) },
      { address: bytes32(11), schemaHash: bytes32(21) },
      { address: bytes32(12), schemaHash: bytes32(22) },
    ];
    datasets.forEach((d) => registry.registerDataset(d.address, d.schemaHash));

    const state = registry.ledger();
    expect(state.datasetCount).toBe(3n);

    const discovered = [...state.datasetAddresses].sort((a, b) => Number(a[0] - b[0]));
    expect(discovered).toHaveLength(3);
    discovered.forEach(([index, address], i) => {
      expect(index).toBe(BigInt(i));
      expect(address).toEqual(datasets[i].address);
      expect(state.datasetSchemaHashes.lookup(index)).toEqual(datasets[i].schemaHash);
    });
  });
});
