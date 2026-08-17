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
      className={`relative transition-colors ${active ? "text-foreground" : "text-muted hover:text-foreground"}`}
    >
      {children}
      {active && <span className="absolute -bottom-[21px] left-0 right-0 h-[2px] rounded-full bg-accent" />}
    </Link>
  );
}
