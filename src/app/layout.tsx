import type { Metadata } from "next";
import Link from "next/link";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { NavLink } from "@/components/NavLink";
import { UserMenu } from "@/components/UserMenu";
import { SupabaseNotConfigured } from "@/components/SupabaseNotConfigured";
import { IconPhysique } from "@/components/icons";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

const supabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* Pareamento do tema custom "instrumento" (ver design.md):
 * display em grotesk de traço técnico, corpo em sans neutra que some, números em mono.
 * Três famílias é o teto da disciplina 2+1 do Hallmark — display + corpo + a mono
 * que existe por função (alinhar coluna de número), não por estilo. */
const displayFont = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono-tech",
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
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col text-foreground">
        {!supabaseConfigured ? (
          <SupabaseNotConfigured />
        ) : (
          <AuthProvider>
            <header className="sticky top-0 z-10 border-b border-rule-2 bg-background">
              <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between gap-4">
                <Link href="/" className="flex items-center gap-2 font-display font-semibold tracking-tight shrink-0 group">
                  <span className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-accent text-[color:var(--accent-contrast)] transition-colors duration-150 group-hover:bg-accent-strong">
                    <IconPhysique className="h-3.5 w-3.5" />
                  </span>
                  <span className="hidden sm:inline">Degrau</span>
                </Link>
                <nav className="flex items-center gap-5 text-sm overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            <footer className="border-t border-rule-2">
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
