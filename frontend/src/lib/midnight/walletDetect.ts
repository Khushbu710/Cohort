// Deliberately has zero SDK imports. isWalletAvailable() is called on every
// render of <ConnectWalletButton> (every page, wallet needed or not), so it
// must not pull in the Midnight SDK just to check "is an extension
// present" — see wallet.ts for why that SDK code is lazy-loaded instead.
export function isWalletAvailable(): boolean {
  return typeof window !== "undefined" && !!window.midnight && Object.keys(window.midnight).length > 0;
}
