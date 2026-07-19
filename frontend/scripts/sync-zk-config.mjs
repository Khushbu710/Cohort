// Copies each compiled contract's ZK artifacts (zkir + prover/verifier keys,
// once generated with a non---skip-zk compile) into public/zk-config/<name>/
// so FetchZkConfigProvider can serve them to the browser over HTTP. Run
// automatically before dev/build (see package.json) — never hand-edit the
// public/zk-config output, it's regenerated from contracts/managed.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const managedDir = path.resolve(frontendDir, "..", "contracts", "managed");
const publicZkConfigDir = path.join(frontendDir, "public", "zk-config");

const contracts = ["registry", "dataset"];

rmSync(publicZkConfigDir, { recursive: true, force: true });
mkdirSync(publicZkConfigDir, { recursive: true });

for (const name of contracts) {
  const src = path.join(managedDir, name);
  if (!existsSync(src)) {
    console.warn(`skip ${name}: not compiled yet (run pnpm --filter @cohort/contracts compact:build)`);
    continue;
  }
  const dest = path.join(publicZkConfigDir, name);
  mkdirSync(dest, { recursive: true });

  // FetchZkConfigProvider expects zkir/<circuit>.bzkir + keys/<circuit>.{prover,verifier}.
  // A --skip-zk compile (see contracts/scripts/compile.mjs) only produces plain
  // .zkir files and no keys/ dir at all — copy whatever exists so the wiring is
  // ready, but writes will fail until the contracts are compiled with real key
  // generation (`pnpm --filter @cohort/contracts compact:build -- --with-zk`).
  const zkirSrc = path.join(src, "zkir");
  if (existsSync(zkirSrc)) cpSync(zkirSrc, path.join(dest, "zkir"), { recursive: true });

  const keysSrc = path.join(src, "keys");
  if (existsSync(keysSrc)) {
    cpSync(keysSrc, path.join(dest, "keys"), { recursive: true });
  } else {
    console.warn(`${name}: no proving/verifier keys yet (compiled with --skip-zk) — writes will fail until recompiled`);
  }
}

console.log("Synced zk-config into public/zk-config/");
