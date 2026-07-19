import { Button } from "@/components/ui/button";
import { useWalletStore } from "@/store/wallet";
import { isWalletAvailable } from "@/lib/midnight/walletDetect";

function truncateAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

export function ConnectWalletButton() {
  const { status, address, error, connect, disconnect } = useWalletStore();

  if (status === "connected" && address) {
    return (
      <Button variant="outline" onClick={disconnect} title="Click to disconnect">
        {truncateAddress(address)}
      </Button>
    );
  }

  if (!isWalletAvailable()) {
    return (
      <Button variant="outline" asChild>
        <a href="https://1am.xyz/" target="_blank" rel="noreferrer">
          Install 1AM
        </a>
      </Button>
    );
  }

  return (
    <Button onClick={() => connect()} disabled={status === "connecting"}>
      {status === "connecting" ? "Connecting…" : error ? "Retry connection" : "Connect wallet"}
    </Button>
  );
}
