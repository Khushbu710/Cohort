// Shared local-devnet configuration and wallet/provider wiring, used by
// every deploy script (deploy-registry.ts, deploy-dataset.ts) so the actual
// "how do we talk to the chain" logic exists in exactly one place.
//
// This follows the exact pattern used by midnightntwrk/example-counter's
// counter-cli/src/api.ts (the official reference for this SDK generation):
// a headless wallet is built from three composed sub-wallets (Shielded,
// Unshielded, Dust) via WalletFacade, since there is no browser/Lace wallet
// available for scripted deployment (Lace is a browser extension — scripts
// run in Node). On the local standalone devnet (CFG_PRESET=dev in
// docker-compose.yml), the well-known genesis seed below is pre-funded with
// all minted NIGHT in the genesis block — this is a devnet-only
// convenience, never use this seed against a real network.
//
// Unlike the old @midnight-ntwrk/wallet generation, this SDK requires an
// explicit DUST (fee token) registration step before any transaction can be
// balanced — NIGHT UTXOs must be registered for dust generation and DUST
// must accrue before a contract can be deployed or called, even on a fully
// local standalone network.
import { firstValueFrom, filter, throttleTime } from "rxjs";
import { WebSocket } from "ws";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import { unshieldedToken } from "@midnight-ntwrk/ledger-v8";
import { setNetworkId, getNetworkId } from "@midnight-ntwrk/midnight-js/network-id";
import { toHex } from "@midnight-ntwrk/midnight-js/utils";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import type { MidnightProvider, WalletProvider, ZKConfigProvider } from "@midnight-ntwrk/midnight-js/types";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
  type UnshieldedKeystore,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { HDWallet, Roles, type Role } from "@midnight-ntwrk/wallet-sdk-hd";

// GraphQL subscriptions (wallet sync) require a WebSocket global in Node.
// @ts-expect-error: needed to enable WebSocket usage through the wallet SDK's Apollo client
globalThis.WebSocket = WebSocket;

/** Gives access to tokens minted in the genesis block of the local standalone devnet. */
export const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";

export const LOCAL_DEVNET = {
  indexer: "http://127.0.0.1:8088/api/v3/graphql",
  indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
  node: "http://127.0.0.1:9944",
  proofServer: "http://127.0.0.1:6300",
};

export interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

/**
 * Signs all unshielded offers in a transaction's intents with the correct
 * proof marker for Intent.deserialize. Works around a bug in
 * @midnight-ntwrk/wallet-sdk-unshielded-wallet@2.1.0 where `signRecipe`
 * hardcodes the 'pre-proof' marker, which fails to deserialize proven
 * (UnboundTransaction) intents that carry 'proof' data instead — see
 * midnightntwrk/example-counter's MIGRATION_GUIDE.md §4 ("signRecipe Bug
 * Workaround"), which documents this exact bug and this exact fix.
 */
function signTransactionIntents(
  tx: { intents?: Map<number, any> },
  signFn: (payload: Uint8Array) => ledger.Signature,
  proofMarker: "proof" | "pre-proof",
): void {
  if (!tx.intents || tx.intents.size === 0) return;

  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;

    const cloned = ledger.Intent.deserialize<ledger.SignatureEnabled, ledger.Proofish, ledger.PreBinding>(
      "signature",
      proofMarker,
      "pre-binding",
      intent.serialize(),
    );

    const sigData = cloned.signatureData(segment);
    const signature = signFn(sigData);

    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
        (_: unknown, i: number) => cloned.fallibleUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }
    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_: unknown, i: number) => cloned.guaranteedUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }
    tx.intents.set(segment, cloned);
  }
}

/** Bridges the wallet-sdk-facade to the WalletProvider/MidnightProvider interfaces midnight-js needs. */
async function createWalletAndMidnightProvider(ctx: WalletContext): Promise<WalletProvider & MidnightProvider> {
  const state = await firstValueFrom(ctx.wallet.state().pipe(filter((s) => s.isSynced)));
  return {
    getCoinPublicKey() {
      return state.shielded.coinPublicKey.toHexString();
    },
    getEncryptionPublicKey() {
      return state.shielded.encryptionPublicKey.toHexString();
    },
    async balanceTx(tx, ttl?) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      const signFn = (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, "proof");
      if (recipe.balancingTransaction) {
        signTransactionIntents(recipe.balancingTransaction, signFn, "pre-proof");
      }
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx(tx) {
      return ctx.wallet.submitTransaction(tx);
    },
  };
}

function deriveKeysFromSeed(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hdWallet.type !== "seedOk") throw new Error("Failed to initialize HDWallet from seed");

  const derivationResult = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derivationResult.type !== "keysDerived") throw new Error("Failed to derive keys");

  hdWallet.hdWallet.clear();
  return derivationResult.keys as Record<Role, Uint8Array>;
}

/** Registers NIGHT UTXOs for DUST (fee token) generation and waits for a non-zero DUST balance.
 * Required before any transaction can be balanced — even on the local standalone devnet. */
async function registerForDustGeneration(wallet: WalletFacade, unshieldedKeystore: UnshieldedKeystore): Promise<void> {
  const state = await firstValueFrom(wallet.state().pipe(filter((s) => s.isSynced)));

  if (state.dust.availableCoins.length > 0 && state.dust.balance(new Date()) > 0n) {
    return;
  }

  const nightUtxos = state.unshielded.availableCoins.filter(
    (coin: any) => coin.meta?.registeredForDustGeneration !== true,
  );

  if (nightUtxos.length > 0) {
    console.log(`Registering ${nightUtxos.length} NIGHT UTXO(s) for dust generation...`);
    const recipe = await wallet.registerNightUtxosForDustGeneration(nightUtxos, unshieldedKeystore.getPublicKey(), (payload) =>
      unshieldedKeystore.signData(payload),
    );
    const finalized = await wallet.finalizeRecipe(recipe);
    await wallet.submitTransaction(finalized);
  }

  console.log("Waiting for dust tokens to generate...");
  await firstValueFrom(
    wallet.state().pipe(
      throttleTime(5_000),
      filter((s) => s.isSynced),
      filter((s) => s.dust.balance(new Date()) > 0n),
    ),
  );
}

async function buildWallet(seed: string): Promise<WalletContext> {
  const keys = deriveKeysFromSeed(seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

  const shieldedConfig = {
    networkId: getNetworkId(),
    indexerClientConnection: { indexerHttpUrl: LOCAL_DEVNET.indexer, indexerWsUrl: LOCAL_DEVNET.indexerWS },
    provingServerUrl: new URL(LOCAL_DEVNET.proofServer),
    relayURL: new URL(LOCAL_DEVNET.node.replace(/^http/, "ws")),
  };
  const unshieldedConfig = {
    networkId: getNetworkId(),
    indexerClientConnection: { indexerHttpUrl: LOCAL_DEVNET.indexer, indexerWsUrl: LOCAL_DEVNET.indexerWS },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  };
  const dustConfig = {
    networkId: getNetworkId(),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    indexerClientConnection: { indexerHttpUrl: LOCAL_DEVNET.indexer, indexerWsUrl: LOCAL_DEVNET.indexerWS },
    provingServerUrl: new URL(LOCAL_DEVNET.proofServer),
    relayURL: new URL(LOCAL_DEVNET.node.replace(/^http/, "ws")),
  };

  const wallet = await WalletFacade.init({
    configuration: { ...shieldedConfig, ...unshieldedConfig, ...dustConfig },
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  console.log("Syncing with network...");
  await firstValueFrom(wallet.state().pipe(throttleTime(5_000), filter((s) => s.isSynced)));

  const balance = (await firstValueFrom(wallet.state())).unshielded.balances[unshieldedToken().raw] ?? 0n;
  console.log(`Unshielded balance: ${balance}`);

  await registerForDustGeneration(wallet, unshieldedKeystore);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

/** Builds the full provider set a `deployContract`/`findDeployedContract` call needs,
 * pointed at the local devnet and a given contract's compiled zk artifacts. */
export async function makeLocalProviders<K extends string>(zkConfigDir: string, seed: string = GENESIS_SEED) {
  setNetworkId("undeployed");
  const ctx = await buildWallet(seed);
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(ctx);
  const zkConfigProvider: ZKConfigProvider<K> = new NodeZkConfigProvider<K>(zkConfigDir);

  // accountId and privateStoragePasswordProvider are required by
  // levelPrivateStateProvider now (encrypts private state at rest). The coin
  // public key is base64-encoded for the password — base64 output covers all
  // four character classes and avoids repeated-character runs found in raw
  // hex strings. Matches midnightntwrk/example-counter's api.ts pattern.
  const accountId = walletAndMidnightProvider.getCoinPublicKey();
  const storagePassword = `${Buffer.from(accountId, "hex").toString("base64")}!`;

  return {
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: "cohort-deploy-db",
      accountId,
      privateStoragePasswordProvider: () => storagePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(LOCAL_DEVNET.indexer, LOCAL_DEVNET.indexerWS),
    proofProvider: httpClientProofProvider(LOCAL_DEVNET.proofServer, zkConfigProvider),
    zkConfigProvider,
    walletContext: ctx,
  };
}
