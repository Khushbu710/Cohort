import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OrgProfile } from "@cohort/shared";
// Type-only: doesn't pull the SDK into the eagerly-loaded app shell. The
// real class is dynamic-imported inside connect() below — see wallet.ts's
// header comment for why the Midnight SDK can't be a static top-level
// import in anything reachable from every route.
import type { MidnightWalletProvider } from "@/lib/midnight/wallet";

export type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

interface WalletStoreState {
  status: WalletStatus;
  provider: MidnightWalletProvider | null;
  address: string | null;
  error: string | null;
  orgProfiles: Record<string, Omit<OrgProfile, "walletAddress">>;
  connect: () => Promise<void>;
  disconnect: () => void;
  setOrgProfile: (profile: Omit<OrgProfile, "walletAddress">) => void;
}

export const useWalletStore = create<WalletStoreState>()(
  persist(
    (set, get) => ({
      status: "disconnected",
      provider: null,
      address: null,
      error: null,
      orgProfiles: {},

      connect: async () => {
        set({ status: "connecting", error: null });
        try {
          const { MidnightWalletProvider } = await import("@/lib/midnight/wallet");
          const provider = await MidnightWalletProvider.connect();
          set({ status: "connected", provider, address: provider.address, error: null });
        } catch (err) {
          set({ status: "error", provider: null, address: null, error: err instanceof Error ? err.message : "Failed to connect wallet" });
        }
      },

      disconnect: () => {
        set({ status: "disconnected", provider: null, address: null, error: null });
      },

      setOrgProfile: (profile) => {
        const address = get().address;
        if (!address) return;
        set((state) => ({ orgProfiles: { ...state.orgProfiles, [address]: profile } }));
      },
    }),
    {
      name: "cohort-wallet",
      // The provider instance (live wallet handle) is not serializable and
      // shouldn't survive a reload anyway — only the org profile cache does.
      partialize: (state) => ({ orgProfiles: state.orgProfiles }),
    },
  ),
);

export function useOrgProfile(): Omit<OrgProfile, "walletAddress"> | null {
  return useWalletStore((state) => (state.address ? (state.orgProfiles[state.address] ?? null) : null));
}
