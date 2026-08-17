export function SupabaseNotConfigured() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md card p-8 text-center space-y-3">
        <h1 className="text-xl font-semibold tracking-tight">Supabase não configurado</h1>
        <p className="text-sm text-muted leading-relaxed">
          Defina <code className="text-foreground">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
          <code className="text-foreground">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> em{" "}
          <code className="text-foreground">.env.local</code> (veja{" "}
          <code className="text-foreground">.env.local.example</code>) e reinicie o servidor.
        </p>
      </div>
    </div>
  );
}
