// Org identity secret. See docs/ARCHITECTURE.md §5: the original design
// derives this from a wallet signature, but the Lace connector API
// available today (@midnight-ntwrk/dapp-connector-api) doesn't expose a
// generic message-signing method to build that on. A persistent,
// locally-generated random secret gives the same properties that matter —
// unlinkable, one-time-per-dataset nullifiers via the contract's join/
// submit circuits — without inventing an auth or KYB layer. It's keyed by
// wallet address purely so switching wallets gets a fresh identity; the
// secret itself never leaves the browser or appears in any transaction.
import { bytesToHex, hexToBytes } from "./utils";

const STORAGE_PREFIX = "cohort:org-secret:";

export function getOrgSecret(walletAddress: string): Uint8Array {
  const key = STORAGE_PREFIX + walletAddress;
  const existing = localStorage.getItem(key);
  if (existing) return hexToBytes(existing);

  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  localStorage.setItem(key, bytesToHex(secret));
  return secret;
}
