// Runs the full Phase 2 dataset lifecycle — OPEN -> FROZEN -> REVEALED —
// against the real compiled CohortDataset contract via the Compact
// simulator (@midnight-ntwrk/compact-runtime), printing the ledger after
// each step. Three distinct simulated organizations (each with their own
// private secret and private survey answer) join and submit, demonstrating
// that the tally updates without ever recording which org contributed
// which answer. See docs/ARCHITECTURE.md, Phase 2.
//
// Run `pnpm --filter @cohort/contracts compact:build` first, then:
//   pnpm --filter @cohort/scripts demo:lifecycle
//
// Real deployment to a live Midnight devnet (via @midnight-ntwrk/midnight-js
// contracts) is Phase 3 work — see the note in this repo's README about the
// compactc/midnight-js version pairing that needs to be resolved first.
import { type CircuitContext, createCircuitContext, createConstructorContext, sampleContractAddress } from "@midnight-ntwrk/compact-runtime";
import { Contract, ledger, DatasetState, type Witnesses } from "@cohort/contracts/managed/dataset/contract/index.js";

const COIN_PUBLIC_KEY = "00".repeat(32);
const DATASET_ID = new Uint8Array(32).fill(1);

interface Answers {
  salaryBand: bigint;
  companySize: bigint;
}

interface OrgPrivateState {
  datasetId: Uint8Array;
  secretKey: Uint8Array;
  answers: Answers;
}

function org(name: string, answers: Answers = { salaryBand: 0n, companySize: 0n }): OrgPrivateState {
  const secretKey = new TextEncoder().encode(name.padEnd(32, "\0")).slice(0, 32);
  return { datasetId: DATASET_ID, secretKey, answers };
}

const witnesses: Witnesses<OrgPrivateState> = {
  configuredDatasetId: (context) => [context.privateState, context.privateState.datasetId],
  localSecretKey: (context) => [context.privateState, context.privateState.secretKey],
  surveyAnswers: (context) => [context.privateState, context.privateState.answers],
};

class DatasetSession {
  private readonly contract = new Contract<OrgPrivateState>(witnesses);
  private readonly address = sampleContractAddress();
  private context: CircuitContext<OrgPrivateState>;

  constructor(deployer: OrgPrivateState) {
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

  freeze(caller: OrgPrivateState) {
    return this.call("freeze", caller);
  }

  revealResults(caller: OrgPrivateState) {
    return this.call("revealResults", caller);
  }

  ledger() {
    return ledger(this.context.currentQueryContext.state);
  }
}

function printState(label: string, session: DatasetSession) {
  const state = session.ledger();
  console.log(`\n[${label}] state=${DatasetState[state.state]}`);
  console.log(
    `  participants=${state.participantCount} responses=${state.responseCount}/${state.threshold}` +
      ` joinNullifiers=${state.joinNullifiers.size()} submitNullifiers=${state.submitNullifiers.size()}`,
  );
  console.log(
    `  salaryBand: <100k=${state.salaryBand0} 100-150k=${state.salaryBand1} 150-200k=${state.salaryBand2} >200k=${state.salaryBand3}`,
  );
  console.log(
    `  companySize: 1-50=${state.companySize0} 51-500=${state.companySize1} 500+=${state.companySize2}`,
  );
}

const alice = org("alice", { salaryBand: 1n, companySize: 2n });
const bob = org("bob", { salaryBand: 2n, companySize: 1n });
const carol = org("carol", { salaryBand: 1n, companySize: 0n });

const session = new DatasetSession(alice);
printState("deployed", session);

session.join(alice);
session.join(bob);
session.join(carol);
printState("3 organizations joined (unlinkable nullifiers, no identity on chain)", session);

session.submit(alice);
printState("1st response submitted (raw answer never left alice's browser)", session);

session.submit(bob);
session.submit(carol);
printState("threshold reached (3 responses)", session);

session.freeze(alice);
printState("frozen", session);

session.revealResults(alice);
printState("revealed", session);
