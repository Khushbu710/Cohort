// Exercises the *actual compiled* CohortDataset contract (via compactc +
// @midnight-ntwrk/compact-runtime), not a hand-written mirror of it.
//
// Phase 2: the contract now derives dataset-scoped, action-scoped
// nullifiers from a private `localSecretKey` witness, and reads the
// survey answer from a private `surveyAnswers` witness instead of a
// public circuit argument. Witness functions are fixed on the Contract
// object, so each test models a distinct organization by supplying a
// different `currentPrivateState` per circuit call — the shared ledger
// state is threaded through regardless of which "organization" is
// acting, exactly as one deployed contract instance serving many callers
// would behave.
//
// Run `pnpm compact:build` first to (re)generate managed/dataset/contract.
import { beforeEach, describe, expect, it } from "vitest";
import { type CircuitContext, createCircuitContext, createConstructorContext, sampleContractAddress } from "@midnight-ntwrk/compact-runtime";
import { Contract, ledger, DatasetState } from "../managed/dataset/contract/index.js";

const COIN_PUBLIC_KEY = "00".repeat(32);
const DATASET_ID = new Uint8Array(32).fill(7);
const OTHER_DATASET_ID = new Uint8Array(32).fill(9);

interface Answers {
  salaryBand: bigint;
  companySize: bigint;
}

interface OrgPrivateState {
  datasetId: Uint8Array;
  secretKey: Uint8Array;
  answers: Answers;
}

/** A distinct simulated organization: its own secret, scoped to a dataset. */
function org(seed: number, datasetId = DATASET_ID, answers: Answers = { salaryBand: 0n, companySize: 0n }): OrgPrivateState {
  return { datasetId, secretKey: new Uint8Array(32).fill(seed), answers };
}

const witnesses = {
  configuredDatasetId: (context: { privateState: OrgPrivateState }) => [context.privateState, context.privateState.datasetId] as const,
  localSecretKey: (context: { privateState: OrgPrivateState }) => [context.privateState, context.privateState.secretKey] as const,
  surveyAnswers: (context: { privateState: OrgPrivateState }) => [context.privateState, context.privateState.answers] as const,
};

/** Threads shared ledger/Zswap state through calls made by different simulated organizations. */
class DatasetSession {
  private readonly contract = new Contract<OrgPrivateState>(witnesses);
  private readonly address = sampleContractAddress();
  private context: CircuitContext<OrgPrivateState>;

  constructor(deployer: OrgPrivateState = org(0)) {
    const { currentPrivateState, currentContractState, currentZswapLocalState } = this.contract.initialState(
      createConstructorContext(deployer, COIN_PUBLIC_KEY),
    );
    this.context = createCircuitContext(this.address, currentZswapLocalState, currentContractState, currentPrivateState);
  }

  private call(circuit: "join" | "submit" | "freeze" | "revealResults", caller: OrgPrivateState) {
    const contextForCaller: CircuitContext<OrgPrivateState> = { ...this.context, currentPrivateState: caller };
    const { result, context: next } = this.contract.impureCircuits[circuit](contextForCaller);
    this.context = next;
    return result;
  }

  join(caller: OrgPrivateState) {
    return this.call("join", caller);
  }

  submit(caller: OrgPrivateState) {
    return this.call("submit", caller);
  }

  freeze(caller: OrgPrivateState = org(0)) {
    return this.call("freeze", caller);
  }

  revealResults(caller: OrgPrivateState = org(0)) {
    return this.call("revealResults", caller);
  }

  ledger() {
    return ledger(this.context.currentQueryContext.state);
  }
}

describe("CohortDataset (Phase 2 privacy model)", () => {
  let session: DatasetSession;

  beforeEach(() => {
    session = new DatasetSession();
  });

  it("starts OPEN with a threshold of 3, all counters at zero, and empty nullifier sets", () => {
    const state = session.ledger();
    expect(state.state).toBe(DatasetState.OPEN);
    expect(state.threshold).toBe(3n);
    expect(state.participantCount).toBe(0n);
    expect(state.responseCount).toBe(0n);
    expect(state.joinNullifiers.isEmpty()).toBe(true);
    expect(state.submitNullifiers.isEmpty()).toBe(true);
  });

  it("lets distinct organizations each join exactly once", () => {
    session.join(org(1));
    session.join(org(2));
    expect(session.ledger().participantCount).toBe(2n);
    expect(session.ledger().joinNullifiers.size()).toBe(2n);
  });

  it("rejects a second join from the same organization (same secret)", () => {
    session.join(org(1));
    expect(() => session.join(org(1))).toThrow();
    expect(session.ledger().participantCount).toBe(1n);
  });

  it("refuses to submit before joining", () => {
    expect(() => session.submit(org(1, DATASET_ID, { salaryBand: 0n, companySize: 0n }))).toThrow();
  });

  it("rejects a second submission from the same organization", () => {
    const alice = org(1, DATASET_ID, { salaryBand: 1n, companySize: 2n });
    session.join(alice);
    session.submit(alice);
    expect(() => session.submit(alice)).toThrow();
    expect(session.ledger().responseCount).toBe(1n);
  });

  it("tallies each distinct organization's submission into the correct bucket, unlinked from identity", () => {
    const alice = org(1, DATASET_ID, { salaryBand: 1n, companySize: 2n });
    const bob = org(2, DATASET_ID, { salaryBand: 1n, companySize: 0n });
    session.join(alice);
    session.join(bob);
    session.submit(alice);
    session.submit(bob);

    const state = session.ledger();
    expect(state.responseCount).toBe(2n);
    expect(state.salaryBand1).toBe(2n); // both picked the same bucket
    expect(state.companySize0).toBe(1n);
    expect(state.companySize2).toBe(1n);
    // the tally records *that* two orgs picked band 1, never *which* orgs
    expect(state.submitNullifiers.size()).toBe(2n);
  });

  it("rejects an out-of-range option", () => {
    const alice = org(1, DATASET_ID, { salaryBand: 9n, companySize: 0n });
    session.join(alice);
    expect(() => session.submit(alice)).toThrow();
  });

  it("derives different nullifiers for join vs. submit from the same secret (unlinkable actions)", () => {
    const alice = org(1, DATASET_ID, { salaryBand: 0n, companySize: 0n });
    session.join(alice);
    session.submit(alice);

    const state = session.ledger();
    const [joinNullifier] = [...state.joinNullifiers];
    const [submitNullifier] = [...state.submitNullifiers];
    expect(Buffer.from(joinNullifier).toString("hex")).not.toBe(Buffer.from(submitNullifier).toString("hex"));
  });

  it("derives a different join nullifier for the same secret on a different dataset", () => {
    const secretSeed = 42;
    const sessionA = new DatasetSession(org(0, DATASET_ID));
    const sessionB = new DatasetSession(org(0, OTHER_DATASET_ID));

    sessionA.join(org(secretSeed, DATASET_ID));
    sessionB.join(org(secretSeed, OTHER_DATASET_ID));

    const [nullifierA] = [...sessionA.ledger().joinNullifiers];
    const [nullifierB] = [...sessionB.ledger().joinNullifiers];
    expect(Buffer.from(nullifierA).toString("hex")).not.toBe(Buffer.from(nullifierB).toString("hex"));
  });

  it("refuses to freeze before the participation threshold is reached", () => {
    session.join(org(1));
    session.join(org(2));
    session.submit(org(1));
    session.submit(org(2));
    expect(session.ledger().responseCount).toBe(2n);
    expect(() => session.freeze()).toThrow();
  });

  it("freezes once the threshold is reached, then rejects further join/submit", () => {
    const alice = org(1, DATASET_ID, { salaryBand: 0n, companySize: 0n });
    const bob = org(2, DATASET_ID, { salaryBand: 1n, companySize: 0n });
    const carol = org(3, DATASET_ID, { salaryBand: 2n, companySize: 0n });
    [alice, bob, carol].forEach((o) => session.join(o));
    [alice, bob, carol].forEach((o) => session.submit(o));
    expect(session.ledger().responseCount).toBe(3n);

    session.freeze();
    expect(session.ledger().state).toBe(DatasetState.FROZEN);

    expect(() => session.join(org(4))).toThrow();
    expect(() => session.submit(org(4))).toThrow();
  });

  it("only allows revealResults once frozen, and it is immutable after", () => {
    expect(() => session.revealResults()).toThrow(); // still OPEN

    [org(1), org(2), org(3)].forEach((o) => {
      session.join(o);
      session.submit(o);
    });
    session.freeze();

    session.revealResults();
    expect(session.ledger().state).toBe(DatasetState.REVEALED);
  });
});
