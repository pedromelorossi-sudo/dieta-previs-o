"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { IconFlame } from "@/components/icons";

export default function CadastroPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data.session) {
      setNeedsConfirmation(true);
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (needsConfirmation) {
    return (
      <div className="min-h-[calc(100vh-140px)] flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm card p-6 text-center space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">Confirme seu email</h1>
          <p className="text-sm text-muted">
            Enviamos um link de confirmação para <span className="text-foreground">{email}</span>. Clique nele para
            ativar sua conta e depois volte para fazer login.
          </p>
          <Link href="/login" className="inline-block mt-2 text-sm text-accent hover:underline">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-140px)] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-accent text-[color:var(--accent-contrast)]">
            <IconFlame className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <p className="meta">Degrau</p>
            <h1 className="text-2xl">Criar conta</h1>
            <p className="text-sm text-muted">Cada pessoa tem seu próprio histórico e dieta</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <Field label="Nome">
            <input required value={name} onChange={(e) => setName(e.target.value)} className="input" autoComplete="name" />
          </Field>
          <Field label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" />
          </Field>
          <Field label="Senha">
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
          </Field>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? "Criando…" : "Criar conta"}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          Já tem conta?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="meta block mb-1.5">{label}</span>
      {children}
    </label>
  );
}
