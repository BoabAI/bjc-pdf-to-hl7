"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}

const ITEMS: NavItem[] = [
  { href: "/", label: "Converter" },
  { href: "/reference", label: "Reference Data" },
  { href: "/log", label: "Log" },
  { href: "/stats", label: "Stats" },
  { href: "/compliance", label: "Data Handling" },
  { href: "/privacy", label: "Privacy" },
];

export function AppNav() {
  const pathname = usePathname();

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
      </nav>
    </header>
  );
}
