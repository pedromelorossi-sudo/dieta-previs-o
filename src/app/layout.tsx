import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavLink } from "@/components/NavLink";
import { UserMenu } from "@/components/UserMenu";
import { SupabaseNotConfigured } from "@/components/SupabaseNotConfigured";
import { IconPhysique } from "@/components/icons";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

const supabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Degrau",
  description: "Previsão de peso e macros com base no histórico de ciclos de prescrição",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col text-foreground">
        {!supabaseConfigured ? (
          <SupabaseNotConfigured />
        ) : (
          <AuthProvider>
            <header className="border-b border-border/70 sticky top-0 z-10 backdrop-blur-md bg-background/70">
              <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between gap-4">
                <a href="/" className="flex items-center gap-2.5 font-semibold tracking-tight shrink-0 group">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-strong text-[color:var(--accent-contrast)] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 animate-pop-in">
                    <IconPhysique className="h-4 w-4" />
                  </span>
                  <span className="hidden sm:inline">Degrau</span>
                </a>
                <nav className="flex items-center gap-5 text-sm overflow-x-auto">
                  <NavLink href="/previsao-ia">Novo ciclo</NavLink>
                  <NavLink href="/dieta/novo">Montar dieta</NavLink>
                  <NavLink href="/treino">Treino</NavLink>
                  <NavLink href="/">Histórico</NavLink>
                </nav>
                <div className="shrink-0">
                  <UserMenu />
                </div>
              </div>
            </header>
            <main className="flex-1">{children}</main>
            <footer className="border-t border-border/70">
              <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-muted">
                Modelo pessoal com poucos pontos de dado — hipóteses de trabalho, não leis confirmadas. Não substitui acompanhamento profissional.
              </div>
            </footer>
          </AuthProvider>
        )}
      </body>
    </html>
  );
}
