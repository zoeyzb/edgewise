"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { APP_NAME, ADVANCED_NAV, NAV_ITEMS } from "@/lib/core/constants";
import { ModeSelector } from "./ModeSelector";
import { ProviderStatusBar } from "./ProviderStatusBar";
import { KillSwitchControl } from "./KillSwitchControl";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils/cn";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [advancedOpen, setAdvancedOpen] = useState(
    ADVANCED_NAV.some((item) => pathname === item.href)
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-edge-border bg-edge-surface lg:flex">
        <div className="border-b border-edge-border px-4 py-5">
          <p className="text-[10px] uppercase tracking-widest text-edge-muted">Kalshi Edge</p>
          <p className="text-lg font-semibold">{APP_NAME}</p>
          <p className="mt-1 text-[10px] text-edge-muted">Production-first</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          <NavSection items={NAV_ITEMS} pathname={pathname} />
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="mt-6 flex w-full items-center justify-between px-2 text-[10px] uppercase tracking-widest text-edge-muted hover:text-slate-200"
          >
            <span>Advanced</span>
            <span>{advancedOpen ? "−" : "+"}</span>
          </button>
          {advancedOpen ? (
            <div className="mt-2">
              <NavSection items={ADVANCED_NAV} pathname={pathname} />
            </div>
          ) : null}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-edge-border bg-edge-bg/95 backdrop-blur">
          <div className="flex flex-col gap-3 px-4 py-3 lg:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="lg:hidden">
                <p className="text-sm font-semibold">{APP_NAME}</p>
              </div>
              <ModeSelector />
              <div className="flex items-center gap-2">
                <StatusBadge variant="muted">Production default</StatusBadge>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ProviderStatusBar />
              <KillSwitchControl />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

function NavSection({
  items,
  pathname,
}: {
  items: ReadonlyArray<{ href: string; label: string }>;
  pathname: string;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "block rounded px-2 py-1.5 text-sm transition-colors",
                active
                  ? "bg-edge-accent/10 text-edge-accent"
                  : "text-edge-muted hover:bg-edge-border/30 hover:text-slate-200"
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
