// Node-side "wallet bridge" for browser E2E verification. Reuses the exact,
// already-verified wallet-sdk-facade wiring from scripts/lib/network.ts
// (genesis seed) to hold real keys and do real balancing/signing/submission,
// exposed over plain HTTP so the in-browser mock ConnectedAPI can delegate
// to it without needing to bundle wallet-sdk-facade into the browser.
import http from "node:http";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { firstValueFrom, filter, throttleTime } from "rxjs";
import { WebSocket } from "ws";

globalThis.WebSocket = WebSocket;

const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";
const LOCAL_DEVNET = {
  indexer: "http://127.0.0.1:8088/api/v3/graphql",
  indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
  node: "http://127.0.0.1:9944",
  proofServer: "http://127.0.0.1:6300",
};

function signTransactionIntents(tx, signFn, proofMarker) {
  if (!tx.intents || tx.intents.size === 0) return;
  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize("signature", proofMarker, "pre-binding", intent.serialize());
    const sigData = cloned.signatureData(segment);
    const signature = signFn(sigData);
    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map((_, i) => cloned.fallibleUnshieldedOffer.signatures.at(i) ?? signature);
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }
    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map((_, i) => cloned.guaranteedUnshieldedOffer.signatures.at(i) ?? signature);
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }
    tx.intents.set(segment, cloned);
  }
}

async function buildWallet() {
  const hdWallet = HDWallet.fromSeed(Buffer.from(GENESIS_SEED, "hex"));
  if (hdWallet.type !== "seedOk") throw new Error("seed failed");
  const derivation = hdWallet.hdWallet.selectAccount(0).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
  if (derivation.type !== "keysDerived") throw new Error("derive failed");
  hdWallet.hdWallet.clear();

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derivation.keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derivation.keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(derivation.keys[Roles.NightExternal], "undeployed");

  const shieldedConfig = {
    networkId: "undeployed",
    indexerClientConnection: { indexerHttpUrl: LOCAL_DEVNET.indexer, indexerWsUrl: LOCAL_DEVNET.indexerWS },
    provingServerUrl: new URL(LOCAL_DEVNET.proofServer),
    relayURL: new URL(LOCAL_DEVNET.node.replace(/^http/, "ws")),
  };
  const unshieldedConfig = {
    networkId: "undeployed",
    indexerClientConnection: { indexerHttpUrl: LOCAL_DEVNET.indexer, indexerWsUrl: LOCAL_DEVNET.indexerWS },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  };
  const dustConfig = {
    networkId: "undeployed",
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
  console.log("[bridge] syncing...");
  await firstValueFrom(wallet.state().pipe(throttleTime(2000), filter((s) => s.isSynced)));
  console.log("[bridge] synced.");

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

const ctx = await buildWallet();

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  try {
    const body = JSON.parse((await readBody(req)) || "{}");
    if (req.url === "/addresses" && req.method === "GET") {
      const state = await firstValueFrom(ctx.wallet.state().pipe(filter((s) => s.isSynced)));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          shieldedCoinPublicKey: state.shielded.coinPublicKey.toHexString(),
          shieldedEncryptionPublicKey: state.shielded.encryptionPublicKey.toHexString(),
          unshieldedAddress: ctx.unshieldedKeystore.getBech32Address().toString(),
        }),
      );
      return;
    }
    if (req.url === "/balance" && req.method === "POST") {
      const { hexTx } = body;
      const unboundTx = ledger.Transaction.deserialize("signature", "proof", "pre-binding", Buffer.from(hexTx, "hex"));
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        unboundTx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: new Date(Date.now() + 30 * 60 * 1000) },
      );
      const signFn = (payload) => ctx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, "proof");
      if (recipe.balancingTransaction) signTransactionIntents(recipe.balancingTransaction, signFn, "pre-proof");
      const finalized = await ctx.wallet.finalizeRecipe(recipe);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ hexTx: Buffer.from(finalized.serialize()).toString("hex") }));
      return;
    }
    if (req.url === "/submit" && req.method === "POST") {
      const { hexTx } = body;
      const finalizedTx = ledger.Transaction.deserialize("signature", "proof", "binding", Buffer.from(hexTx, "hex"));
      await ctx.wallet.submitTransaction(finalizedTx);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  } catch (err) {
    console.error("[bridge] error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
});

server.listen(7777, "127.0.0.1", () => console.log("[bridge] listening on http://127.0.0.1:7777"));
