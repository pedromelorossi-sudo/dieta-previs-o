"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { AdminUserSummary, loadAllUsersSummary } from "@/lib/admin";
import { fmt, fmtDate } from "@/lib/format";
import { IconScale } from "@/components/icons";

export default function AdminPage() {
  const { ready, profile } = useAuth();
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !profile?.isAdmin) return;
    loadAllUsersSummary()
      .then(setUsers)
      .catch((e) => setError(e.message));
  }, [ready, profile]);

  if (!ready) {
    return <div className="mx-auto max-w-4xl px-6 py-16 text-muted">Carregando…</div>;
  }

  if (!profile?.isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm text-muted">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight gradient-text">Painel de administrador</h1>
        <p className="text-sm text-muted mt-2">
          Evolução de todos os usuários — visão somente leitura, ninguém além de você tem acesso aos dados dos
          outros.
        </p>
      </div>

      {error && <div className="card border-warn/30 bg-warn/5 p-4 text-sm text-warn">{error}</div>}

      {!users ? (
        <div className="skeleton h-40 w-full" />
      ) : users.length === 0 ? (
        <p className="text-sm text-muted">Nenhum usuário cadastrado ainda.</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Cadastro</th>
                <th className="px-4 py-3 font-medium">Ciclos</th>
                <th className="px-4 py-3 font-medium">Último peso</th>
                <th className="px-4 py-3 font-medium">Última atualização</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => (window.location.href = `/admin/${u.id}`)}
                  className="border-b border-border last:border-0 hover:bg-surface-raised/60 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium">
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-accent text-[10px] font-semibold">
                        {u.name.slice(0, 1).toUpperCase()}
                      </span>
                      {u.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{fmtDate(u.createdAt.slice(0, 10))}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{u.cycleCount}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {u.lastWeightKg != null ? (
                      <span className="flex items-center gap-1.5">
                        <IconScale className="h-3.5 w-3.5 text-muted" />
                        {fmt(u.lastWeightKg)} kg
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {u.lastDate ? fmtDate(u.lastDate) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
