import { useQuery } from "@tanstack/react-query";
import type { DatasetSchema } from "@cohort/shared";
import { REGISTRY_ADDRESS, KNOWN_SCHEMAS } from "@/lib/config";

export interface DatasetListEntry {
  contractAddress: string;
  schema: DatasetSchema;
}

// Phase 3 simplification: every dataset registered so far uses the one
// compiled schema, so we pair every registry entry with it directly rather
// than verifying schemaHash against a catalog of many. Real per-dataset
// schema-hash verification is worth adding once Phase 6 ships more than
// one schema.
function resolveSchema(): DatasetSchema {
  return KNOWN_SCHEMAS[0];
}

// lib/midnight/* is dynamic-imported inside each queryFn, not statically
// imported at module top-level — see lib/midnight/wallet.ts's header
// comment for why: these hooks are reachable from every route via
// Explore/Dashboard, and a static import would load the Midnight SDK (and
// its current Vite dev-bundling friction) on every page, not just the ones
// that actually query the chain.

export function useRegisteredDatasets() {
  return useQuery<DatasetListEntry[]>({
    queryKey: ["datasets", "list", REGISTRY_ADDRESS],
    queryFn: async () => {
      if (!REGISTRY_ADDRESS) return [];
      const { listRegisteredDatasets } = await import("@/lib/midnight/registry");
      const registered = await listRegisteredDatasets(REGISTRY_ADDRESS);
      return registered.map((entry) => ({
        contractAddress: entry.contractAddress,
        schema: resolveSchema(),
      }));
    },
    refetchInterval: 10_000,
  });
}

export function useDatasetState(contractAddress: string | undefined, schema: DatasetSchema | undefined) {
  return useQuery({
    queryKey: ["dataset", "state", contractAddress],
    queryFn: async () => {
      const { readDatasetState } = await import("@/lib/midnight/dataset");
      return readDatasetState(contractAddress as string, schema as DatasetSchema);
    },
    enabled: Boolean(contractAddress && schema),
    refetchInterval: 5_000,
  });
}
