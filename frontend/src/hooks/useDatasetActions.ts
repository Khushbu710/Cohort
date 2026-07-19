import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWalletStore } from "@/store/wallet";
import { useParticipationStore } from "@/store/participation";

// lib/midnight/actions is dynamic-imported per mutation — see
// lib/midnight/wallet.ts's header comment for why it can't be a static
// top-level import here.

export function useJoinDataset(contractAddress: string) {
  const queryClient = useQueryClient();
  const provider = useWalletStore((state) => state.provider);
  const markJoined = useParticipationStore((state) => state.markJoined);

  return useMutation({
    mutationFn: async () => {
      if (!provider) throw new Error("Wallet is not connected");
      const { joinDataset } = await import("@/lib/midnight/actions");
      return joinDataset(provider, contractAddress);
    },
    onSuccess: () => {
      if (provider) markJoined(provider.address, contractAddress);
      queryClient.invalidateQueries({ queryKey: ["dataset", "state", contractAddress] });
    },
  });
}

export function useSubmitResponse(contractAddress: string) {
  const queryClient = useQueryClient();
  const provider = useWalletStore((state) => state.provider);
  const markSubmitted = useParticipationStore((state) => state.markSubmitted);

  return useMutation({
    mutationFn: async (answers: { salaryBand: bigint; companySize: bigint }) => {
      if (!provider) throw new Error("Wallet is not connected");
      const { submitResponse } = await import("@/lib/midnight/actions");
      return submitResponse(provider, contractAddress, answers);
    },
    onSuccess: () => {
      if (provider) markSubmitted(provider.address, contractAddress);
      queryClient.invalidateQueries({ queryKey: ["dataset", "state", contractAddress] });
    },
  });
}

export function useFreezeDataset(contractAddress: string) {
  const queryClient = useQueryClient();
  const provider = useWalletStore((state) => state.provider);

  return useMutation({
    mutationFn: async () => {
      if (!provider) throw new Error("Wallet is not connected");
      const { freezeDataset } = await import("@/lib/midnight/actions");
      return freezeDataset(provider, contractAddress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset", "state", contractAddress] });
    },
  });
}

export function useRevealResults(contractAddress: string) {
  const queryClient = useQueryClient();
  const provider = useWalletStore((state) => state.provider);

  return useMutation({
    mutationFn: async () => {
      if (!provider) throw new Error("Wallet is not connected");
      const { revealDatasetResults } = await import("@/lib/midnight/actions");
      return revealDatasetResults(provider, contractAddress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset", "state", contractAddress] });
    },
  });
}
