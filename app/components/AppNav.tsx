"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { WalkthroughButton } from "./WalkthroughButton";

interface NavItem {
  href: string;
  label: string;
}

const ITEMS: NavItem[] = [
  { href: "/", label: "Converter" },
  { href: "/log", label: "Log" },
  { href: "/stats", label: "Stats" },
  { href: "/reference", label: "Reference Data" },
  { href: "/compliance", label: "Data Handling" },
  { href: "/privacy", label: "Privacy" },
];

export function AppNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userEmail = session?.user?.email;

  return (
    <header className="sticky top-0 z-30 w-full border-b border-[var(--border-light)] bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 py-2 md:px-6">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors " +
                (active
                  ? "bg-[var(--bjc-blue)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]")
              }
            >
              {item.label}
            </Link>
          );
        })}
        {userEmail && (
          <div className="ml-auto flex items-center gap-3">
            <WalkthroughButton />
            {/* Hide email on narrow viewports — at < 640px, the nav already
             *  wraps onto multiple rows. Keeping the email visible eats a
             *  third row for marginal value; the title attribute on the
             *  Sign out button preserves discoverability. */}
            <span
              className="hidden sm:inline text-xs text-[var(--text-muted)] truncate max-w-[220px]"
              title={userEmail}
            >
              {userEmail}
            </span>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
              title={`Signed in as ${userEmail}. Click to sign out.`}
            >
              Sign out
            </button>
          </div>
        )}
      </nav>
    </header>
  );
}
