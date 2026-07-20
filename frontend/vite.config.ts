import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const APOLLO_CJS_SUBPATHS = [
  '@apollo/client/core/core.cjs',
  '@apollo/client/link/core/core.cjs',
  '@apollo/client/link/http/http.cjs',
  '@apollo/client/link/retry/retry.cjs',
  '@apollo/client/link/subscriptions/subscriptions.cjs',
  '@apollo/client/link/ws/ws.cjs',
  '@apollo/client/link/utils/utils.cjs',
  '@apollo/client/errors/errors.cjs',
  '@apollo/client/utilities/utilities.cjs',
  '@apollo/client/utilities/globals/globals.cjs',
  '@apollo/client/utilities/subscriptions/relay/relay.cjs',
  '@apollo/client/utilities/subscriptions/urql/urql.cjs',
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    wasm(),
    topLevelAwait(),
    // level (used by levelPrivateStateProvider) resolves to browser-level in
    // the browser, which pulls in Node core modules (events, crypto, stream,
    // util, ...) for EventEmitter/PBKDF2/etc that Vite otherwise externalizes
    // for client builds (leaving them undefined at runtime and breaking e.g.
    // `class X extends EventEmitter`). This polyfills the whole family in
    // one place instead of aliasing each one individually.
    nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    // The whole @midnight-ntwrk/* family is excluded from esbuild's
    // dependency pre-bundling scan: compact-runtime does a plain CJS
    // `require()` of onchain-runtime, whose wasm-bindgen glue uses
    // top-level await — esbuild can't statically inline that into a
    // scanned bundle (sync require of an inherently-async module), and
    // several sibling packages (network-id, wallet-api, wallet-sdk-
    // address-format, ...) hit the same wall transitively. Serving them
    // through Vite's own per-file transform instead (not pre-bundled)
    // sidesteps it.
    exclude: [
      '@midnight-ntwrk/compact-runtime',
      '@midnight-ntwrk/compact-js',
      '@midnight-ntwrk/onchain-runtime-v3',
      '@midnight-ntwrk/ledger-v8',
      '@midnight-ntwrk/dapp-connector-api',
      '@midnight-ntwrk/midnight-js',
      '@midnight-ntwrk/midnight-js-types',
      '@midnight-ntwrk/midnight-js-http-client-proof-provider',
      '@midnight-ntwrk/midnight-js-fetch-zk-config-provider',
      '@midnight-ntwrk/midnight-js-level-private-state-provider',
      '@midnight-ntwrk/midnight-js-utils',
    ],
    // The indexer provider (excluded above) reaches into these exact
    // @apollo/client .cjs subpaths. Each one sits in a directory whose
    // package.json says `"type": "module"`, which makes Vite's import
    // analysis mis-detect the (genuinely CommonJS, `.cjs`-extension)
    // file as ESM and find zero named exports. `needsInterop` overrides
    // that misdetection and forces proper CJS→ESM interop.
    needsInterop: APOLLO_CJS_SUBPATHS,
    // object-inspect (reached transitively via side-channel <- qs <-
    // cross-fetch, several layers deep under the excluded @midnight-ntwrk/*
    // chain above) never passes through esbuild's dependency scan because
    // its consumers are excluded, so Vite serves its raw CommonJS file
    // directly and fails to synthesize a default export for it. Forcing it
    // into the pre-bundle explicitly gives it proper CJS->ESM interop.
    include: [
      'object-inspect',
      '@subsquid/scale-codec',
      '@subsquid/util-internal-hex',
      '@subsquid/util-internal-json',
      'cross-fetch',
      'fetch-retry',
      'level',
    ],
  },
})
