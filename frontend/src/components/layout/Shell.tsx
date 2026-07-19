import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";

const NAV_LINKS = [
  { to: "/explore", label: "Explore" },
  { to: "/datasets/new", label: "Create Dataset" },
  { to: "/dashboard", label: "Dashboard" },
];

export function Shell() {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <NavLink to="/" className="text-sm font-semibold tracking-tight">
            Cohort
          </NavLink>
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                    isActive && "bg-muted text-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <ConnectWalletButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
