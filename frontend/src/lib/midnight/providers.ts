// Read-only Midnight access: just the indexer's public data provider.
// Deliberately has no dependency on a connected wallet — browsing datasets,
// viewing status, and reading tallies are meant to work for anyone, wallet
// connected or not (see docs/ARCHITECTURE.md §5: wallet connection is only
// needed to *act*, never to look).
import { setNetworkId } from "@midnight-ntwrk/midnight-js/network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import type { PublicDataProvider } from "@midnight-ntwrk/midnight-js/types";
import { NETWORK_CONFIG } from "../config";

let publicDataProvider: PublicDataProvider | undefined;

/** The single shared read-only provider for the whole app. */
export function getPublicDataProvider(): PublicDataProvider {
  if (!publicDataProvider) {
    setNetworkId("undeployed");
    publicDataProvider = indexerPublicDataProvider(NETWORK_CONFIG.indexer, NETWORK_CONFIG.indexerWS);
  }
  return publicDataProvider;
}
