"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`relative shrink-0 whitespace-nowrap transition-colors ${active ? "text-foreground" : "text-muted hover:text-foreground"}`}
    >
      {children}
      {/* -15px medido no browser: distancia da base do link ate a regua inferior
          do header (py-3 + centragem contra a marca de 24px). Se a densidade do
          header mudar, esse numero muda junto. */}
      {active && <span className="absolute -bottom-[15px] left-0 right-0 h-[2px] bg-accent" />}
    </Link>
  );
}
