import type { Metadata } from "next";
import Link from "next/link";
import { NavLink } from "@/components/NavLink";
import { UserMenu } from "@/components/UserMenu";
import { SupabaseNotConfigured } from "@/components/SupabaseNotConfigured";
import { IconDegrau } from "@/components/icons";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

const supabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* Sem `next/font`. A skill apple-design proíbe Inter/Roboto como face de marca
 * — fonte genérica é um dos tells que ela lista. A pilha do sistema entrega SF
 * Pro no Mac e no iPhone do Pedro (que é onde ele abre isto), custa zero byte
 * de download e é a única forma de a tipografia ser de fato a da Apple.
 * A pilha vive em `--font-system`, em globals.css. */

export const metadata: Metadata = {
  title: "Degrau",
  description: "Previsão de peso e macros com base no histórico de ciclos de prescrição",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col text-foreground">
        {!supabaseConfigured ? (
          <SupabaseNotConfigured />
        ) : (
          <AuthProvider>
            <header className="glass-nav sticky top-0 z-50">
              <div className="mx-auto max-w-5xl px-[22px] py-3 flex items-center justify-between gap-4">
                <Link href="/" className="flex items-center gap-2 font-semibold tracking-[-0.01em] shrink-0 group">
                  <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-brand-ink text-brand transition-transform duration-200 group-hover:scale-[1.04]">
                    <IconDegrau className="h-[15px] w-[15px]" />
                  </span>
                  <span className="hidden sm:inline">Degrau</span>
                </Link>
                <nav className="flex items-center gap-5 text-sm overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <NavLink href="/previsao-ia">Novo ciclo</NavLink>
                  <NavLink href="/dieta">Dieta</NavLink>
                  <NavLink href="/treino">Treino</NavLink>
                  <NavLink href="/">Histórico</NavLink>
                </nav>
                <div className="shrink-0">
                  <UserMenu />
                </div>
              </div>
            </header>
            <main className="flex-1">{children}</main>
            <footer className="border-t border-border">
              <div className="mx-auto max-w-5xl px-[22px] py-8 text-[13px] leading-relaxed text-neutral">
                Modelo pessoal com poucos pontos de dado — hipóteses de trabalho, não leis confirmadas. Não substitui acompanhamento profissional.
              </div>
            </footer>
          </AuthProvider>
        )}
      </body>
    </html>
  );
}
