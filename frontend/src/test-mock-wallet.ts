// TEMPORARY verification harness — NOT part of the shipped app.
//
// No real 1AM/Lace browser extension can be installed in this sandboxed
// environment, so this stands in for one: it implements the exact
// documented @midnight-ntwrk/dapp-connector-api InitialAPI/ConnectedAPI shape
// and registers itself under window.midnight, exactly as a real extension
// would.
//
// Proving is done exactly as a real wallet would: via
// httpClientProvingProvider talking directly to the local proof server
// (the low-level ProvingProvider that ConnectedAPI.getProvingProvider is
// documented to return — see midnight-js-http-client-proof-provider).
//
// Balancing and submission need real keys, so those two calls are
// delegated over plain HTTP to a small Node bridge (scripts/wallet-bridge.mjs)
// that holds the SAME already-verified wallet-sdk-facade wiring used by
// scripts/lib/network.ts (genesis seed) — avoiding a second, separate round
// of bundling wallet-sdk-facade into the browser (a test-harness-only
// concern; real extensions never load in this page).
import { httpClientProvingProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";

const LOCAL_DEVNET = {
  indexer: "http://127.0.0.1:8088/api/v3/graphql",
  indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
  node: "http://127.0.0.1:9944",
  proofServer: "http://127.0.0.1:6300",
};
const BRIDGE = "http://127.0.0.1:7777";

export function buildConnectedApi(addresses: { shieldedCoinPublicKey: string; shieldedEncryptionPublicKey: string; unshieldedAddress: string }) {
  const connectedApi = {
    async getConnectionStatus() {
      return { status: "connected", networkId: "undeployed" };
    },
    async getConfiguration() {
      return {
        indexerUri: LOCAL_DEVNET.indexer,
        indexerWsUri: LOCAL_DEVNET.indexerWS,
        substrateNodeUri: LOCAL_DEVNET.node,
        networkId: "undeployed",
      };
    },
    async getShieldedAddresses() {
      return {
        shieldedAddress: "mock-shielded-address",
        shieldedCoinPublicKey: addresses.shieldedCoinPublicKey,
        shieldedEncryptionPublicKey: addresses.shieldedEncryptionPublicKey,
      };
    },
    async getUnshieldedAddress() {
      return { unshieldedAddress: addresses.unshieldedAddress };
    },
    async getDustAddress() {
      return { dustAddress: "mock-dust-address" };
    },
    async getShieldedBalances() {
      return {};
    },
    async getUnshieldedBalances() {
      return {};
    },
    async getDustBalance() {
      return { balance: 0n, cap: 0n };
    },
    async getProvingProvider(keyMaterialProvider: any) {
      return httpClientProvingProvider(LOCAL_DEVNET.proofServer, keyMaterialProvider);
    },
    async balanceUnsealedTransaction(hexTx: string, _options?: { payFees?: boolean }) {
      const res = await fetch(`${BRIDGE}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hexTx }),
      });
      if (!res.ok) throw new Error(`bridge /balance failed: ${await res.text()}`);
      const { hexTx: resultHex } = await res.json();
      return { tx: resultHex };
    },
    async submitTransaction(hexTx: string) {
      const res = await fetch(`${BRIDGE}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hexTx }),
      });
      if (!res.ok) throw new Error(`bridge /submit failed: ${await res.text()}`);
    },
  };

  return connectedApi;
}
