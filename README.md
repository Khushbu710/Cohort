# Cohort

A protocol for confidential, dataset-agnostic industry surveys on Midnight.
See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full system design.

Status: **Phase 0 (scaffolding), Phase 1 (walking skeleton), Phase 2 (real
privacy model + registry), and Phase 3 (local devnet + full frontend)
complete.** Live on-chain deployment is blocked in this environment by a
proving-key network fetch — see "Known limitations" below; everything
short of that is real, running, and verified.

## Workspace layout

```
contracts/    CohortRegistry + CohortDataset Compact contracts, tested against the real compiled output
frontend/     React + Vite + Tailwind + shadcn/ui + Zustand + TanStack Query, wired to the deployment config layer
packages/shared/  Shared TS types, dataset schema JSON, and deployment config (packages/shared/deployments/local.json)
scripts/      Deploy scripts (headless wallet, genesis seed) + lifecycle demo
docs/         Architecture doc
docker-compose.yml   Local Midnight devnet (node + proof server + indexer)
```

### Contract privacy model (Phase 2)

`CohortDataset` no longer takes the org's answer or identity as public
circuit arguments. Three witnesses supply private data locally:
`configuredDatasetId`, `localSecretKey`, and `surveyAnswers`. `join()` and
`submit()` each derive their own domain-separated nullifier
(`hash("cohort:join" | datasetId | secret)` and
`hash("cohort:submit" | datasetId | secret)`) so an organization can join
and submit exactly once per dataset, without the chain ever learning who
did either or what they answered — only which bucket counter moved.
`CohortRegistry` is a separate, non-private singleton contract that makes
deployed dataset contracts discoverable by (address, schema hash).

## Prerequisites

- Node 20+, [pnpm](https://pnpm.io) (`npm install -g pnpm`)
- Docker (for compiling contracts, and later for the local devnet)

## Setup

```bash
pnpm install
```

## Contracts

```bash
pnpm --filter @cohort/contracts compact:build   # compiles CohortRegistry + CohortDataset via the compactc Docker image
pnpm --filter @cohort/contracts test            # runs both contracts against the real compiled output
```

## Frontend

```bash
pnpm --filter @cohort/frontend dev       # http://localhost:5173
pnpm --filter @cohort/frontend build     # production build — see note below
pnpm --filter @cohort/frontend preview   # serve the production build, http://localhost:4173
```

**Use `build` + `preview` to actually verify Midnight-SDK-dependent pages
(Explore/Dataset Detail/Dashboard's live queries).** The `dev` server hits a
real, verified CJS/ESM interop gap specific to Vite's dev-time per-file
transform and `@apollo/client`'s dual-package build (used internally by the
indexer provider) — it does not affect the production build, which bundles
the same code through Rollup and works cleanly end to end, including real
WASM contract-address parsing and validation. See `frontend/vite.config.ts`
for the full explanation and everything that was tried. Pages that don't
touch the Midnight SDK (Landing, Create Dataset's initial render) work fine
in `dev` too; the SDK itself is lazy-loaded (dynamic `import()`) everywhere
so this doesn't crash the app shell — see `lib/midnight/wallet.ts`'s header
comment.

## Lifecycle demo (CLI)

Runs the full OPEN → FROZEN → REVEALED lifecycle against the real compiled
contract and prints the ledger after each step:

```bash
pnpm --filter @cohort/scripts demo:lifecycle
```

## Local devnet

```bash
pnpm devnet:up     # docker compose up -d — node :9944, proof server :6300, indexer :8088
pnpm devnet:down
```

Verified running and healthy in this environment. Deploying to it:

```bash
pnpm --filter @cohort/scripts deploy:registry   # writes registryAddress to packages/shared/deployments/local.json
pnpm --filter @cohort/scripts deploy:dataset    # deploys + registers the demo dataset, appends to the same file
```

The frontend reads that same file (`frontend/src/lib/config.ts`) — once
these scripts succeed, addresses show up in the app with no code changes.

## Known limitations

**`compact:build --with-zk` now works — see "Toolchain" below for what
changed and what it broke downstream.**

**Headless deployment uses the local devnet's well-known genesis seed**
(`0x00...01`), which holds all minted NIGHT/tDUST on a fresh `Undeployed`
network — see `scripts/lib/network.ts`. Never reuse that seed against a
real network.

## Toolchain

**`contracts/scripts/compile.mjs` no longer uses `midnightnetwork/
compactc:latest`.** That image is a stale, differently-named-org,
unofficial build (compiler 0.25.0) that turned out to be a dead end for
real proving-key generation. Root cause, verified on two separate
machines: the compiler's own Rust HTTP client cannot fetch the required
ZK trusted-setup parameter files from Midnight's S3 fileshare — 3 retries,
no useful error — even though the *exact same files* download fine via
curl or Node's `fetch()` from the same machine, same container, at the
same time. This reproduces identically on the old image and on the
current official one, so it's a genuine upstream bug in `zkir`, not a
network/firewall/sandbox issue — worth reporting to Midnight.

The fix: `compile.mjs` now installs the official `compact` CLI
(`midnightntwrk/compact`, currently 0.31.1) and, for `--with-zk`, runs a
tiny local caching proxy (plain Node, no extra dependency) that fetches
the needed parameter files with `fetch()` and hands them to the compiler
over `MIDNIGHT_PARAM_SOURCE` — an env var the compiler already respects,
just not for the broken direct path. Fully automatic; nothing to
configure. First `--with-zk` run downloads the CLI, builds a small local
Docker image (`ca-certificates` + `tar`/`xz`, missing from `debian:
bookworm-slim` by default), and installs the compiler toolchain — all
cached, so only the first run pays that cost.

**This changed the compiled output — everything downstream still expects
the old shape and needs updating before it works again:**

- Output is now `contract/index.js` (ESM), not `index.cjs` (CommonJS).
- Generated code now targets `@midnight-ntwrk/compact-runtime@0.16.0`
  (official current pairing with compiler 0.31.1), not `0.8.1`.
- `contracts/tests/*.test.ts` still import the `.cjs` path and use
  `compact-runtime@0.8.1`'s manual `constructorContext`/`QueryContext`
  API — these will fail as-is.
- `scripts/lib/network.ts` + the deploy scripts, and
  `frontend/src/lib/midnight/*`, are pinned to `@midnight-ntwrk/
  midnight-js-contracts@2.1.0`, verified compatible with `0.8.1`-generated
  output specifically. The officially matched SDK for `0.16.0` is
  `midnight-js-contracts@4.1.1` + `@midnight-ntwrk/compact-js@2.5.1`, a
  materially different (Effect-based) calling convention — this is a real
  migration, not a version bump, and hasn't been done yet.

Until that migration happens, `pnpm --filter @cohort/contracts test`,
`pnpm --filter @cohort/scripts deploy:registry`/`deploy:dataset`, and the
frontend's Midnight-SDK code paths are expected to fail — the compiler fix
is real and verified in isolation (`compact:build --with-zk` completes and
produces real prover/verifier keys for every circuit), but the rest of the
pipeline hasn't been updated to match yet.
