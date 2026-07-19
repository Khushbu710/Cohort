// Local convenience tracking of "datasets I've personally joined/submitted
// to", for the Dashboard page. This is deliberately *not* derived from an
// on-chain nullifier-membership check — the contract's nullifier sets are
// what actually enforce one-join/one-submit-per-org; this is just a
// personal view of your own activity in this browser, so it's fine for it
// to be a simple local record rather than a cryptographic proof.
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ParticipationRecord {
  joined: boolean;
  submitted: boolean;
}

interface ParticipationState {
  records: Record<string, Record<string, ParticipationRecord>>;
  markJoined: (walletAddress: string, contractAddress: string) => void;
  markSubmitted: (walletAddress: string, contractAddress: string) => void;
}

export const useParticipationStore = create<ParticipationState>()(
  persist(
    (set) => ({
      records: {},
      markJoined: (walletAddress, contractAddress) =>
        set((state) => ({
          records: {
            ...state.records,
            [walletAddress]: {
              ...state.records[walletAddress],
              [contractAddress]: { ...state.records[walletAddress]?.[contractAddress], joined: true, submitted: state.records[walletAddress]?.[contractAddress]?.submitted ?? false },
            },
          },
        })),
      markSubmitted: (walletAddress, contractAddress) =>
        set((state) => ({
          records: {
            ...state.records,
            [walletAddress]: {
              ...state.records[walletAddress],
              [contractAddress]: { ...state.records[walletAddress]?.[contractAddress], joined: true, submitted: true },
            },
          },
        })),
    }),
    { name: "cohort-participation" },
  ),
);

// A stable empty-object reference: the selector below must return the same
// object on every call when there's nothing to show, or React's
// useSyncExternalStore sees a "changed" snapshot every render and loops.
const EMPTY_RECORD: Record<string, ParticipationRecord> = {};

export function useMyParticipation(walletAddress: string | null): Record<string, ParticipationRecord> {
  return useParticipationStore((state) => (walletAddress ? (state.records[walletAddress] ?? EMPTY_RECORD) : EMPTY_RECORD));
}
