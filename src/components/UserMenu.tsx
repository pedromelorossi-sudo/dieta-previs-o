"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export function UserMenu() {
  const router = useRouter();
  const { ready, user, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!ready || !user) return null;

  const label = profile?.name || user.email?.split("@")[0] || "Conta";

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-[12px] border border-border bg-surface-raised/60 px-3 py-1.5 text-sm hover:border-neutral transition-colors"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-accent text-[10px] font-semibold">
          {label.slice(0, 1).toUpperCase()}
        </span>
        {label}
        <span className="text-muted text-xs">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-52 card p-2 z-20">
            <div className="px-2 py-1.5 text-xs text-muted truncate">{user.email}</div>
            <div className="border-t border-border mt-1 pt-1 space-y-0.5">
              <Link
                href="/fotos"
                className="block rounded-[12px] px-2 py-1.5 text-sm text-muted hover:bg-surface-raised hover:text-foreground transition-colors"
              >
                Fotos de progresso
              </Link>
              <Link
                href="/analise"
                className="block rounded-[12px] px-2 py-1.5 text-sm text-muted hover:bg-surface-raised hover:text-foreground transition-colors"
              >
                Análise do Claude
              </Link>
              <Link
                href="/perfil/questionario"
                className="block rounded-[12px] px-2 py-1.5 text-sm text-muted hover:bg-surface-raised hover:text-foreground transition-colors"
              >
                Questionário de hábitos
              </Link>
              <div className="border-t border-border mt-1 pt-1">
                <span className="block px-2 py-1 text-[12px] text-neutral">Modo manual</span>
                <Link
                  href="/previsao"
                  className="block rounded-[12px] px-2 py-1.5 text-sm text-muted hover:bg-surface-raised hover:text-foreground transition-colors"
                >
                  Nova previsão (sem foto)
                </Link>
                <Link
                  href="/ciclos/novo"
                  className="block rounded-[12px] px-2 py-1.5 text-sm text-muted hover:bg-surface-raised hover:text-foreground transition-colors"
                >
                  Registrar ciclo manualmente
                </Link>
              </div>
              {profile?.isAdmin && (
                <Link
                  href="/admin"
                  className="block rounded-[12px] px-2 py-1.5 text-sm text-accent hover:bg-surface-raised transition-colors"
                >
                  Painel de administrador
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="w-full text-left rounded-[12px] px-2 py-1.5 text-sm text-danger hover:bg-surface-raised transition-colors"
              >
                Sair
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
