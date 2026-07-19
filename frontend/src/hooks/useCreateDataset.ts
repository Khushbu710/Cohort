import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWalletStore } from "@/store/wallet";

export function useCreateDataset() {
  const provider = useWalletStore((state) => state.provider);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (schemaSlug: string) => {
      if (!provider) throw new Error("Wallet is not connected");
      const { deployNewDataset } = await import("@/lib/midnight/createDataset");
      return deployNewDataset(provider, schemaSlug);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets", "list"] });
    },
  });
}
