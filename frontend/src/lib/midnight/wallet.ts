// Browser wallet connection. Prefers 1AM (the wallet built specifically for
// the Midnight network, with documented DApp Connector v4 support) and falls
// back to Lace or any other injected connector — see findConnector() below.
//
// Import this module only via dynamic import() (see store/wallet.ts), never
// as a static top-level import — see this file's header comment history /
// docs/ARCHITECTURE.md for why the Midnight SDK can't be a static top-level
// import in anything reachable from every route.
//
// This bridges @midnight-ntwrk/dapp-connector-api@4.0.1 (a complete redesign
// from the 3.0.0 API this app originally targeted) to midnight-js's
// WalletProvider/MidnightProvider interfaces, following exactly the pattern
// used by the officially-linked example repos:
//   - https://github.com/bochaco/react-mn-wallet-connect (linked directly
//     from docs.midnight.network/guides/react-wallet-connect) — connect()
//     flow and address retrieval.
//   - https://github.com/0xfdbu/midnight-dapp-connect (src/pages/Transfer.tsx)
//     — the real prove -> balanceUnsealedTransaction -> submitTransaction
//     sequence for a browser wallet, including delegating proving to the
//     wallet via getProvingProvider() rather than a local proof-server HTTP
//     client (that only applies to headless/CLI wallets — see
//     scripts/lib/network.ts's header comment and transaction-cli.ts in the
//     0xfdbu reference, which documents this exact CLI-vs-browser split).
import "@midnight-ntwrk/dapp-connector-api"; // augments `window.midnight`
import type { ConnectedAPI, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";
import { Transaction, type SignatureEnabled, type Proof, type Binding } from "@midnight-ntwrk/ledger-v8";
import { toHex, fromHex } from "@midnight-ntwrk/midnight-js/utils";
import { createProofProvider } from "@midnight-ntwrk/midnight-js/types";
import type { MidnightProvider, ProofProvider, WalletProvider, ZKConfigProvider } from "@midnight-ntwrk/midnight-js/types";

export class WalletNotFoundError extends Error {
  constructor() {
    super("No Midnight-compatible wallet extension found. Install 1AM (or Lace) to continue.");
    this.name = "WalletNotFoundError";
  }
}

export class WalletConnectionRejectedError extends Error {
  constructor(cause: unknown) {
    super("Wallet connection was rejected or failed.");
    this.name = "WalletConnectionRejectedError";
    this.cause = cause;
  }
}

/** Picks a wallet from window.midnight, preferring 1AM over Lace over anything else —
 * matching the selection order used by the officially-linked reference apps. */
function findConnector(): InitialAPI | undefined {
  const registry = window.midnight;
  if (!registry) return undefined;
  const candidates = Object.values(registry);
  if (candidates.length === 0) return undefined;
  return (
    candidates.find((w) => w.rdns?.includes("1am") || w.rdns?.includes("xyz.1am")) ??
    candidates.find((w) => w.rdns?.includes("lace")) ??
    candidates[0]
  );
}

/** Builds a ProofProvider that delegates circuit proving to the connected wallet
 * (via ConnectedAPI.getProvingProvider), instead of talking to a proof server
 * directly — the correct approach for a browser wallet, which holds the keys
 * and manages its own proving infrastructure. */
export async function createWalletProofProvider<K extends string>(
  api: ConnectedAPI,
  zkConfigProvider: ZKConfigProvider<K>,
): Promise<ProofProvider> {
  const provingProvider = await api.getProvingProvider(zkConfigProvider.asKeyMaterialProvider());
  return createProofProvider(provingProvider);
}

export class MidnightWalletProvider implements WalletProvider, MidnightProvider {
  readonly walletName: string;
  readonly address: string;
  readonly api: ConnectedAPI;
  private readonly shieldedCoinPublicKeyValue: string;
  private readonly shieldedEncryptionPublicKeyValue: string;

  private constructor(walletName: string, api: ConnectedAPI, shieldedCoinPublicKey: string, shieldedEncryptionPublicKey: string, unshieldedAddress: string) {
    this.walletName = walletName;
    this.api = api;
    this.shieldedCoinPublicKeyValue = shieldedCoinPublicKey;
    this.shieldedEncryptionPublicKeyValue = shieldedEncryptionPublicKey;
    this.address = unshieldedAddress;
  }

  static async connect(): Promise<MidnightWalletProvider> {
    const connector = findConnector();
    if (!connector) throw new WalletNotFoundError();

    try {
      const api = await connector.connect("undeployed");
      const status = await api.getConnectionStatus();
      if (status.status !== "connected") {
        throw new Error(`Wallet status: ${status.status}`);
      }
      const [shielded, unshielded] = await Promise.all([api.getShieldedAddresses(), api.getUnshieldedAddress()]);
      return new MidnightWalletProvider(connector.name, api, shielded.shieldedCoinPublicKey, shielded.shieldedEncryptionPublicKey, unshielded.unshieldedAddress);
    } catch (cause) {
      throw new WalletConnectionRejectedError(cause);
    }
  }

  getCoinPublicKey() {
    return this.shieldedCoinPublicKeyValue;
  }

  getEncryptionPublicKey() {
    return this.shieldedEncryptionPublicKeyValue;
  }

  // tx here is an UnboundTransaction (Transaction<SignatureEnabled, Proof, PreBinding>) —
  // already proven (see createWalletProofProvider above), not yet balanced/bound.
  // balanceUnsealedTransaction is the correct call for contract-call transactions
  // originating from DApp logic (as opposed to balanceSealedTransaction, which is
  // for completing sealed swap/intent transactions created via makeIntent()).
  async balanceTx(tx: Parameters<WalletProvider["balanceTx"]>[0]) {
    const serialized = toHex(tx.serialize());
    const result = await this.api.balanceUnsealedTransaction(serialized, { payFees: true });
    return Transaction.deserialize<SignatureEnabled, Proof, Binding>("signature", "proof", "binding", fromHex(result.tx));
  }

  async submitTx(tx: Parameters<MidnightProvider["submitTx"]>[0]) {
    const serialized = toHex(tx.serialize());
    await this.api.submitTransaction(serialized);
    // dapp-connector-api's submitTransaction returns void, not a transaction ID —
    // the transaction's own identifiers() (from @midnight-ntwrk/ledger-v8) are the
    // canonical source for the ID midnight-js needs to watch for finalization.
    const [txId] = tx.identifiers();
    return txId;
  }
}
