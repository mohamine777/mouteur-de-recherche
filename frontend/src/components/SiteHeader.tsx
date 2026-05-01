"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Search" },
  { href: "/upload", label: "Upload" },
  { href: "/documents", label: "Documents" },
  { href: "/stats", label: "Stats" },
];

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-white/5 bg-[#0b1220]/90 text-white shadow-[0_12px_40px_rgba(15,23,42,0.3)] backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 md:px-8">
        <Link href="/" className="text-xl font-black tracking-[0.02em] text-white">
          Moteur de Recherche
        </Link>
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "rounded-full border border-[#d4af37] bg-[#d4af37] px-4 py-2 text-[#0b1220] shadow-[0_0_18px_rgba(212,175,55,0.22)]"
                    : "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[#cbd5e1] transition hover:border-[#d4af37] hover:text-white"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}