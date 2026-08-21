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
      className={`relative shrink-0 whitespace-nowrap text-[13px] transition-colors duration-200 ${active ? "text-foreground font-medium" : "text-muted hover:text-foreground"}`}
    >
      {children}
      {/* Sem traco de acento sob a aba ativa. A nav da Apple marca o item atual
          so por contraste de texto — cinza vira preto, peso sobe. Isso tambem
          mata o numero magico que dependia da altura exata do header e ja tinha
          quebrado uma vez. */}
    </Link>
  );
}
