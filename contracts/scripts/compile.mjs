// Compiles every .compact contract via the native `compact` CLI (devtools
// 0.5.1, toolchain 0.30.0 — the exact pair midnightntwrk/example-counter's
// own CI pins, matching @midnight-ntwrk/compact-runtime@0.15.0 and
// ledger-8.0.2). The official compact CLI has no Windows build (only
// macOS and Linux musl targets are published), so on Windows this shells
// out through WSL, where the toolchain is installed natively. On Linux/Mac
// it runs directly.
//
// --skip-zk skips proving-key generation and keeps this fast for local
// iteration. Drop the flag for a release build once proving keys matter.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const contractsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(contractsDir, "managed");

const TOOLCHAIN_VERSION = "0.30.0";
const WITH_ZK = process.argv.includes("--with-zk");

const contracts = [
  { source: "registry/CohortRegistry.compact", outSubdir: "registry" },
  { source: "dataset/CohortDataset.compact", outSubdir: "dataset" },
];

const isWindows = os.platform() === "win32";

// Converts an absolute Windows path (C:\Users\...) to its WSL mount path
// (/mnt/c/Users/...) so the compact CLI running inside WSL can see it.
const toWslPath = (p) => {
  const norm = p.replace(/\\/g, "/");
  const match = /^([A-Za-z]):\/(.*)$/.exec(norm);
  if (!match) return norm;
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
};

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function main() {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const { source, outSubdir } of contracts) {
    const srcPath = path.join(contractsDir, "src", source);
    const outPath = path.join(outDir, outSubdir);
    if (!existsSync(outPath)) mkdirSync(outPath, { recursive: true });

    const flags = WITH_ZK ? [] : ["--skip-zk"];
    console.log(`\n> compiling ${source}${WITH_ZK ? " (with real ZK keys)" : ""}`);

    let code;
    if (isWindows) {
      const wslArgs = [
        "-e",
        "bash",
        "-lc",
        [
          `export PATH="$HOME/.local/bin:$PATH"`,
          `compact compile +${TOOLCHAIN_VERSION} ${flags.join(" ")} "${toWslPath(srcPath)}" "${toWslPath(outPath)}"`,
        ].join(" && "),
      ];
      code = await run("wsl.exe", wslArgs);
    } else {
      code = await run("compact", ["compile", `+${TOOLCHAIN_VERSION}`, ...flags, srcPath, outPath]);
    }

    if (code !== 0) {
      console.error(`\nCompilation failed for ${source}`);
      process.exit(code);
    }
  }

  console.log("\nAll contracts compiled successfully.");
}

main();
